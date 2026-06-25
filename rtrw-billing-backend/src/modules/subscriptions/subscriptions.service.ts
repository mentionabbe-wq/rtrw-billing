import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Subscription, ServicePackage, Router, Customer } from '@database/entities';
import { CryptoService } from '@common/crypto/crypto.service';
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
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectQueue(MIKROTIK_QUEUE) private readonly queue: Queue<MikrotikJobData>,
    private readonly crypto: CryptoService,
    private readonly mikrotik: MikrotikService,
  ) {}

  /** Buat langganan untuk pelanggan yang sudah ada (dari menu Langganan). */
  async create(dto: {
    customerId: string; pppoeUser?: string; pppoePass?: string;
    packageId?: string; routerId?: string;
  }) {
    const customer = await this.customers.findOne({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan');
    if (!dto.pppoeUser || !dto.pppoeUser.trim()) throw new BadRequestException('User PPPoE wajib diisi');

    const dup = await this.subs.findOne({ where: { pppoeUser: dto.pppoeUser.trim() } });
    if (dup) throw new BadRequestException(`User PPPoE "${dto.pppoeUser.trim()}" sudah dipakai`);

    const pkg = dto.packageId ? await this.packages.findOne({ where: { id: dto.packageId } }) : null;
    const router = dto.routerId ? await this.routers.findOne({ where: { id: dto.routerId } }) : null;
    const cycle = pkg?.billingCycle || 30;
    const due = new Date();
    due.setDate(due.getDate() + cycle);

    const sub = await this.subs.save(this.subs.create({
      customer,
      package: pkg ?? null,
      router: router ?? null,
      connType: 'pppoe',
      pppoeUser: dto.pppoeUser.trim(),
      pppoePassEnc: dto.pppoePass ? this.crypto.encrypt(dto.pppoePass) : null,
      status: 'active',
      dueDate: due.toISOString().slice(0, 10),
    }));
    return { id: sub.id };
  }

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
