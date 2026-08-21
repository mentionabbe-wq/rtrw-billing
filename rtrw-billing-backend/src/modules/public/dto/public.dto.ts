import { Type } from 'class-transformer';
import {
  IsEmail, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, Length, MaxLength,
} from 'class-validator';

export class RegisterLeadDto {
  @IsString()
  @Length(2, 80, { message: 'Nama antara 2 dan 80 karakter.' })
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Nomor WhatsApp wajib diisi.' })
  @MaxLength(24)
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Format email tidak valid.' })
  @MaxLength(120)
  email?: string;

  @IsString()
  @Length(8, 300, { message: 'Alamat terlalu pendek.' })
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  rt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  rw?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'Koordinat lintang tidak valid.' })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'Koordinat bujur tidak valid.' })
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  packageId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CoverageCheckDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  rt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  rw?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'Koordinat lintang tidak valid.' })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'Koordinat bujur tidak valid.' })
  lng?: number;
}

export class BillingCheckRequestDto {
  /** Nomor pelanggan atau nomor WhatsApp. */
  @IsString()
  @IsNotEmpty({ message: 'Isi nomor pelanggan atau nomor WhatsApp.' })
  @MaxLength(64)
  identifier: string;
}

export class BillingCheckVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  identifier: string;

  @IsString()
  @Length(6, 6, { message: 'Kode OTP terdiri dari 6 digit.' })
  code: string;
}
