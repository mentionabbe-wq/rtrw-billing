import { Module, Controller, Get, Injectable, UseGuards } from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Customer, Subscription, Invoice, DeviceMetric } from '@database/entities';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(DeviceMetric) private readonly metrics: Repository<DeviceMetric>,
  ) {}

  async stats() {
    const [totalCustomers, active, suspended, unpaidInvoices] = await Promise.all([
      this.customers.count(),
      this.subs.count({ where: { status: 'active' } }),
      this.subs.count({ where: { status: 'suspended' } }),
      this.invoices.count({ where: { status: 'unpaid' } }),
    ]);

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
  imports: [TypeOrmModule.forFeature([Customer, Subscription, Invoice, DeviceMetric])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
