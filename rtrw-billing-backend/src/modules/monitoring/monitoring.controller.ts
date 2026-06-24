import {
  BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Post, UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Device, Olt } from '@database/entities';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { SnmpService } from '@modules/snmp/snmp.service';

@Injectable()
export class MonitoringService {
  constructor(
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(Olt) private readonly olts: Repository<Olt>,
    private readonly snmp: SnmpService,
  ) {}

  /** Enable/disable ONU port remotely via SNMP SET (per-vendor OID). */
  async setPort(deviceId: string, up: boolean) {
    const device = await this.devices.findOne({ where: { id: deviceId } });
    if (!device || !device.oltHost) throw new NotFoundException('Device/OLT not found');
    const olt = await this.olts.findOne({ where: { host: device.oltHost } });
    if (!olt) throw new BadRequestException('OLT credentials not configured');

    await this.snmp.setOnuAdminStatus(
      {
        host: olt.host, vendor: olt.vendor, snmpUser: olt.snmpUser,
        authKeyEnc: olt.snmpAuthEnc, privKeyEnc: olt.snmpPrivEnc,
      },
      device.oltIfIndex,
      device.onuId,
      up,
    );
    await this.devices.update(device.id, { lastStatus: up ? 'online' : 'offline' });
    return { id: device.id, up };
  }

  async listOnu() {
    const rows = await this.devices.find({
      where: { type: 'onu' },
      relations: { subscription: { customer: true } },
      take: 500,
    });
    return rows.map((d) => ({
      id: d.id,
      serialNumber: d.serialNumber,
      customerName: d.subscription?.customer?.fullName ?? null,
      lastRxPower: d.lastRxPower,
      lastStatus: d.lastStatus,
    }));
  }
}

@ApiTags('monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly service: MonitoringService) {}

  @Get('devices')
  devices() {
    return this.service.listOnu();
  }

  /** Remote ONU port control. Body: { up: boolean }. */
  @Post('devices/:id/port')
  @Roles('admin', 'operator')
  setPort(@Param('id') id: string, @Body('up') up: boolean) {
    return this.service.setPort(id, up);
  }
}
