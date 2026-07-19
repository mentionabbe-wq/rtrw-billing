import { IsOptional, IsString, Length } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @Length(3, 120)
  fullName: string;

  @IsString()
  phone: string; // stored encrypted

  @IsOptional()
  @IsString()
  nik?: string; // stored encrypted

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  geoLat?: string;

  @IsOptional()
  @IsString()
  geoLng?: string;

  // ---- Langganan opsional (kalau diisi, langsung dibuatkan langganan) ----
  /** Bila diisi, dibuat langganan PPPoE sekaligus. */
  @IsOptional() @IsString() pppoeUser?: string;
  @IsOptional() @IsString() pppoePass?: string;
  @IsOptional() @IsString() packageId?: string;
  @IsOptional() @IsString() routerId?: string;
  /** IP statis pelanggan (remote-address PPP secret). Opsional. */
  @IsOptional() @IsString() ipStatic?: string;
}
