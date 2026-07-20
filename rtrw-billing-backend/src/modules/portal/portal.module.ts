import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Customer, Invoice, Payment, PortalSetting, Router, Subscription } from '@database/entities';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { GenieacsModule } from '@modules/genieacs/genieacs.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PortalSetting, Subscription, Customer, Invoice, Payment, Router]),
    MikrotikModule,
    GenieacsModule,
    JwtModule.register({}),
  ],
  controllers: [PortalController, CustomerPortalController],
  providers: [PortalService, CustomerPortalService],
})
export class PortalModule {}
