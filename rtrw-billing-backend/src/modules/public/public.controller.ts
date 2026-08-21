import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequestMeta } from '@modules/portal-account/customer-auth.service';
import {
  BillingCheckRequestDto, BillingCheckVerifyDto, CoverageCheckDto, RegisterLeadDto,
} from './dto/public.dto';
import { PublicService } from './public.service';

/**
 * API publik landing page — tanpa autentikasi (`/api/public/*`).
 * Tidak ada endpoint di sini yang mengembalikan data pelanggan tanpa OTP.
 */
@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly svc: PublicService) {}

  private meta(req: Request): RequestMeta {
    return {
      ip: (req.socket?.remoteAddress ?? '').replace(/^::ffff:/, ''),
      userAgent: String(req.headers['user-agent'] ?? ''),
    };
  }

  /** Seluruh konten landing page dalam satu panggilan. */
  @Get('landing')
  landing() {
    return this.svc.landing();
  }

  @Get('packages')
  packages() {
    return this.svc.publicPackages();
  }

  @Get('coverage')
  coverage() {
    return this.svc.publicCoverage();
  }

  @Post('coverage/check')
  checkCoverage(@Body() dto: CoverageCheckDto, @Req() req: Request) {
    return this.svc.checkCoverage(dto, this.meta(req));
  }

  /** Status jaringan — dapat dilihat tanpa login (§41). */
  @Get('status')
  status() {
    return this.svc.networkStatus();
  }

  /** Cek tagihan langkah 1: kirim OTP ke WhatsApp terdaftar. */
  @Post('billing-check/request')
  billingRequest(@Body() dto: BillingCheckRequestDto, @Req() req: Request) {
    return this.svc.billingCheckRequest(dto.identifier, this.meta(req));
  }

  /** Cek tagihan langkah 2: verifikasi OTP lalu tampilkan tagihan. */
  @Post('billing-check/verify')
  billingVerify(@Body() dto: BillingCheckVerifyDto, @Req() req: Request) {
    return this.svc.billingCheckVerify(dto, this.meta(req));
  }

  @Post('register')
  register(@Body() dto: RegisterLeadDto, @Req() req: Request) {
    return this.svc.register(dto, this.meta(req));
  }

  @Get('register/:requestNo')
  registrationStatus(@Param('requestNo') requestNo: string, @Req() req: Request) {
    return this.svc.registrationStatus(requestNo, this.meta(req));
  }
}
