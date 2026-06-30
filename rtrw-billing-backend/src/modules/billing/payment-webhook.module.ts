import { Module } from '@nestjs/common';
import { BillingModule } from './billing.module';
import { HotspotModule } from '@modules/hotspot/hotspot.module';
import { PaymentWebhookController } from './payment-webhook.controller';

/**
 * Modul terpisah agar BillingModule dan HotspotModule tidak saling import
 * (circular dependency). Controller webhook cukup inject keduanya dari sini.
 */
@Module({
  imports: [BillingModule, HotspotModule],
  controllers: [PaymentWebhookController],
})
export class PaymentWebhookModule {}
