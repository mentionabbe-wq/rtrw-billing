import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('mikrotik_sync_logs')
export class MikrotikSyncLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'subscription_id', type: 'bigint', nullable: true })
  subscriptionId: string;

  /** suspend | activate | set_bandwidth | sync */
  @Column({ type: 'varchar' })
  action: string;

  /** success | failed */
  @Column({ type: 'varchar' })
  result: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
