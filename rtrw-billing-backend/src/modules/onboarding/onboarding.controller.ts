import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import { CustomerRequestsService } from './customer-requests.service';
import { CoverageService } from './coverage.service';
import { PortalAccountsService } from './portal-accounts.service';
import {
  ApproveRequestDto, PortalAccessDto, RejectRequestDto, UpsertCoverageDto,
} from './dto/onboarding.dto';

/** Pendaftaran calon pelanggan — panel admin. */
@ApiTags('admin-onboarding')
@ApiBearerAuth()
@Controller('customer-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomerRequestsController {
  constructor(private readonly svc: CustomerRequestsService) {}

  @Get()
  @Roles('admin', 'operator')
  list(@Query('status') status?: string) {
    return this.svc.list(status);
  }

  @Get('counts')
  @Roles('admin', 'operator')
  counts() {
    return this.svc.counts();
  }

  @Get(':id')
  @Roles('admin', 'operator')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post(':id/contacted')
  @Roles('admin', 'operator')
  contacted(@Param('id') id: string, @Req() req: any) {
    return this.svc.markContacted(id, req.user?.id ? { id: req.user.id } as any : undefined);
  }

  @Post(':id/approve')
  @Roles('admin')
  approve(@Param('id') id: string, @Body() dto: ApproveRequestDto, @Req() req: any) {
    return this.svc.approve(id, dto, req.user?.id ? { id: req.user.id } as any : undefined);
  }

  @Post(':id/reject')
  @Roles('admin')
  reject(@Param('id') id: string, @Body() dto: RejectRequestDto, @Req() req: any) {
    return this.svc.reject(id, dto.reason, req.user?.id ? { id: req.user.id } as any : undefined);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}

/** Area layanan (coverage) — panel admin. */
@ApiTags('admin-onboarding')
@ApiBearerAuth()
@Controller('coverage-areas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoverageController {
  constructor(private readonly svc: CoverageService) {}

  @Get()
  @Roles('admin', 'operator')
  list() {
    return this.svc.list();
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: UpsertCoverageDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpsertCoverageDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}

/** Kendali akun portal pelanggan — panel admin. */
@ApiTags('admin-onboarding')
@ApiBearerAuth()
@Controller('portal-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PortalAccountsController {
  constructor(private readonly svc: PortalAccountsService) {}

  @Get(':customerId')
  @Roles('admin', 'operator')
  status(@Param('customerId') customerId: string) {
    return this.svc.status(customerId);
  }

  /** Buat/atur ulang kata sandi sementara, lalu kirim via WhatsApp. */
  @Post(':customerId/reset-password')
  @Roles('admin')
  reset(@Param('customerId') customerId: string) {
    return this.svc.resetPassword(customerId);
  }

  @Patch(':customerId/access')
  @Roles('admin')
  access(@Param('customerId') customerId: string, @Body() dto: PortalAccessDto) {
    return this.svc.setAccess(customerId, dto.enabled);
  }

  @Post(':customerId/logout-all')
  @Roles('admin')
  logoutAll(@Param('customerId') customerId: string) {
    return this.svc.logoutAll(customerId);
  }
}
