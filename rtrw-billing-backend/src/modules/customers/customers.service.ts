import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptoService } from '@common/crypto/crypto.service';
import { Customer } from '@database/entities';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly repo: Repository<Customer>,
    private readonly crypto: CryptoService,
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
