import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Post, UseGuards,
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
        host: olt.host, vendor: olt.vendor, version: olt.snmpVersion,
        snmpUser: olt.snmpUser,
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
      subscriptionId: d.subscription?.id ?? null,
      lastRxPower: d.lastRxPower,
      lastStatus: d.lastStatus,
      oltIfIndex: d.oltIfIndex,
      onuId: d.onuId,
    }));
  }

  /**
   * Daftarkan ONU hasil scan OLT sebagai perangkat monitoring (idempotent).
   * ONU langsung ikut polling optik 5-menit; pelanggan bisa dikaitkan belakangan.
   */
  async registerOnu(dto: { oltId: string; ifIndex: number; onuId: number; dBm?: number | null }) {
    const olt = await this.olts.findOne({ where: { id: dto.oltId } });
    if (!olt) throw new NotFoundException('OLT not found');

    let d = await this.devices.findOne({
      where: { oltHost: olt.host, oltIfIndex: dto.ifIndex, onuId: dto.onuId },
    });
    if (!d) {
      // Label PON/ONU: index C-Data dikodekan 32-bit — 16 bit bawah = nomor sebenarnya.
      const pon = dto.ifIndex > 0xffff ? dto.ifIndex & 0xffff : dto.ifIndex;
      const onu = dto.onuId > 0xffff ? dto.onuId & 0xffff : dto.onuId;
      d = this.devices.create({
        type: 'onu',
        serialNumber: `PON${pon}-ONU${onu}`,
        oltHost: olt.host,
        oltIfIndex: dto.ifIndex,
        onuId: dto.onuId,
      });
    }
    if (dto.dBm != null) {
      d.lastRxPower = dto.dBm.toFixed(2);
      d.lastStatus = 'online';
    }
    d.updatedAt = new Date();
    await this.devices.save(d);
    return { id: d.id, serialNumber: d.serialNumber };
  }

  /** Kaitkan/lepas ONU ke pelanggan (langganan). subscriptionId null = lepas. */
  async assignSubscription(deviceId: string, subscriptionId: string | null) {
    const d = await this.devices.findOne({ where: { id: deviceId } });
    if (!d) throw new NotFoundException('Device not found');
    d.subscription = subscriptionId ? ({ id: subscriptionId } as any) : null;
    await this.devices.save(d);
    return { id: d.id, subscriptionId };
  }

  /** Hapus ONU dari daftar monitoring. */
  async removeDevice(deviceId: string) {
    await this.devices.delete(deviceId);
    return { id: deviceId, deleted: true };
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

  /** Daftarkan ONU hasil scan ke tabel perangkat monitoring. */
  @Post('devices/register')
  @Roles('admin', 'operator')
  register(@Body() body: { oltId: string; ifIndex: number; onuId: number; dBm?: number | null }) {
    return this.service.registerOnu(body);
  }

  /** Kaitkan ONU ke pelanggan. Body: { subscriptionId: string | null }. */
  @Post('devices/:id/assign')
  @Roles('admin', 'operator')
  assign(@Param('id') id: string, @Body('subscriptionId') subscriptionId: string | null) {
    return this.service.assignSubscription(id, subscriptionId ?? null);
  }

  /** Hapus ONU dari monitoring. */
  @Delete('devices/:id')
  @Roles('admin', 'operator')
  remove(@Param('id') id: string) {
    return this.service.removeDevice(id);
  }
}
