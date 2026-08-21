import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Customer } from './customer.entity';

/**
 * Sesi login portal pelanggan. Token JWT tidak disimpan — hanya SHA-256-nya,
 * sehingga bocornya isi tabel tidak membuat sesi bisa dipakai ulang.
 * Dipakai untuk daftar perangkat aktif & "keluar dari semua perangkat".
 */
@Entity('customer_sessions')
@Index('idx_cust_sessions_active', ['customer', 'revokedAt'])
export class CustomerSession {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'token_hash', type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  lastSeenAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
