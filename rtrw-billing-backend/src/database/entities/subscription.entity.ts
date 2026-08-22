import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Customer } from './customer.entity';
import { ServicePackage } from './service-package.entity';
import { Router } from './router.entity';

@Entity('subscriptions')
@Index('idx_sub_due', ['dueDate', 'status'])
export class Subscription {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => Customer, (c) => c.subscriptions)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => ServicePackage)
  @JoinColumn({ name: 'package_id' })
  package: ServicePackage;

  @ManyToOne(() => Router)
  @JoinColumn({ name: 'router_id' })
  router: Router;

  /** pppoe | hotspot */
  @Column({ name: 'conn_type', type: 'varchar', default: 'pppoe' })
  connType: string;

  @Column({ name: 'pppoe_user', unique: true, nullable: true })
  pppoeUser: string;

  @Column({ name: 'pppoe_pass_enc', type: 'bytea', nullable: true })
  pppoePassEnc: Buffer | null;

  @Column({ name: 'ip_static', type: 'inet', nullable: true })
  ipStatic: string | null;

  /** active | suspended | isolated */
  @Column({ type: 'varchar', default: 'active' })
  status: string;

  @Column({ name: 'activated_at', type: 'date', nullable: true })
  activatedAt: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  // ── Status PPPoE hasil polling berkala (bukan konfigurasi) ────────────────

  /** Sesi PPPoE ditemukan pada polling terakhir. */
  @Column({ name: 'live_online', default: false })
  liveOnline: boolean;

  @Column({ name: 'live_ip', type: 'varchar', length: 64, nullable: true })
  liveIp: string | null;

  @Column({ name: 'live_uptime', type: 'varchar', length: 32, nullable: true })
  liveUptime: string | null;

  /** MAC perangkat pelanggan yang membangun sesi (caller-id RouterOS). */
  @Column({ name: 'live_caller_id', type: 'varchar', length: 64, nullable: true })
  liveCallerId: string | null;

  /**
   * Router tempat sesi benar-benar ditemukan. Bila berbeda dengan `router_id`,
   * berarti pemetaan router pelanggan perlu dikoreksi (multi-MikroTik).
   */
  @ManyToOne(() => Router, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'live_router_id' })
  liveRouter: Router | null;

  @Column({ name: 'last_online_at', type: 'timestamptz', nullable: true })
  lastOnlineAt: Date | null;

  @Column({ name: 'live_checked_at', type: 'timestamptz', nullable: true })
  liveCheckedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
