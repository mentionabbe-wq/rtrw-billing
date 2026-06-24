import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { LessThan, Repository } from 'typeorm';
import { Device, Subscription } from '@database/entities';
import { BillingService } from '@modules/billing/billing.service';
import {
  MIKROTIK_QUEUE, MONITOR_QUEUE, MikrotikJobData, MonitorJobData, DEFAULT_JOB_OPTS,
} from './queue.constants';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectQueue(MIKROTIK_QUEUE) private readonly mikrotikQueue: Queue<MikrotikJobData>,
    @InjectQueue(MONITOR_QUEUE) private readonly monitorQueue: Queue<MonitorJobData>,
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {}

  /** Monthly 01:00 on the 1st — generate invoices for all active subscriptions. */
  @Cron('0 1 1 * *', { name: 'monthly-invoice' })
  async monthlyInvoice() {
    const res = await this.billing.generateMonthly();
    this.logger.log(`monthly-invoice: created=${res.created} skipped=${res.skipped}`);
  }

  /** Daily 00:05 — suspend overdue, still-active subscriptions. */
  @Cron('5 0 * * *', { name: 'auto-suspend' })
  async autoSuspend() {
    const today = new Date().toISOString().slice(0, 10);
    const due = await this.subs.find({
      where: { status: 'active', dueDate: LessThan(today) },
      select: { id: true },
    });
    this.logger.log(`auto-suspend: enqueueing ${due.length} subscriptions`);
    await this.mikrotikQueue.addBulk(
      due.map((s) => ({ name: 'suspend' as const, data: { subscriptionId: s.id }, opts: DEFAULT_JOB_OPTS })),
    );
  }

  /** Every 5 minutes — poll optical power of all active ONUs. */
  @Cron('*/5 * * * *', { name: 'optical-poll' })
  async pollOptical() {
    const devices = await this.devices.find({ where: { type: 'onu' }, select: { id: true } });
    await this.monitorQueue.addBulk(
      devices.map((d) => ({
        name: 'poll',
        data: { deviceId: d.id },
        opts: { attempts: 2, removeOnComplete: true, removeOnFail: 500 },
      })),
    );
  }
}
