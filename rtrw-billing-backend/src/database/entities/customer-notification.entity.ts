import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Customer } from './customer.entity';

export type NotificationType =
  | 'info' | 'invoice' | 'payment' | 'isolate' | 'reactivate' | 'maintenance' | 'outage' | 'security';

/** Lonceng notifikasi di portal pelanggan (§39). */
@Entity('customer_notifications')
@Index('idx_cust_notif', ['customer', 'createdAt'])
export class CustomerNotification {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'varchar', length: 32, default: 'info' })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', nullable: true })
  link: string | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
