import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Customer, CustomerRequest, ServicePackage, User } from '@database/entities';
import { CryptoService } from '@common/crypto/crypto.service';
import { WhatsappService } from '@modules/whatsapp/whatsapp.module';
import { ApproveRequestDto } from './dto/onboarding.dto';

/** Pengelolaan pendaftaran calon pelanggan oleh admin (§36). */
@Injectable()
export class CustomerRequestsService {
  private readonly logger = new Logger(CustomerRequestsService.name);

  constructor(
    @InjectRepository(CustomerRequest) private readonly requests: Repository<CustomerRequest>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(ServicePackage) private readonly packages: Repository<ServicePackage>,
    private readonly crypto: CryptoService,
    private readonly wa: WhatsappService,
  ) {}

  async list(status?: string) {
    const qb = this.requests
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.package', 'p')
      .leftJoinAndSelect('r.customer', 'c')
      .orderBy('r.id', 'DESC')
      .take(300);
    if (status && status !== 'all') qb.where('r.status = :status', { status });
    const rows = await qb.getMany();
    return rows.map((r) => this.toDto(r));
  }

  async counts() {
    const rows = await this.requests
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.status')
      .getRawMany<{ status: string; count: string }>();
    const out: Record<string, number> = { pending: 0, contacted: 0, approved: 0, rejected: 0 };
    for (const r of rows) out[r.status] = Number(r.count);
    return out;
  }

  async detail(id: string) {
    const r = await this.requests.findOne({
      where: { id },
      relations: { package: true, customer: true },
    });
    if (!r) throw new NotFoundException('Pendaftaran tidak ditemukan.');
    return { ...this.toDto(r), phone: this.phoneOf(r) };
  }

  async markContacted(id: string, actor?: User) {
    const r = await this.get(id);
    if (r.status !== 'pending') throw new BadRequestException('Status pendaftaran sudah berubah.');
    await this.requests.update(id, { status: 'contacted', handledBy: actor ?? null, handledAt: new Date() });
    return { ok: true };
  }

  async reject(id: string, reason: string, actor?: User) {
    const r = await this.get(id);
    if (r.status === 'approved') throw new BadRequestException('Pendaftaran sudah disetujui, tidak bisa ditolak.');

    await this.requests.update(id, {
      status: 'rejected',
      rejectReason: reason,
      handledBy: actor ?? null,
      handledAt: new Date(),
    });

    const phone = this.phoneOf(r);
    if (phone) {
      void this.wa
        .sendRaw(
          phone,
          `Halo ${r.fullName}, mohon maaf pendaftaran internet Anda (${r.requestNo}) belum dapat kami proses.\nAlasan: ${reason}`,
        )
        .catch(() => undefined);
    }
    return { ok: true };
  }

  /**
   * Setujui pendaftaran → buat akun pelanggan + kredensial portal.
   * Langganan (PPPoE/router/ONU) sengaja TIDAK dibuat otomatis: data teknis
   * diisi teknisi lewat menu Pelanggan setelah pemasangan.
   */
  async approve(id: string, dto: ApproveRequestDto, actor?: User) {
    const r = await this.get(id);
    if (r.status === 'approved') throw new BadRequestException('Pendaftaran ini sudah disetujui.');

    const phone = this.phoneOf(r);
    if (!phone) throw new BadRequestException('Nomor WhatsApp pendaftar tidak dapat dibaca.');

    const phoneHash = this.crypto.hmac(phone);
    const existing = await this.customers.findOne({ where: { phoneHash } });
    if (existing) {
      throw new BadRequestException(
        `Nomor WhatsApp ini sudah terdaftar sebagai pelanggan ${existing.customerNo}.`,
      );
    }

    const pkg = dto.packageId
      ? await this.packages.findOne({ where: { id: String(dto.packageId) } })
      : r.package;

    const createAccount = dto.createPortalAccount !== false;
    const tempPassword = createAccount ? this.tempPassword() : null;

    const customer = await this.customers.save(
      this.customers.create({
        customerNo: await this.nextCustomerNo(),
        fullName: r.fullName,
        phoneEnc: this.crypto.encrypt(phone),
        phoneHash,
        email: r.email,
        address: r.address,
        rt: r.rt,
        rw: r.rw,
        geoLat: r.geoLat,
        geoLng: r.geoLng,
        status: 'active',
        portalEnabled: true,
        passwordHash: tempPassword ? await argon2.hash(tempPassword, { type: argon2.argon2id }) : null,
      }),
    );

    await this.requests.update(id, {
      status: 'approved',
      customer,
      handledBy: actor ?? null,
      handledAt: new Date(),
      note: dto.note ?? r.note,
    });

    if (createAccount) {
      void this.wa
        .sendRaw(
          phone,
          `Halo ${customer.fullName}, pendaftaran Anda DISETUJUI 🎉\n\n` +
            `No. Pelanggan: ${customer.customerNo}\n` +
            `Kata sandi sementara: ${tempPassword}\n` +
            (pkg ? `Paket: ${pkg.name}\n` : '') +
            `\nMasuk ke portal pelanggan lalu segera ganti kata sandi Anda. ` +
            `JANGAN bagikan kata sandi ini kepada siapa pun.`,
        )
        .catch(() => undefined);
    }

    return {
      ok: true,
      customerId: String(customer.id),
      customerNo: customer.customerNo,
      portalAccountCreated: createAccount,
    };
  }

  async remove(id: string) {
    const r = await this.get(id);
    if (r.status === 'approved') {
      throw new BadRequestException('Pendaftaran yang sudah disetujui tidak dapat dihapus.');
    }
    await this.requests.delete(id);
    return { ok: true };
  }

  // ─── Bantu ─────────────────────────────────────────────────────────────────

  private async get(id: string): Promise<CustomerRequest> {
    const r = await this.requests.findOne({ where: { id }, relations: { package: true } });
    if (!r) throw new NotFoundException('Pendaftaran tidak ditemukan.');
    return r;
  }

  private phoneOf(r: CustomerRequest): string {
    try {
      return this.crypto.decrypt(r.phoneEnc) ?? '';
    } catch {
      return '';
    }
  }

  /** Kata sandi sementara yang mudah dibacakan lewat WhatsApp. */
  private tempPassword(): string {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const pick = (src: string, n: number) =>
      Array.from({ length: n }, () => src[crypto.randomInt(0, src.length)]).join('');
    return `${pick(alphabet, 4)}${pick(digits, 4)}`;
  }

  private async nextCustomerNo(): Promise<string> {
    const row = await this.customers
      .createQueryBuilder('c')
      .select('MAX(c.customerNo)', 'max')
      .getRawOne<{ max: string }>();
    const num = parseInt((row?.max ?? 'CST000000').replace('CST', ''), 10) || 0;
    return 'CST' + String(num + 1).padStart(6, '0');
  }

  private toDto(r: CustomerRequest) {
    return {
      id: String(r.id),
      requestNo: r.requestNo,
      fullName: r.fullName,
      phoneMasked: r.phoneMasked,
      email: r.email,
      address: r.address,
      rt: r.rt,
      rw: r.rw,
      lat: r.geoLat ? Number(r.geoLat) : null,
      lng: r.geoLng ? Number(r.geoLng) : null,
      packageName: r.package?.name ?? null,
      packageId: r.package ? String(r.package.id) : null,
      note: r.note,
      status: r.status,
      rejectReason: r.rejectReason,
      customerNo: r.customer?.customerNo ?? null,
      createdAt: r.createdAt,
      handledAt: r.handledAt,
    };
  }
}
