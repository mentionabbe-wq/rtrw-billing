import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device, Olt, Subscription } from '@database/entities';
import { SnmpModule } from '@modules/snmp/snmp.module';
import { MonitoringGateway } from './monitoring.gateway';
import { MonitoringController, MonitoringService } from './monitoring.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Device, Olt, Subscription]), SnmpModule],
  controllers: [MonitoringController],
  providers: [MonitoringGateway, MonitoringService],
  exports: [MonitoringGateway],
})
export class MonitoringModule {}
