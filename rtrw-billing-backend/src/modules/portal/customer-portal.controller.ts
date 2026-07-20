import { Body, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CustomerPortalService } from './customer-portal.service';
import { PortalService } from './portal.service';

/**
 * Portal self-service pelanggan — PUBLIK (tanpa login admin).
 * Identifikasi: otomatis dari IP koneksi pelanggan, atau login cadangan
 * (no. pelanggan + 4 digit terakhir no. HP). Token khusus scope portal.
 */
@ApiTags('customer-portal')
@Controller('portal/customer')
export class CustomerPortalController {
  constructor(
    private readonly svc: CustomerPortalService,
    private readonly portal: PortalService,
  ) {}

  /** Ambil IP asli dari socket (bukan header, agar tidak bisa dipalsukan). */
  private clientIp(req: Request): string {
    return (req.socket?.remoteAddress as string) ?? '';
  }

  /**
   * Coba kenali otomatis dari IP. Bila ketemu → token + data langsung.
   * Bila tidak → { identified: false }, frontend menampilkan form login.
   */
  @Post('identify')
  async identify(@Req() req: Request) {
    const sub = await this.svc.identifyByIp(this.clientIp(req));
    if (!sub?.customer) return { identified: false };
    const customerId = String(sub.customer.id);
    return {
      identified: true,
      token: this.svc.issueToken(customerId),
      data: await this.svc.overview(customerId),
    };
  }

  /** Login cadangan bila deteksi IP gagal (mis. dibuka dari data seluler). */
  @Post('login')
  async login(@Body() body: { customerNo: string; phoneLast4: string }) {
    const sub = await this.svc.identifyByCredentials(body?.customerNo, body?.phoneLast4);
    if (!sub?.customer) {
      return { ok: false, message: 'No. pelanggan atau 4 digit HP tidak cocok.' };
    }
    const customerId = String(sub.customer.id);
    return {
      ok: true,
      token: this.svc.issueToken(customerId),
      data: await this.svc.overview(customerId),
    };
  }

  /** Muat ulang data (butuh token portal). */
  @Get('me')
  async me(@Headers('authorization') auth?: string) {
    const customerId = this.svc.verifyToken(auth?.replace(/^Bearer\s+/i, ''));
    return this.svc.overview(customerId);
  }

  /** Ubah nama & password WiFi sendiri via TR-069. */
  @Post('wifi')
  async wifi(
    @Body() body: { ssid?: string; password?: string },
    @Headers('authorization') auth?: string,
  ) {
    const customerId = this.svc.verifyToken(auth?.replace(/^Bearer\s+/i, ''));
    return this.svc.changeWifi(customerId, body?.ssid?.trim() || undefined, body?.password || undefined);
  }

  /** Konfirmasi sudah bayar + bukti transfer (identitas dari token). */
  @Post('claim')
  async claim(
    @Body() body: { note?: string; proofImage?: string },
    @Headers('authorization') auth?: string,
  ) {
    const customerId = this.svc.verifyToken(auth?.replace(/^Bearer\s+/i, ''));
    const data = await this.svc.overview(customerId);
    const ident = data.subscription?.pppoeUser || data.customer.customerNo;
    return this.portal.claimPayment({
      identifier: ident,
      note: body?.note,
      proofImage: body?.proofImage,
    });
  }
}
