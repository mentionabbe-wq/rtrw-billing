import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Router, Subscription } from '@database/entities';
import { MikrotikService } from '@modules/mikrotik/mikrotik.service';

/** Sesi aktif yang dikumpulkan dari seluruh router. */
interface LiveSession {
  routerId: string;
  address: string | null;
  uptime: string | null;
  callerId: string | null;
}

/**
 * Poller PPPoE.
 *
 * ONU sudah dipoll cron SNMP tiap 5 menit, tetapi status PPPoE sebelumnya
 * hanya dibaca saat halaman dibuka — tidak pernah disimpan. Akibatnya status
 * pelanggan tampak "tidak terhubung" hanya karena router sedang lambat
 * menjawab, atau karena kolom `routers.status` masih `unknown` (status itu
 * dulu hanya berubah saat admin menekan tombol Test).
 *
 * Poller ini menyapu SEMUA router secara berkala, menyimpan hasilnya ke
 * `subscriptions.live_*`, sekaligus memperbarui `routers.status` sebagai efek
 * samping — jadi tidak ada lagi router yang "unknown" selamanya.
 */
@Injectable()
export class PppoePollerService {
  private readonly logger = new Logger(PppoePollerService.name);
  private running = false;

  constructor(
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Router) private readonly routers: Repository<Router>,
    private readonly mikrotik: MikrotikService,
  ) {}

  @Cron(process.env.PPPOE_POLL_CRON || '*/2 * * * *', { name: 'pppoe-poll' })
  async poll() {
    // Router yang lambat menjawab bisa membuat siklus berikutnya menumpuk.
    if (this.running) {
      this.logger.warn('polling sebelumnya belum selesai — siklus ini dilewati');
      return;
    }
    this.running = true;
    try {
      await this.run();
    } catch (e) {
      this.logger.error(`poll gagal: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Dipanggil cron & tombol "Perbarui sekarang" di panel admin. */
  async run(): Promise<{
    routersOnline: number;
    routersTotal: number;
    sessions: number;
    matched: number;
    unmatched: string[];
  }> {
    const routers = await this.routers.find();
    const sessions = new Map<string, LiveSession>();
    let routersOnline = 0;

    for (const r of routers) {
      try {
        const rows = await this.mikrotik.listActive(r);
        routersOnline++;
        await this.routers.update(r.id, { status: 'online', lastSeenAt: new Date() });
        for (const s of rows) {
          const name = String(s.name ?? '').trim().toLowerCase();
          if (!name) continue;
          sessions.set(name, {
            routerId: String(r.id),
            address: s.address ?? null,
            uptime: s.uptime ?? null,
            callerId: s.callerId ?? null,
          });
        }
      } catch (e) {
        await this.routers.update(r.id, { status: 'offline' });
        this.logger.warn(`router ${r.name} tak terjawab: ${(e as Error).message}`);
      }
    }

    // Router tak satu pun terjawab → jangan tandai semua pelanggan offline,
    // itu justru laporan palsu. Biarkan status terakhir apa adanya.
    if (routersOnline === 0 && routers.length > 0) {
      this.logger.warn('semua router tak terjawab — status PPPoE pelanggan tidak diubah');
      return { routersOnline, routersTotal: routers.length, sessions: 0, matched: 0, unmatched: [] };
    }

    const all = await this.subs.find({ relations: { router: true } });
    const now = new Date();
    let matched = 0;
    const claimed = new Set<string>();

    for (const sub of all) {
      const key = (sub.pppoeUser ?? '').trim().toLowerCase();
      // Pencocokan tidak peka huruf besar/kecil — nama secret di Mikrotik
      // sering berbeda kapitalisasinya dengan yang tersimpan di aplikasi.
      const hit = key ? sessions.get(key) : undefined;

      if (hit) {
        matched++;
        claimed.add(key);
        await this.subs.update(sub.id, {
          liveOnline: true,
          liveIp: hit.address,
          liveUptime: hit.uptime,
          liveCallerId: hit.callerId,
          liveRouter: { id: hit.routerId } as Router,
          lastOnlineAt: now,
          liveCheckedAt: now,
        });
        if (sub.router && String(sub.router.id) !== hit.routerId) {
          // Tidak diubah otomatis: router_id dipakai perintah suspend/aktifkan,
          // jadi koreksinya diserahkan ke admin lewat daftar "perlu perhatian".
          this.logger.warn(
            `sesi ${sub.pppoeUser} ditemukan di router lain (tersimpan: ${sub.router.name})`,
          );
        }
      } else {
        await this.subs.update(sub.id, {
          liveOnline: false,
          liveIp: null,
          liveUptime: null,
          liveCheckedAt: now,
        });
      }
    }

    // Sesi yang tidak punya pasangan langganan — biasanya secret dibuat manual
    // di Mikrotik dan belum disinkronkan ke aplikasi.
    const unmatched = [...sessions.keys()].filter((k) => !claimed.has(k));

    this.logger.log(
      `pppoe-poll: ${routersOnline}/${routers.length} router, ${sessions.size} sesi, ` +
        `${matched} cocok, ${unmatched.length} sesi tanpa langganan`,
    );
    return {
      routersOnline,
      routersTotal: routers.length,
      sessions: sessions.size,
      matched,
      unmatched: unmatched.slice(0, 50),
    };
  }
}
