import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import { IntegrationsService } from './integrations.service';

@Controller('settings/integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  @Get()
  get() {
    return this.svc.getMasked();
  }

  @Patch()
  update(@Body() body: any) {
    return this.svc.update(body);
  }
}
