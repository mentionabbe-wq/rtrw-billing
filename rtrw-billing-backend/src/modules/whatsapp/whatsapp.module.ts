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
   * Notifikasi kejadian ke nomor WA admin (ONU LOS, pembayaran masuk, dll).
   * No-op bila toggle notifikasi mati atau nomor admin belum diisi.
   */
  async notifyAdmin(text: string): Promise<void> {
    const { adminPhone, notifyEnabled } = await this.integrations.resolveWa();
    if (!notifyEnabled || !adminPhone) return;
    await this.sendRaw(adminPhone, text);
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
