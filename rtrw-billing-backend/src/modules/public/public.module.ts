import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CoverageArea, Customer, CustomerRequest, Device, Invoice, PortalSetting, Router,
  ServicePackage, Subscription,
} from '@database/entities';
import { PortalAccountModule } from '@modules/portal-account/portal-account.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

/** PHASE 1 — API publik untuk landing page (`/api/public/*`). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PortalSetting, ServicePackage, CoverageArea, CustomerRequest,
      Customer, Subscription, Invoice, Router, Device,
    ]),
    PortalAccountModule,
  ],
  controllers: [PublicController],
  providers: [PublicService],
  exports: [PublicService],
})
export class PublicModule {}
