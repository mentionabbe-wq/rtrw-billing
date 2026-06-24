import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Subscription, ServicePackage } from '@database/entities';
import {
  MIKROTIK_QUEUE, MikrotikJobData, DEFAULT_JOB_OPTS,
} from '@modules/scheduler/queue.constants';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(ServicePackage) private readonly packages: Repository<ServicePackage>,
    @InjectQueue(MIKROTIK_QUEUE) private readonly queue: Queue<MikrotikJobData>,
  ) {}

  async findAll() {
    const rows = await this.subs.find({
      relations: { customer: true, package: true },
      order: { id: 'DESC' },
      take: 300,
    });
    return rows.map((s) => ({
      id: s.id,
      customerName: s.customer?.fullName,
      customerNo: s.customer?.customerNo,
      pppoeUser: s.pppoeUser,
      packageId: s.package?.id,
      packageName: s.package?.name,
      rateLimit: s.package?.rateLimit,
      status: s.status,
      dueDate: s.dueDate,
    }));
  }

  /** Change package, then push the new bandwidth to Mikrotik (queued). */
  async changePackage(id: string, packageId: string) {
    const sub = await this.subs.findOne({ where: { id }, relations: { router: true } });
    if (!sub) throw new NotFoundException('Subscription not found');
    const pkg = await this.packages.findOne({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('Package not found');

    sub.package = pkg;
    await this.subs.save(sub);

    if (sub.status === 'active') {
      await this.queue.add(
        'set_bandwidth',
        { subscriptionId: sub.id, rateLimit: pkg.rateLimit },
        DEFAULT_JOB_OPTS,
      );
    }
    return { id: sub.id, packageId: pkg.id, rateLimit: pkg.rateLimit, queued: sub.status === 'active' };
  }

  /** Manual suspend/activate from the dashboard (status updated by the worker). */
  async setAccess(id: string, action: 'suspend' | 'activate') {
    const sub = await this.subs.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('Subscription not found');
    await this.queue.add(action, { subscriptionId: sub.id }, DEFAULT_JOB_OPTS);
    return { id: sub.id, action, queued: true };
  }
}
