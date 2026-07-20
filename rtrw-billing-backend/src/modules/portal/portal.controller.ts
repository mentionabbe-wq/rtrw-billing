import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import { PortalService } from './portal.service';

@Controller('portal')
export class PortalController {
  constructor(private readonly svc: PortalService) {}

  /** Public — dibaca oleh halaman captive portal tanpa login */
  @Get('settings')
  getSettings() {
    return this.svc.get();
  }

  /** Public — pelanggan konfirmasi sudah bayar + bukti transfer (opsional). */
  @Post('payment-claim')
  claimPayment(@Body() body: { identifier: string; note?: string; proofImage?: string }) {
    return this.svc.claimPayment(body);
  }

  /** Admin only — simpan kustomisasi portal */
  @Patch('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateSettings(@Body() body: any) {
    const { id, ...dto } = body;
    return this.svc.update(dto);
  }
}
