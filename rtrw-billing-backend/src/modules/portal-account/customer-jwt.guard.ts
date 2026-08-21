import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { CustomerAuthService } from './customer-auth.service';

export interface PortalActor {
  customerId: string;
  sessionId: string;
}

/**
 * Penjaga semua endpoint portal pelanggan.
 *
 * Identitas SELALU diambil dari token (dan divalidasi ke tabel sesi), tidak
 * pernah dari body/param — inilah yang mencegah satu pelanggan mengakses data
 * pelanggan lain (§38).
 */
@Injectable()
export class CustomerJwtGuard implements CanActivate {
  constructor(private readonly auth: CustomerAuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { portal?: PortalActor }>();
    const header = req.headers.authorization ?? '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new UnauthorizedException('Silakan masuk terlebih dahulu.');

    req.portal = await this.auth.validateSession(token);
    return true;
  }
}

/** `@Portal() actor: PortalActor` — pelanggan pemilik permintaan ini. */
export const Portal = createParamDecorator((_data: unknown, ctx: ExecutionContext): PortalActor => {
  const req = ctx.switchToHttp().getRequest<Request & { portal?: PortalActor }>();
  if (!req.portal) throw new UnauthorizedException('Silakan masuk terlebih dahulu.');
  return req.portal;
});
