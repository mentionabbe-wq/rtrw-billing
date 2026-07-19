import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  /** Cek ketersediaan user PPPoE. Definisikan SEBELUM :id. */
  @Get('check-pppoe')
  checkPppoe(@Query('username') username: string, @Query('routerId') routerId?: string) {
    return this.service.checkPppoe(username, routerId || undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('admin', 'operator')
  create(@Body() dto: CreateCustomerDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles('admin', 'operator')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.service.update(id, dto);
  }

  /** Sinkron pelanggan dari PPP secret Mikrotik (admin). Definisikan SEBELUM :id. */
  @Post('sync-mikrotik')
  @Roles('admin')
  syncMikrotik() {
    return this.service.syncFromMikrotik();
  }

  /** Hapus semua data demo/pelanggan (admin). Definisikan SEBELUM :id. */
  @Post('clear-demo')
  @Roles('admin')
  clearDemo() {
    return this.service.clearDemo();
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
