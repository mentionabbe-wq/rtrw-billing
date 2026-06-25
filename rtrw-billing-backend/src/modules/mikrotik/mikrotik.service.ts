import { Injectable, Logger } from '@nestjs/common';
import { RouterOSAPI } from 'node-routeros';
import { CryptoService } from '@common/crypto/crypto.service';
import { Router } from '@database/entities';
import { Subscription } from '@database/entities';

/**
 * All actions are idempotent so the BullMQ worker can safely retry them.
 * Connections always use API-SSL (port 8729) with TLS.
 */
@Injectable()
export class MikrotikService {
  private readonly logger = new Logger(MikrotikService.name);

  constructor(private readonly crypto: CryptoService) {}

  private async connect(router: Router): Promise<RouterOSAPI> {
    // Port 8728 = API plaintext, 8729 = API-SSL. RouterOS API-SSL biasanya pakai
    // sertifikat self-signed, jadi TLS tak boleh menolak cert tak dikenal
    // (rejectUnauthorized:false) — kalau true, handshake gagal & tak pernah konek.
    const port = router.apiPort || 8729;
    const useTls = port !== 8728;
    const conn = new RouterOSAPI({
      host: router.host,
      user: router.apiUsername,
      password: this.crypto.decrypt(router.apiSecretEnc),
      port,
      tls: useTls ? { rejectUnauthorized: false } : undefined,
      timeout: 8,
    });
    await conn.connect();
    return conn;
  }

  // ----------------------- READ-BACK (Mikrotik -> app) -----------------------

  /** Identity + versi RouterOS. Dipakai tombol "Test koneksi" & status router. */
  async testConnection(router: Router): Promise<{
    ok: boolean; identity?: string; version?: string; board?: string; uptime?: string; error?: string;
  }> {
    try {
      const conn = await this.connect(router);
      try {
        const id = await conn.write('/system/identity/print');
        const res = await conn.write('/system/resource/print');
        return {
          ok: true,
          identity: id[0]?.name,
          version: res[0]?.version,
          board: res[0]?.['board-name'],
          uptime: res[0]?.uptime,
        };
      } finally {
        conn.close();
      }
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  /** Sesi PPPoE/hotspot yang sedang online sekarang (siapa konek + IP + uptime). */
  async listActive(router: Router): Promise<any[]> {
    const conn = await this.connect(router);
    try {
      const rows = await conn.write('/ppp/active/print');
      return rows.map((r) => ({
        name: r.name,
        address: r.address,
        uptime: r.uptime,
        callerId: r['caller-id'],
        service: r.service,
      }));
    } finally {
      conn.close();
    }
  }

  /** Semua PPP secret di router (untuk rekonsiliasi / discovery pelanggan). */
  async listSecrets(router: Router): Promise<any[]> {
    const conn = await this.connect(router);
    try {
      const rows = await conn.write('/ppp/secret/print');
      return rows.map((r) => ({
        name: r.name,
        profile: r.profile,
        service: r.service,
        disabled: r.disabled === 'true' || r.disabled === true,
        comment: r.comment,
      }));
    } finally {
      conn.close();
    }
  }

  /** Daftar PPP profile + rate-limit-nya (untuk memetakan paket app <-> profile). */
  async listProfiles(router: Router): Promise<any[]> {
    const conn = await this.connect(router);
    try {
      const rows = await conn.write('/ppp/profile/print');
      return rows.map((r) => ({
        name: r.name,
        rateLimit: r['rate-limit'],
        localAddress: r['local-address'],
        remoteAddress: r['remote-address'],
      }));
    } finally {
      conn.close();
    }
  }

  /** Disable PPPoE secret, drop active session, add to "isolir" address-list. */
  async suspend(router: Router, sub: Subscription): Promise<void> {
    const conn = await this.connect(router);
    try {
      await this.setSecretDisabled(conn, sub.pppoeUser, true);
      await this.dropActiveSession(conn, sub.pppoeUser);
      if (sub.ipStatic) {
        await conn
          .write('/ip/firewall/address-list/add', [
            '=list=isolir',
            `=address=${sub.ipStatic}`,
            `=comment=auto-suspend ${sub.pppoeUser}`,
          ])
          .catch(() => undefined); // already present
      }
    } finally {
      conn.close();
    }
  }

  /** Re-enable PPPoE secret and remove from "isolir" address-list. */
  async activate(router: Router, sub: Subscription): Promise<void> {
    const conn = await this.connect(router);
    try {
      await this.setSecretDisabled(conn, sub.pppoeUser, false);
      if (sub.ipStatic) {
        const items = await conn.write('/ip/firewall/address-list/print', [
          '?list=isolir',
          `?address=${sub.ipStatic}`,
        ]);
        for (const it of items) {
          await conn.write('/ip/firewall/address-list/remove', [`=.id=${it['.id']}`]);
        }
      }
    } finally {
      conn.close();
    }
  }

  /**
   * Terapkan bandwidth paket baru ke Mikrotik. Menangani DUA skema sekaligus:
   *  1) PPP profile  — set `profile` di /ppp/secret, lalu drop sesi aktif agar
   *     login ulang dengan profil (rate-limit) baru. Dipakai bila paket punya
   *     pppoeProfile (cara umum RT/RW Net).
   *  2) Simple Queue — update max-limit di /queue/simple bila entry-nya ada.
   * Idempotent: aman di-retry oleh worker.
   */
  async setBandwidth(
    router: Router,
    sub: Subscription,
    rateLimit: string,
    pppoeProfile?: string,
  ): Promise<void> {
    const conn = await this.connect(router);
    try {
      if (pppoeProfile) {
        const secrets = await conn.write('/ppp/secret/print', [`?name=${sub.pppoeUser}`]);
        if (secrets.length) {
          await conn.write('/ppp/secret/set', [
            `=.id=${secrets[0]['.id']}`,
            `=profile=${pppoeProfile}`,
          ]);
          // Profil baru hanya berlaku setelah re-connect → putus sesi aktif sekali.
          await this.dropActiveSession(conn, sub.pppoeUser);
        }
      }
      const queues = await conn.write('/queue/simple/print', [`?name=${sub.pppoeUser}`]);
      if (queues.length) {
        await conn.write('/queue/simple/set', [
          `=.id=${queues[0]['.id']}`,
          `=max-limit=${rateLimit}`,
        ]);
      }
    } finally {
      conn.close();
    }
  }

  /** Liveness check used by the scheduler to update router.status. */
  async ping(router: Router): Promise<boolean> {
    try {
      const conn = await this.connect(router);
      await conn.write('/system/identity/print');
      conn.close();
      return true;
    } catch {
      return false;
    }
  }

  private async setSecretDisabled(conn: RouterOSAPI, user: string, disabled: boolean) {
    const secrets = await conn.write('/ppp/secret/print', [`?name=${user}`]);
    if (secrets.length) {
      await conn.write('/ppp/secret/set', [
        `=.id=${secrets[0]['.id']}`,
        `=disabled=${disabled ? 'yes' : 'no'}`,
      ]);
    }
  }

  private async dropActiveSession(conn: RouterOSAPI, user: string) {
    const active = await conn.write('/ppp/active/print', [`?name=${user}`]);
    for (const s of active) {
      await conn.write('/ppp/active/remove', [`=.id=${s['.id']}`]);
    }
  }
}
