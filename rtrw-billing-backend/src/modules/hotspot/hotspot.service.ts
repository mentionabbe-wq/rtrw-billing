import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HotspotPackage, HotspotVoucher, Router } from '@database/entities';
import { MikrotikService } from '@modules/mikrotik/mikrotik.service';
import { CryptoService } from '@common/crypto/crypto.service';
import { WhatsappService } from '@modules/whatsapp/whatsapp.module';
import { PaymentGatewayService } from '@modules/billing/payment-gateway.service';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class HotspotService {
  private readonly logger = new Logger(HotspotService.name);

  constructor(
    @InjectRepository(HotspotPackage) private readonly pkgs: Repository<HotspotPackage>,
    @InjectRepository(HotspotVoucher) private readonly vouchers: Repository<HotspotVoucher>,
    @InjectRepository(Router) private readonly routers: Repository<Router>,
    private readonly mikrotik: MikrotikService,
    private readonly crypto: CryptoService,
    private readonly wa: WhatsappService,
  ) {}

  // ─── helpers ────────────────────────────────────────────────────────────────

  private randStr(n: number) {
    return Array.from({ length: n }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  }

  private genCode(): string {
    return `HS-${this.randStr(4)}-${this.randStr(4)}`;
  }

  private genPassword(): string {
    const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join('');
  }

  /** Konversi menit ke format uptime Mikrotik, mis. "1d00:00:00" atau "01:00:00". */
  private toUptime(minutes: number): string {
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    const m = minutes % 60;
    const hms = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    return d > 0 ? `${d}d${hms}` : hms;
  }

  // ─── packages ────────────────────────────────────────────────────────────────

  listPackages() {
    return this.pkgs.find({ where: { isActive: true }, order: { price: 'ASC' } });
  }

  allPackages() {
    return this.pkgs.find({ order: { price: 'ASC' } });
  }

  async createPackage(dto: Partial<HotspotPackage>) {
    return this.pkgs.save(this.pkgs.create(dto));
  }

  async updatePackage(id: number, dto: Partial<HotspotPackage>) {
    await this.pkgs.update(id, dto);
    return this.pkgs.findOneOrFail({ where: { id } });
  }

  async deletePackage(id: number) {
    await this.pkgs.delete(id);
    return { deleted: true };
  }

  // ─── routers (public) ────────────────────────────────────────────────────────

  async listRouters() {
    const rows = await this.routers.find({ order: { name: 'ASC' } });
    return rows.map((r) => ({ id: r.id, name: r.name, status: r.status }));
  }

  // ─── vouchers ────────────────────────────────────────────────────────────────

  async listVouchers(filter: { status?: string; packageId?: number } = {}) {
    const qb = this.vouchers
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.package', 'pkg')
      .leftJoinAndSelect('v.router', 'r')
      .orderBy('v.id', 'DESC')
      .take(500);

    if (filter.status) qb.andWhere('v.status = :s', { s: filter.status });
    if (filter.packageId) qb.andWhere('v.packageId = :pid', { pid: filter.packageId });

    const rows = await qb.getMany();
    return rows.map((v) => ({
      id: v.id,
      code: v.code,
      username: v.username,
      status: v.status,
      packageName: v.package?.name ?? null,
      durationMinutes: v.package?.durationMinutes ?? null,
      routerName: v.router?.name ?? null,
      buyerName: v.buyerName ?? null,
      amount: v.amount,
      expiresAt: v.expiresAt,
      createdAt: v.createdAt,
    }));
  }

  async getStats() {
    const [total, active, pending, voidCount] = await Promise.all([
      this.vouchers.count(),
      this.vouchers.count({ where: { status: 'active' } }),
      this.vouchers.count({ where: { status: 'pending' } }),
      this.vouchers.count({ where: { status: 'void' } }),
    ]);
    return { total, active, pending, void: voidCount };
  }

  /**
   * Generate batch voucher secara langsung (admin).
   * Voucher langsung dibuat di Mikrotik dengan status active.
   */
  async generateBatch(packageId: number, routerId: string, count: number) {
    const pkg = await this.pkgs.findOneOrFail({ where: { id: packageId } });
    const router = await this.routers.findOneOrFail({ where: { id: routerId } });

    const created: { code: string; username: string; password: string; packageName: string }[] = [];

    for (let i = 0; i < count; i++) {
      const code = this.genCode();
      const username = code.replace(/-/g, '');
      const password = this.genPassword();
      const passwordEnc = this.crypto.encrypt(password);

      await this.vouchers.save(
        this.vouchers.create({
          code, username, passwordEnc,
          packageId, routerId,
          status: 'active',
          amount: pkg.price,
          expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000), // 90 hari
        }),
      );

      try {
        await this.mikrotik.addHotspotUser(
          router, username, password, pkg.mikrotikProfile, this.toUptime(pkg.durationMinutes),
        );
      } catch (e) {
        this.logger.warn(`addHotspotUser ${username} gagal: ${e.message}`);
      }

      created.push({ code, username, password, packageName: pkg.name });
    }

    this.logger.log(`Generated ${created.length} vouchers for pkg=${pkg.name} router=${router.name}`);
    return created;
  }

  /**
   * Pembelian online — buat voucher pending + payment link.
   * appUrl dan paymentGateway di-pass dari controller agar tidak circular dependency.
   */
  async purchaseVoucher(
    dto: { packageId: number; routerId: string; buyerName: string; buyerPhone?: string; gateway: string },
    paymentGateway: PaymentGatewayService,
    appUrl: string,
  ) {
    const pkg = await this.pkgs.findOneOrFail({ where: { id: dto.packageId } });

    const code = this.genCode();
    const username = code.replace(/-/g, '');
    const password = this.genPassword();
    const passwordEnc = this.crypto.encrypt(password);
    const buyerPhoneEnc = dto.buyerPhone ? this.crypto.encrypt(dto.buyerPhone) : null;

    await this.vouchers.save(
      this.vouchers.create({
        code, username, passwordEnc,
        packageId: dto.packageId,
        routerId: dto.routerId,
        status: 'pending',
        buyerName: dto.buyerName || null,
        buyerPhoneEnc,
        amount: pkg.price,
      }),
    );

    const params = {
      invoiceNo: code,
      amount: Math.round(Number(pkg.price)),
      customerName: dto.buyerName || 'Pembeli Voucher',
      customerPhone: dto.buyerPhone || undefined,
      description: `Voucher Hotspot ${pkg.name}`,
      returnUrl: `${appUrl}/voucher?code=${code}`,
    };

    const result = dto.gateway === 'midtrans'
      ? await paymentGateway.createMidtrans(params)
      : await paymentGateway.createTripay(params);

    await this.vouchers.update({ code }, { paymentRef: result.reference, paymentGateway: result.gateway });

    return { code, paymentUrl: result.paymentUrl, gateway: result.gateway };
  }

  /**
   * Dipanggil webhook saat pembayaran voucher konfirmasi.
   * code = merchant_ref / order_id dari gateway.
   */
  async activateByCode(code: string, gatewayRef: string, amount: string, method: string): Promise<void> {
    const voucher = await this.vouchers.findOne({
      where: { code },
      relations: { package: true, router: true },
    });
    if (!voucher || voucher.status !== 'pending') return;

    const password = this.crypto.decrypt(voucher.passwordEnc);

    if (voucher.router && voucher.package) {
      try {
        await this.mikrotik.addHotspotUser(
          voucher.router,
          voucher.username,
          password,
          voucher.package.mikrotikProfile,
          this.toUptime(voucher.package.durationMinutes),
        );
      } catch (e) {
        this.logger.warn(`addHotspotUser ${voucher.username} saat aktivasi: ${e.message}`);
      }
    }

    await this.vouchers.update(voucher.id, {
      status: 'active',
      paymentRef: gatewayRef,
      paymentGateway: method,
    });

    if (voucher.buyerPhoneEnc) {
      const phone = this.crypto.decrypt(voucher.buyerPhoneEnc);
      if (phone) {
        await this.wa.sendRaw(
          phone,
          `Halo ${voucher.buyerName ?? 'Pelanggan'}, voucher hotspot Anda sudah AKTIF!\n\n` +
          `📶 Paket: ${voucher.package?.name ?? ''}\n` +
          `🔑 Username: ${voucher.username}\n` +
          `🔐 Password: ${password}\n\n` +
          `Masukkan username & password tersebut di halaman login hotspot WiFi. Terima kasih!`,
        );
      }
    }

    this.logger.log(`Voucher ${code} activated via ${method}`);
  }

  /** Cek status voucher (public — untuk landing page setelah bayar). */
  async getByCode(code: string) {
    const v = await this.vouchers.findOne({
      where: { code },
      relations: { package: true },
    });
    if (!v) return null;

    const password = v.status === 'active' ? this.crypto.decrypt(v.passwordEnc) : null;
    return {
      code: v.code,
      username: v.username,
      password,
      status: v.status,
      packageName: v.package?.name ?? null,
      durationMinutes: v.package?.durationMinutes ?? null,
      buyerName: v.buyerName,
      expiresAt: v.expiresAt,
    };
  }

  /** Batalkan voucher (admin). */
  async voidVoucher(id: string) {
    const v = await this.vouchers.findOne({ where: { id }, relations: { router: true } });
    if (!v) throw new NotFoundException('Voucher tidak ditemukan');

    if (v.router && v.status === 'active') {
      try {
        await this.mikrotik.removeHotspotUser(v.router, v.username);
      } catch (e) {
        this.logger.warn(`removeHotspotUser ${v.username}: ${e.message}`);
      }
    }

    await this.vouchers.update(id, { status: 'void' });
    return { voided: true };
  }
}
