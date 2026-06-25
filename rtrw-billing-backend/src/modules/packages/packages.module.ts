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
import { ServicePackage } from '@database/entities';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

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
  ) {}

  findAll() {
    return this.repo.find({ order: { price: 'ASC' } });
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
  @Post() @Roles('admin') create(@Body() dto: UpsertPackageDto) { return this.service.create(dto); }
  @Patch(':id') @Roles('admin') update(@Param('id') id: string, @Body() dto: UpsertPackageDto) { return this.service.update(id, dto); }
  @Delete(':id') @Roles('admin') remove(@Param('id') id: string) { return this.service.remove(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([ServicePackage])],
  controllers: [PackagesController],
  providers: [PackagesService],
})
export class PackagesModule {}
