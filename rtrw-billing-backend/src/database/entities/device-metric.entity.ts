import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Time-series of ONU/device readings. In production, convert to a
 * PARTITION BY RANGE(recorded_at) table (monthly) via migration; this
 * entity definition stays the same.
 */
@Entity('device_metrics')
export class DeviceMetric {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'device_id', type: 'bigint' })
  deviceId: string;

  @Column({ name: 'rx_power', type: 'numeric', precision: 6, scale: 2, nullable: true })
  rxPower: string;

  @Column({ name: 'tx_power', type: 'numeric', precision: 6, scale: 2, nullable: true })
  txPower: string;

  @Column({ name: 'traffic_in', type: 'bigint', nullable: true })
  trafficIn: string;

  @Column({ name: 'traffic_out', type: 'bigint', nullable: true })
  trafficOut: string;

  @Column({ name: 'uptime_sec', type: 'bigint', nullable: true })
  uptimeSec: string;

  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'now()' })
  recordedAt: Date;
}
