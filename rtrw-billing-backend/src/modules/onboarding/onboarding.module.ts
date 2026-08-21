import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoverageArea, Customer, CustomerRequest, ServicePackage } from '@database/entities';
import { PortalAccountModule } from '@modules/portal-account/portal-account.module';
import {
  CoverageController, CustomerRequestsController, PortalAccountsController,
} from './onboarding.controller';
import { CustomerRequestsService } from './customer-requests.service';
import { CoverageService } from './coverage.service';
import { PortalAccountsService } from './portal-accounts.service';

/**
 * PHASE 1 — sisi admin untuk onboarding pelanggan:
 * pendaftaran calon pelanggan, area coverage, dan akun portal.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerRequest, Customer, ServicePackage, CoverageArea]),
    PortalAccountModule,
  ],
  controllers: [CustomerRequestsController, CoverageController, PortalAccountsController],
  providers: [CustomerRequestsService, CoverageService, PortalAccountsService],
  exports: [CustomerRequestsService, CoverageService],
})
export class OnboardingModule {}
