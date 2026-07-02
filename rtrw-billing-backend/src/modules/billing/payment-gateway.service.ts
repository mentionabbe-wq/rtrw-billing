import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { IntegrationsService } from '@modules/integrations/integrations.service';

export interface PaymentLinkResult {
  gateway: string;
  paymentUrl: string;
  reference: string;
  expiredAt?: string;
}

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly integrations: IntegrationsService,
  ) {}

  /** Cek konfigurasi gateway yang sudah diisi (DB dulu, env fallback). */
  async getStatus() {
    const cfg = await this.integrations.resolvePayment();
    const tripayOk = !!(cfg.tripayApiKey && cfg.tripayPrivateKey && cfg.tripayMerchantCode);
    const midtransOk = !!cfg.midtransServerKey;
    return {
      tripay: { configured: tripayOk, mode: cfg.tripayMode },
      midtrans: { configured: midtransOk, mode: cfg.midtransMode },
    };
  }

  /** Buat link pembayaran via Tripay. returnUrl opsional — default ke /portal. */
  async createTripay(invoice: {
    invoiceNo: string;
    amount: number;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    description: string;
    returnUrl?: string;
  }): Promise<PaymentLinkResult> {
    const cfg = await this.integrations.resolvePayment();
    const { tripayApiKey: apiKey, tripayPrivateKey: privateKey, tripayMerchantCode: merchantCode, tripayMode: mode } = cfg;
    const appUrl = this.config.get<string>('payment.appUrl');

    if (!apiKey || !privateKey || !merchantCode) {
      throw new BadRequestException('Tripay belum dikonfigurasi. Isi di menu Pengaturan → Integrasi.');
    }

    const signature = crypto
      .createHmac('sha256', privateKey)
      .update(merchantCode + invoice.invoiceNo + invoice.amount)
      .digest('hex');

    const baseUrl = mode === 'production'
      ? 'https://tripay.co.id/api'
      : 'https://tripay.co.id/api-sandbox';

    const expiredAt = Math.floor(Date.now() / 1000) + 24 * 3600;

    const body = {
      method: 'QRIS',
      merchant_ref: invoice.invoiceNo,
      amount: invoice.amount,
      customer_name: invoice.customerName,
      customer_email: invoice.customerEmail || 'pelanggan@rtrwnet.local',
      customer_phone: invoice.customerPhone || '08000000000',
      order_items: [{ name: invoice.description, price: invoice.amount, quantity: 1 }],
      callback_url: `${appUrl}/api/payments/webhook/tripay`,
      return_url: invoice.returnUrl ?? `${appUrl}/portal`,
      expired_time: expiredAt,
      signature,
    };

    const res = await fetch(`${baseUrl}/transaction/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json: any = await res.json();
    if (!json.success) {
      this.logger.error(`Tripay create failed: ${JSON.stringify(json)}`);
      throw new BadRequestException(`Tripay error: ${json.message ?? JSON.stringify(json.data)}`);
    }

    return {
      gateway: 'tripay',
      paymentUrl: json.data.checkout_url,
      reference: json.data.reference,
      expiredAt: new Date(expiredAt * 1000).toISOString(),
    };
  }

  /** Buat link pembayaran via Midtrans Snap. returnUrl opsional — default ke /portal. */
  async createMidtrans(invoice: {
    invoiceNo: string;
    amount: number;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    description: string;
    returnUrl?: string;
  }): Promise<PaymentLinkResult> {
    const cfg = await this.integrations.resolvePayment();
    const { midtransServerKey: serverKey, midtransMode: mode } = cfg;
    const appUrl = this.config.get<string>('payment.appUrl');

    if (!serverKey) {
      throw new BadRequestException('Midtrans belum dikonfigurasi. Isi di menu Pengaturan → Integrasi.');
    }

    const baseUrl = mode === 'production'
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    const body = {
      transaction_details: { order_id: invoice.invoiceNo, gross_amount: invoice.amount },
      customer_details: {
        first_name: invoice.customerName,
        email: invoice.customerEmail || 'pelanggan@rtrwnet.local',
        phone: invoice.customerPhone || '08000000000',
      },
      item_details: [{ id: invoice.invoiceNo, price: invoice.amount, quantity: 1, name: invoice.description }],
      callbacks: {
        finish: invoice.returnUrl ?? `${appUrl}/portal`,
        notification: `${appUrl}/api/payments/webhook/midtrans`,
      },
    };

    const auth = Buffer.from(serverKey + ':').toString('base64');
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json: any = await res.json();
    if (!json.token) {
      this.logger.error(`Midtrans Snap create failed: ${JSON.stringify(json)}`);
      throw new BadRequestException(`Midtrans error: ${json.error_messages?.join(', ') ?? JSON.stringify(json)}`);
    }

    const snapUrl = mode === 'production'
      ? `https://app.midtrans.com/snap/v2/vtweb/${json.token}`
      : `https://app.sandbox.midtrans.com/snap/v2/vtweb/${json.token}`;

    return {
      gateway: 'midtrans',
      paymentUrl: snapUrl,
      reference: json.token,
    };
  }
}
