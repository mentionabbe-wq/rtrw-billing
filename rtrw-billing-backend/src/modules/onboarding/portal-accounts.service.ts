import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Customer } from '@database/entities';
import { CryptoService } from '@common/crypto/crypto.service';
import { maskPhone, normalizePhone } from '@common/security/phone.util';
import { WhatsappService } from '@modules/whatsapp/whatsapp.module';
import { CustomerAuthService } from '@modules/portal-account/customer-auth.service';

/**
 * Kendali admin atas akun portal pelanggan: reset kata sandi, buka/tutup akses,
 * dan paksa keluar dari semua perangkat.
 */
@Injectable()
export class PortalAccountsService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    private readonly crypto: CryptoService,
    private readonly wa: WhatsappService,
    private readonly auth: CustomerAuthService,
  ) {}

  async status(customerId: string) {
    const c = await this.customers
      .createQueryBuilder('c')
      .addSelect('c.passwordHash')
      .where('c.id = :id', { id: customerId })
      .getOne();
    if (!c) throw new NotFoundException('Pelanggan tidak ditemukan.');
    return {
      customerId: String(c.id),
      customerNo: c.customerNo,
      portalEnabled: c.portalEnabled,
      hasPassword: !!c.passwordHash,
      phoneMasked: maskPhone(this.phoneOf(c)),
      lastLoginAt: c.lastLoginAt,
    };
  }

  /**
   * Setel kata sandi sementara baru dan kirimkan lewat WhatsApp.
   * Kata sandi tidak pernah dikembalikan lewat API bila WA berhasil terkirim —
   * hanya ditampilkan ke admin saat gateway WA belum dikonfigurasi.
   */
  async resetPassword(customerId: string) {
    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan.');

    const phone = this.phoneOf(customer);
    if (!phone) throw new BadRequestException('Nomor WhatsApp pelanggan tidak dapat dibaca.');

    const temp = this.tempPassword();
    await this.customers.update(customerId, {
      passwordHash: await argon2.hash(temp, { type: argon2.argon2id }),
      phoneHash: customer.phoneHash ?? this.crypto.hmac(phone),
    });
    // Kata sandi berganti → semua sesi lama dibatalkan.
    await this.auth.revokeAll(customerId);

    await this.wa.sendRaw(
      phone,
      `Kata sandi portal Anda telah diatur ulang oleh admin.\n\n` +
        `No. Pelanggan: ${customer.customerNo}\nKata sandi sementara: ${temp}\n\n` +
        `Segera ganti kata sandi setelah masuk. JANGAN bagikan kepada siapa pun.`,
    );

    return { ok: true, customerNo: customer.customerNo, sentTo: maskPhone(phone), tempPassword: temp };
  }

  async setAccess(customerId: string, enabled: boolean) {
    const res = await this.customers.update(customerId, { portalEnabled: enabled });
    if (!res.affected) throw new NotFoundException('Pelanggan tidak ditemukan.');
    if (!enabled) await this.auth.revokeAll(customerId);
    return { ok: true, portalEnabled: enabled };
  }

  logoutAll(customerId: string) {
    return this.auth.revokeAll(customerId);
  }

  private phoneOf(c: Customer): string {
    try {
      return normalizePhone(this.crypto.decrypt(c.phoneEnc));
    } catch {
      return '';
    }
  }

  private tempPassword(): string {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const pick = (src: string, n: number) =>
      Array.from({ length: n }, () => src[crypto.randomInt(0, src.length)]).join('');
    return `${pick(alphabet, 4)}${pick(digits, 4)}`;
  }
}
