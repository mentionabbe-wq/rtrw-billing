import { BadRequestException, Body, Controller, Logger, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { BillingService } from './billing.service';
import { HotspotService } from '@modules/hotspot/hotspot.service';

/**
 * Public webhook endpoints. NOT behind JwtAuthGuard — signature verification wajib.
 * Prefix "HS-" pada merchant_ref/order_id → diteruskan ke HotspotService.
 * Prefix lain (INV...) → BillingService (tagihan PPPoE).
 */
@ApiTags('payments')
@Controller('payments/webhook')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly billing: BillingService,
    private readonly hotspot: HotspotService,
    private readonly config: ConfigService,
  ) {}

  /** Midtrans HTTP notification. */
  @Post('midtrans')
  async midtrans(@Body() body: any) {
    const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    const expected = crypto
      .createHash('sha512')
      .update(body.order_id + body.status_code + body.gross_amount + serverKey)
      .digest('hex');

    if (expected !== body.signature_key) {
      this.logger.warn(`Midtrans signature mismatch for ${body.order_id}`);
      throw new BadRequestException('Invalid signature');
    }

    const settled = ['capture', 'settlement'].includes(body.transaction_status);
    if (settled) {
      if (String(body.order_id).startsWith('HS-')) {
        await this.hotspot.activateByCode(body.order_id, body.transaction_id, body.gross_amount, body.payment_type);
      } else {
        await this.billing.settlePayment({
          invoiceNo: body.order_id,
          gateway: 'midtrans',
          gatewayRef: body.transaction_id,
          amount: body.gross_amount,
          method: body.payment_type,
          rawPayload: body,
        });
      }
    }
    return { ok: true };
  }

  /** Tripay callback (signature in X-Callback-Signature header). */
  @Post('tripay')
  async tripay(@Req() req: any, @Body() body: any) {
    const privateKey = process.env.TRIPAY_PRIVATE_KEY || '';
    const signature = crypto
      .createHmac('sha256', privateKey)
      .update(JSON.stringify(body))
      .digest('hex');

    if (signature !== req.headers['x-callback-signature']) {
      this.logger.warn(`Tripay signature mismatch for ${body.merchant_ref}`);
      throw new BadRequestException('Invalid signature');
    }

    if (body.status === 'PAID') {
      if (String(body.merchant_ref).startsWith('HS-')) {
        await this.hotspot.activateByCode(
          body.merchant_ref, body.reference,
          String(body.amount_received ?? body.amount), body.payment_method,
        );
      } else {
        await this.billing.settlePayment({
          invoiceNo: body.merchant_ref,
          gateway: 'tripay',
          gatewayRef: body.reference,
          amount: String(body.amount_received ?? body.amount),
          method: body.payment_method,
          rawPayload: body,
        });
      }
    }
    return { success: true };
  }
}
