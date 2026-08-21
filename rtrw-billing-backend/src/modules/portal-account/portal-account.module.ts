import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import {
  Customer, CustomerNotification, CustomerOtp, CustomerSession, Device, Invoice,
  Payment, PortalSetting, Subscription,
} from '@database/entities';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { PortalModule } from '@modules/portal/portal.module';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAccountController } from './customer-account.controller';
import { CustomerAccountService } from './customer-account.service';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { PortalMaintenanceService } from './portal-maintenance.service';

/**
 * PHASE 1 — akun & self-service pelanggan (`/api/portal/auth`, `/api/portal/me`).
 * Terpisah dari `PortalModule` lama yang melayani captive portal berbasis IP.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer, CustomerSession, CustomerOtp, CustomerNotification,
      Subscription, Invoice, Payment, Device, PortalSetting,
    ]),
    MikrotikModule,
    PortalModule,
    JwtModule.register({}),
  ],
  controllers: [CustomerAuthController, CustomerAccountController],
  providers: [CustomerAuthService, CustomerAccountService, CustomerJwtGuard, PortalMaintenanceService],
  exports: [CustomerAuthService, CustomerAccountService],
})
export class PortalAccountModule {}
