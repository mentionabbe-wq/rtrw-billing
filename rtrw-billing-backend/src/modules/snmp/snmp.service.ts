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
  /** true = ONU benar-benar terbaca di OLT (dBm valid ATAU LOS asli).
   *  false = tidak bisa dibaca (timeout/SNMP error/tak ada di tabel) → jangan alarm. */
  found: boolean;
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
    // Timeout & retry lebih longgar: OLT GPON (C-Data) sering lambat menjawab
    // walk DDM saat sibuk. Tanpa ini, timeout sesaat -> status LOS palsu.
    const opts = { timeout: 8000, retries: 3 };
    // v2c: community = snmpUser. Dipakai banyak OLT EPON murah (mis. C-Data).
    if ((olt.version ?? 'v3').toLowerCase() === 'v2c') {
      return snmp.createSession(olt.host, olt.snmpUser, { version: snmp.Version2c, ...opts });
    }
    // v3 authPriv (default).
    return snmp.createV3Session(olt.host, {
      name: olt.snmpUser,
      level: snmp.SecurityLevel.authPriv,
      authProtocol: snmp.AuthProtocols.sha,
      authKey: this.crypto.decrypt(olt.authKeyEnc),
      privProtocol: snmp.PrivProtocols.aes,
      privKey: this.crypto.decrypt(olt.privKeyEnc),
      ...opts,
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
  ): Promise<Array<{
    ifIndex: number; onuId: number; dBm: number | null;
    health: OpticalReading['health']; name: string | null; description: string | null;
  }>> {
    const profile = getProfile(olt.vendor);
    const rows = await this.walk(olt, profile.rxPowerOid);
    const base = profile.rxPowerOid.replace(/^\./, '');

    // Tabel label/deskripsi di-index per ifIndex (satu bagian) → join key = ifIndex.
    const nameMap = await this.walkLabelMap(olt, profile.nameOid);
    const descMap = await this.walkLabelMap(olt, profile.descOid);

    return rows.map(({ oid, value }) => {
      // Suffix index relatif thd base OID: ZTE/Huawei 2 bagian (ifIndex.onuId),
      // C-Data GPON 3 bagian (ponPort.0.onuIdx) — ambil bagian pertama & terakhir.
      const clean = oid.replace(/^\./, '');
      const suffix = clean.startsWith(base) ? clean.slice(base.length + 1) : clean;
      const parts = suffix.split('.');
      const ifIndex = Number(parts[0]);
      const onuId = Number(parts[parts.length - 1]);
      const dBm = profile.toDbm(Number(value));
      return {
        ifIndex, onuId, dBm, health: this.classify(dBm),
        name: nameMap[ifIndex] ?? null,
        description: descMap[ifIndex] ?? null,
      };
    });
  }

  /** Walk tabel string (nama/deskripsi ONU) → map { ifIndex: teks }. */
  private async walkLabelMap(olt: OltTarget, oid?: string): Promise<Record<number, string>> {
    if (!oid) return {};
    const rows = await this.walk(olt, oid).catch(() => []);
    const base = oid.replace(/^\./, '');
    const map: Record<number, string> = {};
    for (const { oid: o, value } of rows) {
      const clean = String(o).replace(/^\./, '');
      const suffix = clean.startsWith(base) ? clean.slice(base.length + 1) : clean;
      const ifIndex = Number(suffix.split('.')[0]);
      const text = String(value ?? '').trim();
      if (!Number.isNaN(ifIndex) && text) map[ifIndex] = text;
    }
    return map;
  }

  async readOpticalPower(olt: OltTarget, ifIndex: number, onuId: number): Promise<OpticalReading> {
    const profile = getProfile(olt.vendor);
    const idx = profile.buildIndex ? profile.buildIndex(ifIndex, onuId) : `${ifIndex}.${onuId}`;

    // Coba GET langsung dulu (cepat & ringan). Banyak OLT GPON — termasuk
    // C-Data — TIDAK menjawab GET pada leaf DDM, hanya lewat walk/GETNEXT;
    // dalam kasus itu GET balik null/noSuchInstance → fallback ke walk & cocokkan.
    try {
      const raw = await this.get(olt, `${profile.rxPowerOid}.${idx}`);
      const dBm = profile.toDbm(Number(raw));
      if (dBm != null) return { dBm, health: this.classify(dBm), found: true };
    } catch {
      /* fallthrough ke walk */
    }

    // Fallback walk. Jika walk sendiri gagal (timeout/SNMP error), lempar —
    // caller memperlakukannya sbg "tak terbaca", BUKAN LOS (hindari alarm palsu).
    const rows = await this.walkOnu(olt);
    const match = rows.find((r) => r.ifIndex === ifIndex && r.onuId === onuId);
    if (!match) {
      // ONU tak ada di tabel walk → anggap tak terbaca, jangan alarm LOS.
      return { dBm: null, health: 'ok', found: false };
    }
    return { dBm: match.dBm, health: this.classify(match.dBm), found: true };
  }

  /** SET ONU/ONT admin status: up=enable, down=shutdown (nilai per vendor). */
  async setOnuAdminStatus(olt: OltTarget, ifIndex: number, onuId: number, up: boolean): Promise<void> {
    const profile = getProfile(olt.vendor);
    const session = this.session(olt);
    const idx = profile.buildIndex ? profile.buildIndex(ifIndex, onuId) : `${ifIndex}.${onuId}`;
    const oid = `${profile.adminStatusOid}.${idx}`;
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
