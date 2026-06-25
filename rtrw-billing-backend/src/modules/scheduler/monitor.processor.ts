import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { Device, DeviceMetric, Olt } from '@database/entities';
import { SnmpService, OltTarget } from '@modules/snmp/snmp.service';
import { MonitoringGateway } from '@modules/monitoring/monitoring.gateway';
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
  ) {
    super();
  }

  async process(job: Job<MonitorJobData>): Promise<void> {
    const device = await this.devices.findOne({ where: { id: job.data.deviceId } });
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

    try {
      const reading = await this.snmp.readOpticalPower(olt, device.oltIfIndex, device.onuId);
      const rx = reading.dBm == null ? null : reading.dBm.toFixed(2);
      await this.metrics.save(this.metrics.create({ deviceId: device.id, rxPower: rx }));
      await this.devices.update(device.id, {
        lastRxPower: rx,
        lastStatus: reading.dBm == null ? 'los' : reading.health === 'critical' ? 'los' : 'online',
        updatedAt: new Date(),
      });
      this.gateway.emitOnuStatus({
        deviceId: device.id,
        dBm: reading.dBm,
        health: reading.health,
      });
    } catch (err) {
      await this.devices.update(device.id, { lastStatus: 'offline', updatedAt: new Date() });
      this.gateway.emitOnuStatus({ deviceId: device.id, dBm: null, health: 'critical' });
      this.logger.warn(`SNMP poll failed for device ${device.id}: ${err.message}`);
    }
  }
}
