import {
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Req, UseGuards, BadRequestException,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as argon2 from 'argon2';
import { User } from '@database/entities';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

const ROLES = ['admin', 'operator', 'finance'] as const;

export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsIn(ROLES as unknown as string[]) role: string;
}
export class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(ROLES as unknown as string[]) role?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class ResetPasswordDto {
  @IsString() @MinLength(8) password: string;
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  /** Never expose passwordHash / totpSecretEnc. */
  private view(u: User) {
    return {
      id: u.id, email: u.email, role: u.role,
      isActive: u.isActive, totpEnabled: u.totpEnabled, createdAt: u.createdAt,
    };
  }

  async findAll() {
    return (await this.repo.find({ order: { id: 'ASC' } })).map((u) => this.view(u));
  }

  async create(dto: CreateUserDto) {
    if (await this.repo.findOne({ where: { email: dto.email } })) {
      throw new BadRequestException('Email already used');
    }
    const u = this.repo.create({
      email: dto.email,
      role: dto.role as any,
      passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
    });
    return this.view(await this.repo.save(u));
  }

  async update(id: string, dto: UpdateUserDto) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    if (dto.email !== undefined) u.email = dto.email;
    if (dto.role !== undefined) u.role = dto.role as any;
    if (dto.isActive !== undefined) u.isActive = dto.isActive;
    return this.view(await this.repo.save(u));
  }

  async resetPassword(id: string, password: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    u.passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.repo.save(u);
    return { id, reset: true };
  }

  async remove(id: string, actingUserId: string) {
    if (id === actingUserId) throw new BadRequestException('Cannot delete your own account');
    const admins = await this.repo.count({ where: { role: 'admin' as any, isActive: true } });
    const target = await this.repo.findOne({ where: { id } });
    if (target?.role === 'admin' && admins <= 1) {
      throw new BadRequestException('Cannot delete the last admin');
    }
    await this.repo.delete(id);
    return { id, deleted: true };
  }
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get() findAll() { return this.service.findAll(); }
  @Post() create(@Body() dto: CreateUserDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateUserDto) { return this.service.update(id, dto); }
  @Post(':id/reset-password') reset(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(id, dto.password);
  }
  @Delete(':id') remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user.id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
