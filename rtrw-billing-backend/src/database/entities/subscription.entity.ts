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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
