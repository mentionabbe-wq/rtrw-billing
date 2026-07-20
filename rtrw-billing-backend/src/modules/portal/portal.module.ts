import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, Invoice, PortalSetting, Subscription } from '@database/entities';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [TypeOrmModule.forFeature([PortalSetting, Subscription, Customer, Invoice])],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
