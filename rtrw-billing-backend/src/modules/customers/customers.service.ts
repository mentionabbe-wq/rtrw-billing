import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CryptoService } from '@common/crypto/crypto.service';
import { Customer } from '@database/entities';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly repo: Repository<Customer>,
    private readonly crypto: CryptoService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateCustomerDto): Promise<{ id: string; customerNo: string }> {
    const customerNo = await this.nextCustomerNo();
    const entity = this.repo.create({
      customerNo,
      fullName: dto.fullName,
      phoneEnc: this.crypto.encrypt(dto.phone),
      nikEnc: this.crypto.encrypt(dto.nik),
      address: dto.address,
      geoLat: dto.geoLat,
      geoLng: dto.geoLng,
    });
    const saved = await this.repo.save(entity);
    return { id: saved.id, customerNo: saved.customerNo };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Customer not found');

    if (dto.fullName !== undefined) c.fullName = dto.fullName;
    if (dto.address !== undefined) c.address = dto.address;
    if (dto.status !== undefined) c.status = dto.status;
    if (dto.phone !== undefined) c.phoneEnc = this.crypto.encrypt(dto.phone)!;
    if (dto.nik !== undefined) c.nikEnc = this.crypto.encrypt(dto.nik);

    await this.repo.save(c);
    return this.toView(c);
  }

  async findAll() {
    const rows = await this.repo.find({ order: { id: 'DESC' }, take: 200 });
    return rows.map((c) => this.toView(c));
  }

  /**
   * Hapus 1 pelanggan + seluruh data turunannya. subscriptions & devices
   * ON DELETE CASCADE; invoices & payments harus dibuang manual (FK restrict).
   */
  async remove(id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Customer not found');
    await this.dataSource.transaction(async (m) => {
      await m.query(
        `DELETE FROM payments WHERE invoice_id IN (
           SELECT i.id FROM invoices i
           JOIN subscriptions s ON i.subscription_id = s.id
           WHERE s.customer_id = $1)`, [id]);
      await m.query(
        `DELETE FROM invoices WHERE subscription_id IN (
           SELECT id FROM subscriptions WHERE customer_id = $1)`, [id]);
      await m.query(`DELETE FROM customers WHERE id = $1`, [id]); // cascade subs+devices
    });
    return { id, deleted: true };
  }

  /**
   * Bersihkan SEMUA data demo/pelanggan (pelanggan, langganan, ONU, tagihan,
   * pembayaran, log, metrik). Paket/router/OLT/user TIDAK dihapus.
   * Set SEED_ON_START=false agar tidak ter-seed ulang.
   */
  async clearDemo() {
    await this.dataSource.transaction(async (m) => {
      await m.query('DELETE FROM payments');
      await m.query('DELETE FROM invoices');
      await m.query('DELETE FROM customers'); // cascade subscriptions + devices
      await m.query('DELETE FROM mikrotik_sync_logs');
      await m.query('DELETE FROM device_metrics');
    });
    return { cleared: true };
  }

  async findOne(id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Customer not found');
    return this.toView(c);
  }

  /** Decrypt sensitive fields only when explicitly returning a single record. */
  private toView(c: Customer) {
    return {
      id: c.id,
      customerNo: c.customerNo,
      fullName: c.fullName,
      phone: this.crypto.decrypt(c.phoneEnc),
      nik: this.crypto.decrypt(c.nikEnc),
      address: c.address,
      status: c.status,
      createdAt: c.createdAt,
    };
  }

  private async nextCustomerNo(): Promise<string> {
    const count = await this.repo.count();
    return 'CST' + String(count + 1).padStart(6, '0');
  }
}
