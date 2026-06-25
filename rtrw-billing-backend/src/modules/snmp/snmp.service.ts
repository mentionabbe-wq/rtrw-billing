import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as snmp from 'net-snmp';
import { CryptoService } from '@common/crypto/crypto.service';
import { getProfile, OltVendor } from './vendor-profiles';

export interface OltTarget {
  host: string;
  vendor: OltVendor | string;
  /** 'v3' (authPriv) atau 'v2c' (community = snmpUser). Default v3. */
  version?: string;
  snmpUser: string;
  authKeyEnc: Buffer;
  privKeyEnc: Buffer;
}

export interface OpticalReading {
  dBm: number | null;
  health: 'ok' | 'warning' | 'critical';
}

/**
 * SNMPv3 (authPriv) manager for OLT/ONU optical monitoring & port control.
 * OID dan konversi dBm di-resolve dari vendor profile (ZTE / Huawei / generic).
 * Lihat src/modules/snmp/vendor-profiles.ts.
 */
@Injectable()
export class SnmpService {
  private readonly logger = new Logger(SnmpService.name);

  constructor(
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  private session(olt: OltTarget): any {
    // v2c: community = snmpUser. Dipakai banyak OLT EPON murah (mis. C-Data).
    if ((olt.version ?? 'v3').toLowerCase() === 'v2c') {
      return snmp.createSession(olt.host, olt.snmpUser, { version: snmp.Version2c });
    }
    // v3 authPriv (default).
    return snmp.createV3Session(olt.host, {
      name: olt.snmpUser,
      level: snmp.SecurityLevel.authPriv,
      authProtocol: snmp.AuthProtocols.sha,
      authKey: this.crypto.decrypt(olt.authKeyEnc),
      privProtocol: snmp.PrivProtocols.aes,
      privKey: this.crypto.decrypt(olt.privKeyEnc),
    });
  }

  /** Test koneksi SNMP: ambil sysDescr (1.3.6.1.2.1.1.1.0). Jalan utk v2c & v3. */
  async testConnection(olt: OltTarget): Promise<{ ok: boolean; description?: string; error?: string }> {
    try {
      const desc = await this.get(olt, '1.3.6.1.2.1.1.1.0');
      return { ok: true, description: String(desc) };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  /**
   * Discovery: walk seluruh tabel rxPower OLT → daftar semua ONU + redaman-nya
   * dalam satu pass (OLT -> app). Index OID = `${rxPowerOid}.${ifIndex}.${onuId}`.
   */
  async walkOnu(
    olt: OltTarget,
  ): Promise<Array<{ ifIndex: number; onuId: number; dBm: number | null; health: OpticalReading['health'] }>> {
    const profile = getProfile(olt.vendor);
    const rows = await this.walk(olt, profile.rxPowerOid);
    return rows.map(({ oid, value }) => {
      const parts = oid.split('.');
      const onuId = Number(parts[parts.length - 1]);
      const ifIndex = Number(parts[parts.length - 2]);
      const dBm = profile.toDbm(Number(value));
      return { ifIndex, onuId, dBm, health: this.classify(dBm) };
    });
  }

  async readOpticalPower(olt: OltTarget, ifIndex: number, onuId: number): Promise<OpticalReading> {
    const profile = getProfile(olt.vendor);
    const oid = `${profile.rxPowerOid}.${ifIndex}.${onuId}`;
    const raw = await this.get(olt, oid);
    const dBm = profile.toDbm(Number(raw));
    return { dBm, health: this.classify(dBm) };
  }

  /** SET ONU/ONT admin status: up=enable, down=shutdown (nilai per vendor). */
  async setOnuAdminStatus(olt: OltTarget, ifIndex: number, onuId: number, up: boolean): Promise<void> {
    const profile = getProfile(olt.vendor);
    const session = this.session(olt);
    const oid = `${profile.adminStatusOid}.${ifIndex}.${onuId}`;
    return new Promise((resolve, reject) => {
      session.set(
        [{ oid, type: snmp.ObjectType.Integer, value: up ? profile.adminUp : profile.adminDown }],
        (err: Error) => {
          session.close();
          err ? reject(err) : resolve();
        },
      );
    });
  }

  private get(olt: OltTarget, oid: string): Promise<number | string> {
    const session: any = this.session(olt);
    return new Promise((resolve, reject) => {
      session.get([oid], (err: Error, varbinds: any[]) => {
        session.close();
        if (err) return reject(err);
        const vb = varbinds[0];
        if (snmp.isVarbindError(vb)) return reject(new Error(snmp.varbindError(vb)));
        resolve(vb.value);
      });
    });
  }

  /** Walk subtree → kumpulkan {oid, value} sampai keluar dari baseOid. */
  private walk(olt: OltTarget, baseOid: string): Promise<Array<{ oid: string; value: any }>> {
    const session: any = this.session(olt);
    const out: Array<{ oid: string; value: any }> = [];
    return new Promise((resolve, reject) => {
      session.subtree(
        baseOid,
        20,
        (varbinds: any[]) => {
          for (const vb of varbinds) {
            if (!snmp.isVarbindError(vb)) out.push({ oid: vb.oid, value: vb.value });
          }
        },
        (err: Error) => {
          session.close();
          err ? reject(err) : resolve(out);
        },
      );
    });
  }

  private classify(dBm: number | null): OpticalReading['health'] {
    if (dBm == null) return 'critical'; // LOS / no signal
    const crit = this.config.get<number>('monitoring.critDbm');
    const warn = this.config.get<number>('monitoring.warnDbm');
    if (dBm < crit) return 'critical';
    if (dBm < warn) return 'warning';
    return 'ok';
  }
}
