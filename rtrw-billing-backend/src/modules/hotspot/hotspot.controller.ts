import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { HotspotService } from './hotspot.service';
import { PaymentGatewayService } from '@modules/billing/payment-gateway.service';

@ApiTags('hotspot')
@Controller('hotspot')
export class HotspotController {
  constructor(
    private readonly svc: HotspotService,
    private readonly gateway: PaymentGatewayService,
  ) {}

  // ── Public (tanpa auth) ──────────────────────────────────────────────────────

  /** Daftar paket hotspot yang aktif (untuk halaman beli voucher). */
  @Get('packages')
  packages() {
    return this.svc.listPackages();
  }

  /** Daftar router yang tersedia (untuk dropdown pilih hotspot). */
  @Get('routers')
  routers() {
    return this.svc.listRouters();
  }

  /** Gateway pembayaran yang terkonfigurasi — hanya yang aktif tampil di form beli. */
  @Get('gateways')
  async gateways() {
    const s = await this.gateway.getStatus();
    return { tripay: s.tripay.configured, midtrans: s.midtrans.configured };
  }

  /** Cek status voucher by kode — ditampilkan setelah pembayaran. */
  @Get('voucher/:code')
  getVoucher(@Param('code') code: string) {
    return this.svc.getByCode(code);
  }

  /** Pesan voucher TANPA gateway (bayar QRIS statis/transfer). */
  @Post('order')
  order(@Body() body: {
    packageId: number; routerId: string; buyerName?: string; buyerPhone?: string;
  }) {
    return this.svc.orderVoucher(body);
  }

  /** Pembeli klaim sudah bayar → admin diberi tahu utk menyetujui. */
  @Post('order/:code/claim')
  claim(@Param('code') code: string, @Body('note') note?: string) {
    return this.svc.claimPayment(code, note);
  }

  /** Beli voucher online → kembalikan payment URL. */
  @Post('purchase')
  purchase(@Body() body: {
    packageId: number;
    routerId: string;
    buyerName: string;
    buyerPhone?: string;
    gateway: string;
  }) {
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    return this.svc.purchaseVoucher(body, this.gateway, appUrl);
  }

  // ── Admin / Operator ─────────────────────────────────────────────────────────

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator', 'finance')
  stats() {
    return this.svc.getStats();
  }

  @Get('vouchers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator', 'finance')
  listVouchers(
    @Query('status') status?: string,
    @Query('packageId') packageId?: string,
  ) {
    return this.svc.listVouchers({
      status: status || undefined,
      packageId: packageId ? Number(packageId) : undefined,
    });
  }

  @Post('vouchers/generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  generate(@Body() body: { packageId: number; routerId: string; count?: number }) {
    return this.svc.generateBatch(body.packageId, body.routerId, Math.min(body.count ?? 10, 100));
  }

  @Post('vouchers/:id/void')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  voidVoucher(@Param('id') id: string) {
    return this.svc.voidVoucher(id);
  }

  /** Setujui pembayaran manual (QRIS/transfer) → voucher aktif. */
  @Post('vouchers/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'finance', 'operator')
  approveVoucher(@Param('id') id: string) {
    return this.svc.approveVoucher(id);
  }

  /** Sinkronisasi hotspot user dari Mikrotik ke DB voucher. */
  @Post('sync/:routerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  sync(@Param('routerId') routerId: string) {
    return this.svc.syncFromMikrotik(routerId);
  }

  // ── Admin packages CRUD ──────────────────────────────────────────────────────

  @Get('admin/packages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  allPackages() {
    return this.svc.allPackages();
  }

  @Post('admin/packages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createPackage(@Body() body: any) {
    return this.svc.createPackage(body);
  }

  @Patch('admin/packages/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updatePackage(@Param('id') id: string, @Body() body: any) {
    return this.svc.updatePackage(Number(id), body);
  }

  @Delete('admin/packages/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  deletePackage(@Param('id') id: string) {
    return this.svc.deletePackage(Number(id));
  }

  // ── Sinkron profil Mikrotik ──────────────────────────────────────────────────

  /** Baca daftar hotspot user profile dari Mikrotik untuk dipilih sebelum import. */
  @Get('admin/mikrotik-profiles/:routerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  mikrotikProfiles(@Param('routerId') routerId: string) {
    return this.svc.listMikrotikProfiles(routerId);
  }

  /** Import profil terpilih sebagai paket baru di DB. */
  @Post('admin/import-profiles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  importProfiles(@Body() body: {
    routerId: string;
    profiles: { name: string; rateLimit?: string; durationMinutes?: number; price?: number }[];
  }) {
    return this.svc.importPackagesFromProfiles(body.routerId, body.profiles);
  }

  /** Buat / update profil langsung di Mikrotik dari aplikasi. */
  @Post('admin/save-profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  saveProfile(@Body() body: {
    routerIds: string[];
    name: string;
    rateLimit?: string;
    sessionTimeout?: string;
    sharedUsers?: string;
  }) {
    const { routerIds, ...dto } = body;
    return this.svc.saveMikrotikProfile(routerIds, dto);
  }
}
