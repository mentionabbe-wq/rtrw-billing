import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationsService } from '@modules/integrations/integrations.service';

export type WaTemplate =
  | 'invoice_baru' | 'jatuh_tempo' | 'suspend' | 'aktif_kembali' | 'pengingat';


const TEMPLATES: Record<WaTemplate, (v: Record<string, string>) => string> = {
  invoice_baru: (v) => `Halo ${v.name}, tagihan internet ${v.period} sebesar ${v.amount} sudah terbit. Jatuh tempo ${v.due}. Terima kasih.`,
  pengingat: (v) => `Halo ${v.name}, pengingat: tagihan internet ${v.amount} akan jatuh tempo ${v.due} (${v.daysLeft} hari lagi). Mohon lakukan pembayaran sebelum jatuh tempo agar layanan tetap aktif. Terima kasih.`,
  jatuh_tempo: (v) => `Halo ${v.name}, tagihan ${v.amount} jatuh tempo hari ini. Mohon segera lakukan pembayaran agar layanan tetap aktif.`,
  suspend: (v) => `Halo ${v.name}, layanan internet Anda dinonaktifkan sementara karena tagihan belum dibayar. Silakan lunasi untuk mengaktifkan kembali.`,
  aktif_kembali: (v) => `Halo ${v.name}, pembayaran diterima. Layanan internet Anda sudah AKTIF kembali. Terima kasih.`,
};

/**
 * Minimal WhatsApp gateway wrapper. Konfigurasi diambil dari menu
 * Pengaturan → Integrasi (DB), fallback env WA_API_URL + WA_API_TOKEN;
 * bila keduanya kosong pesan hanya di-log (dev mode). Body request memakai
 * format Fonnte/Wablas ({ target, message }) — sesuaikan bila provider lain.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly integrations: IntegrationsService,
  ) {}

  async send(phone: string, template: WaTemplate, vars: Record<string, string>): Promise<void> {
    return this.sendRaw(phone, TEMPLATES[template](vars));
  }

  /**
   * Notifikasi kejadian ke admin (ONU LOS, pembayaran masuk, dll).
   * Prioritas: Telegram bot (gratis) bila aktif; fallback WA admin bila
   * Telegram tidak dikonfigurasi. No-op bila keduanya mati.
   */
  async notifyAdmin(text: string): Promise<void> {
    const tg = await this.integrations.resolveTelegram();
    if (tg.notifyEnabled && tg.botToken && tg.chatId) {
      await this.sendTelegram(tg.botToken, tg.chatId, text);
      return;
    }
    const { adminPhone, notifyEnabled } = await this.integrations.resolveWa();
    if (!notifyEnabled || !adminPhone) return;
    await this.sendRaw(adminPhone, text);
  }

  /**
   * Notifikasi ke admin BESERTA gambar (mis. bukti transfer). Dikirim via
   * Telegram sendPhoto bila aktif; bila tidak, jatuh ke pesan teks biasa.
   */
  async notifyAdminPhoto(caption: string, dataUri: string): Promise<void> {
    const tg = await this.integrations.resolveTelegram();
    if (!tg.notifyEnabled || !tg.botToken || !tg.chatId) {
      await this.notifyAdmin(`${caption}\n\n(Bukti transfer terlampir hanya dapat dikirim via Telegram.)`);
      return;
    }
    const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUri ?? '');
    if (!m) {
      await this.notifyAdmin(caption);
      return;
    }
    try {
      const buf = Buffer.from(m[2], 'base64');
      const ext = m[1].includes('png') ? 'png' : 'jpg';
      const form = new FormData();
      form.append('chat_id', tg.chatId);
      form.append('caption', caption.slice(0, 1024));
      form.append('photo', new Blob([buf], { type: m[1] }), `bukti.${ext}`);

      const res = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendPhoto`, {
        method: 'POST',
        body: form as any,
      });
      const json: any = await res.json().catch(() => ({}));
      if (!json.ok) {
        this.logger.warn(`Telegram sendPhoto gagal: ${json.description ?? res.status}`);
        await this.notifyAdmin(caption);
      }
    } catch (e) {
      this.logger.warn(`Telegram sendPhoto error: ${(e as Error).message}`);
      await this.notifyAdmin(caption);
    }
  }

  /** Kirim pesan via Telegram Bot API. */
  private async sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      const json: any = await res.json().catch(() => ({}));
      if (!json.ok) this.logger.warn(`Telegram send gagal: ${json.description ?? res.status}`);
    } catch (e) {
      this.logger.warn(`Telegram send error: ${(e as Error).message}`);
    }
  }

  /** Tes koneksi Telegram — kirim pesan tes, lempar error bila gagal. */
  async testTelegram(): Promise<{ ok: boolean; error?: string }> {
    const tg = await this.integrations.resolveTelegram();
    if (!tg.botToken || !tg.chatId) {
      return { ok: false, error: 'Bot token / Chat ID belum diisi.' };
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tg.chatId,
          text: '✅ Tes koneksi berhasil — notifikasi admin RT/RW Billing via Telegram aktif.',
        }),
      });
      const json: any = await res.json().catch(() => ({}));
      return json.ok
        ? { ok: true }
        : { ok: false, error: json.description ?? `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async sendRaw(phone: string, text: string): Promise<void> {
    const { apiUrl: url, apiToken: token } = await this.integrations.resolveWa();

    if (!url || !token) {
      this.logger.log(`[WA dev] -> ${phone}: ${text}`);
      return;
    }
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target: phone, message: text }),
      });
    } catch (e) {
      this.logger.warn(`WA send failed to ${phone}: ${(e as Error).message}`);
    }
  }
}

@Global()
@Module({
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
