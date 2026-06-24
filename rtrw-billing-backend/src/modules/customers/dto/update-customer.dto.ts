import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @Length(3, 120)
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string; // re-encrypted if provided

  @IsOptional()
  @IsString()
  nik?: string; // re-encrypted if provided

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsIn(['active', 'suspended', 'terminated'])
  status?: string;
}
