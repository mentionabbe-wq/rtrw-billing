import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CustomerPortalService } from '@modules/portal/customer-portal.service';
import { CustomerAccountService } from './customer-account.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerJwtGuard, Portal, PortalActor } from './customer-jwt.guard';
import { ChangePasswordDto, UpdateProfileDto } from './dto/customer-auth.dto';
import { ChangeWifiDto } from './dto/wifi.dto';

/**
 * Data milik pelanggan yang sedang masuk — `/api/portal/me/*`.
 * Semua endpoint memakai id pelanggan DARI TOKEN, tidak pernah dari parameter.
 */
@ApiTags('portal-account')
@ApiBearerAuth()
@Controller('portal/me')
@UseGuards(CustomerJwtGuard)
export class CustomerAccountController {
  constructor(
    private readonly account: CustomerAccountService,
    private readonly auth: CustomerAuthService,
    private readonly wifi: CustomerPortalService,
  ) {}

  @Get()
  dashboard(@Portal() actor: PortalActor) {
    return this.account.dashboard(actor.customerId);
  }

  @Get('internet')
  internet(@Portal() actor: PortalActor) {
    return this.account.internet(actor.customerId);
  }

  @Get('device')
  device(@Portal() actor: PortalActor) {
    return this.account.device(actor.customerId);
  }

  @Get('invoices')
  invoices(@Portal() actor: PortalActor) {
    return this.account.invoiceList(actor.customerId);
  }

  @Get('invoices/:id')
  invoice(@Portal() actor: PortalActor, @Param('id') id: string) {
    return this.account.invoiceDetail(actor.customerId, id);
  }

  @Get('payments')
  payments(@Portal() actor: PortalActor) {
    return this.account.paymentHistory(actor.customerId);
  }

  /** Info WiFi pelanggan (§8). */
  @Get('wifi')
  wifiInfo(@Portal() actor: PortalActor) {
    return this.wifi.wifiInfoFor(actor.customerId);
  }

  /**
   * Ubah nama / kata sandi WiFi sendiri (§9, §10). Perangkat dipastikan milik
   * pelanggan ini lewat langganannya, bukan lewat id yang dikirim klien.
   */
  @Post('wifi')
  async changeWifi(@Portal() actor: PortalActor, @Body() dto: ChangeWifiDto) {
    const features = await this.account.featureFlags();
    if (dto.ssid !== undefined && !features.wifiName) {
      throw new BadRequestException('Ubah nama WiFi sedang dinonaktifkan oleh admin.');
    }
    if (dto.password !== undefined && !features.wifiPassword) {
      throw new BadRequestException('Ubah kata sandi WiFi sedang dinonaktifkan oleh admin.');
    }
    // Kata sandi WiFi tidak pernah ikut tercatat di audit log — hanya fakta perubahannya.
    await this.wifi.changeWifi(actor.customerId, dto.ssid?.trim(), dto.password);
    return {
      ok: true,
      message: dto.password
        ? 'Kata sandi WiFi berhasil diubah. Perangkat yang sedang terhubung mungkin akan terputus.'
        : 'Nama WiFi berhasil diubah.',
    };
  }

  @Get('notifications')
  notifications(@Portal() actor: PortalActor) {
    return this.account.notifications(actor.customerId);
  }

  @Post('notifications/:id/read')
  readNotification(@Portal() actor: PortalActor, @Param('id') id: string) {
    return this.account.markRead(actor.customerId, id);
  }

  @Post('notifications/read-all')
  readAll(@Portal() actor: PortalActor) {
    return this.account.markAllRead(actor.customerId);
  }

  @Get('profile')
  profile(@Portal() actor: PortalActor) {
    return this.account.profile(actor.customerId);
  }

  @Patch('profile')
  updateProfile(@Portal() actor: PortalActor, @Body() dto: UpdateProfileDto) {
    return this.account.updateProfile(actor.customerId, dto);
  }

  @Post('password')
  changePassword(@Portal() actor: PortalActor, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(actor.customerId, dto.oldPassword, dto.newPassword);
  }
}
