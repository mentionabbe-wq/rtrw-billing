import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Invoice } from './invoice.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => Invoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  /** midtrans | tripay | manual */
  @Column({ type: 'varchar', nullable: true })
  gateway: string;

  @Column({ name: 'gateway_ref', nullable: true })
  gatewayRef: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', nullable: true })
  method: string;

  /** pending | settled | failed */
  @Column({ type: 'varchar', default: 'pending' })
  status: string;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
