import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer, Invoice, PortalSetting, Subscription } from '@database/entities';
import { WhatsappService } from '@modules/whatsapp/whatsapp.module';
import { inspectQris } from '@common/qris/qris.util';

const rupiah = (v: string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));

@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(PortalSetting) private readonly repo: Repository<PortalSetting>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    private readonly wa: WhatsappService,
  ) {}

  /**
   * Pelanggan (PPPoE) mengaku sudah bayar dari halaman portal, dengan bukti
   * transfer opsional. Dikirim ke admin via Telegram (foto) supaya bisa
   * langsung diverifikasi. Identitas dicari dari user PPPoE / no. pelanggan / nama.
   */
  async claimPayment(dto: { identifier: string; note?: string; proofImage?: string }) {
    const key = (dto.identifier ?? '').trim();
    if (!key) throw new BadRequestException('Isi nama / no. pelanggan / user PPPoE Anda.');

    // Cari langganan via user PPPoE, lalu pelanggan via no. pelanggan / nama.
    const sub = await this.subs
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .leftJoinAndSelect('s.package', 'p')
      .where('LOWER(s.pppoeUser) = LOWER(:k)', { k: key })
      .getOne();

    let customer: Customer | null = sub?.customer ?? null;
    if (!customer) {
      customer = await this.customers
        .createQueryBuilder('c')
        .where('LOWER(c.customerNo) = LOWER(:k) OR LOWER(c.fullName) LIKE LOWER(:like)', {
          k: key, like: `%${key}%`,
        })
        .getOne();
    }

    // Tagihan belum dibayar (kalau pelanggannya ketemu) untuk konteks nominal.
    let unpaid: Invoice | null = null;
    if (customer) {
      unpaid = await this.invoices
        .createQueryBuilder('i')
        .leftJoin('i.subscription', 's')
        .leftJoin('s.customer', 'c')
        .where('c.id = :id', { id: customer.id })
        .andWhere("i.status = 'unpaid'")
        .orderBy('i.id', 'DESC')
        .getOne();
    }

    const caption =
      `💳 Konfirmasi pembayaran dari pelanggan\n` +
      `Identitas diisi: ${key}\n` +
      (customer ? `Pelanggan: ${customer.fullName} (${customer.customerNo})\n` : '⚠️ Data pelanggan TIDAK ditemukan\n') +
      (sub?.pppoeUser ? `PPPoE: ${sub.pppoeUser}\n` : '') +
      (unpaid ? `Tagihan: ${unpaid.invoiceNo} — ${rupiah(unpaid.amount)} (jatuh tempo ${unpaid.dueDate})\n` : '') +
      (dto.note ? `Catatan: ${dto.note.slice(0, 200)}\n` : '') +
      `\nVerifikasi di menu Tagihan → tombol Bayar untuk mengaktifkan kembali.`;

    if (dto.proofImage) await this.wa.notifyAdminPhoto(caption, dto.proofImage);
    else await this.wa.notifyAdmin(caption);

    return { ok: true, matched: !!customer };
  }

  async get(): Promise<PortalSetting> {
    let row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) {
      row = await this.repo.save(this.repo.create({ id: 1 }));
    }
    return row;
  }

  /**
   * Versi untuk endpoint PUBLIK: payload QRIS mentah tidak ikut dikirim
   * (cukup penanda tersedia/tidak), supaya tidak bisa dipanen bot.
   */
  async getPublic(): Promise<Omit<PortalSetting, 'qrisPayload'> & { qrisDynamic: boolean }> {
    const { qrisPayload, ...rest } = await this.get();
    return { ...rest, qrisDynamic: !!qrisPayload };
  }

  /** Payload QRIS + hasil pemeriksaannya — hanya untuk admin. */
  async getQris() {
    const row = await this.get();
    if (!row.qrisPayload) return { payload: null, valid: false as const };
    return { payload: row.qrisPayload, ...inspectQris(row.qrisPayload) };
  }

  async update(dto: Partial<Omit<PortalSetting, 'id'>>): Promise<PortalSetting> {
    // Payload QRIS diperiksa di sini agar salah salin ketahuan saat menyimpan,
    // bukan saat pelanggan gagal memindai.
    if (dto.qrisPayload !== undefined) {
      const raw = (dto.qrisPayload ?? '').replace(/\s+/g, '');
      if (!raw) {
        dto.qrisPayload = null;
      } else {
        const info = inspectQris(raw);
        if (!info.valid) throw new BadRequestException(info.error ?? 'Payload QRIS tidak valid.');
        dto.qrisPayload = raw;
      }
    }
    await this.repo.upsert({ id: 1, ...dto }, ['id']);
    return this.get();
  }
}
