import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Logger, Module,
  Param, Post, UseGuards,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Device, Router, Subscription } from '@database/entities';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { IntegrationsService } from '@modules/integrations/integrations.service';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { MikrotikService } from '@modules/mikrotik/mikrotik.service';

/**
 * Integrasi GenieACS via NBI REST API (TR-069). Aplikasi ini "menyetir"
 * server GenieACS: daftar ONU, ubah SSID/password WiFi, reboot, refresh.
 * Pekerjaan TR-069 sebenarnya dilakukan GenieACS.
 *
 * Konfigurasi dari menu Pengaturan → Integrasi (DB), fallback env
 * GENIEACS_URL / GENIEACS_USERNAME / GENIEACS_PASSWORD.
 */
@Injectable()
export class GenieacsService {
  private readonly logger = new Logger(GenieacsService.name);
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly mikrotik: MikrotikService,
    @InjectRepository(Router) private readonly routers: Repository<Router>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
  ) {}

  /**
   * Daftar ONU TR-069 + deteksi pelanggan OTOMATIS via IP WAN:
   * IP ONU → sesi PPPoE aktif (Mikrotik) → user PPPoE → langganan → pelanggan.
   * Juga gabungkan redaman optik (RX) dari device monitoring OLT via langganan.
   */
  async listDevicesWithCustomer() {
    // GenieACS OPSIONAL — bila belum dikonfigurasi / tak terjangkau, tetap
    // tampilkan ONU yang terdaftar dari OLT (redaman) agar tidak hilang.
    let acsDevices: any[] = [];
    try { acsDevices = await this.listDevices(); } catch { acsDevices = []; }

    // Peta IP → user PPPoE dari semua router online.
    const ipToUser = new Map<string, string>();
    const onlineRouters = await this.routers.find({ where: { status: 'online' } });
    await Promise.all(
      onlineRouters.map(async (r) => {
        try {
          for (const s of await this.mikrotik.listActive(r)) {
            if (s.address) ipToUser.set(String(s.address), String(s.name));
          }
        } catch { /* skip router offline/error */ }
      }),
    );

    // Peta user PPPoE (lowercase) → {nama pelanggan, id langganan}.
    const allSubs = await this.subs.find({ relations: { customer: true } });
    const userToSub = new Map<string, { name: string; subId: string }>();
    for (const s of allSubs) {
      if (s.pppoeUser) {
        userToSub.set(s.pppoeUser.toLowerCase(), {
          name: s.customer?.fullName ?? s.pppoeUser,
          subId: String(s.id),
        });
      }
    }

    // Peta langganan → device monitoring OLT (redaman terakhir hasil polling).
    const onus = await this.devices.find({
      where: { type: 'onu' },
      relations: { subscription: true },
    });

    // Resolusi pelanggan OTOMATIS berdasarkan USER PPPoE: cari user PPPoE
    // (sbg kata utuh) di dalam nama ONU dari OLT (serialNumber, mis.
    // "gpon 0/0/1 onu 1 a20"). Setelah cocok sekali → dipersist by ID langganan,
    // jadi ganti user PPPoE di menu Pelanggan tetap aman.
    const subsWithCust = allSubs.filter((s) => s.customer);
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const resolveSub = (d: Device): string | null => {
      if (d.subscription?.id) return String(d.subscription.id);
      const text = (d.serialNumber ?? '').toLowerCase();
      if (!text) return null;
      let best: { subId: string; len: number } | null = null;
      for (const s of subsWithCust) {
        const key = (s.pppoeUser ?? '').trim().toLowerCase();
        if (key.length < 2) continue;
        // Kata utuh: "a20" tak salah cocok dgn "a200"/"ba20".
        const re = new RegExp(`(^|[^a-z0-9])${escapeRe(key)}([^a-z0-9]|$)`);
        if (re.test(text) && (!best || key.length > best.len)) {
          best = { subId: String(s.id), len: key.length };
        }
      }
      return best?.subId ?? null;
    };

    const deviceSubId = new Map<string, string>();
    const subToOnu = new Map<string, Device>();
    for (const d of onus) {
      const sid = resolveSub(d);
      if (sid) {
        deviceSubId.set(String(d.id), sid);
        if (!subToOnu.has(sid)) subToOnu.set(sid, d);
        // Persist tautan bila belum ada, agar notifikasi & data konsisten.
        if (!d.subscription) {
          this.devices.update(d.id, { subscription: { id: sid } as any }).catch(() => {});
        }
      }
    }
    const classify = (d?: Device): 'ok' | 'warning' | 'critical' | null => {
      if (!d) return null;
      if (d.lastStatus === 'los' || d.lastStatus === 'offline') return 'critical';
      const dbm = d.lastRxPower != null ? Number(d.lastRxPower) : null;
      if (dbm == null) return null;
      if (dbm < -27) return 'critical';
      if (dbm < -25) return 'warning';
      return 'ok';
    };

    const usedSubIds = new Set<string>();
    const rows: any[] = acsDevices.map((d) => {
      const user = d.ip ? ipToUser.get(d.ip) : undefined;
      const sub = user ? userToSub.get(user.toLowerCase()) : undefined;
      const onu = sub ? subToOnu.get(sub.subId) : undefined;
      if (sub) usedSubIds.add(sub.subId);
      return {
        ...d,
        acsId: d.id,          // id TR-069 (aksi WiFi/reboot/hapus GenieACS)
        deviceId: onu ? String(onu.id) : null, // id device monitoring OLT
        source: 'tr069',
        pppoeUser: user ?? null,
        customerName: sub?.name ?? (user || null),
        rxPower: onu?.lastRxPower != null ? Number(onu.lastRxPower) : null,
        opticalHealth: classify(onu),
      };
    });

    // Tambahkan ONU dari OLT yang BELUM diwakili baris TR-069 (mis. ONU bridge
    // atau ONU yang belum/tak lapor ke ACS) supaya redamannya tetap tampil.
    const subById = new Map(allSubs.map((s) => [String(s.id), s]));
    for (const d of onus) {
      const subId = deviceSubId.get(String(d.id)) ?? null;
      if (subId && usedSubIds.has(subId)) continue;
      const s = subId ? subById.get(subId) : undefined;
      rows.push({
        id: `olt-${d.id}`,
        acsId: null,
        deviceId: String(d.id),
        source: 'olt',
        serial: d.serialNumber,
        manufacturer: null, model: null, software: null,
        ssid: null, ip: null,
        lastInform: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
        online: d.lastStatus === 'online',
        pppoeUser: s?.pppoeUser ?? null,
        customerName: s?.customer?.fullName ?? s?.pppoeUser ?? null,
        rxPower: d.lastRxPower != null ? Number(d.lastRxPower) : null,
        opticalHealth: classify(d),
      });
    }

    return rows;
  }

  /** URL NBI + header auth efektif (DB dulu, env fallback). */
  private async client(): Promise<{ base: string; headers: Record<string, string> }> {
    const cfg = await this.integrations.resolveGenieacs();
    if (!cfg.url) {
      throw new BadRequestException('GenieACS belum dikonfigurasi. Isi di menu Pengaturan → Integrasi.');
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.username) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
    }
    return { base: cfg.url.replace(/\/$/, ''), headers };
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
    const { base, headers } = await this.client();
    const res = await fetch(`${base}/devices/?projection=${encodeURIComponent(projection)}`, { headers });
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

  /** Hapus device dari GenieACS (NBI). Berguna utk ONU lama/duplikat. */
  async deleteDevice(id: string) {
    const { base, headers } = await this.client();
    const res = await fetch(`${base}/devices/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
    if (!res.ok && res.status !== 200 && res.status !== 404) {
      throw new BadRequestException(`GenieACS gagal hapus (${res.status})`);
    }
    return { id, deleted: true };
  }

  // ---- internal ----
  private async fetchOne(id: string): Promise<any> {
    const { base, headers } = await this.client();
    const q = encodeURIComponent(JSON.stringify({ _id: id }));
    const res = await fetch(`${base}/devices/?query=${q}`, { headers });
    if (!res.ok) throw new BadRequestException(`GenieACS error ${res.status}`);
    const arr = (await res.json()) as any[];
    if (!arr.length) throw new BadRequestException('Device tidak ditemukan di GenieACS.');
    return arr[0];
  }

  private async task(id: string, body: any) {
    const { base, headers } = await this.client();
    const res = await fetch(
      `${base}/devices/${encodeURIComponent(id)}/tasks?connection_request`,
      { method: 'POST', headers, body: JSON.stringify(body) },
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

  @Get('devices') list() { return this.service.listDevicesWithCustomer(); }
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

  @Delete('devices/:id')
  @Roles('admin', 'operator')
  remove(@Param('id') id: string) { return this.service.deleteDevice(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([Router, Subscription, Device]), MikrotikModule],
  controllers: [GenieacsController],
  providers: [GenieacsService],
  exports: [GenieacsService],
})
export class GenieacsModule {}
