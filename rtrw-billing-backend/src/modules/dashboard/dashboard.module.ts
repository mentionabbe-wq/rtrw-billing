import { Module, Controller, Get, Injectable, UseGuards } from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Customer, Subscription, Invoice, DeviceMetric, Device, Router } from '@database/entities';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
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
    private readonly mikrotik: MikrotikService,
  ) {}

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
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Subscription, Invoice, DeviceMetric, Device, Router]),
    MikrotikModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
