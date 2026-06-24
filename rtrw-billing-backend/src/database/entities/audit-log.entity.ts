import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
@Index('idx_audit_created', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId: string | null;

  @Column({ name: 'user_email', type: 'varchar', nullable: true })
  userEmail: string | null;

  /** HTTP verb + route, e.g. "POST /api/subscriptions/12/suspend" */
  @Column({ type: 'varchar' })
  action: string;

  @Column({ type: 'varchar', nullable: true })
  entity: string | null;

  @Column({ name: 'entity_id', type: 'varchar', nullable: true })
  entityId: string | null;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
