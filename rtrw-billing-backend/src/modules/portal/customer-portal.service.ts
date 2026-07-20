import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer, Invoice, Payment, Router, Subscription } from '@database/entities';
import { CryptoService } from '@common/crypto/crypto.service';
import { MikrotikService } from '@modules/mikrotik/mikrotik.service';
import { GenieacsService } from '@modules/genieacs/genieacs.module';

/** Payload token portal pelanggan (dibedakan dari token admin lewat `scope`). */
interface PortalTokenPayload {
  scope: 'customer-portal';
  customerId: string;
}

@Injectable()
export class CustomerPortalService {
  private readonly logger = new Logger(CustomerPortalService.name);

  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Router) private readonly routers: Repository<Router>,
    private readonly crypto: CryptoService,
    private readonly mikrotik: MikrotikService,
    private readonly genieacs: GenieacsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Identifikasi ──────────────────────────────────────────────────────────

  /** Normalisasi IP: buang prefix IPv6-mapped (::ffff:192.168.40.2 → 192.168.40.2). */
  private normalizeIp(ip?: string): string {
    return (ip ?? '').replace(/^::ffff:/, '').trim();
  }

  /**
   * Kenali pelanggan dari IP koneksinya: IP → sesi PPPoE aktif di Mikrotik →
   * user PPPoE → langganan → pelanggan. Tanpa login, hanya jalan bila pelanggan
   * membuka portal dari jaringan mereka sendiri.
   */
  async identifyByIp(rawIp?: string): Promise<Subscription | null> {
    const ip = this.normalizeIp(rawIp);
    if (!ip || ip === '127.0.0.1' || ip === '::1') return null;

    const routers = await this.routers.find({ where: { status: 'online' } });
    let pppoeUser: string | null = null;
    for (const r of routers) {
      try {
        const sessions = await this.mikrotik.listActive(r);
        const hit = sessions.find((s: any) => String(s.address) === ip);
        if (hit) { pppoeUser = String(hit.name); break; }
      } catch { /* router tak terjangkau — coba router berikutnya */ }
    }
    if (!pppoeUser) return null;

    return this.subs
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .leftJoinAndSelect('s.package', 'p')
      .where('LOWER(s.pppoeUser) = LOWER(:u)', { u: pppoeUser })
      .getOne();
  }

  /** Login cadangan: no. pelanggan + 4 digit terakhir no. HP. */
  async identifyByCredentials(customerNo: string, phoneLast4: string): Promise<Subscription | null> {
    const no = (customerNo ?? '').trim();
    const last4 = (phoneLast4 ?? '').replace(/\D/g, '').slice(-4);
    if (!no || last4.length !== 4) {
      throw new BadRequestException('Isi no. pelanggan dan 4 digit terakhir no. HP.');
    }

    const customer = await this.customers
      .createQueryBuilder('c')
      .where('LOWER(c.customerNo) = LOWER(:no)', { no })
      .getOne();
    if (!customer) return null;

    const phone = this.crypto.decrypt(customer.phoneEnc) ?? '';
    if (phone.replace(/\D/g, '').slice(-4) !== last4) return null;

    return this.subs
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .leftJoinAndSelect('s.package', 'p')
      .where('c.id = :id', { id: customer.id })
      .getOne() ?? null;
  }

  issueToken(customerId: string): string {
    const payload: PortalTokenPayload = { scope: 'customer-portal', customerId };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.secret'),
      expiresIn: '12h',
    });
  }

  verifyToken(token?: string): string {
    if (!token) throw new UnauthorizedException('Sesi tidak ditemukan, silakan masuk kembali.');
    try {
      const p = this.jwt.verify<PortalTokenPayload>(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
      if (p.scope !== 'customer-portal') throw new Error('scope');
      return p.customerId;
    } catch {
      throw new UnauthorizedException('Sesi berakhir, silakan masuk kembali.');
    }
  }

  // ─── Data pelanggan ────────────────────────────────────────────────────────

  /** Ringkasan untuk portal: identitas, langganan, tagihan, riwayat, WiFi. */
  async overview(customerId: string) {
    const sub = await this.subs
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .leftJoinAndSelect('s.package', 'p')
      .where('c.id = :id', { id: customerId })
      .getOne();
    const customer = sub?.customer ?? (await this.customers.findOne({ where: { id: customerId } }));
    if (!customer) throw new UnauthorizedException('Data pelanggan tidak ditemukan.');

    const invoices = await this.invoices
      .createQueryBuilder('i')
      .leftJoin('i.subscription', 's')
      .leftJoin('s.customer', 'c')
      .where('c.id = :id', { id: customerId })
      .orderBy('i.id', 'DESC')
      .take(12)
      .getMany();

    const payments = await this.payments.find({
      where: { invoice: { subscription: { customer: { id: customerId } } } },
      relations: { invoice: true },
      order: { id: 'DESC' },
      take: 12,
    });

    const wifi = await this.findWifiDevice(sub?.pppoeUser ?? null);

    return {
      customer: {
        fullName: customer.fullName,
        customerNo: customer.customerNo,
        status: customer.status,
      },
      subscription: sub
        ? {
            pppoeUser: sub.pppoeUser,
            status: sub.status,
            dueDate: sub.dueDate,
            packageName: sub.package?.name ?? null,
            rateLimit: sub.package?.rateLimit ?? null,
            price: sub.package?.price ?? null,
          }
        : null,
      invoices: invoices.map((i) => ({
        id: i.id,
        invoiceNo: i.invoiceNo,
        amount: i.amount,
        status: i.status,
        dueDate: i.dueDate,
        periodStart: i.periodStart,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method ?? p.gateway,
        paidAt: p.paidAt,
        invoiceNo: p.invoice?.invoiceNo ?? null,
      })),
      wifi: wifi ? { deviceId: wifi.deviceId, ssid: wifi.ssid, online: wifi.online } : null,
    };
  }

  /**
   * Cari perangkat TR-069 milik pelanggan: IP sesi PPPoE-nya dicocokkan dengan
   * IP WAN yang dilaporkan ONU ke GenieACS. Null bila ONU belum terhubung ACS.
   */
  private async findWifiDevice(pppoeUser: string | null) {
    if (!pppoeUser) return null;

    // IP aktif user ini dari Mikrotik.
    let ip: string | null = null;
    const routers = await this.routers.find({ where: { status: 'online' } });
    for (const r of routers) {
      try {
        const sessions = await this.mikrotik.listActive(r);
        const hit = sessions.find((s: any) => String(s.name).toLowerCase() === pppoeUser.toLowerCase());
        if (hit?.address) { ip = String(hit.address); break; }
      } catch { /* skip */ }
    }
    if (!ip) return null;

    try {
      const devices = await this.genieacs.listDevices();
      const dev = devices.find((d: any) => d.ip === ip);
      return dev ? { deviceId: dev.id, ssid: dev.ssid, online: dev.online } : null;
    } catch {
      return null; // GenieACS tak dikonfigurasi/tak terjangkau → sembunyikan fitur
    }
  }

  /** Ubah SSID / password WiFi milik pelanggan sendiri (via TR-069). */
  async changeWifi(customerId: string, ssid?: string, password?: string) {
    if (!ssid && !password) throw new BadRequestException('Isi nama WiFi atau password baru.');
    if (password && password.length < 8) {
      throw new BadRequestException('Password WiFi minimal 8 karakter.');
    }

    const sub = await this.subs
      .createQueryBuilder('s')
      .leftJoin('s.customer', 'c')
      .addSelect('s.pppoeUser')
      .where('c.id = :id', { id: customerId })
      .getOne();

    const wifi = await this.findWifiDevice(sub?.pppoeUser ?? null);
    if (!wifi) {
      throw new BadRequestException(
        'Perangkat WiFi Anda belum terhubung ke sistem. Hubungi admin untuk mengaktifkan fitur ini.',
      );
    }

    await this.genieacs.setWifi(wifi.deviceId, ssid, password);
    this.logger.log(`Portal pelanggan ${customerId} mengubah WiFi (device ${wifi.deviceId})`);
    return { ok: true };
  }
}
