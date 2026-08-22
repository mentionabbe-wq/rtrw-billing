import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Subscription, ServicePackage, Router, Customer, Device } from '@database/entities';
import { MIKROTIK_QUEUE } from '@modules/scheduler/queue.constants';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { SchedulerModule } from '@modules/scheduler/scheduler.module';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, ServicePackage, Router, Customer, Device]),
    BullModule.registerQueue({ name: MIKROTIK_QUEUE }),
    MikrotikModule,
    SchedulerModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
