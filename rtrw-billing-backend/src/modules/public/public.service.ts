import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CoverageArea, Customer, CustomerRequest, Device, Invoice, PortalSetting, Router, ServicePackage,
  Subscription,
} from '@database/entities';
import { CryptoService } from '@common/crypto/crypto.service';
import { RateLimitService } from '@common/security/rate-limit.service';
import { maskName, maskPhone, normalizePhone } from '@common/security/phone.util';
import { WhatsappService } from '@modules/whatsapp/whatsapp.module';
import { CustomerAuthService, RequestMeta } from '@modules/portal-account/customer-auth.service';
import { BillingCheckVerifyDto, CoverageCheckDto, RegisterLeadDto } from './dto/public.dto';

const DEFAULT_HERO_TITLE = 'Internet Cepat & Stabil untuk Rumah Anda';
const DEFAULT_HERO_SUBTITLE =
  'Kelola layanan internet, tagihan, pembayaran, dan WiFi Anda dengan mudah.';

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    @InjectRepository(PortalSetting) private readonly settings: Repository<PortalSetting>,
    @InjectRepository(ServicePackage) private readonly packages: Repository<ServicePackage>,
    @InjectRepository(CoverageArea) private readonly coverage: Repository<CoverageArea>,
    @InjectRepository(CustomerRequest) private readonly requests: Repository<CustomerRequest>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(Router) private readonly routers: Repository<Router>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly crypto: CryptoService,
    private readonly limiter: RateLimitService,
    private readonly wa: WhatsappService,
    private readonly auth: CustomerAuthService,
  ) {}

  // ─── Konten landing page (§2, §33, §34) ────────────────────────────────────

  async landing() {
    const s = (await this.settings.findOne({ where: { id: 1 } })) ?? ({} as PortalSetting);
    return {
      company: {
        name: s.companyName ?? 'RT/RW Net',
        tagline: s.tagline ?? 'Layanan Internet Rumahan',
        logoUrl: s.logoUrl ?? null,
        primaryColor: s.primaryColor ?? '#012b6d',
        whatsappNumber: s.whatsappNumber ?? null,
        contactEmail: s.contactEmail ?? null,
        officeAddress: s.officeAddress ?? null,
        footerText: s.footerText ?? null,
      },
      hero: {
        title: s.heroTitle || DEFAULT_HERO_TITLE,
        subtitle: s.heroSubtitle || DEFAULT_HERO_SUBTITLE,
      },
      highlights: s.highlights?.length
        ? s.highlights
        : [
            { title: 'Jaringan Fiber', text: 'Fiber optik sampai rumah, stabil untuk kerja & belajar.' },
            { title: 'Tanpa FUP', text: 'Kuota unlimited, kecepatan sesuai paket sepanjang bulan.' },
            { title: 'Dukungan Lokal', text: 'Teknisi warga sekitar, respons cepat lewat WhatsApp.' },
          ],
      faq: s.faq?.length
        ? s.faq
        : [
            { q: 'Berapa lama proses pemasangan?', a: 'Umumnya 1–3 hari kerja setelah pendaftaran disetujui dan lokasi masuk area layanan.' },
            { q: 'Apakah ada biaya pemasangan?', a: 'Biaya pemasangan menyesuaikan jarak dan kebutuhan material. Petugas kami akan menginformasikan sebelum pemasangan.' },
            { q: 'Bagaimana cara membayar tagihan?', a: 'Melalui transfer bank, QRIS, atau metode lain yang tersedia di portal pelanggan.' },
            { q: 'Apa yang terjadi bila telat bayar?', a: 'Layanan akan diisolir sementara setelah masa tenggang, dan aktif kembali otomatis setelah pembayaran terverifikasi.' },
          ],
      payment: {
        instructions: s.paymentInstructions ?? null,
        bankAccounts: s.bankAccounts ?? [],
        qrisAvailable: !!s.qrisImage,
      },
      coverageNote: s.coverageNote ?? null,
      registrationEnabled: s.registrationEnabled !== false,
      packages: await this.publicPackages(),
      coverage: await this.publicCoverage(),
      status: await this.networkStatus(),
    };
  }

  /** Kartu paket di landing page — harga selalu dari database (§34). */
  async publicPackages() {
    const rows = await this.packages.find({
      where: { isActive: true, isPublic: true },
      order: { sortOrder: 'ASC', price: 'ASC' },
    });
    return rows.map((p) => ({
      id: String(p.id),
      name: p.name,
      price: Number(p.price),
      speedDownMbps: p.speedDownMbps ?? this.speedFromRateLimit(p.rateLimit, 0),
      speedUpMbps: p.speedUpMbps ?? this.speedFromRateLimit(p.rateLimit, 1),
      description: p.description ?? null,
      features: p.features?.length ? p.features : ['Unlimited tanpa FUP', 'Gratis pemasangan WiFi', 'Portal pelanggan'],
      badge: p.badge ?? null,
      billingCycle: p.billingCycle,
    }));
  }

  /** "20M/10M" → 20 (index 0) atau 10 (index 1). */
  private speedFromRateLimit(rateLimit: string | null, index: 0 | 1): number | null {
    const parts = (rateLimit ?? '').split('/');
    const m = /(\d+)\s*[Mm]/.exec(parts[index] ?? '');
    return m ? Number(m[1]) : null;
  }

  async publicCoverage() {
    const rows = await this.coverage.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
    return rows.map((a) => ({
      id: String(a.id),
      name: a.name,
      village: a.village,
      district: a.district,
      rt: a.rt,
      rw: a.rw,
      status: a.status,
      note: a.note,
    }));
  }

  // ─── Cek ketersediaan (§35) ────────────────────────────────────────────────

  async checkCoverage(dto: CoverageCheckDto, meta: RequestMeta) {
    this.limiter.hit(`coverage:${meta.ip}`, 30, 10 * 60_000);

    const areas = await this.coverage.find({ where: { isActive: true } });
    if (!areas.length) {
      return { covered: false, area: null, message: 'Data area layanan belum tersedia. Silakan hubungi kami via WhatsApp.' };
    }

    // 1) Cocokkan lewat GPS bila pengguna mengizinkan lokasi.
    if (dto.lat != null && dto.lng != null) {
      const withGeo = areas.filter((a) => a.lat != null && a.lng != null);
      const scored = withGeo
        .map((a) => ({ a, d: this.haversine(dto.lat!, dto.lng!, Number(a.lat), Number(a.lng)) }))
        .sort((x, y) => x.d - y.d);
      const nearest = scored[0];
      if (nearest && nearest.d <= nearest.a.radiusM) {
        return this.coverageAnswer(nearest.a, Math.round(nearest.d));
      }
      if (nearest) {
        return {
          covered: false,
          area: null,
          nearest: { name: nearest.a.name, distanceM: Math.round(nearest.d) },
          message: `Lokasi Anda sekitar ${this.km(nearest.d)} dari area terdekat (${nearest.a.name}). Silakan hubungi kami untuk survei.`,
        };
      }
    }

    // 2) Cocokkan lewat teks alamat / RT / RW.
    const haystack = `${dto.address ?? ''} ${dto.rt ?? ''} ${dto.rw ?? ''}`.toLowerCase();
    const rt = (dto.rt ?? '').replace(/\D/g, '');
    const rw = (dto.rw ?? '').replace(/\D/g, '');

    const hit = areas.find((a) => {
      const areaRt = (a.rt ?? '').replace(/\D/g, '');
      const areaRw = (a.rw ?? '').replace(/\D/g, '');
      const rtRwMatch = !!(rw && areaRw && rw === areaRw && (!areaRt || !rt || areaRt === rt));
      const textMatch = [a.name, a.village, a.district]
        .filter(Boolean)
        .some((t) => haystack.includes(String(t).toLowerCase()));
      return rtRwMatch || textMatch;
    });

    if (hit) return this.coverageAnswer(hit);

    return {
      covered: false,
      area: null,
      message: 'Alamat Anda belum terdeteksi di area layanan kami. Kirim lokasi via WhatsApp — kami akan mengecek kemungkinan penarikan jaringan baru.',
    };
  }

  private coverageAnswer(a: CoverageArea, distanceM?: number) {
    if (a.status === 'full') {
      return {
        covered: true, full: true,
        area: { name: a.name, status: a.status, note: a.note },
        distanceM: distanceM ?? null,
        message: `Area ${a.name} sudah terjangkau, namun kapasitas sedang penuh. Anda dapat mendaftar untuk masuk daftar tunggu.`,
      };
    }
    if (a.status === 'planned') {
      return {
        covered: false, planned: true,
        area: { name: a.name, status: a.status, note: a.note },
        distanceM: distanceM ?? null,
        message: `Area ${a.name} sedang dalam rencana penarikan jaringan. Daftar sekarang untuk diprioritaskan.`,
      };
    }
    return {
      covered: true, full: false,
      area: { name: a.name, status: a.status, note: a.note },
      distanceM: distanceM ?? null,
      message: `Selamat! Area ${a.name} sudah terjangkau layanan kami.`,
    };
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  private km(m: number): string {
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
  }

  // ─── Status jaringan publik (§41) ──────────────────────────────────────────

  /**
   * Ringkasan status tanpa membocorkan detail infrastruktur. Admin dapat
   * memaksa status lewat Pengaturan; bila 'operational', status dihitung dari
   * kesehatan router & ONU.
   */
  async networkStatus() {
    const s = await this.settings.findOne({ where: { id: 1 } });
    if (s?.networkStatus && s.networkStatus !== 'operational') {
      return {
        status: s.networkStatus,
        note: s.networkStatusNote ?? null,
        source: 'manual' as const,
        checkedAt: new Date(),
      };
    }

    const [routers, routersOnline] = await Promise.all([
      this.routers.count(),
      this.routers.count({ where: { status: 'online' } }),
    ]);
    const [onus, onusDown] = await Promise.all([
      this.devices.count(),
      this.devices.count({ where: { lastStatus: 'los' } }),
    ]);

    let status: 'operational' | 'degraded' | 'outage' = 'operational';
    if (routers > 0 && routersOnline === 0) status = 'outage';
    else if (routers > routersOnline) status = 'degraded';
    else if (onus > 0 && onusDown / onus > 0.3) status = 'degraded';

    const note =
      status === 'outage' ? 'Sedang terjadi gangguan pada jaringan utama. Tim teknis sedang menangani.'
        : status === 'degraded' ? 'Sebagian area mengalami gangguan. Tim teknis sedang menangani.'
          : 'Semua sistem berjalan normal.';

    return { status, note, source: 'auto' as const, checkedAt: new Date() };
  }

  // ─── Cek tagihan publik dengan OTP (§3) ────────────────────────────────────

  /** Nomor pelanggan atau nomor WhatsApp → pelanggan. */
  private async resolveIdentifier(identifier: string): Promise<Customer | null> {
    const raw = (identifier ?? '').trim();
    if (!raw) return null;
    const phone = normalizePhone(raw);
    if (phone) return this.auth.findByPhone(phone);
    return this.customers
      .createQueryBuilder('c')
      .where('LOWER(c.customerNo) = LOWER(:id)', { id: raw })
      .getOne();
  }

  /**
   * Langkah 1 — kirim OTP ke WhatsApp terdaftar. Belum ada data sensitif yang
   * dikembalikan di tahap ini, hanya nomor tujuan yang disamarkan.
   */
  async billingCheckRequest(identifier: string, meta: RequestMeta) {
    this.limiter.hit(`billcheck:${meta.ip}`, 8, 10 * 60_000, 15 * 60_000);

    const customer = await this.resolveIdentifier(identifier);
    if (!customer) {
      // Jawaban seragam: jangan beri tahu nomor pelanggan mana yang terdaftar.
      this.logger.warn(`Cek tagihan utk identitas tak dikenal dari ${meta.ip}`);
      return { ok: true, masked: '****', expiresIn: 300 };
    }

    const phone = this.auth.phoneOf(customer);
    if (!phone) {
      throw new BadRequestException(
        'Nomor WhatsApp Anda belum terdaftar di sistem kami. Silakan hubungi admin.',
      );
    }
    return this.auth.requestOtp(phone, 'billing_check', meta);
  }

  /** Langkah 2 — verifikasi OTP lalu tampilkan ringkasan tagihan. */
  async billingCheckVerify(dto: BillingCheckVerifyDto, meta: RequestMeta) {
    const customer = await this.resolveIdentifier(dto.identifier);
    if (!customer) throw new BadRequestException('Kode OTP salah atau sudah kedaluwarsa.');

    const phone = this.auth.phoneOf(customer);
    await this.auth.consumeOtp(phone, dto.code, 'billing_check', meta);

    const sub = await this.subs.findOne({
      where: { customer: { id: customer.id } },
      relations: { package: true },
      order: { id: 'DESC' },
    });

    const unpaid = await this.invoices
      .createQueryBuilder('i')
      .leftJoin('i.subscription', 's')
      .leftJoin('s.customer', 'c')
      .where('c.id = :id', { id: customer.id })
      .andWhere(`i.status IN ('unpaid', 'overdue')`)
      .orderBy('i.dueDate', 'ASC')
      .getMany();

    return {
      customer: {
        fullName: customer.fullName,
        customerNo: customer.customerNo,
        status: customer.status,
      },
      package: sub?.package
        ? { name: sub.package.name, price: Number(sub.package.price) }
        : null,
      service: { status: sub?.status ?? 'unknown', dueDate: sub?.dueDate ?? null },
      invoices: unpaid.map((i) => ({
        id: String(i.id),
        invoiceNo: i.invoiceNo,
        amount: Number(i.amount),
        dueDate: i.dueDate,
        status: i.status,
      })),
      total: unpaid.reduce((n, i) => n + Number(i.amount), 0),
    };
  }

  // ─── Pendaftaran calon pelanggan (§36) ─────────────────────────────────────

  async register(dto: RegisterLeadDto, meta: RequestMeta) {
    const s = await this.settings.findOne({ where: { id: 1 } });
    if (s && s.registrationEnabled === false) {
      throw new BadRequestException('Pendaftaran online sedang ditutup. Silakan hubungi kami via WhatsApp.');
    }
    this.limiter.hit(`register:${meta.ip}`, 5, 60 * 60_000, 60 * 60_000);

    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('Nomor WhatsApp tidak valid. Contoh: 081234567890');
    const phoneHash = this.crypto.hmac(phone);

    const pending = await this.requests.findOne({ where: { phoneHash, status: 'pending' } });
    if (pending) {
      return {
        ok: true,
        duplicate: true,
        requestNo: pending.requestNo,
        message: 'Pendaftaran Anda sudah kami terima sebelumnya dan sedang diproses.',
      };
    }

    const pkg = dto.packageId
      ? await this.packages.findOne({ where: { id: String(dto.packageId), isActive: true, isPublic: true } })
      : null;

    const seq = (await this.requests.count()) + 1;
    const now = new Date();
    const requestNo = `REG-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;

    const saved = await this.requests.save(
      this.requests.create({
        requestNo,
        fullName: dto.fullName.trim(),
        phoneEnc: this.crypto.encrypt(phone),
        phoneHash,
        phoneMasked: maskPhone(phone),
        email: dto.email?.trim().toLowerCase() ?? null,
        address: dto.address.trim(),
        rt: dto.rt ?? null,
        rw: dto.rw ?? null,
        geoLat: dto.lat != null ? String(dto.lat) : null,
        geoLng: dto.lng != null ? String(dto.lng) : null,
        package: pkg,
        note: dto.note?.trim() ?? null,
        status: 'pending',
        ip: meta.ip || null,
      }),
    );

    // Beri tahu admin + balas ke calon pelanggan (keduanya tidak boleh menggagalkan request).
    void this.wa
      .notifyAdmin(
        `📥 Pendaftaran baru ${saved.requestNo}\n` +
          `Nama: ${saved.fullName}\nWA: ${phone}\nAlamat: ${saved.address}\n` +
          `RT/RW: ${saved.rt ?? '-'} / ${saved.rw ?? '-'}\nPaket: ${pkg?.name ?? '(belum dipilih)'}`,
      )
      .catch(() => undefined);
    void this.wa
      .sendRaw(
        phone,
        `Halo ${saved.fullName}, pendaftaran internet Anda (${saved.requestNo}) sudah kami terima. ` +
          `Tim kami akan menghubungi Anda untuk survei lokasi. Terima kasih.`,
      )
      .catch(() => undefined);

    return {
      ok: true,
      duplicate: false,
      requestNo: saved.requestNo,
      message: 'Pendaftaran berhasil dikirim. Tim kami akan menghubungi Anda via WhatsApp.',
    };
  }

  /** Status pendaftaran — hanya menampilkan data tersamar (dipakai halaman "cek pendaftaran"). */
  async registrationStatus(requestNo: string, meta: RequestMeta) {
    this.limiter.hit(`regstatus:${meta.ip}`, 20, 10 * 60_000);
    const r = await this.requests.findOne({ where: { requestNo: (requestNo ?? '').trim().toUpperCase() } });
    if (!r) throw new BadRequestException('Nomor pendaftaran tidak ditemukan.');
    return {
      requestNo: r.requestNo,
      name: maskName(r.fullName),
      status: r.status,
      createdAt: r.createdAt,
      handledAt: r.handledAt,
    };
  }
}
