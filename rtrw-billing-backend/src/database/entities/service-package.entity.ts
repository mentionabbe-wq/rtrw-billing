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

  @Column({ name: 'billing_cycle', type: 'smallint', default: 30 })
  billingCycle: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
