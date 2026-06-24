import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Subscription } from './subscription.entity';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'invoice_no', unique: true })
  invoiceNo: string;

  @ManyToOne(() => Subscription)
  @JoinColumn({ name: 'subscription_id' })
  subscription: Subscription;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'period_start', type: 'date', nullable: true })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date', nullable: true })
  periodEnd: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  /** unpaid | paid | overdue | void */
  @Column({ type: 'varchar', default: 'unpaid' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
