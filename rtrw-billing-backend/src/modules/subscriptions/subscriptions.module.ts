import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Subscription, ServicePackage, Router } from '@database/entities';
import { MIKROTIK_QUEUE } from '@modules/scheduler/queue.constants';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, ServicePackage, Router]),
    BullModule.registerQueue({ name: MIKROTIK_QUEUE }),
    MikrotikModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
