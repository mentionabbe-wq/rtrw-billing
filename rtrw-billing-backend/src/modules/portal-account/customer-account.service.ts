import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import {
  Customer, CustomerNotification, Device, Invoice, Payment, PortalSetting, Subscription,
} from '@database/entities';
import { CryptoService } from '@common/crypto/crypto.service';
import { maskEmail, maskPhone, normalizePhone } from '@common/security/phone.util';
import { buildDynamicQris, inspectQris } from '@common/qris/qris.util';
import { MikrotikService } from '@modules/mikrotik/mikrotik.service';
import { UpdateProfileDto } from './dto/customer-auth.dto';

/** Saklar fitur portal bawaan bila admin belum mengubah apa pun (§48). */
export const DEFAULT_PORTAL_FEATURES: Record<string, boolean> = {
  wifiName: true,
  wifiPassword: true,
  restartRouter: false,
  guestWifi: false,
  advancedWifi: false,
  packageUpgrade: true,
  packageDowngrade: true,
  speedTest: true,
  ticket: true,
};

@Injectable()
export class CustomerAccountService {
  private readonly logger = new Logger(CustomerAccountService.name);

  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(CustomerNotification) private readonly notifs: Repository<CustomerNotification>,
    @InjectRepository(PortalSetting) private readonly settings: Repository<PortalSetting>,
    private readonly crypto: CryptoService,
    private readonly mikrotik: MikrotikService,
  ) {}

  // ─── Pengambilan dasar ─────────────────────────────────────────────────────

  private async getCustomer(customerId: string): Promise<Customer> {
    const c = await this.customers.findOne({ where: { id: customerId } });
    if (!c) throw new NotFoundException('Data pelanggan tidak ditemukan.');
    return c;
  }

  /** Langganan aktif pelanggan beserta paket & router. */
  private async getSubscription(customerId: string): Promise<Subscription | null> {
    return this.subs.findOne({
      where: { customer: { id: customerId } },
      relations: { package: true, router: true, customer: true },
      order: { id: 'DESC' },
    });
  }

  private async features(): Promise<Record<string, boolean>> {
    const s = await this.settings.findOne({ where: { id: 1 } });
    return { ...DEFAULT_PORTAL_FEATURES, ...(s?.portalFeatures ?? {}) };
  }

  /** Saklar fitur portal — dipakai controller sebelum menjalankan aksi. */
  featureFlags(): Promise<Record<string, boolean>> {
    return this.features();
  }

  private daysUntil(date: string | null): number | null {
    if (!date) return null;
    const due = new Date(`${date}T23:59:59`);
    return Math.ceil((due.getTime() - Date.now()) / 86400_000);
  }

  // ─── Dasbor (§5) ───────────────────────────────────────────────────────────

  async dashboard(customerId: string) {
    const customer = await this.getCustomer(customerId);
    const sub = await this.getSubscription(customerId);
    const settings = await this.settings.findOne({ where: { id: 1 } });

    const outstanding = await this.invoices
      .createQueryBuilder('i')
      .leftJoin('i.subscription', 's')
      .leftJoin('s.customer', 'c')
      .where('c.id = :id', { id: customerId })
      .andWhere(`i.status IN ('unpaid', 'overdue')`)
      .orderBy('i.dueDate', 'ASC')
      .getMany();

    const totalOutstanding = outstanding.reduce((n, i) => n + Number(i.amount), 0);
    const unread = await this.notifs.count({ where: { customer: { id: customerId }, readAt: IsNull() } });
    const device = await this.devices.findOne({ where: { subscription: { id: sub?.id ?? '0' } } });

    return {
      customer: this.publicCustomer(customer),
      subscription: sub ? this.publicSubscription(sub) : null,
      billing: {
        outstandingTotal: totalOutstanding,
        oldestDueDate: outstanding[0]?.dueDate ?? null,
        unpaidCount: outstanding.length,
        nextInvoice: outstanding[0]
          ? {
              id: String(outstanding[0].id),
              invoiceNo: outstanding[0].invoiceNo,
              amount: Number(outstanding[0].amount),
              dueDate: outstanding[0].dueDate,
              status: outstanding[0].status,
            }
          : null,
      },
      service: {
        status: sub?.status ?? 'unknown',
        daysRemaining: this.daysUntil(sub?.dueDate ?? null),
        dueDate: sub?.dueDate ?? null,
      },
      device: device
        ? {
            type: device.type,
            status: device.lastStatus ?? 'unknown',
            serialNumber: device.serialNumber ?? null,
            signalLabel: this.signalLabel(device.lastRxPower),
            updatedAt: device.updatedAt ?? null,
          }
        : null,
      notifications: { unread },
      announcement:
        settings?.networkStatus && settings.networkStatus !== 'operational'
          ? { status: settings.networkStatus, note: settings.networkStatusNote ?? null }
          : null,
      features: await this.features(),
    };
  }

  /** Label sinyal ONU yang aman untuk pelanggan — tanpa angka teknis OLT (§31). */
  private signalLabel(rx: string | null): 'normal' | 'warning' | 'critical' | 'unknown' {
    if (rx == null) return 'unknown';
    const v = Number(rx);
    if (!Number.isFinite(v)) return 'unknown';
    if (v >= -25) return 'normal';
    if (v >= -27) return 'warning';
    return 'critical';
  }

  private publicCustomer(c: Customer) {
    let phone = '';
    try {
      phone = normalizePhone(this.crypto.decrypt(c.phoneEnc));
    } catch {
      phone = '';
    }
    return {
      id: String(c.id),
      customerNo: c.customerNo,
      fullName: c.fullName,
      email: c.email ?? null,
      emailMasked: c.email ? maskEmail(c.email) : null,
      phoneMasked: maskPhone(phone),
      address: c.address ?? null,
      rt: c.rt ?? null,
      rw: c.rw ?? null,
      photoUrl: c.photoUrl ?? null,
      status: c.status,
      memberSince: c.createdAt,
    };
  }

  /** Hanya data yang boleh dilihat pelanggan — kredensial PPPoE tidak ikut (§38). */
  private publicSubscription(s: Subscription) {
    return {
      id: String(s.id),
      status: s.status,
      dueDate: s.dueDate,
      activatedAt: s.activatedAt ?? null,
      connType: s.connType,
      pppoeUser: s.pppoeUser ?? null,
      package: s.package
        ? {
            id: String(s.package.id),
            name: s.package.name,
            price: Number(s.package.price),
            speedDownMbps: s.package.speedDownMbps ?? null,
            speedUpMbps: s.package.speedUpMbps ?? null,
            rateLimit: s.package.rateLimit,
          }
        : null,
      routerName: s.router?.name ?? null,
    };
  }

  // ─── Internet Saya (§7) ────────────────────────────────────────────────────

  async internet(customerId: string) {
    const sub = await this.getSubscription(customerId);
    if (!sub) {
      return { subscription: null, live: null, liveError: null };
    }

    let live: {
      online: boolean; ip: string | null; uptime: string | null; callerId: string | null;
      cached?: boolean; checkedAt?: Date | null;
    } | null = null;
    let liveError: string | null = null;

    if (sub.router && sub.pppoeUser) {
      try {
        const sessions = await this.mikrotik.listActive(sub.router);
        const wanted = sub.pppoeUser.trim().toLowerCase();
        const hit = sessions.find((s: any) => String(s.name ?? '').trim().toLowerCase() === wanted);
        live = hit
          ? { online: true, ip: hit.address ?? null, uptime: hit.uptime ?? null, callerId: hit.callerId ?? null }
          : { online: false, ip: null, uptime: null, callerId: null };
      } catch (e) {
        this.logger.warn(`gagal baca sesi PPPoE (${sub.router?.name}): ${(e as Error).message}`);
      }
    }

    // Router tak terjawab / langganan belum dipetakan → pakai hasil polling
    // terakhir supaya pelanggan tidak melihat "offline" palsu.
    if (!live && sub.liveCheckedAt) {
      live = {
        online: sub.liveOnline,
        ip: sub.liveIp,
        uptime: sub.liveUptime,
        callerId: sub.liveCallerId,
        cached: true,
        checkedAt: sub.liveCheckedAt,
      };
    }
    if (!live) {
      liveError = 'Status koneksi belum dapat dibaca. Coba beberapa saat lagi.';
    }

    return { subscription: this.publicSubscription(sub), live, liveError };
  }

  // ─── Perangkat (§32) ───────────────────────────────────────────────────────

  async device(customerId: string) {
    const sub = await this.getSubscription(customerId);
    const device = sub ? await this.devices.findOne({ where: { subscription: { id: sub.id } } }) : null;
    if (!device) return { device: null };
    return {
      device: {
        type: device.type,
        serialNumber: device.serialNumber ?? null,
        status: device.lastStatus ?? 'unknown',
        signalLabel: this.signalLabel(device.lastRxPower),
        updatedAt: device.updatedAt ?? null,
      },
    };
  }

  // ─── Tagihan (§17) ─────────────────────────────────────────────────────────

  async invoiceList(customerId: string) {
    const rows = await this.invoices
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.subscription', 's')
      .leftJoinAndSelect('s.package', 'p')
      .leftJoin('s.customer', 'c')
      .where('c.id = :id', { id: customerId })
      .orderBy('i.id', 'DESC')
      .take(36)
      .getMany();

    return rows.map((i) => ({
      id: String(i.id),
      invoiceNo: i.invoiceNo,
      amount: Number(i.amount),
      status: i.status,
      dueDate: i.dueDate,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      packageName: i.subscription?.package?.name ?? null,
      createdAt: i.createdAt,
    }));
  }

  /** Detail satu tagihan — dengan pengecekan kepemilikan yang eksplisit. */
  async invoiceDetail(customerId: string, invoiceId: string) {
    const inv = await this.invoices
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.subscription', 's')
      .leftJoinAndSelect('s.package', 'p')
      .leftJoinAndSelect('s.customer', 'c')
      .where('i.id = :iid', { iid: invoiceId })
      .getOne();

    if (!inv || String(inv.subscription?.customer?.id) !== String(customerId)) {
      // Sengaja 404, bukan 403 — jangan bocorkan bahwa nomor tagihan itu ada.
      throw new NotFoundException('Tagihan tidak ditemukan.');
    }

    const payments = await this.payments.find({
      where: { invoice: { id: inv.id } },
      order: { id: 'DESC' },
    });

    return {
      id: String(inv.id),
      invoiceNo: inv.invoiceNo,
      amount: Number(inv.amount),
      status: inv.status,
      dueDate: inv.dueDate,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      createdAt: inv.createdAt,
      packageName: inv.subscription?.package?.name ?? null,
      customer: {
        fullName: inv.subscription?.customer?.fullName ?? null,
        customerNo: inv.subscription?.customer?.customerNo ?? null,
        address: inv.subscription?.customer?.address ?? null,
      },
      payments: payments.map((p) => ({
        id: String(p.id),
        amount: Number(p.amount),
        method: p.method ?? p.gateway,
        status: p.status,
        paidAt: p.paidAt,
      })),
    };
  }

  /**
   * QRIS dinamis untuk satu tagihan: nominal sudah terisi sehingga pelanggan
   * tidak bisa salah ketik. Dibuat dari payload QRIS statis merchant, tanpa
   * payment gateway — karena itu pelunasan tetap diverifikasi admin.
   */
  async invoiceQris(customerId: string, invoiceId: string) {
    // Memakai invoiceDetail agar pemeriksaan kepemilikan tetap satu jalur.
    const invoice = await this.invoiceDetail(customerId, invoiceId);
    if (invoice.status === 'paid' || invoice.status === 'void') {
      return { available: false, reason: 'Tagihan ini sudah tidak perlu dibayar.' };
    }

    const settings = await this.settings.findOne({ where: { id: 1 } });
    if (!settings?.qrisPayload) {
      return { available: false, reason: 'Pembayaran QRIS otomatis belum diaktifkan admin.' };
    }

    try {
      return {
        available: true,
        payload: buildDynamicQris(settings.qrisPayload, invoice.amount),
        amount: invoice.amount,
        invoiceNo: invoice.invoiceNo,
        merchantName: inspectQris(settings.qrisPayload).merchantName ?? null,
      };
    } catch (e) {
      this.logger.warn(`gagal membuat QRIS dinamis: ${(e as Error).message}`);
      return { available: false, reason: 'QRIS belum dapat dibuat. Silakan pakai transfer bank.' };
    }
  }

  async paymentHistory(customerId: string) {
    const rows = await this.payments
      .createQueryBuilder('pm')
      .leftJoinAndSelect('pm.invoice', 'i')
      .leftJoin('i.subscription', 's')
      .leftJoin('s.customer', 'c')
      .where('c.id = :id', { id: customerId })
      .orderBy('pm.id', 'DESC')
      .take(36)
      .getMany();

    return rows.map((p) => ({
      id: String(p.id),
      invoiceNo: p.invoice?.invoiceNo ?? null,
      amount: Number(p.amount),
      method: p.method ?? p.gateway,
      status: p.status,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    }));
  }

  // ─── Notifikasi (§39) ──────────────────────────────────────────────────────

  async notifications(customerId: string) {
    const rows = await this.notifs.find({
      where: { customer: { id: customerId } },
      order: { id: 'DESC' },
      take: 50,
    });
    return rows.map((n) => ({
      id: String(n.id),
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt,
      createdAt: n.createdAt,
    }));
  }

  async markRead(customerId: string, id: string) {
    const res = await this.notifs
      .createQueryBuilder()
      .update(CustomerNotification)
      .set({ readAt: new Date() })
      .where('id = :id AND customer_id = :cid', { id, cid: customerId })
      .execute();
    if (!res.affected) throw new NotFoundException('Notifikasi tidak ditemukan.');
    return { ok: true };
  }

  async markAllRead(customerId: string) {
    await this.notifs
      .createQueryBuilder()
      .update(CustomerNotification)
      .set({ readAt: new Date() })
      .where('customer_id = :cid AND read_at IS NULL', { cid: customerId })
      .execute();
    return { ok: true };
  }

  // ─── Profil (§37) ──────────────────────────────────────────────────────────

  async profile(customerId: string) {
    const c = await this.getCustomer(customerId);
    const withHash = await this.customers
      .createQueryBuilder('c')
      .addSelect('c.passwordHash')
      .where('c.id = :id', { id: customerId })
      .getOne();
    return { ...this.publicCustomer(c), hasPassword: !!withHash?.passwordHash };
  }

  /**
   * Ubah data profil. Field teknis (PPPoE, IP, VLAN, router, ONU) TIDAK ada di
   * sini — memang tidak boleh diubah pelanggan.
   */
  async updateProfile(customerId: string, dto: UpdateProfileDto) {
    const customer = await this.getCustomer(customerId);
    const patch: Partial<Customer> = {};

    if (dto.fullName !== undefined) patch.fullName = dto.fullName.trim();

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const taken = await this.customers
        .createQueryBuilder('c')
        .where('LOWER(c.email) = :email AND c.id <> :id', { email, id: customerId })
        .getExists();
      if (taken) throw new BadRequestException('Email sudah dipakai akun lain.');
      patch.email = email;
    }

    if (dto.phone !== undefined) {
      const phone = normalizePhone(dto.phone);
      if (!phone) throw new BadRequestException('Nomor WhatsApp tidak valid. Contoh: 081234567890');
      const hash = this.crypto.hmac(phone);
      const taken = await this.customers
        .createQueryBuilder('c')
        .where('c.phoneHash = :hash AND c.id <> :id', { hash, id: customerId })
        .getExists();
      if (taken) throw new BadRequestException('Nomor WhatsApp sudah dipakai akun lain.');
      patch.phoneEnc = this.crypto.encrypt(phone);
      patch.phoneHash = hash;
    }

    if (dto.photoUrl !== undefined) {
      const ok = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(dto.photoUrl);
      if (!ok) throw new BadRequestException('Foto harus berupa gambar PNG/JPG/WebP.');
      patch.photoUrl = dto.photoUrl;
    }

    if (!Object.keys(patch).length) return this.profile(customerId);

    await this.customers.update(customer.id, patch);
    return this.profile(customerId);
  }

  // ─── Dipakai modul lain ────────────────────────────────────────────────────

  /** Simpan satu notifikasi untuk pelanggan (dipanggil billing/scheduler). */
  async pushNotification(
    customerId: string,
    type: string,
    title: string,
    body?: string,
    link?: string,
  ) {
    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) return;
    await this.notifs.save(
      this.notifs.create({ customer, type: type as any, title, body: body ?? null, link: link ?? null }),
    );
  }

  /** Jumlah pelanggan yang punya kredensial portal — dipakai dasbor admin. */
  countWithPortalAccess() {
    return this.customers.count({ where: { passwordHash: Not(IsNull()) } });
  }
}
