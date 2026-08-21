import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, MaxLength, Min,
} from 'class-validator';

export class ApproveRequestDto {
  /** Paket yang disepakati (boleh berbeda dari pilihan calon pelanggan). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  packageId?: number;

  /** Buatkan kredensial portal & kirim via WhatsApp (default: ya). */
  @IsOptional()
  @IsBoolean()
  createPortalAccount?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class RejectRequestDto {
  @IsString()
  @Length(3, 300, { message: 'Alasan penolakan wajib diisi.' })
  reason: string;
}

export class UpsertCoverageDto {
  @IsString()
  @Length(2, 80)
  name: string;

  @IsOptional() @IsString() @MaxLength(80)
  village?: string;

  @IsOptional() @IsString() @MaxLength(80)
  district?: string;

  @IsOptional() @IsString() @MaxLength(8)
  rt?: string;

  @IsOptional() @IsString() @MaxLength(8)
  rw?: string;

  @IsOptional() @Type(() => Number) @IsLatitude()
  lat?: number;

  @IsOptional() @Type(() => Number) @IsLongitude()
  lng?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(50)
  radiusM?: number;

  @IsOptional() @IsIn(['available', 'full', 'planned'])
  status?: 'available' | 'full' | 'planned';

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class PortalAccessDto {
  @IsBoolean()
  enabled: boolean;
}
