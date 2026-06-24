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
}
