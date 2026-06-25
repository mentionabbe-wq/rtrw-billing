import {
  BadRequestException, Body, Controller, Get, Injectable, Logger, Module,
  Param, Post, UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

/**
 * Integrasi GenieACS via NBI REST API (TR-069). Aplikasi ini "menyetir"
 * server GenieACS: daftar ONU, ubah SSID/password WiFi, reboot, refresh.
 * Pekerjaan TR-069 sebenarnya dilakukan GenieACS.
 *
 * Konfigurasi via env: GENIEACS_URL (mis. http://ip:7557), GENIEACS_USERNAME,
 * GENIEACS_PASSWORD (opsional, bila NBI di balik basic-auth).
 */
@Injectable()
export class GenieacsService {
  private readonly logger = new Logger(GenieacsService.name);
  constructor(private readonly config: ConfigService) {}

  private base(): string {
    const url = this.config.get<string>('genieacs.url');
    if (!url) throw new BadRequestException('GENIEACS_URL belum diset di environment aplikasi.');
    return url.replace(/\/$/, '');
  }
  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const u = this.config.get<string>('genieacs.username');
    const p = this.config.get<string>('genieacs.password');
    if (u) h['Authorization'] = 'Basic ' + Buffer.from(`${u}:${p ?? ''}`).toString('base64');
    return h;
  }

  /** Baca nilai parameter (path titik) dari objek device GenieACS. */
  private val(d: any, path: string): any {
    let cur = d;
    for (const part of path.split('.')) { cur = cur?.[part]; if (cur == null) return null; }
    return cur?._value ?? null;
  }
  /** Apakah sebuah node parameter ada di tree device. */
  private has(d: any, path: string): boolean {
    let cur = d;
    for (const part of path.split('.')) { cur = cur?.[part]; if (cur == null) return false; }
    return true;
  }

  async listDevices() {
    const projection = [
      '_id', '_deviceId', '_lastInform',
      'InternetGatewayDevice.DeviceInfo.SerialNumber',
      'InternetGatewayDevice.DeviceInfo.ModelName',
      'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
      'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress',
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
      'Device.WiFi.SSID.1.SSID',
    ].join(',');
    const res = await fetch(`${this.base()}/devices/?projection=${encodeURIComponent(projection)}`, { headers: this.headers() });
    if (!res.ok) throw new BadRequestException(`GenieACS error ${res.status}`);
    const arr = (await res.json()) as any[];
    return arr.map((d) => this.summary(d));
  }

  async getDevice(id: string) {
    const d = await this.fetchOne(id);
    const w = this.resolveWifi(d);
    return {
      ...this.summary(d),
      ssidPath: w.ssidPath,
      passPath: w.passPath,
      password: w.passPath ? this.val(d, w.passPath) : null,
      connectedHosts:
        this.val(d, 'InternetGatewayDevice.LANDevice.1.Hosts.HostNumberOfEntries') ??
        this.val(d, 'Device.Hosts.HostNumberOfEntries'),
      uptime: this.val(d, 'InternetGatewayDevice.DeviceInfo.UpTime') ?? this.val(d, 'Device.DeviceInfo.UpTime'),
    };
  }

  /** Ubah SSID dan/atau password WiFi via task setParameterValues. */
  async setWifi(id: string, ssid?: string, password?: string) {
    const d = await this.fetchOne(id);
    const w = this.resolveWifi(d);
    const params: any[] = [];
    if (ssid && w.ssidPath) params.push([w.ssidPath, ssid, 'xsd:string']);
    if (password && w.passPath) params.push([w.passPath, password, 'xsd:string']);
    if (!params.length) throw new BadRequestException('Tidak ada parameter WiFi yang bisa diset pada device ini.');
    await this.task(id, { name: 'setParameterValues', parameterValues: params });
    return { id, updated: params.map((p) => p[0]) };
  }

  async reboot(id: string) {
    await this.task(id, { name: 'reboot' });
    return { id, reboot: true };
  }

  async refresh(id: string) {
    const d = await this.fetchOne(id);
    const root = d?.InternetGatewayDevice ? 'InternetGatewayDevice' : 'Device';
    await this.task(id, { name: 'refreshObject', objectName: root });
    return { id, refreshed: true };
  }

  // ---- internal ----
  private async fetchOne(id: string): Promise<any> {
    const q = encodeURIComponent(JSON.stringify({ _id: id }));
    const res = await fetch(`${this.base()}/devices/?query=${q}`, { headers: this.headers() });
    if (!res.ok) throw new BadRequestException(`GenieACS error ${res.status}`);
    const arr = (await res.json()) as any[];
    if (!arr.length) throw new BadRequestException('Device tidak ditemukan di GenieACS.');
    return arr[0];
  }

  private async task(id: string, body: any) {
    const res = await fetch(
      `${this.base()}/devices/${encodeURIComponent(id)}/tasks?connection_request`,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
    );
    // 200 = selesai, 202 = antri (device sedang offline). Keduanya OK.
    if (!res.ok && res.status !== 202) {
      const txt = await res.text().catch(() => '');
      throw new BadRequestException(`GenieACS task gagal (${res.status}) ${txt}`.trim());
    }
  }

  private resolveWifi(d: any): { ssidPath: string | null; passPath: string | null } {
    // TR-098 (InternetGatewayDevice) — paling umum di ONU ZTE/Huawei/C-Data.
    const igd = 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1';
    if (this.has(d, `${igd}.SSID`)) {
      let passPath: string | null = null;
      for (const cand of [`${igd}.KeyPassphrase`, `${igd}.PreSharedKey.1.KeyPassphrase`, `${igd}.PreSharedKey.1.PreSharedKey`]) {
        if (this.has(d, cand)) { passPath = cand; break; }
      }
      return { ssidPath: `${igd}.SSID`, passPath };
    }
    // TR-181 (Device.)
    if (this.has(d, 'Device.WiFi.SSID.1.SSID')) {
      const passPath = this.has(d, 'Device.WiFi.AccessPoint.1.Security.KeyPassphrase')
        ? 'Device.WiFi.AccessPoint.1.Security.KeyPassphrase' : null;
      return { ssidPath: 'Device.WiFi.SSID.1.SSID', passPath };
    }
    return { ssidPath: null, passPath: null };
  }

  private summary(d: any) {
    const did = d._deviceId || {};
    const ssid =
      this.val(d, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID') ??
      this.val(d, 'Device.WiFi.SSID.1.SSID');
    const ip =
      this.val(d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress') ??
      this.val(d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress');
    const lastInformMs = d._lastInform ? new Date(d._lastInform).getTime() : 0;
    return {
      id: d._id,
      serial: did._SerialNumber ?? this.val(d, 'InternetGatewayDevice.DeviceInfo.SerialNumber'),
      manufacturer: did._Manufacturer ?? null,
      productClass: did._ProductClass ?? null,
      model: this.val(d, 'InternetGatewayDevice.DeviceInfo.ModelName') ?? null,
      software: this.val(d, 'InternetGatewayDevice.DeviceInfo.SoftwareVersion') ?? null,
      ssid,
      ip,
      lastInform: lastInformMs ? new Date(lastInformMs).toISOString() : null,
      online: lastInformMs ? Date.now() - lastInformMs < 10 * 60 * 1000 : false,
    };
  }
}

@ApiTags('genieacs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('genieacs')
export class GenieacsController {
  constructor(private readonly service: GenieacsService) {}

  @Get('devices') list() { return this.service.listDevices(); }
  @Get('devices/:id') get(@Param('id') id: string) { return this.service.getDevice(id); }

  @Post('devices/:id/wifi')
  @Roles('admin', 'operator')
  wifi(@Param('id') id: string, @Body() body: { ssid?: string; password?: string }) {
    return this.service.setWifi(id, body?.ssid, body?.password);
  }

  @Post('devices/:id/reboot')
  @Roles('admin', 'operator')
  reboot(@Param('id') id: string) { return this.service.reboot(id); }

  @Post('devices/:id/refresh')
  @Roles('admin', 'operator')
  refresh(@Param('id') id: string) { return this.service.refresh(id); }
}

@Module({
  imports: [ConfigModule],
  controllers: [GenieacsController],
  providers: [GenieacsService],
})
export class GenieacsModule {}
