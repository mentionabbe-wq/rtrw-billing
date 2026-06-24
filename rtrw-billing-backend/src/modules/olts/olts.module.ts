import {
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Olt } from '@database/entities';
import { CryptoService } from '@common/crypto/crypto.service';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

export class UpsertOltDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsIn(['zte', 'huawei', 'generic']) vendor?: string;
  @IsOptional() @IsString() snmpUser?: string;
  @IsOptional() @IsString() snmpAuthKey?: string; // plain -> encrypted
  @IsOptional() @IsString() snmpPrivKey?: string; // plain -> encrypted
}

@Injectable()
export class OltsService {
  constructor(
    @InjectRepository(Olt) private readonly repo: Repository<Olt>,
    private readonly crypto: CryptoService,
  ) {}

  /** Never expose SNMP keys. */
  private view(o: Olt) {
    return {
      id: o.id, name: o.name, host: o.host, vendor: o.vendor,
      snmpUser: o.snmpUser, status: o.status,
      hasAuthKey: !!o.snmpAuthEnc, hasPrivKey: !!o.snmpPrivEnc,
    };
  }

  async findAll() {
    return (await this.repo.find({ order: { id: 'ASC' } })).map((o) => this.view(o));
  }

  async create(dto: UpsertOltDto) {
    const o = this.repo.create({
      name: dto.name,
      host: dto.host,
      vendor: dto.vendor ?? 'generic',
      snmpUser: dto.snmpUser,
      snmpAuthEnc: this.crypto.encrypt(dto.snmpAuthKey ?? '')!,
      snmpPrivEnc: this.crypto.encrypt(dto.snmpPrivKey ?? '')!,
    });
    return this.view(await this.repo.save(o));
  }

  async update(id: string, dto: UpsertOltDto) {
    const o = await this.repo.findOne({ where: { id } });
    if (!o) throw new NotFoundException('OLT not found');
    if (dto.name !== undefined) o.name = dto.name;
    if (dto.host !== undefined) o.host = dto.host;
    if (dto.vendor !== undefined) o.vendor = dto.vendor;
    if (dto.snmpUser !== undefined) o.snmpUser = dto.snmpUser;
    if (dto.snmpAuthKey) o.snmpAuthEnc = this.crypto.encrypt(dto.snmpAuthKey)!;
    if (dto.snmpPrivKey) o.snmpPrivEnc = this.crypto.encrypt(dto.snmpPrivKey)!;
    return this.view(await this.repo.save(o));
  }

  async remove(id: string) {
    await this.repo.delete(id);
    return { id, deleted: true };
  }
}

@ApiTags('olts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('olts')
export class OltsController {
  constructor(private readonly service: OltsService) {}

  @Get() findAll() { return this.service.findAll(); }
  @Post() create(@Body() dto: UpsertOltDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpsertOltDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([Olt])],
  controllers: [OltsController],
  providers: [OltsService],
})
export class OltsModule {}
