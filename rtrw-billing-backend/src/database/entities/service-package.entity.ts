import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('service_packages')
export class ServicePackage {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column()
  name: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price: string;

  /** Mikrotik queue rate limit, e.g. "20M/20M" */
  @Column({ name: 'rate_limit' })
  rateLimit: string;

  @Column({ name: 'pppoe_profile', nullable: true })
  pppoeProfile: string;

  /** Nama IP pool Mikrotik untuk paket ini (opsional). */
  @Column({ name: 'ip_pool', nullable: true })
  ipPool: string;

  /** local-address PPP profile (IP gateway router utk klien). */
  @Column({ name: 'local_address', nullable: true })
  localAddress: string | null;

  /** DNS server yang didorong ke klien, dipisah koma. */
  @Column({ name: 'dns_server', nullable: true })
  dnsServer: string | null;

  /** only-one PPP profile: 'default' | 'yes' | 'no'. */
  @Column({ name: 'only_one', default: 'default' })
  onlyOne: string;

  /** parent-queue utk simple queue (limitasi global). */
  @Column({ name: 'parent_queue', nullable: true })
  parentQueue: string | null;

  /** insert-queue-before — urutan penempatan di simple queue. */
  @Column({ name: 'insert_queue_before', nullable: true })
  insertQueueBefore: string | null;

  @Column({ name: 'billing_cycle', type: 'smallint', default: 30 })
  billingCycle: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
