import { Module, Controller, Get, Injectable, Query, UseGuards } from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Customer, Subscription, Invoice, DeviceMetric, Device, Router, Payment, HotspotVoucher,
} from '@database/entities';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { MikrotikModule } from '@modules/mikrotik/mikrotik.module';
import { MikrotikService } from '@modules/mikrotik/mikrotik.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(DeviceMetric) private readonly metrics: Repository<DeviceMetric>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(Router) private readonly routers: Repository<Router>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(HotspotVoucher) private readonly vouchers: Repository<HotspotVoucher>,
    private readonly mikrotik: MikrotikService,
  ) {}

  /** Daftar ONU bermasalah (warning/critical/LOS) untuk dashboard. */
  async onuProblems() {
    const rows = await this.devices.find({
      where: { type: 'onu' },
      relations: { subscription: { customer: true } },
      take: 500,
    });
    const classify = (d: Device): 'ok' | 'warning' | 'critical' => {
      if (d.lastStatus === 'los' || d.lastStatus === 'offline') return 'critical';
      const dbm = d.lastRxPower != null ? Number(d.lastRxPower) : null;
      if (dbm == null) return 'ok';
      if (dbm < -27) return 'critical';
      if (dbm < -25) return 'warning';
      return 'ok';
    };
    return rows
      .map((d) => ({
        id: d.id,
        serialNumber: d.serialNumber,
        customerName: d.subscription?.customer?.fullName ?? null,
        lastRxPower: d.lastRxPower,
        lastStatus: d.lastStatus,
        health: classify(d),
        updatedAt: d.updatedAt,
      }))
      .filter((d) => d.health !== 'ok')
      .sort((a, b) => (a.health === 'critical' ? -1 : 1) - (b.health === 'critical' ? -1 : 1));
  }

  /**
   * Laporan keuangan: pemasukan per bulan (N bulan terakhir) dari
   * pembayaran PPPoE (payments settled) + voucher hotspot aktif.
   */
  async finance(months = 6) {
    const n = Math.min(Math.max(months, 1), 24);
    const start = new Date();
    start.setMonth(start.getMonth() - (n - 1));
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const pppoeRows = await this.payments
      .createQueryBuilder('p')
      .select("to_char(COALESCE(p.paidAt, p.createdAt), 'YYYY-MM')", 'bulan')
      .addSelect('COALESCE(SUM(CAST(p.amount AS DECIMAL)), 0)', 'total')
      .where('p.status = :s', { s: 'settled' })
      .andWhere('COALESCE(p.paidAt, p.createdAt) >= :start', { start })
      .groupBy('bulan')
      .getRawMany();

    const voucherRows = await this.vouchers
      .createQueryBuilder('v')
      .select("to_char(v.createdAt, 'YYYY-MM')", 'bulan')
      .addSelect('COALESCE(SUM(CAST(v.amount AS DECIMAL)), 0)', 'total')
      .where('v.status = :s', { s: 'active' })
      .andWhere('v.createdAt >= :start', { start })
      .groupBy('bulan')
      .getRawMany();

    const pMap = new Map(pppoeRows.map((r) => [r.bulan, Number(r.total)]));
    const vMap = new Map(voucherRows.map((r) => [r.bulan, Number(r.total)]));

    const series: { bulan: string; pppoe: number; hotspot: number; total: number }[] = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(start);
      d.setMonth(start.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const pppoe = pMap.get(key) ?? 0;
      const hotspot = vMap.get(key) ?? 0;
      series.push({ bulan: key, pppoe, hotspot, total: pppoe + hotspot });
    }

    const totalPppoe = series.reduce((s, r) => s + r.pppoe, 0);
    const totalHotspot = series.reduce((s, r) => s + r.hotspot, 0);
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = series.find((r) => r.bulan === thisMonthKey)?.total ?? 0;

    // Tagihan PPPoE belum dibayar (piutang berjalan).
    const unpaid = await this.invoices
      .createQueryBuilder('i')
      .select('COALESCE(SUM(CAST(i.amount AS DECIMAL)), 0)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('i.status = :s', { s: 'unpaid' })
      .getRawOne();

    return {
      series,
      totalPppoe,
      totalHotspot,
      totalAll: totalPppoe + totalHotspot,
      thisMonth,
      unpaidAmount: Number(unpaid?.total ?? 0),
      unpaidCount: Number(unpaid?.count ?? 0),
    };
  }

  async stats() {
    const [totalCustomers, active, suspended, unpaidInvoices, onuActive] = await Promise.all([
      this.customers.count(),
      this.subs.count({ where: { status: 'active' } }),
      this.subs.count({ where: { status: 'suspended' } }),
      this.invoices.count({ where: { status: 'unpaid' } }),
      this.devices.count({ where: { lastStatus: 'online' } }),
    ]);

    // PPPoE aktif live — hanya router yang berstatus online (cepat & tak hang).
    let pppoeActive = 0;
    const onlineRouters = await this.routers.find({ where: { status: 'online' } });
    await Promise.all(
      onlineRouters.map(async (r) => {
        try { pppoeActive += (await this.mikrotik.listActive(r)).length; } catch { /* skip */ }
      }),
    );

    // Aggregate traffic (last 12 buckets). Replace with a proper time_bucket query.
    const raw = await this.metrics
      .createQueryBuilder('m')
      .select("to_char(m.recorded_at, 'HH24:MI')", 't')
      .addSelect('COALESCE(SUM(m.traffic_in + m.traffic_out),0) / 125000.0', 'mbps')
      .groupBy('t')
      .orderBy('t', 'DESC')
      .limit(12)
      .getRawMany();

    return {
      totalCustomers,
      active,
      suspended,
      unpaidInvoices,
      onuActive,
      pppoeActive,
      trafficSeries: raw.reverse().map((r) => ({ t: r.t, mbps: Math.round(Number(r.mbps)) })),
    };
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}
  @Get('stats')
  stats() {
    return this.service.stats();
  }

  /** Daftar ONU bermasalah (warning/critical/LOS). */
  @Get('onu-problems')
  onuProblems() {
    return this.service.onuProblems();
  }

  /** Laporan keuangan bulanan. Query: ?months=6 (default). */
  @Get('finance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'finance')
  finance(@Query('months') months?: string) {
    return this.service.finance(months ? Number(months) : 6);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer, Subscription, Invoice, DeviceMetric, Device, Router, Payment, HotspotVoucher,
    ]),
    MikrotikModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
