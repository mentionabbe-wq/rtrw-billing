import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { BillingService } from './billing.service';
import { PaymentGatewayService } from './payment-gateway.service';
import { IntegrationsService } from '@modules/integrations/integrations.service';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly gateway: PaymentGatewayService,
    private readonly integrations: IntegrationsService,
  ) {}

  /** Kirim pengingat WA sekarang (uji manual, pakai setting H- dari Integrasi). */
  @Post('reminders/send')
  @Roles('admin', 'finance')
  async sendReminders() {
    const wa = await this.integrations.resolveWa();
    const sent = await this.billing.sendDueReminders(wa.reminderDays);
    return { sent, days: wa.reminderDays };
  }

  @Get('invoices')
  list() {
    return this.billing.listInvoices();
  }

  @Post('invoices/generate')
  @Roles('admin', 'finance')
  generate(@Body('subscriptionId') subscriptionId: string) {
    return this.billing.generateInvoice(subscriptionId);
  }

  @Post('invoices/generate-monthly')
  @Roles('admin', 'finance')
  generateMonthly(@Body('month') month?: string) {
    return this.billing.generateMonthly(month);
  }

  /** Bayar manual (tunai/transfer) → lunas + pelanggan otomatis aktif kembali. */
  @Post('invoices/:id/pay')
  @Roles('admin', 'finance')
  pay(@Param('id') id: string, @Body('method') method?: string) {
    return this.billing.payManual(id, method);
  }

  /** Generate link pembayaran online via Tripay atau Midtrans. */
  @Post('invoices/:id/payment-link')
  @Roles('admin', 'finance', 'operator')
  async paymentLink(
    @Param('id') id: string,
    @Body('gateway') gatewayName: string = 'tripay',
  ) {
    return this.billing.createPaymentLink(id, gatewayName, this.gateway);
  }

  /** Riwayat pembayaran satu pelanggan. */
  @Get('customers/:customerId/payments')
  customerPayments(@Param('customerId') customerId: string) {
    return this.billing.customerPayments(customerId);
  }

  /** Kirim ulang kuitansi pembayaran ke WA pelanggan. */
  @Post('payments/:id/receipt')
  @Roles('admin', 'finance', 'operator')
  sendReceipt(@Param('id') id: string) {
    return this.billing.sendReceipt(id);
  }

  /** Cek apakah payment gateway sudah dikonfigurasi. */
  @Get('gateway/status')
  @Roles('admin', 'finance')
  gatewayStatus() {
    return this.gateway.getStatus();
  }
}
