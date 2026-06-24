import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  /** 6-digit TOTP, required only when the account has 2FA enabled. */
  @IsOptional()
  @IsString()
  token?: string;
}
