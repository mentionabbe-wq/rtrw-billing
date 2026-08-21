import { IsOptional, IsString, Length } from 'class-validator';

export class ChangeWifiDto {
  @IsOptional()
  @IsString()
  @Length(2, 32, { message: 'Nama WiFi harus 2–32 karakter.' })
  ssid?: string;

  @IsOptional()
  @IsString()
  @Length(8, 63, { message: 'Kata sandi WiFi harus 8–63 karakter.' })
  password?: string;
}
