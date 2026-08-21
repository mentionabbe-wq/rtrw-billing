import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CustomerAuthService, RequestMeta } from './customer-auth.service';
import { CustomerJwtGuard, Portal, PortalActor } from './customer-jwt.guard';
import {
  OtpRequestDto, OtpVerifyDto, PortalLoginDto, ResetPasswordDto,
} from './dto/customer-auth.dto';

/** Autentikasi portal pelanggan — `/api/portal/auth/*` (§4). */
@ApiTags('portal-auth')
@Controller('portal/auth')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  /** IP diambil dari socket, bukan header, agar tidak bisa dipalsukan. */
  private meta(req: Request): RequestMeta {
    return {
      ip: (req.socket?.remoteAddress ?? '').replace(/^::ffff:/, ''),
      userAgent: String(req.headers['user-agent'] ?? ''),
    };
  }

  /** Masuk dengan nomor pelanggan/email + kata sandi. */
  @Post('login')
  login(@Body() dto: PortalLoginDto, @Req() req: Request) {
    return this.auth.loginWithPassword(dto.identifier, dto.password, this.meta(req));
  }

  /** Kirim OTP login ke WhatsApp. */
  @Post('otp/request')
  requestOtp(@Body() dto: OtpRequestDto, @Req() req: Request) {
    return this.auth.requestOtp(dto.phone, 'login', this.meta(req));
  }

  /** Masuk dengan OTP WhatsApp. */
  @Post('otp/verify')
  verifyOtp(@Body() dto: OtpVerifyDto, @Req() req: Request) {
    return this.auth.loginWithOtp(dto.phone, dto.code, this.meta(req));
  }

  /** Lupa kata sandi — kirim OTP ke WhatsApp terdaftar. */
  @Post('forgot')
  forgot(@Body() dto: OtpRequestDto, @Req() req: Request) {
    return this.auth.requestOtp(dto.phone, 'reset_password', this.meta(req));
  }

  /** Setel kata sandi baru dengan OTP; sekaligus langsung masuk. */
  @Post('reset')
  reset(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto.phone, dto.code, dto.newPassword, this.meta(req));
  }

  // ── Sesi (butuh token portal) ──────────────────────────────────────────────

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(CustomerJwtGuard)
  logout(@Portal() actor: PortalActor) {
    return this.auth.revokeSession(actor.customerId, actor.sessionId);
  }

  /** Keluar dari semua perangkat kecuali yang sedang dipakai. */
  @Post('logout-all')
  @ApiBearerAuth()
  @UseGuards(CustomerJwtGuard)
  logoutAll(@Portal() actor: PortalActor) {
    return this.auth.revokeAll(actor.customerId, actor.sessionId);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(CustomerJwtGuard)
  sessions(@Portal() actor: PortalActor) {
    return this.auth.listSessions(actor.customerId, actor.sessionId);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @UseGuards(CustomerJwtGuard)
  revoke(@Portal() actor: PortalActor, @Param('id') id: string) {
    return this.auth.revokeSession(actor.customerId, id);
  }
}
