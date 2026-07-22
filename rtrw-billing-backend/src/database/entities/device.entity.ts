import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Subscription } from './subscription.entity';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => Subscription)
  @JoinColumn({ name: 'subscription_id' })
  subscription: Subscription;

  @Column({ type: 'varchar', default: 'onu' })
  type: string;

  @Column({ name: 'serial_number', nullable: true })
  serialNumber: string;

  @Column({ name: 'olt_host', type: 'inet', nullable: true })
  oltHost: string;

  /** ifIndex / PON port index used in the SNMP OID */
  @Column({ name: 'olt_if_index', type: 'int', nullable: true })
  oltIfIndex: number;

  @Column({ name: 'onu_id', type: 'int', nullable: true })
  onuId: number;

  @Column({ name: 'last_rx_power', type: 'numeric', precision: 6, scale: 2, nullable: true })
  lastRxPower: string;

  /** online | los | offline */
  @Column({ name: 'last_status', type: 'varchar', nullable: true })
  lastStatus: string;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date;

  /**
   * Pembacaan "tak ada sinyal" berturut-turut. Dipakai meredam LOS palsu:
   * OLT GPON kadang balas nilai sentinel bergantian. LOS baru diakui setelah
   * beberapa kali beruntun. Reset ke 0 saat ada pembacaan sehat.
   */
  @Column({ name: 'los_strikes', type: 'int', default: 0 })
  losStrikes: number;
}
