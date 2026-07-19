import { BadRequestException, Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import { IntegrationsService } from './integrations.service';
import { WhatsappService } from '@modules/whatsapp/whatsapp.module';

@Controller('settings/integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class IntegrationsController {
  constructor(
    private readonly svc: IntegrationsService,
    private readonly wa: WhatsappService,
  ) {}

  @Get()
  get() {
    return this.svc.getMasked();
  }

  @Patch()
  update(@Body() body: any) {
    return this.svc.update(body);
  }

  /** Kirim pesan tes ke Telegram (validasi bot token + chat ID). */
  @Post('telegram/test')
  async testTelegram() {
    const r = await this.wa.testTelegram();
    if (!r.ok) throw new BadRequestException(r.error ?? 'Tes Telegram gagal');
    return r;
  }
}
