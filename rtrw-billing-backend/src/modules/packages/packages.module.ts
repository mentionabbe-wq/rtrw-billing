import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Body, Controller, Delete, Get, Injectable, NotFoundException,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsBoolean, IsInt, IsNumberString, IsOptional, IsString } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ServicePackage, Router } from '@database/entities';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { MikrotikService } from '@modules/mikrotik/mikrotik.service';

export class UpsertPackageDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumberString() price?: string;
  @IsOptional() @IsString() rateLimit?: string;       // "20M/20M"
  @IsOptional() @IsString() pppoeProfile?: string;
  @IsOptional() @IsString() ipPool?: string;
  @IsOptional() @IsInt() billingCycle?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class PackagesService {
  constructor(
    @InjectRepository(ServicePackage) private readonly repo: Repository<ServicePackage>,
    @InjectRepository(Router) private readonly routers: Repository<Router>,
    private readonly mikrotik: MikrotikService,
  ) {}

  findAll() {
    return this.repo.find({ order: { price: 'ASC' } });
  }

  /**
   * SINKRON paket dari PPP profile Mikrotik (router online). Profile yang belum
   * punya paket (cocok via pppoeProfile) dibuatkan paket baru: rate-limit & pool
   * (remote-address) diambil dari profile, harga 0 (isi manual). Idempotent.
   */
  async syncFromMikrotik() {
   try {
    const routers = await this.routers.find();
    if (!routers.length) return { created: 0, skipped: 0, routers: [], error: 'Belum ada router. Tambah router di Pengaturan dulu.' };
    const existing = new Set(
      (await this.repo.find()).map((p) => p.pppoeProfile).filter(Boolean),
    );
    const SKIP = new Set(['default', 'default-encryption']);

    let created = 0;
    let skipped = 0;
    const perRouter: Array<{ router: string; created: number; skipped: number; error?: string }> = [];

    for (const r of routers) {
      if (r.status === 'offline') { perRouter.push({ router: r.name, created: 0, skipped: 0, error: 'offline' }); continue; }
      let profiles: any[] = [];
      try {
        profiles = await this.mikrotik.listProfiles(r);
      } catch (e) {
        perRouter.push({ router: r.name, created: 0, skipped: 0, error: e?.message ?? 'gagal konek' });
        continue;
      }

      let rc = 0, rs = 0, saveErr: string | undefined;
      for (const prof of profiles) {
        const name: string = prof.name;
        if (!name || SKIP.has(name) || existing.has(name)) { rs++; skipped++; continue; }
        existing.add(name);
        try {
          await this.repo.save(this.repo.create({
            name,
            price: '0',
            rateLimit: prof.rateLimit || '0/0',
            pppoeProfile: name,
            ipPool: prof.remoteAddress || null,
            billingCycle: 30,
            isActive: true,
          }));
          rc++; created++;
        } catch (e) {
          saveErr = e?.message ?? 'gagal simpan';
          break; // error simpan biasanya sama utk semua (mis. kolom hilang)
        }
      }
      perRouter.push({ router: r.name, created: rc, skipped: rs, error: saveErr });
    }

    return { created, skipped, routers: perRouter };
   } catch (e) {
    return { created: 0, skipped: 0, routers: [], error: e?.message ?? 'internal error' };
   }
  }

  async create(dto: UpsertPackageDto) {
    const p = this.repo.create({
      name: dto.name,
      price: dto.price ?? '0',
      rateLimit: dto.rateLimit,
      pppoeProfile: dto.pppoeProfile,
      ipPool: dto.ipPool,
      billingCycle: dto.billingCycle ?? 30,
      isActive: dto.isActive ?? true,
    });
    return this.repo.save(p);
  }

  async update(id: string, dto: UpsertPackageDto) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Package not found');
    if (dto.name !== undefined) p.name = dto.name;
    if (dto.price !== undefined) p.price = dto.price;
    if (dto.rateLimit !== undefined) p.rateLimit = dto.rateLimit;
    if (dto.pppoeProfile !== undefined) p.pppoeProfile = dto.pppoeProfile;
    if (dto.ipPool !== undefined) p.ipPool = dto.ipPool;
    if (dto.billingCycle !== undefined) p.billingCycle = dto.billingCycle;
    if (dto.isActive !== undefined) p.isActive = dto.isActive;
    return this.repo.save(p);
  }

  async remove(id: string) {
    await this.repo.delete(id);
    return { id, deleted: true };
  }
}

@ApiTags('packages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('packages')
export class PackagesController {
  constructor(private readonly service: PackagesService) {}

  @Get() findAll() { return this.service.findAll(); }
  @Post('sync-mikrotik') @Roles('admin') sync() { return this.service.syncFromMikrotik(); }
  @Post() @Roles('admin') create(@Body() dto: UpsertPackageDto) { return this.service.create(dto); }
  @Patch(':id') @Roles('admin') update(@Param('id') id: string, @Body() dto: UpsertPackageDto) { return this.service.update(id, dto); }
  @Delete(':id') @Roles('admin') remove(@Param('id') id: string) { return this.service.remove(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([ServicePackage, Router]), MikrotikModule],
  controllers: [PackagesController],
  providers: [PackagesService],
})
export class PackagesModule {}
