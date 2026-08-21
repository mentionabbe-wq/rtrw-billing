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

  // ── Tampilan di landing page publik (Phase 1) ─────────────────────────────

  /** Tampilkan paket ini di halaman paket publik. */
  @Column({ name: 'is_public', default: true })
  isPublic: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Daftar benefit yang tampil bercentang di kartu paket. */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  features: string[];

  @Column({ name: 'speed_down_mbps', type: 'int', nullable: true })
  speedDownMbps: number | null;

  @Column({ name: 'speed_up_mbps', type: 'int', nullable: true })
  speedUpMbps: number | null;

  /** Label kecil di kartu paket, mis. "POPULER". */
  @Column({ type: 'varchar', length: 24, nullable: true })
  badge: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
