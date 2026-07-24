import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  /** PPPoE aktif live + sisa masa aktif. Definisikan SEBELUM route :id apa pun. */
  @Get('pppoe-active')
  pppoeActive() {
    return this.service.pppoeActive();
  }

  /** Buat langganan baru untuk pelanggan yang sudah ada. */
  @Post()
  @Roles('admin', 'operator')
  create(@Body() dto: {
    customerId: string; pppoeUser?: string; pppoePass?: string;
    packageId?: string; routerId?: string;
  }) {
    return this.service.create(dto);
  }

  @Patch(':id/package')
  @Roles('admin', 'operator')
  changePackage(@Param('id') id: string, @Body('packageId') packageId: string) {
    return this.service.changePackage(id, packageId);
  }

  @Patch(':id/pppoe')
  @Roles('admin', 'operator')
  editPppoe(@Param('id') id: string, @Body() body: { pppoeUser?: string; pppoePass?: string }) {
    return this.service.editPppoe(id, body);
  }

  @Post(':id/suspend')
  @Roles('admin', 'operator')
  suspend(@Param('id') id: string) {
    return this.service.setAccess(id, 'suspend');
  }

  @Post(':id/activate')
  @Roles('admin', 'operator')
  activate(@Param('id') id: string) {
    return this.service.setAccess(id, 'activate');
  }
}
