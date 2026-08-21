import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Customer, CustomerNotification, CustomerOtp, CustomerSession } from '@database/entities';
import type { OtpPurpose } from '@database/entities/customer-otp.entity';
import { CryptoService } from '@common/crypto/crypto.service';
import { RateLimitService } from '@common/security/rate-limit.service';
import { maskEmail, maskPhone, normalizePhone } from '@common/security/phone.util';
import { WhatsappService } from '@modules/whatsapp/whatsapp.module';

/** Isi token portal. `scope` membedakannya dari token admin. */
export interface CustomerTokenPayload {
  scope: 'customer';
  sub: string;
  sid: string;
}

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

const SESSION_TTL_HOURS = 12;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(CustomerSession) private readonly sessions: Repository<CustomerSession>,
    @InjectRepository(CustomerOtp) private readonly otps: Repository<CustomerOtp>,
    @InjectRepository(CustomerNotification) private readonly notifs: Repository<CustomerNotification>,
    private readonly crypto: CryptoService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly limiter: RateLimitService,
    private readonly wa: WhatsappService,
  ) {}

  // ─── Pencarian pelanggan ───────────────────────────────────────────────────

  /**
   * Cari pelanggan dari nomor telepon lewat kolom hash. Bila hash belum terisi
   * (data lama, dibuat sebelum Phase 1) lakukan pencocokan sekali jalan dengan
   * mendekripsi lalu simpan hash-nya supaya lain kali cukup lewat indeks.
   */
  async findByPhone(rawPhone: string): Promise<Customer | null> {
    const phone = normalizePhone(rawPhone);
    if (!phone) return null;

    const hash = this.crypto.hmac(phone);
    const hit = await this.customers.findOne({ where: { phoneHash: hash } });
    if (hit) return hit;

    const legacy = await this.customers.find({ where: { phoneHash: IsNull() } });
    for (const c of legacy) {
      let stored: string | null = null;
      try {
        stored = this.crypto.decrypt(c.phoneEnc);
      } catch {
        continue; // data rusak / kunci berbeda — lewati, jangan gagalkan login
      }
      const norm = normalizePhone(stored);
      if (!norm) continue;
      await this.customers.update(c.id, { phoneHash: this.crypto.hmac(norm) });
      if (norm === phone) return this.customers.findOne({ where: { id: c.id } });
    }
    return null;
  }

  /** Cari dari nomor pelanggan atau email (case-insensitive). */
  async findByIdentifier(identifier: string): Promise<Customer | null> {
    const id = (identifier ?? '').trim();
    if (!id) return null;
    return this.customers
      .createQueryBuilder('c')
      .addSelect('c.passwordHash')
      .where('LOWER(c.customerNo) = LOWER(:id) OR LOWER(c.email) = LOWER(:id)', { id })
      .getOne();
  }

  /** Nomor telepon pelanggan dalam bentuk E.164 (untuk kirim WA). */
  phoneOf(customer: Customer): string {
    try {
      return normalizePhone(this.crypto.decrypt(customer.phoneEnc));
    } catch {
      return '';
    }
  }

  // ─── Login kata sandi ──────────────────────────────────────────────────────

  async loginWithPassword(identifier: string, password: string, meta: RequestMeta) {
    const key = `portal:login:${meta.ip}:${(identifier ?? '').toLowerCase()}`;
    this.limiter.hit(key, 5, 10 * 60_000, 15 * 60_000);

    const customer = await this.findByIdentifier(identifier);
    // Pesan sengaja seragam agar tidak membocorkan nomor pelanggan mana yang ada.
    const invalid = new UnauthorizedException('Nomor pelanggan / email atau kata sandi salah.');
    if (!customer?.passwordHash) throw invalid;

    let ok = false;
    try {
      ok = await argon2.verify(customer.passwordHash, password ?? '');
    } catch {
      ok = false;
    }
    if (!ok) throw invalid;

    this.assertPortalAccess(customer);
    this.limiter.reset(key);
    return this.startSession(customer, meta);
  }

  // ─── Login OTP WhatsApp ────────────────────────────────────────────────────

  /**
   * Kirim OTP ke nomor WhatsApp pelanggan. Respons selalu sama bentuknya —
   * nomor yang tidak terdaftar tidak dibedakan, supaya tidak bisa dipakai
   * memetakan siapa saja pelanggan kita.
   */
  async requestOtp(rawPhone: string, purpose: OtpPurpose, meta: RequestMeta) {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new BadRequestException('Nomor WhatsApp tidak valid. Contoh: 081234567890');

    this.limiter.hit(`otp:ip:${meta.ip}`, 10, 10 * 60_000);
    this.limiter.hit(`otp:${purpose}:${phone}`, 3, 10 * 60_000, 10 * 60_000);

    const customer = await this.findByPhone(phone);
    const masked = maskPhone(phone);

    if (customer) {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      await this.otps.save(
        this.otps.create({
          purpose,
          channel: 'whatsapp',
          targetHash: this.crypto.hmac(phone),
          targetMasked: masked,
          customer,
          codeHash: this.crypto.hmac(code),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
          ip: meta.ip,
        }),
      );
      const label =
        purpose === 'billing_check' ? 'cek tagihan'
          : purpose === 'reset_password' ? 'atur ulang kata sandi'
            : 'masuk portal';
      await this.wa.sendRaw(
        phone,
        `Kode OTP ${label} Anda: ${code}\nBerlaku 5 menit. JANGAN berikan kode ini kepada siapa pun, termasuk petugas.`,
      );
    } else {
      this.logger.warn(`OTP ${purpose} diminta untuk nomor tak terdaftar (${masked}) dari ${meta.ip}`);
    }

    return { ok: true, masked, expiresIn: OTP_TTL_MS / 1000 };
  }

  /**
   * Cocokkan OTP. Mengembalikan pelanggan bila benar; melempar bila salah,
   * kedaluwarsa, atau sudah terpakai. Kode dianggap sekali pakai.
   */
  async consumeOtp(rawPhone: string, code: string, purpose: OtpPurpose, meta: RequestMeta): Promise<Customer> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new BadRequestException('Nomor WhatsApp tidak valid.');
    this.limiter.hit(`otp:verify:${meta.ip}:${phone}`, 10, 10 * 60_000, 15 * 60_000);

    const otp = await this.otps.findOne({
      where: { targetHash: this.crypto.hmac(phone), purpose, consumedAt: IsNull() },
      relations: { customer: true },
      order: { id: 'DESC' },
    });
    const invalid = new UnauthorizedException('Kode OTP salah atau sudah kedaluwarsa.');
    if (!otp || !otp.customer) throw invalid;

    if (otp.expiresAt.getTime() < Date.now() || otp.attempts >= OTP_MAX_ATTEMPTS) {
      await this.otps.update(otp.id, { consumedAt: new Date() });
      throw invalid;
    }

    const given = this.crypto.hmac(String(code ?? '').trim());
    if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(otp.codeHash))) {
      await this.otps.update(otp.id, { attempts: otp.attempts + 1 });
      throw invalid;
    }

    await this.otps.update(otp.id, { consumedAt: new Date() });
    return otp.customer;
  }

  async loginWithOtp(rawPhone: string, code: string, meta: RequestMeta) {
    const customer = await this.consumeOtp(rawPhone, code, 'login', meta);
    this.assertPortalAccess(customer);
    return this.startSession(customer, meta);
  }

  // ─── Lupa / atur kata sandi ────────────────────────────────────────────────

  /**
   * Reset kata sandi lewat OTP WhatsApp. Dipakai juga untuk MENYETEL kata sandi
   * pertama kali (pelanggan lama yang belum punya kredensial portal).
   */
  async resetPassword(rawPhone: string, code: string, newPassword: string, meta: RequestMeta) {
    this.assertPasswordPolicy(newPassword);
    const customer = await this.consumeOtp(rawPhone, code, 'reset_password', meta);
    this.assertPortalAccess(customer);

    await this.customers.update(customer.id, {
      passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }),
    });
    // Kata sandi berganti → semua sesi lama dibatalkan.
    await this.revokeAll(customer.id);
    await this.notify(customer, 'security', 'Kata sandi portal diubah',
      'Kata sandi akun portal Anda baru saja diubah. Semua perangkat telah dikeluarkan.');

    return this.startSession(customer, meta);
  }

  /** Ganti kata sandi dari dalam portal (butuh kata sandi lama bila sudah ada). */
  async changePassword(customerId: string, oldPassword: string | undefined, newPassword: string) {
    this.assertPasswordPolicy(newPassword);
    const customer = await this.customers
      .createQueryBuilder('c')
      .addSelect('c.passwordHash')
      .where('c.id = :id', { id: customerId })
      .getOne();
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan.');

    if (customer.passwordHash) {
      let ok = false;
      try {
        ok = await argon2.verify(customer.passwordHash, oldPassword ?? '');
      } catch {
        ok = false;
      }
      if (!ok) throw new BadRequestException('Kata sandi lama salah.');
    }

    await this.customers.update(customerId, {
      passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }),
    });
    await this.notify(customer, 'security', 'Kata sandi portal diubah',
      'Kata sandi akun portal Anda baru saja diubah.');
    return { ok: true };
  }

  private assertPasswordPolicy(pw: string) {
    if (!pw || pw.length < 8) throw new BadRequestException('Kata sandi minimal 8 karakter.');
    if (pw.length > 72) throw new BadRequestException('Kata sandi maksimal 72 karakter.');
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
      throw new BadRequestException('Kata sandi harus memuat huruf dan angka.');
    }
  }

  private assertPortalAccess(customer: Customer) {
    if (customer.portalEnabled === false) {
      throw new ForbiddenException('Akses portal untuk akun ini dinonaktifkan. Hubungi admin.');
    }
    if (customer.status === 'terminated') {
      throw new ForbiddenException('Layanan untuk akun ini sudah dihentikan.');
    }
  }

  // ─── Sesi ──────────────────────────────────────────────────────────────────

  /** Buat sesi + token JWT yang terikat ke baris `customer_sessions`. */
  async startSession(customer: Customer, meta: RequestMeta) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
    // Token ditandatangani setelah baris sesi punya id → sid masuk ke payload.
    const session = await this.sessions.save(
      this.sessions.create({
        customer,
        tokenHash: 'pending-' + crypto.randomBytes(24).toString('hex'),
        userAgent: (meta.userAgent ?? '').slice(0, 255) || null,
        ip: meta.ip || null,
        expiresAt,
      }),
    );

    const payload: CustomerTokenPayload = { scope: 'customer', sub: String(customer.id), sid: String(session.id) };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.secret'),
      expiresIn: `${SESSION_TTL_HOURS}h`,
    });

    await this.sessions.update(session.id, { tokenHash: this.hashToken(token) });
    await this.customers.update(customer.id, { lastLoginAt: new Date() });

    return {
      token,
      expiresAt,
      customer: {
        id: String(customer.id),
        customerNo: customer.customerNo,
        fullName: customer.fullName,
        email: customer.email ?? null,
        phoneMasked: maskPhone(this.phoneOf(customer)),
        emailMasked: customer.email ? maskEmail(customer.email) : null,
        photoUrl: customer.photoUrl ?? null,
        status: customer.status,
        hasPassword: !!customer.passwordHash,
      },
    };
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Dipakai guard: pastikan token & barisan sesinya masih hidup. */
  async validateSession(token: string): Promise<{ customerId: string; sessionId: string }> {
    let payload: CustomerTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<CustomerTokenPayload>(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
    } catch {
      throw new UnauthorizedException('Sesi berakhir, silakan masuk kembali.');
    }
    if (payload?.scope !== 'customer') throw new UnauthorizedException('Token tidak berlaku untuk portal.');

    const session = await this.sessions.findOne({
      where: { id: payload.sid },
      relations: { customer: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now() ||
      session.tokenHash !== this.hashToken(token) ||
      String(session.customer?.id) !== String(payload.sub)
    ) {
      throw new UnauthorizedException('Sesi berakhir, silakan masuk kembali.');
    }
    if (session.customer.portalEnabled === false) {
      throw new ForbiddenException('Akses portal untuk akun ini dinonaktifkan.');
    }

    // Perbarui "terakhir aktif" maksimal sekali per menit agar tidak boros tulis.
    if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
      await this.sessions.update(session.id, { lastSeenAt: new Date() });
    }
    return { customerId: String(session.customer.id), sessionId: String(session.id) };
  }

  async listSessions(customerId: string, currentSessionId: string) {
    const rows = await this.sessions.find({
      where: { customer: { id: customerId }, revokedAt: IsNull() },
      order: { lastSeenAt: 'DESC' },
    });
    return rows
      .filter((s) => s.expiresAt.getTime() > Date.now())
      .map((s) => ({
        id: String(s.id),
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
        current: String(s.id) === String(currentSessionId),
      }));
  }

  async revokeSession(customerId: string, sessionId: string) {
    // Ownership: hanya sesi milik pelanggan ini yang boleh dibatalkan.
    const res = await this.sessions
      .createQueryBuilder()
      .update(CustomerSession)
      .set({ revokedAt: new Date() })
      .where('id = :sid AND customer_id = :cid AND revoked_at IS NULL', { sid: sessionId, cid: customerId })
      .execute();
    if (!res.affected) throw new NotFoundException('Sesi tidak ditemukan.');
    return { ok: true };
  }

  async revokeAll(customerId: string, exceptSessionId?: string) {
    const qb = this.sessions
      .createQueryBuilder()
      .update(CustomerSession)
      .set({ revokedAt: new Date() })
      .where('customer_id = :cid AND revoked_at IS NULL', { cid: customerId });
    if (exceptSessionId) qb.andWhere('id <> :sid', { sid: exceptSessionId });
    const res = await qb.execute();
    return { ok: true, revoked: res.affected ?? 0 };
  }

  /** Bersihkan sesi & OTP kedaluwarsa (dipanggil scheduler harian). */
  async purgeExpired() {
    const now = new Date();
    await this.sessions.delete({ expiresAt: LessThan(new Date(now.getTime() - 7 * 86400_000)) });
    await this.otps.delete({ expiresAt: LessThan(new Date(now.getTime() - 86400_000)) });
  }

  private async notify(customer: Customer, type: any, title: string, body: string) {
    try {
      await this.notifs.save(this.notifs.create({ customer, type, title, body }));
    } catch (e) {
      this.logger.warn(`gagal menyimpan notifikasi: ${(e as Error).message}`);
    }
  }
}
