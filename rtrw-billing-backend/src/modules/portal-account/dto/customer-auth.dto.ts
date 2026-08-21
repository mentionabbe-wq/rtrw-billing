import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class PortalLoginDto {
  /** Nomor pelanggan atau email. */
  @IsString()
  @IsNotEmpty({ message: 'Nomor pelanggan / email wajib diisi.' })
  @MaxLength(120)
  identifier: string;

  @IsString()
  @IsNotEmpty({ message: 'Kata sandi wajib diisi.' })
  @MaxLength(72)
  password: string;
}

export class OtpRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'Nomor WhatsApp wajib diisi.' })
  @MaxLength(24)
  phone: string;
}

export class OtpVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  phone: string;

  @IsString()
  @Length(6, 6, { message: 'Kode OTP terdiri dari 6 digit.' })
  code: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  phone: string;

  @IsString()
  @Length(6, 6, { message: 'Kode OTP terdiri dari 6 digit.' })
  code: string;

  @IsString()
  @Length(8, 72, { message: 'Kata sandi minimal 8 karakter.' })
  newPassword: string;
}

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(72)
  oldPassword?: string;

  @IsString()
  @Length(8, 72, { message: 'Kata sandi baru minimal 8 karakter.' })
  newPassword: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 80, { message: 'Nama antara 2 dan 80 karakter.' })
  fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Format email tidak valid.' })
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  /** Data URI gambar (maks ±1 MB setelah base64). */
  @IsOptional()
  @IsString()
  @MaxLength(1_500_000)
  photoUrl?: string;
}
