import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Subscription, ServicePackage, Router } from '@database/entities';
import { MikrotikService } from '@modules/mikrotik/mikrotik.service';
import {
  MIKROTIK_QUEUE, MikrotikJobData, DEFAULT_JOB_OPTS,
} from '@modules/scheduler/queue.constants';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(ServicePackage) private readonly packages: Repository<ServicePackage>,
    @InjectRepository(Router) private readonly routers: Repository<Router>,
    @InjectQueue(MIKROTIK_QUEUE) private readonly queue: Queue<MikrotikJobData>,
    private readonly mikrotik: MikrotikService,
  ) {}

  /**
   * PPPoE yang sedang aktif (live dari Mikrotik) digabung data langganan →
   * nama pelanggan, paket, jatuh tempo, dan SISA MASA AKTIF (hari). Hanya
   * polling router berstatus online agar tidak hang pada router mati.
   */
  async pppoeActive() {
    const routers = await this.routers.find();
    const subs = await this.subs.find({ relations: { customer: true, package: true } });
    const byUser = new Map<string, Subscription>();
    for (const s of subs) if (s.pppoeUser) byUser.set(s.pppoeUser, s);

    const today = Date.now();
    const out: any[] = [];
    for (const r of routers) {
      if (r.status === 'offline') continue;
      let active: any[] = [];
      try { active = await this.mikrotik.listActive(r); } catch { continue; }
      for (const a of active) {
        const sub = byUser.get(a.name);
        let remainingDays: number | null = null;
        if (sub?.dueDate) {
          const due = new Date(sub.dueDate + 'T00:00:00Z').getTime();
          remainingDays = Math.ceil((due - today) / 86400000);
        }
        out.push({
          pppoeUser: a.name,
          address: a.address,
          uptime: a.uptime,
          callerId: a.callerId,
          router: r.name,
          customerName: sub?.customer?.fullName ?? null,
          packageName: sub?.package?.name ?? null,
          dueDate: sub?.dueDate ?? null,
          remainingDays,
          status: sub?.status ?? null,
        });
      }
    }
    return out;
  }

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
