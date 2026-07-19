import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { CryptoService } from '@common/crypto/crypto.service';
import { Customer, Subscription, ServicePackage, Router } from '@database/entities';
import { MikrotikService } from '@modules/mikrotik/mikrotik.service';
import { MIKROTIK_QUEUE, MikrotikJobData, DEFAULT_JOB_OPTS } from '@modules/scheduler/queue.constants';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly repo: Repository<Customer>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(ServicePackage) private readonly packages: Repository<ServicePackage>,
    @InjectRepository(Router) private readonly routers: Repository<Router>,
    private readonly crypto: CryptoService,
    private readonly mikrotik: MikrotikService,
    private readonly dataSource: DataSource,
    @InjectQueue(MIKROTIK_QUEUE) private readonly mikrotikQueue: Queue<MikrotikJobData>,
  ) {}

  /**
   * SINKRON dari Mikrotik: tarik semua PPP secret di tiap router (online) lalu
   * buat pelanggan + langganan untuk user PPPoE yang BELUM ada di app.
   * - nama pelanggan diambil dari comment secret (fallback = nama user)
   * - paket dicocokkan dari profile secret → ServicePackage.pppoeProfile
   * - status disable di Mikrotik → suspended
   * Idempotent: pppoeUser yang sudah ada dilewati.
   */
  async syncFromMikrotik() {
   try {
    const routers = await this.routers.find();
    if (!routers.length) return { created: 0, skipped: 0, routers: [], error: 'Belum ada router. Tambah router di Pengaturan dulu.' };
    const allPackages = await this.packages.find();
    const pkgByProfile = new Map(allPackages.filter((p) => p.pppoeProfile).map((p) => [p.pppoeProfile, p]));

    const existing = new Set(
      (await this.subs.find({ select: { id: true, pppoeUser: true } }))
        .map((s) => s.pppoeUser).filter(Boolean),
    );

    let nextNo = (await this.repo.count()) + 1;
    let created = 0;
    let skipped = 0;
    const perRouter: Array<{ router: string; created: number; skipped: number; error?: string }> = [];
    const today = new Date();

    for (const r of routers) {
      if (r.status === 'offline') { perRouter.push({ router: r.name, created: 0, skipped: 0, error: 'offline' }); continue; }
      let secrets: any[] = [];
      try {
        secrets = await this.mikrotik.listSecrets(r);
      } catch (e) {
        perRouter.push({ router: r.name, created: 0, skipped: 0, error: e?.message ?? 'gagal konek' });
        continue;
      }

      let rc = 0, rs = 0, saveErr: string | undefined;
      for (const sec of secrets) {
        const pppoeUser: string = sec.name;
        if (!pppoeUser || existing.has(pppoeUser)) { rs++; skipped++; continue; }
        existing.add(pppoeUser);
        try {
          const customer = await this.repo.save(this.repo.create({
            customerNo: 'CST' + String(nextNo++).padStart(6, '0'),
            fullName: (sec.comment && String(sec.comment).trim()) || pppoeUser,
            phoneEnc: this.crypto.encrypt('')!, // phone wajib, kosong dulu
            status: sec.disabled ? 'suspended' : 'active',
          }));

          const pkg = pkgByProfile.get(sec.profile);
          const cycle = pkg?.billingCycle || 30;
          const due = new Date(today);
          due.setDate(due.getDate() + cycle);

          await this.subs.save(this.subs.create({
            customer,
            package: pkg ?? null,
            router: r,
            connType: 'pppoe',
            pppoeUser,
            status: sec.disabled ? 'suspended' : 'active',
            dueDate: due.toISOString().slice(0, 10),
          }));
          rc++; created++;
        } catch (e) {
          saveErr = e?.message ?? 'gagal simpan';
          break;
        }
      }
      perRouter.push({ router: r.name, created: rc, skipped: rs, error: saveErr });
    }

    return { created, skipped, routers: perRouter };
   } catch (e) {
    return { created: 0, skipped: 0, routers: [], error: e?.message ?? 'internal error' };
   }
  }

  async create(dto: CreateCustomerDto): Promise<{ id: string; customerNo: string; subscriptionCreated: boolean }> {
    const customerNo = await this.nextCustomerNo();
    const entity = this.repo.create({
      customerNo,
      fullName: dto.fullName,
      phoneEnc: this.crypto.encrypt(dto.phone),
      nikEnc: this.crypto.encrypt(dto.nik),
      address: dto.address,
      geoLat: dto.geoLat,
      geoLng: dto.geoLng,
    });
    const saved = await this.repo.save(entity);

    // Bila user PPPoE diisi → buat langganan sekaligus, agar langsung tampil
    // di menu Langganan (pelanggan ≠ langganan: ini menyatukan keduanya).
    let subscriptionCreated = false;
    if (dto.pppoeUser && dto.pppoeUser.trim()) {
      const pkg = dto.packageId ? await this.packages.findOne({ where: { id: dto.packageId } }) : null;
      const router = dto.routerId ? await this.routers.findOne({ where: { id: dto.routerId } }) : null;
      const cycle = pkg?.billingCycle || 30;
      const due = new Date();
      due.setDate(due.getDate() + cycle);

      const newSub = await this.subs.save(this.subs.create({
        customer: saved,
        package: pkg ?? null,
        router: router ?? null,
        connType: 'pppoe',
        pppoeUser: dto.pppoeUser.trim(),
        pppoePassEnc: dto.pppoePass ? this.crypto.encrypt(dto.pppoePass) : null,
        ipStatic: dto.ipStatic?.trim() || null,
        status: 'active',
        dueDate: due.toISOString().slice(0, 10),
      }));
      // Provision PPP secret ke Mikrotik (buat jika belum ada)
      if (router) {
        await this.mikrotikQueue.add('provision', { subscriptionId: newSub.id }, DEFAULT_JOB_OPTS);
      }
      subscriptionCreated = true;
    }

    return { id: saved.id, customerNo: saved.customerNo, subscriptionCreated };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Customer not found');

    if (dto.fullName !== undefined) c.fullName = dto.fullName;
    if (dto.address !== undefined) c.address = dto.address;
    if (dto.status !== undefined) c.status = dto.status;
    if (dto.phone !== undefined) c.phoneEnc = this.crypto.encrypt(dto.phone)!;
    if (dto.nik !== undefined) c.nikEnc = this.crypto.encrypt(dto.nik);

    await this.repo.save(c);
    return this.toView(c);
  }

  /**
   * Cek ketersediaan user PPPoE: unik di billing, dan (bila router dipilih)
   * belum ada sebagai PPP secret di Mikrotik.
   */
  async checkPppoe(username: string, routerId?: string) {
    const u = (username ?? '').trim();
    if (!u) return { available: false, reason: 'Username kosong.' };

    const dup = await this.subs
      .createQueryBuilder('s')
      .where('LOWER(s.pppoeUser) = LOWER(:u)', { u })
      .getOne();
    if (dup) return { available: false, reason: 'Sudah dipakai pelanggan lain di billing.' };

    if (routerId) {
      const router = await this.routers.findOne({ where: { id: routerId } });
      if (router) {
        try {
          const secrets = await this.mikrotik.listSecrets(router);
          if (secrets.some((s: any) => String(s.name).toLowerCase() === u.toLowerCase())) {
            return { available: false, reason: `Sudah ada sebagai secret di Mikrotik (${router.name}).` };
          }
        } catch {
          return { available: true, warning: `Router ${router.name} tak terjangkau — hanya dicek di billing.` };
        }
      }
    }
    return { available: true };
  }

  async findAll() {
    const rows = await this.repo.find({ order: { id: 'DESC' }, take: 200 });

    // Sertakan ringkasan langganan (menu Pelanggan & Langganan digabung).
    const subs = await this.subs.find({
      relations: { customer: true, package: true },
      take: 500,
    });
    const byCustomer = new Map<string, Subscription>();
    for (const s of subs) {
      if (s.customer?.id && !byCustomer.has(String(s.customer.id))) {
        byCustomer.set(String(s.customer.id), s);
      }
    }

    return rows.map((c) => {
      const s = byCustomer.get(String(c.id));
      return {
        ...this.toView(c),
        subscriptionId: s ? String(s.id) : null,
        pppoeUser: s?.pppoeUser ?? null,
        packageId: s?.package ? String(s.package.id) : null,
        packageName: s?.package?.name ?? null,
        rateLimit: s?.package?.rateLimit ?? null,
        subStatus: s?.status ?? null,
        dueDate: s?.dueDate ?? null,
      };
    });
  }

  /**
   * Hapus 1 pelanggan + seluruh data turunannya. subscriptions & devices
   * ON DELETE CASCADE; invoices & payments harus dibuang manual (FK restrict).
   */
  async remove(id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Customer not found');
    await this.dataSource.transaction(async (m) => {
      await m.query(
        `DELETE FROM payments WHERE invoice_id IN (
           SELECT i.id FROM invoices i
           JOIN subscriptions s ON i.subscription_id = s.id
           WHERE s.customer_id = $1)`, [id]);
      await m.query(
        `DELETE FROM invoices WHERE subscription_id IN (
           SELECT id FROM subscriptions WHERE customer_id = $1)`, [id]);
      await m.query(`DELETE FROM customers WHERE id = $1`, [id]); // cascade subs+devices
    });
    return { id, deleted: true };
  }

  /**
   * Bersihkan SEMUA data demo/pelanggan (pelanggan, langganan, ONU, tagihan,
   * pembayaran, log, metrik). Paket/router/OLT/user TIDAK dihapus.
   * Set SEED_ON_START=false agar tidak ter-seed ulang.
   */
  async clearDemo() {
    await this.dataSource.transaction(async (m) => {
      await m.query('DELETE FROM payments');
      await m.query('DELETE FROM invoices');
      await m.query('DELETE FROM customers'); // cascade subscriptions + devices
      await m.query('DELETE FROM mikrotik_sync_logs');
      await m.query('DELETE FROM device_metrics');
    });
    return { cleared: true };
  }

  async findOne(id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Customer not found');
    return this.toView(c);
  }

  /** Decrypt sensitive fields only when explicitly returning a single record. */
  private toView(c: Customer) {
    return {
      id: c.id,
      customerNo: c.customerNo,
      fullName: c.fullName,
      phone: this.crypto.decrypt(c.phoneEnc),
      nik: this.crypto.decrypt(c.nikEnc),
      address: c.address,
      status: c.status,
      createdAt: c.createdAt,
    };
  }

  private async nextCustomerNo(): Promise<string> {
    const row = await this.repo
      .createQueryBuilder('c')
      .select('MAX(c.customerNo)', 'max')
      .getRawOne();
    const num = parseInt((row?.max ?? 'CST000000').replace('CST', ''), 10) || 0;
    return 'CST' + String(num + 1).padStart(6, '0');
  }
}
