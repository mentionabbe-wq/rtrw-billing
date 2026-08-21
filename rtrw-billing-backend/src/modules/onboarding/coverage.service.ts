import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoverageArea } from '@database/entities';
import { UpsertCoverageDto } from './dto/onboarding.dto';

/** CRUD area layanan (dipakai fitur "Cek Ketersediaan" di landing page). */
@Injectable()
export class CoverageService {
  constructor(@InjectRepository(CoverageArea) private readonly repo: Repository<CoverageArea>) {}

  async list() {
    const rows = await this.repo.find({ order: { name: 'ASC' } });
    return rows.map((a) => this.toDto(a));
  }

  async create(dto: UpsertCoverageDto) {
    const saved = await this.repo.save(this.repo.create(this.fromDto(dto)));
    return this.toDto(saved);
  }

  async update(id: string, dto: UpsertCoverageDto) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Area tidak ditemukan.');
    await this.repo.update(id, this.fromDto(dto));
    return this.toDto(await this.repo.findOne({ where: { id } }));
  }

  async remove(id: string) {
    const res = await this.repo.delete(id);
    if (!res.affected) throw new NotFoundException('Area tidak ditemukan.');
    return { ok: true };
  }

  private fromDto(dto: UpsertCoverageDto): Partial<CoverageArea> {
    return {
      name: dto.name?.trim(),
      village: dto.village?.trim() ?? null,
      district: dto.district?.trim() ?? null,
      rt: dto.rt ?? null,
      rw: dto.rw ?? null,
      lat: dto.lat != null ? String(dto.lat) : null,
      lng: dto.lng != null ? String(dto.lng) : null,
      radiusM: dto.radiusM ?? 700,
      status: dto.status ?? 'available',
      note: dto.note?.trim() ?? null,
      isActive: dto.isActive ?? true,
    };
  }

  private toDto(a: CoverageArea) {
    return {
      id: String(a.id),
      name: a.name,
      village: a.village,
      district: a.district,
      rt: a.rt,
      rw: a.rw,
      lat: a.lat != null ? Number(a.lat) : null,
      lng: a.lng != null ? Number(a.lng) : null,
      radiusM: a.radiusM,
      status: a.status,
      note: a.note,
      isActive: a.isActive,
    };
  }
}
