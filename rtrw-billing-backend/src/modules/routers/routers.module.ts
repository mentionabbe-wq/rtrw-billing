import {
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Router } from '@database/entities';
import { CryptoService } from '@common/crypto/crypto.service';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { MikrotikService } from '@modules/mikrotik/mikrotik.service';

export class UpsertRouterDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsInt() apiPort?: number;
  @IsOptional() @IsString() apiUsername?: string;
  @IsOptional() @IsString() apiSecret?: string; // plain -> encrypted server-side
}

@Injectable()
export class RoutersService {
  constructor(
    @InjectRepository(Router) private readonly repo: Repository<Router>,
    private readonly crypto: CryptoService,
    private readonly mikrotik: MikrotikService,
  ) {}

  /** Never expose api_secret. */
  private view(r: Router) {
    return {
      id: r.id, name: r.name, host: r.host, apiPort: r.apiPort,
      apiUsername: r.apiUsername, status: r.status, lastSeenAt: r.lastSeenAt,
      hasSecret: !!r.apiSecretEnc,
    };
  }

  async findAll() {
    return (await this.repo.find({ order: { id: 'ASC' } })).map((r) => this.view(r));
  }

  async create(dto: UpsertRouterDto) {
    const r = this.repo.create({
      name: dto.name,
      host: dto.host,
      apiPort: dto.apiPort ?? 8729,
      apiUsername: dto.apiUsername,
      apiSecretEnc: this.crypto.encrypt(dto.apiSecret ?? '')!,
    });
    return this.view(await this.repo.save(r));
  }

  async update(id: string, dto: UpsertRouterDto) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Router not found');
    if (dto.name !== undefined) r.name = dto.name;
    if (dto.host !== undefined) r.host = dto.host;
    if (dto.apiPort !== undefined) r.apiPort = dto.apiPort;
    if (dto.apiUsername !== undefined) r.apiUsername = dto.apiUsername;
    if (dto.apiSecret) r.apiSecretEnc = this.crypto.encrypt(dto.apiSecret)!;
    return this.view(await this.repo.save(r));
  }

  async remove(id: string) {
    await this.repo.delete(id);
    return { id, deleted: true };
  }

  async test(id: string) {
    const r = await this.get(id);
    const info = await this.mikrotik.testConnection(r);
    await this.repo.update(id, {
      status: info.ok ? 'online' : 'offline',
      lastSeenAt: info.ok ? new Date() : r.lastSeenAt,
    });
    return { id, ...info };
  }

  /** Sesi PPPoE/hotspot yang sedang online (Mikrotik -> app). */
  async active(id: string) {
    return this.mikrotik.listActive(await this.get(id));
  }

  /** Daftar PPP profile + rate-limit (untuk memetakan paket). */
  async profiles(id: string) {
    return this.mikrotik.listProfiles(await this.get(id));
  }

  /** Daftar PPP secret di router (discovery / rekonsiliasi pelanggan). */
  async secrets(id: string) {
    return this.mikrotik.listSecrets(await this.get(id));
  }

  private async get(id: string) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Router not found');
    return r;
  }
}

@ApiTags('routers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('routers')
export class RoutersController {
  constructor(private readonly service: RoutersService) {}

  @Get() findAll() { return this.service.findAll(); }
  @Post() create(@Body() dto: UpsertRouterDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpsertRouterDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
  @Post(':id/test') test(@Param('id') id: string) { return this.service.test(id); }
  @Get(':id/active') active(@Param('id') id: string) { return this.service.active(id); }
  @Get(':id/profiles') profiles(@Param('id') id: string) { return this.service.profiles(id); }
  @Get(':id/secrets') secrets(@Param('id') id: string) { return this.service.secrets(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([Router]), MikrotikModule],
  controllers: [RoutersController],
  providers: [RoutersService],
})
export class RoutersModule {}
