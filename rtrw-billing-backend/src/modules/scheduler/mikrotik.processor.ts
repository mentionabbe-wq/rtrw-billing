import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { Subscription, MikrotikSyncLog } from '@database/entities';
import { MikrotikService } from '@modules/mikrotik/mikrotik.service';
import { CryptoService } from '@common/crypto/crypto.service';
import { WhatsappService } from '@modules/whatsapp/whatsapp.module';
import { MIKROTIK_QUEUE, MikrotikJobData } from './queue.constants';

@Processor(MIKROTIK_QUEUE, { concurrency: 5 })
export class MikrotikProcessor extends WorkerHost {
  private readonly logger = new Logger(MikrotikProcessor.name);

  constructor(
    private readonly mikrotik: MikrotikService,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(MikrotikSyncLog) private readonly logs: Repository<MikrotikSyncLog>,
    private readonly crypto: CryptoService,
    private readonly wa: WhatsappService,
  ) {
    super();
  }

  async process(job: Job<MikrotikJobData>): Promise<void> {
    const sub = await this.subs.findOne({
      where: { id: job.data.subscriptionId },
      relations: { router: true, package: true, customer: true },
    });
    if (!sub) throw new Error(`Subscription ${job.data.subscriptionId} not found`);

    try {
      switch (job.name) {
        case 'provision': {
          const pass = sub.pppoePassEnc ? this.crypto.decrypt(sub.pppoePassEnc) : undefined;
          await this.mikrotik.provisionSecret(sub.router, sub, pass ?? undefined, sub.package?.pppoeProfile);
          await this.subs.update(sub.id, { status: 'active' });
          break;
        }
        case 'suspend':
          await this.mikrotik.suspend(sub.router, sub);
          await this.subs.update(sub.id, { status: 'suspended' });
          await this.notify(sub, 'suspend');
          break;
        case 'activate':
          await this.mikrotik.activate(sub.router, sub);
          await this.subs.update(sub.id, { status: 'active' });
          break;
        case 'set_bandwidth':
          await this.mikrotik.setBandwidth(
            sub.router, sub, job.data.rateLimit, sub.package?.pppoeProfile,
          );
          break;
      }
      await this.record(sub.id, job.name, 'success');
    } catch (err) {
      await this.record(sub.id, job.name, 'failed', err.message);
      throw err; // let BullMQ retry with backoff
    }
  }

  private record(subscriptionId: string, action: string, result: string, message?: string) {
    return this.logs.save(this.logs.create({ subscriptionId, action, result, message }));
  }

  private async notify(sub: Subscription, template: 'suspend') {
    if (!sub.customer) return;
    const phone = this.crypto.decrypt(sub.customer.phoneEnc);
    if (phone) await this.wa.send(phone, template, { name: sub.customer.fullName });
  }
}
