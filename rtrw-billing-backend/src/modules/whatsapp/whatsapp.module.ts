import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WaTemplate = 'invoice_baru' | 'jatuh_tempo' | 'suspend' | 'aktif_kembali';


const TEMPLATES: Record<WaTemplate, (v: Record<string, string>) => string> = {
  invoice_baru: (v) => `Halo ${v.name}, tagihan internet ${v.period} sebesar ${v.amount} sudah terbit. Jatuh tempo ${v.due}. Terima kasih.`,
  jatuh_tempo: (v) => `Halo ${v.name}, tagihan ${v.amount} jatuh tempo hari ini. Mohon segera lakukan pembayaran agar layanan tetap aktif.`,
  suspend: (v) => `Halo ${v.name}, layanan internet Anda dinonaktifkan sementara karena tagihan belum dibayar. Silakan lunasi untuk mengaktifkan kembali.`,
  aktif_kembali: (v) => `Halo ${v.name}, pembayaran diterima. Layanan internet Anda sudah AKTIF kembali. Terima kasih.`,
};

/**
 * Minimal WhatsApp gateway wrapper. Configure WA_API_URL + WA_API_TOKEN to send;
 * otherwise it logs the message (dev mode). Swap `send()` body for your provider
 * (Fonnte / Wablas / WA Cloud API) — keep the template contract.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly config: ConfigService) {}

  async send(phone: string, template: WaTemplate, vars: Record<string, string>): Promise<void> {
    return this.sendRaw(phone, TEMPLATES[template](vars));
  }

  async sendRaw(phone: string, text: string): Promise<void> {
    const url = process.env.WA_API_URL;
    const token = process.env.WA_API_TOKEN;

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
