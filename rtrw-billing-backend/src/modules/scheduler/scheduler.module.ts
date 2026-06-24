import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Subscription, Device, MikrotikSyncLog, DeviceMetric, Olt,
} from '@database/entities';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { SnmpModule } from '@modules/snmp/snmp.module';
import { BillingModule } from '@modules/billing/billing.module';
import { MIKROTIK_QUEUE, MONITOR_QUEUE } from './queue.constants';
import { SchedulerService } from './scheduler.service';
import { MikrotikProcessor } from './mikrotik.processor';
import { MonitorProcessor } from './monitor.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, Device, MikrotikSyncLog, DeviceMetric, Olt]),
    BullModule.registerQueue({ name: MIKROTIK_QUEUE }, { name: MONITOR_QUEUE }),
    MikrotikModule,
    SnmpModule,
    BillingModule,
  ],
  providers: [SchedulerService, MikrotikProcessor, MonitorProcessor],
})
export class SchedulerModule {}
