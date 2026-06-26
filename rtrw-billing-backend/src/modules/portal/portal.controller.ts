import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { Roles } from '@modules/auth/roles.decorator';
import { RolesGuard } from '@modules/auth/roles.guard';
import { PortalService } from './portal.service';

@Controller('portal')
export class PortalController {
  constructor(private readonly svc: PortalService) {}

  /** Public — dibaca oleh halaman captive portal tanpa login */
  @Get('settings')
  getSettings() {
    return this.svc.get();
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
