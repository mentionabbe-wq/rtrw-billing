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

  private buildConn(router: Router, port: number, useTls: boolean): RouterOSAPI {
    // API-SSL (8729) umumnya sertifikat self-signed → rejectUnauthorized:false,
    // kalau true handshake gagal. Port 8728 = API plaintext (yang dipakai Mikhmon).
    return new RouterOSAPI({
      host: router.host,
      user: router.apiUsername,
      password: this.crypto.decrypt(router.apiSecretEnc),
      port,
      tls: useTls ? { rejectUnauthorized: false } : undefined,
      timeout: 8,
    });
  }

  private async connect(router: Router): Promise<RouterOSAPI> {
    const port = router.apiPort || 8728;
    const useTls = port !== 8728;
    try {
      const conn = this.buildConn(router, port, useTls);
      await conn.connect();
      return conn;
    } catch (err) {
      // Fallback: coba transport lain di port standar — mis. user set 8729 (SSL)
      // tapi router hanya mengaktifkan service "api" plain 8728 (kasus Mikhmon),
      // atau sebaliknya. Hanya saat percobaan pertama gagal.
      const altPort = port === 8728 ? 8729 : 8728;
      const altTls = altPort !== 8728;
      try {
        const conn = this.buildConn(router, altPort, altTls);
        await conn.connect();
        this.logger.warn(`Konek ${router.host}:${port} gagal, berhasil lewat :${altPort}`);
        return conn;
      } catch {
        throw err; // lempar error percobaan pertama (lebih relevan ke setting user)
      }
    }
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

  /** Daftar interface/port di router (untuk grafik trafik). */
  async listInterfaces(router: Router): Promise<any[]> {
    const conn = await this.connect(router);
    try {
      const rows = await conn.write('/interface/print');
      return rows.map((r) => ({
        name: r.name,
        type: r.type,
        running: r.running === 'true' || r.running === true,
      }));
    } finally {
      conn.close();
    }
  }

  /** Trafik sesaat sebuah interface (bits/detik) via monitor-traffic once. */
  async monitorTraffic(router: Router, iface: string): Promise<{ rxbps: number; txbps: number }> {
    const conn = await this.connect(router);
    try {
      const rows = await conn.write('/interface/monitor-traffic', [`=interface=${iface}`, '=once=']);
      const r = rows[0] ?? {};
      return {
        rxbps: Number(r['rx-bits-per-second'] ?? 0),
        txbps: Number(r['tx-bits-per-second'] ?? 0),
      };
    } finally {
      conn.close();
    }
  }

  /** Daftar IP pool di router (untuk dropdown pilih pool di paket). */
  async listPools(router: Router): Promise<any[]> {
    const conn = await this.connect(router);
    try {
      const rows = await conn.write('/ip/pool/print');
      return rows.map((r) => ({ name: r.name, ranges: r.ranges }));
    } finally {
      conn.close();
    }
  }

  /**
   * Tetapkan IP pool sebuah paket ke PPP profile (remote-address = pool).
   * Inilah cara Mikrotik memberi IP pelanggan dari pool tertentu. Idempotent.
   */
  async setProfilePool(router: Router, profileName: string, poolName: string): Promise<void> {
    const conn = await this.connect(router);
    try {
      const profiles = await conn.write('/ppp/profile/print', [`?name=${profileName}`]);
      if (!profiles.length) throw new Error(`PPP profile "${profileName}" tidak ditemukan di router`);
      await conn.write('/ppp/profile/set', [
        `=.id=${profiles[0]['.id']}`,
        `=remote-address=${poolName}`,
      ]);
    } finally {
      conn.close();
    }
  }

  /**
   * Suspend pelanggan. Dua mode:
   * - Captive portal (router.suspendProfile diisi): ganti profil PPP ke profil
   *   suspend → pelanggan tetap bisa konek tapi traffic di-redirect ke portal.
   * - Mode lama (suspendProfile kosong): disable PPP secret → internet total mati.
   */
  async suspend(router: Router, sub: Subscription): Promise<void> {
    const conn = await this.connect(router);
    try {
      if (router.suspendProfile) {
        // Mode captive portal: ganti ke profil suspend, putus sesi agar reconnect
        const secrets = await conn.write('/ppp/secret/print', [`?name=${sub.pppoeUser}`]);
        if (secrets.length) {
          await conn.write('/ppp/secret/set', [
            `=.id=${secrets[0]['.id']}`,
            `=profile=${router.suspendProfile}`,
          ]);
        }
        await this.dropActiveSession(conn, sub.pppoeUser);
      } else {
        // Mode lama: disable secret + putus sesi
        await this.setSecretDisabled(conn, sub.pppoeUser, true);
        await this.dropActiveSession(conn, sub.pppoeUser);
      }
    } finally {
      conn.close();
    }
  }

  /**
   * Aktifkan kembali pelanggan.
   * - Captive portal mode: kembalikan profil ke paket asli (atau 'default').
   * - Mode lama: enable kembali PPP secret.
   */
  async activate(router: Router, sub: Subscription): Promise<void> {
    const conn = await this.connect(router);
    try {
      if (router.suspendProfile) {
        const originalProfile = (sub as any).package?.pppoeProfile || 'default';
        const secrets = await conn.write('/ppp/secret/print', [`?name=${sub.pppoeUser}`]);
        if (secrets.length) {
          await conn.write('/ppp/secret/set', [
            `=.id=${secrets[0]['.id']}`,
            `=profile=${originalProfile}`,
          ]);
        }
        await this.dropActiveSession(conn, sub.pppoeUser);
      } else {
        await this.setSecretDisabled(conn, sub.pppoeUser, false);
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

  /**
   * Buat PPP secret di Mikrotik bila belum ada, atau aktifkan kembali bila
   * sudah ada tapi disabled. Dipanggil saat langganan baru dibuat dari UI
   * (bukan dari Sinkron Mikrotik).
   */
  async provisionSecret(router: Router, sub: Subscription, password?: string, profile?: string): Promise<void> {
    const conn = await this.connect(router);
    try {
      const secrets = await conn.write('/ppp/secret/print', [`?name=${sub.pppoeUser}`]);
      if (secrets.length) {
        // Secret sudah ada → pastikan enabled
        await conn.write('/ppp/secret/set', [
          `=.id=${secrets[0]['.id']}`,
          '=disabled=no',
          ...(profile ? [`=profile=${profile}`] : []),
          ...(password ? [`=password=${password}`] : []),
        ]);
      } else {
        // Secret belum ada → buat baru
        await conn.write('/ppp/secret/add', [
          `=name=${sub.pppoeUser}`,
          `=password=${password ?? sub.pppoeUser}`,
          `=service=pppoe`,
          ...(profile ? [`=profile=${profile}`] : []),
          `=comment=auto-provisioned`,
        ]);
      }
    } finally {
      conn.close();
    }
  }

  // ─── Hotspot user management ─────────────────────────────────────────────────

  /**
   * Tambah atau update user di /ip/hotspot/user. Idempotent.
   * limitUptime format Mikrotik: "1d00:00:00", "03:00:00", dll.
   */
  async addHotspotUser(
    router: Router,
    username: string,
    password: string,
    profile: string,
    limitUptime: string,
  ): Promise<void> {
    const conn = await this.connect(router);
    try {
      const existing = await conn.write('/ip/hotspot/user/print', [`?name=${username}`]);
      if (existing.length) {
        await conn.write('/ip/hotspot/user/set', [
          `=.id=${existing[0]['.id']}`,
          `=password=${password}`,
          `=profile=${profile}`,
          `=limit-uptime=${limitUptime}`,
          '=disabled=no',
        ]);
      } else {
        await conn.write('/ip/hotspot/user/add', [
          `=name=${username}`,
          `=password=${password}`,
          `=profile=${profile}`,
          `=limit-uptime=${limitUptime}`,
          '=comment=voucher-auto',
        ]);
      }
    } finally {
      conn.close();
    }
  }

  /** Hapus user dari /ip/hotspot/user. Idempotent. */
  async removeHotspotUser(router: Router, username: string): Promise<void> {
    const conn = await this.connect(router);
    try {
      const users = await conn.write('/ip/hotspot/user/print', [`?name=${username}`]);
      for (const u of users) {
        await conn.write('/ip/hotspot/user/remove', [`=.id=${u['.id']}`]);
      }
    } finally {
      conn.close();
    }
  }

  /** Daftar hotspot user profile di router. Coba beberapa path untuk kompatibilitas versi RouterOS. */
  async listHotspotProfiles(router: Router): Promise<any[]> {
    const conn = await this.connect(router);
    try {
      // Cek hotspot server dulu — konfirmasi fitur hotspot aktif
      let servers: any[] = [];
      try {
        servers = await conn.write('/ip/hotspot/print');
      } catch {
        throw new Error(`Hotspot tidak ditemukan di router ini. Jalankan /ip hotspot setup terlebih dahulu.`);
      }

      if (servers.length === 0) {
        throw new Error(`Hotspot belum dikonfigurasi (tidak ada hotspot server aktif).`);
      }

      // Path benar: /ip hotspot user profile print → /ip/hotspot/user/profile/print
      const rows = await conn.write('/ip/hotspot/user/profile/print');
      this.logger.debug(`listHotspotProfiles ${router.name}: ${rows.length} rows`);
      return rows.map((r) => ({
        name: r.name ?? r['.id'],
        rateLimit: r['rate-limit'] ?? '',
        sessionTimeout: r['session-timeout'] ?? '',
        sharedUsers: r['shared-users'] ?? '1',
      }));
    } catch (e: any) {
      const msg: string = e?.message ?? String(e);
      throw new Error(`Mikrotik [${router.name}]: ${msg}`);
    } finally {
      conn.close();
    }
  }

  /** Buat/update hotspot user profile. Path: /ip hotspot user profile */
  private async writeHotspotProfile(
    conn: RouterOSAPI,
    name: string,
    setParams: string[],
    addParams: string[],
  ): Promise<void> {
    const base = '/ip/hotspot/user/profile';
    const existing = await conn.write(`${base}/print`, [`?name=${name}`]);
    if (existing.length) {
      await conn.write(`${base}/set`, [`=.id=${existing[0]['.id']}`, ...setParams]);
    } else {
      await conn.write(`${base}/add`, [`=name=${name}`, ...addParams]);
    }
  }

  /**
   * Buat atau update hotspot user profile di Mikrotik. Idempotent.
   * sessionTimeout: format Mikrotik "01:00:00" atau "1d00:00:00" (kosong = unlimited)
   */
  async upsertHotspotProfile(
    router: Router,
    name: string,
    rateLimit?: string,
    sessionTimeout?: string,
    sharedUsers?: string,
  ): Promise<void> {
    const conn = await this.connect(router);
    const setParams = [
      ...(rateLimit ? [`=rate-limit=${rateLimit}`] : []),
      ...(sessionTimeout ? [`=session-timeout=${sessionTimeout}`] : []),
      ...(sharedUsers ? [`=shared-users=${sharedUsers}`] : []),
    ];
    try {
      await this.writeHotspotProfile(conn, name, setParams, setParams);
    } finally {
      conn.close();
    }
  }

  /** Daftar semua hotspot user di router (termasuk password plaintext utk sinkronisasi). */
  async listHotspotUsers(router: Router): Promise<any[]> {
    const conn = await this.connect(router);
    try {
      const rows = await conn.write('/ip/hotspot/user/print');
      return rows.map((r) => ({
        id: r['.id'],
        name: r.name,
        password: r.password ?? '',
        profile: r.profile ?? 'default',
        limitUptime: r['limit-uptime'] ?? '',
        uptime: r.uptime ?? '',
        disabled: r.disabled === 'true' || r.disabled === true,
        comment: r.comment ?? '',
      }));
    } finally {
      conn.close();
    }
  }

  /** Jumlah user hotspot yang sedang terkoneksi dari /ip/hotspot/active. */
  async countActiveHotspotSessions(router: Router): Promise<number> {
    const conn = await this.connect(router);
    try {
      const rows = await conn.write('/ip/hotspot/active/print');
      return rows.length;
    } catch {
      return 0;
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
