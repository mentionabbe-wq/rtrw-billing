import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice, Payment, Subscription } from '@database/entities';
import { MIKROTIK_QUEUE } from '@modules/scheduler/queue.constants';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, Payment, Subscription]),
    BullModule.registerQueue({ name: MIKROTIK_QUEUE }),
  ],
  controllers: [BillingController, PaymentWebhookController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
