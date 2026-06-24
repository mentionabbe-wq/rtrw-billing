import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Controller, Get, UseGuards, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ServicePackage } from '@database/entities';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';

@Injectable()
export class PackagesService {
  constructor(
    @InjectRepository(ServicePackage) private readonly repo: Repository<ServicePackage>,
  ) {}
  findAll() {
    return this.repo.find({ order: { price: 'ASC' } });
  }
}

@ApiTags('packages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('packages')
export class PackagesController {
  constructor(private readonly service: PackagesService) {}
  @Get()
  findAll() {
    return this.service.findAll();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ServicePackage])],
  controllers: [PackagesController],
  providers: [PackagesService],
})
export class PackagesModule {}
