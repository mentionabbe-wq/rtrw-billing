import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Between, Repository } from 'typeorm';
import { Invoice, Payment, PortalSetting, Subscription } from '@database/entities';
import { CryptoService } from '@common/crypto/crypto.service';
import { WhatsappService } from '@modules/whatsapp/whatsapp.module';
import {
  MIKROTIK_QUEUE,
  MikrotikJobData,
  DEFAULT_JOB_OPTS,
} from '@modules/scheduler/queue.constants';

const rupiah = (v: string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(PortalSetting) private readonly portal: Repository<PortalSetting>,
    @InjectQueue(MIKROTIK_QUEUE) private readonly mikrotikQueue: Queue<MikrotikJobData>,
    private readonly crypto: CryptoService,
    private readonly wa: WhatsappService,
  ) {}

  /**
   * Bulk-generate invoices for the given month (default: current month).
   * Idempotent: skips a subscription that already has an invoice for the period.
   * Returns how many invoices were created. Sends a WhatsApp notice per invoice.
   */
  async generateMonthly(month?: string): Promise<{ created: number; skipped: number }> {
    const base = month ? new Date(month + '-01T00:00:00Z') : new Date();
    const periodStart = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
    const ps = periodStart.toISOString().slice(0, 10);
    const pe = periodEnd.toISOString().slice(0, 10);

    const subs = await this.subs.find({
      where: { status: 'active' },
      relations: { package: true, customer: true },
    });

    let created = 0;
    let skipped = 0;
    for (const sub of subs) {
      const exists = await this.invoices.findOne({
        where: { subscription: { id: sub.id }, periodStart: Between(ps, ps) },
        relations: { subscription: true },
      });
      if (exists) { skipped++; continue; }

      const invoice = await this.invoices.save(this.invoices.create({
        invoiceNo: 'INV' + Date.now().toString(36).toUpperCase() + sub.id,
        subscription: sub,
        amount: sub.package.price,
        periodStart: ps,
        periodEnd: pe,
        dueDate: sub.dueDate,
        status: 'unpaid',
      }));
      created++;

      const phone = this.crypto.decrypt(sub.customer.phoneEnc);
      if (phone) {
        await this.wa.send(phone, 'invoice_baru', {
          name: sub.customer.fullName,
          period: ps.slice(0, 7),
          amount: rupiah(invoice.amount),
          due: invoice.dueDate,
        });
      }
    }
    this.logger.log(`generateMonthly ${ps}: created=${created} skipped=${skipped}`);
    return { created, skipped };
  }

  /**
   * Kirim pengingat WA utk invoice unpaid yang jatuh tempo `days` hari lagi.
   * Dipanggil cron harian. Return jumlah pesan terkirim.
   */
  async sendDueReminders(days: number): Promise<number> {
    const target = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const rows = await this.invoices.find({
      where: { status: 'unpaid', dueDate: target },
      relations: { subscription: { customer: true } },
    });

    let sent = 0;
    for (const inv of rows) {
      const customer = inv.subscription?.customer;
      if (!customer) continue;
      const phone = this.crypto.decrypt(customer.phoneEnc);
      if (!phone) continue;
      await this.wa.send(phone, 'pengingat', {
        name: customer.fullName,
        amount: rupiah(inv.amount),
        due: inv.dueDate,
        daysLeft: String(days),
      });
      sent++;
    }
    if (sent) this.logger.log(`sendDueReminders: ${sent} pengingat dikirim (H-${days})`);
    return sent;
  }

  /** List recent invoices + nama pelanggan & status langganan (utk tombol Bayar). */
  async listInvoices() {
    const rows = await this.invoices.find({
      order: { id: 'DESC' },
      take: 200,
      relations: { subscription: { customer: true, package: true } },
    });
    return rows.map((i) => ({
      id: i.id,
      invoiceNo: i.invoiceNo,
      amount: i.amount,
      dueDate: i.dueDate,
      status: i.status,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      createdAt: i.createdAt,
      packageName: i.subscription?.package?.name ?? null,
      customerName: i.subscription?.customer?.fullName ?? null,
      customerNo: i.subscription?.customer?.customerNo ?? null,
      pppoeUser: i.subscription?.pppoeUser ?? null,
      subStatus: i.subscription?.status ?? null,
    }));
  }

  /**
   * Pembayaran MANUAL (tunai/transfer) oleh admin/finance dari UI.
   * Memakai jalur settlePayment yang sama → tandai lunas, perpanjang jatuh
   * tempo, dan otomatis aktifkan kembali pelanggan via Mikrotik.
   */
  async payManual(invoiceId: string, method = 'cash') {
    const inv = await this.invoices.findOne({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === 'paid') return { id: invoiceId, paid: true, already: true };
    await this.settlePayment({
      invoiceNo: inv.invoiceNo,
      gateway: 'manual',
      gatewayRef: 'MANUAL-' + Date.now().toString(36).toUpperCase(),
      amount: inv.amount,
      method,
      rawPayload: { manual: true },
    });
    return { id: invoiceId, paid: true };
  }

  /** Generate a monthly invoice for an active subscription. */
  async generateInvoice(subscriptionId: string): Promise<Invoice> {
    const sub = await this.subs.findOne({
      where: { id: subscriptionId },
      relations: { package: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const invoice = this.invoices.create({
      invoiceNo: 'INV' + Date.now().toString(36).toUpperCase(),
      subscription: sub,
      amount: sub.package.price,
      dueDate: sub.dueDate,
      status: 'unpaid',
    });
    return this.invoices.save(invoice);
  }

  /** Generate link pembayaran online untuk invoice tertentu. */
  async createPaymentLink(invoiceId: string, gatewayName: string, gateway: any) {
    const inv = await this.invoices.findOne({
      where: { id: invoiceId },
      relations: { subscription: { customer: true } },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === 'paid') return { alreadyPaid: true };

    const customer = inv.subscription?.customer;
    const phone = customer?.phoneEnc ? this.crypto.decrypt(customer.phoneEnc) : null;
    const params = {
      invoiceNo: inv.invoiceNo,
      amount: Math.round(Number(inv.amount)),
      customerName: customer?.fullName ?? 'Pelanggan',
      customerPhone: phone ?? undefined,
      description: `Tagihan Internet ${inv.periodStart?.slice(0, 7) ?? inv.invoiceNo}`,
    };

    if (gatewayName === 'midtrans') return gateway.createMidtrans(params);
    return gateway.createTripay(params);
  }

  /**
   * Mark invoice paid + extend due date + enqueue Mikrotik reactivation.
   * Idempotent: if already paid, it just no-ops.
   */
  /** Riwayat pembayaran satu pelanggan (semua langganannya), terbaru dulu. */
  async customerPayments(customerId: string) {
    const rows = await this.payments.find({
      where: { invoice: { subscription: { customer: { id: customerId } } } },
      relations: { invoice: { subscription: { customer: true, package: true } } },
      order: { id: 'DESC' },
      take: 100,
    });
    return rows.map((p) => ({
      id: p.id,
      invoiceNo: p.invoice?.invoiceNo ?? null,
      amount: p.amount,
      method: p.method,
      gateway: p.gateway,
      status: p.status,
      paidAt: p.paidAt,
      periodStart: p.invoice?.periodStart ?? null,
      periodEnd: p.invoice?.periodEnd ?? null,
      packageName: p.invoice?.subscription?.package?.name ?? null,
      customerName: p.invoice?.subscription?.customer?.fullName ?? null,
    }));
  }

  /** Kirim kuitansi pembayaran ke WA pelanggan. */
  async sendReceipt(paymentId: string): Promise<{ sent: boolean; reason?: string }> {
    const p = await this.payments.findOne({
      where: { id: paymentId },
      relations: { invoice: { subscription: { customer: true, package: true } } },
    });
    if (!p) throw new NotFoundException('Pembayaran tidak ditemukan');
    if (p.status !== 'settled') return { sent: false, reason: 'Pembayaran belum lunas/settled.' };

    const customer = p.invoice?.subscription?.customer;
    const phone = customer ? this.crypto.decrypt(customer.phoneEnc) : null;
    if (!phone) return { sent: false, reason: 'Nomor WA pelanggan tidak terisi.' };

    const setting = await this.portal.findOne({ where: { id: 1 } });
    const company = setting?.companyName ?? 'RT/RW Net';
    const periode = p.invoice?.periodStart ? String(p.invoice.periodStart).slice(0, 7) : '-';
    const tgl = p.paidAt
      ? new Date(p.paidAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      : '-';

    await this.wa.sendRaw(
      phone,
      `🧾 *KUITANSI PEMBAYARAN — ${company}*\n\n` +
      `Nama: ${customer.fullName}\n` +
      `No. Invoice: ${p.invoice?.invoiceNo ?? '-'}\n` +
      `Paket: ${p.invoice?.subscription?.package?.name ?? '-'}\n` +
      `Periode: ${periode}\n` +
      `Jumlah: ${rupiah(p.amount)}\n` +
      `Metode: ${p.method ?? p.gateway ?? '-'}\n` +
      `Tanggal bayar: ${tgl}\n\n` +
      `Pembayaran Anda sudah kami terima — terima kasih! 🙏`,
    );
    return { sent: true };
  }

  async settlePayment(params: {
    invoiceNo: string;
    gateway: string;
    gatewayRef: string;
    amount: string;
    method: string;
    rawPayload: Record<string, any>;
  }): Promise<void> {
    const invoice = await this.invoices.findOne({
      where: { invoiceNo: params.invoiceNo },
      relations: { subscription: { package: true, customer: true } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'paid') return; // idempotent

    await this.payments.save(
      this.payments.create({
        invoice,
        gateway: params.gateway,
        gatewayRef: params.gatewayRef,
        amount: params.amount,
        method: params.method,
        status: 'settled',
        paidAt: new Date(),
        rawPayload: params.rawPayload,
      }),
    );

    invoice.status = 'paid';
    await this.invoices.save(invoice);

    const sub = invoice.subscription;
    const cycle = sub.package.billingCycle || 30;
    const newDue = new Date(sub.dueDate);
    newDue.setDate(newDue.getDate() + cycle);
    sub.dueDate = newDue.toISOString().slice(0, 10);
    if (sub.status !== 'active') {
      sub.status = 'active';
      await this.mikrotikQueue.add(
        'activate',
        { subscriptionId: sub.id },
        DEFAULT_JOB_OPTS,
      );
    }
    await this.subs.save(sub);

    const phone = invoice.subscription.customer
      ? this.crypto.decrypt(invoice.subscription.customer.phoneEnc)
      : null;
    if (phone) {
      await this.wa.send(phone, 'aktif_kembali', { name: invoice.subscription.customer.fullName });
    }
    await this.wa.notifyAdmin(
      `💰 Pembayaran diterima: ${invoice.subscription.customer?.fullName ?? invoice.invoiceNo} — ` +
      `${rupiah(params.amount)} via ${params.gateway}${params.method ? ` (${params.method})` : ''}.`,
    );
    this.logger.log(`Invoice ${invoice.invoiceNo} settled, sub ${sub.id} reactivated`);
  }
}
