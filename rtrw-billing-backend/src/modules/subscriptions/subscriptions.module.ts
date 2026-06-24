import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Subscription, ServicePackage } from '@database/entities';
import { MIKROTIK_QUEUE } from '@modules/scheduler/queue.constants';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, ServicePackage]),
    BullModule.registerQueue({ name: MIKROTIK_QUEUE }),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
