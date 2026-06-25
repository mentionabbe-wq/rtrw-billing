import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { BillingService } from './billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('invoices')
  list() {
    return this.billing.listInvoices();
  }

  @Post('invoices/generate')
  @Roles('admin', 'finance')
  generate(@Body('subscriptionId') subscriptionId: string) {
    return this.billing.generateInvoice(subscriptionId);
  }

  /** Bulk monthly invoice run. Body: { month?: "YYYY-MM" } (default bulan berjalan). */
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
}
