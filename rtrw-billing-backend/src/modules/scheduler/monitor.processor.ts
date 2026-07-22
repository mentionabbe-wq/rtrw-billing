import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { Device, DeviceMetric, Olt } from '@database/entities';
import { SnmpService, OltTarget } from '@modules/snmp/snmp.service';
import { MonitoringGateway } from '@modules/monitoring/monitoring.gateway';
import { WhatsappService } from '@modules/whatsapp/whatsapp.module';
import { MONITOR_QUEUE, MonitorJobData } from './queue.constants';

/**
 * Polls one ONU per job (low concurrency so the OLT CPU isn't overloaded),
 * stores a metric row, and pushes live updates to the dashboard.
 */
@Processor(MONITOR_QUEUE, { concurrency: 3 })
export class MonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(MonitorProcessor.name);

  constructor(
    private readonly snmp: SnmpService,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(DeviceMetric) private readonly metrics: Repository<DeviceMetric>,
    @InjectRepository(Olt) private readonly olts: Repository<Olt>,
    private readonly gateway: MonitoringGateway,
    private readonly wa: WhatsappService,
  ) {
    super();
  }

  async process(job: Job<MonitorJobData>): Promise<void> {
    const device = await this.devices.findOne({
      where: { id: job.data.deviceId },
      relations: { subscription: { customer: true } },
    });
    if (!device || !device.oltHost) return;

    const oltRow = await this.olts.findOne({ where: { host: device.oltHost } });
    if (!oltRow) {
      this.logger.warn(`No OLT credentials for host ${device.oltHost}`);
      return;
    }
    const olt: OltTarget = {
      host: oltRow.host,
      vendor: oltRow.vendor,
      version: oltRow.snmpVersion,
      snmpUser: oltRow.snmpUser,
      authKeyEnc: oltRow.snmpAuthEnc,
      privKeyEnc: oltRow.snmpPrivEnc,
    };

    // OLT GPON (C-Data) sering membalas nilai sentinel "tak ada data" bergantian
    // walau ONU sehat. LOS baru diakui setelah gagal beruntun sekian kali (≈15 mnt).
    const LOS_THRESHOLD = 3;

    const who = () => (device.subscription?.customer?.fullName
      ? `${device.serialNumber} (${device.subscription.customer.fullName})`
      : device.serialNumber);

    try {
      const reading = await this.snmp.readOpticalPower(olt, device.oltIfIndex, device.onuId);

      // Tak terbaca (timeout/SNMP error/ONU tak ada di tabel walk) → JANGAN alarm.
      // Pertahankan nilai & status terakhir supaya tidak muncul LOS palsu sesaat.
      if (!reading.found) {
        this.logger.debug(`ONU ${device.id} tak terbaca poll ini — status dipertahankan.`);
        return;
      }

      const prevStatus = device.lastStatus;
      const isLosReading = reading.dBm == null || reading.health === 'critical';

      if (!isLosReading) {
        // ── Pembacaan SEHAT → reset strike, status online ──
        const rx = reading.dBm!.toFixed(2);
        await this.metrics.save(this.metrics.create({ deviceId: device.id, rxPower: rx }));
        await this.devices.update(device.id, {
          lastRxPower: rx, lastStatus: 'online', losStrikes: 0, updatedAt: new Date(),
        });
        this.gateway.emitOnuStatus({ deviceId: device.id, dBm: reading.dBm, health: reading.health });

        if (prevStatus === 'los' || prevStatus === 'offline') {
          await this.wa.notifyAdmin(`🟢 ONU pulih: ${who()} — RX ${rx} dBm.`);
        }
        return;
      }

      // ── Pembacaan LOS → hitung strike, tahan sampai ambang tercapai ──
      const strikes = (device.losStrikes ?? 0) + 1;
      await this.metrics.save(this.metrics.create({ deviceId: device.id, rxPower: null }));

      if (strikes < LOS_THRESHOLD) {
        // Belum yakin — naikkan strike, pertahankan status & nilai terakhir.
        await this.devices.update(device.id, { losStrikes: strikes, updatedAt: new Date() });
        this.logger.debug(`ONU ${device.id} pembacaan LOS ${strikes}/${LOS_THRESHOLD} — ditahan.`);
        return;
      }

      // LOS terkonfirmasi (beruntun ≥ ambang).
      await this.devices.update(device.id, {
        lastRxPower: null, lastStatus: 'los', losStrikes: strikes, updatedAt: new Date(),
      });
      this.gateway.emitOnuStatus({ deviceId: device.id, dBm: null, health: 'critical' });

      if (prevStatus !== 'los') {
        await this.wa.notifyAdmin(
          `🔴 ONU LOS: ${who()} — tidak ada sinyal (${strikes}x beruntun). Cek kabel/perangkat pelanggan.`,
        );
      }
    } catch (err) {
      // Gagal total (mis. OLT unreachable) → jangan flip ke LOS/offline; biarkan
      // status terakhir. Cuma catat warning. Alarm sesungguhnya butuh pembacaan sukses.
      this.logger.warn(`SNMP poll gagal utk device ${device.id}: ${err.message} — status dipertahankan.`);
    }
  }
}
