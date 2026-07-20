import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Body, Controller, Delete, Get, Injectable, NotFoundException,
  Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsBoolean, IsIn, IsInt, IsNumberString, IsOptional, IsString } from 'class-validator';
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
  @IsOptional() @IsString() ipPool?: string;          // remote-address
  @IsOptional() @IsInt() billingCycle?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  // ── Field PPP profile lanjutan ──
  @IsOptional() @IsString() localAddress?: string;
  @IsOptional() @IsString() dnsServer?: string;
  @IsOptional() @IsIn(['default', 'yes', 'no']) onlyOne?: string;
  @IsOptional() @IsString() parentQueue?: string;
  @IsOptional() @IsString() insertQueueBefore?: string;
  /** Bila true, profile PPP didorong ke semua router saat simpan. */
  @IsOptional() @IsBoolean() pushToMikrotik?: boolean;
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
          // rate-limit profil bisa "10M/10M 20M/20M 5M/5M 8 ..." (burst) →
          // ambil token pertama (rx/tx dasar), cocok utk max-limit & display.
          const baseRate = String(prof.rateLimit || '').trim().split(/\s+/)[0] || '0/0';
          await this.repo.save(this.repo.create({
            name,
            price: '0',
            rateLimit: baseRate,
            pppoeProfile: name,
            ipPool: prof.remoteAddress || null,
            localAddress: prof.localAddress || null,
            billingCycle: 30,
            isActive: true,
            onlyOne: 'default',
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

  /**
   * Dorong definisi paket sebagai PPP profile ke semua router.
   * Best-effort: router offline/gagal dilewati, hasil per-router dikembalikan.
   */
  private async pushProfile(p: ServicePackage) {
    const profileName = p.pppoeProfile || p.name;
    if (!profileName) return [];
    const routers = await this.routers.find();
    const results = await Promise.allSettled(
      routers.map(async (r) => {
        await this.mikrotik.upsertPppProfile(r, {
          name: profileName,
          rateLimit: p.rateLimit,
          localAddress: p.localAddress,
          remoteAddress: p.ipPool,
          dnsServer: p.dnsServer,
          onlyOne: p.onlyOne,
          parentQueue: p.parentQueue,
          insertQueueBefore: p.insertQueueBefore,
        });
        return r.name;
      }),
    );
    return results.map((res, i) => ({
      router: routers[i]?.name ?? '-',
      ok: res.status === 'fulfilled',
      error: res.status === 'rejected' ? String((res.reason as Error)?.message ?? res.reason) : undefined,
    }));
  }

  /** Daftar pilihan dari Mikrotik utk form paket (pool, queue, profile). */
  async mikrotikOptions(routerId?: string) {
    const router = routerId
      ? await this.routers.findOne({ where: { id: routerId } })
      : (await this.routers.find())[0];
    if (!router) return { pools: [], queues: [], profiles: [], error: 'Belum ada router.' };
    try {
      const [pools, queues, profiles] = await Promise.all([
        this.mikrotik.listIpPools(router),
        this.mikrotik.listQueues(router),
        this.mikrotik.listProfiles(router),
      ]);
      return { pools, queues, profiles, router: router.name };
    } catch (e: any) {
      return { pools: [], queues: [], profiles: [], error: e?.message ?? 'Gagal membaca Mikrotik' };
    }
  }

  private applyDto(p: ServicePackage, dto: UpsertPackageDto) {
    if (dto.name !== undefined) p.name = dto.name;
    if (dto.price !== undefined) p.price = dto.price;
    if (dto.rateLimit !== undefined) p.rateLimit = dto.rateLimit;
    if (dto.pppoeProfile !== undefined) p.pppoeProfile = dto.pppoeProfile;
    if (dto.ipPool !== undefined) p.ipPool = dto.ipPool || null;
    if (dto.billingCycle !== undefined) p.billingCycle = dto.billingCycle;
    if (dto.isActive !== undefined) p.isActive = dto.isActive;
    if (dto.localAddress !== undefined) p.localAddress = dto.localAddress || null;
    if (dto.dnsServer !== undefined) p.dnsServer = dto.dnsServer || null;
    if (dto.onlyOne !== undefined) p.onlyOne = dto.onlyOne;
    if (dto.parentQueue !== undefined) p.parentQueue = dto.parentQueue || null;
    if (dto.insertQueueBefore !== undefined) p.insertQueueBefore = dto.insertQueueBefore || null;
  }

  async create(dto: UpsertPackageDto) {
    const p = this.repo.create({
      price: dto.price ?? '0',
      billingCycle: dto.billingCycle ?? 30,
      isActive: dto.isActive ?? true,
      onlyOne: dto.onlyOne ?? 'default',
    });
    this.applyDto(p, dto);
    // Nama profil default = nama paket bila tidak diisi.
    if (!p.pppoeProfile) p.pppoeProfile = p.name;
    const saved = await this.repo.save(p);
    const pushed = dto.pushToMikrotik === false ? [] : await this.pushProfile(saved);
    return { ...saved, pushed };
  }

  async update(id: string, dto: UpsertPackageDto) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Package not found');
    this.applyDto(p, dto);
    if (!p.pppoeProfile) p.pppoeProfile = p.name;
    const saved = await this.repo.save(p);
    const pushed = dto.pushToMikrotik === false ? [] : await this.pushProfile(saved);
    return { ...saved, pushed };
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
  /** Opsi dari Mikrotik utk form paket: IP pool, simple queue, PPP profile. */
  @Get('mikrotik-options')
  @Roles('admin')
  options(@Query('routerId') routerId?: string) { return this.service.mikrotikOptions(routerId || undefined); }
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
