import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Customer } from './customer.entity';

export type OtpPurpose = 'login' | 'billing_check' | 'reset_password';

/**
 * Kode OTP sekali pakai. Kode & tujuan (nomor WA/email) hanya disimpan sebagai
 * hash; yang tampil ke pengguna hanya versi tersamar (0812****7788).
 */
@Entity('customer_otps')
@Index('idx_cust_otp_lookup', ['targetHash', 'purpose', 'createdAt'])
export class CustomerOtp {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** login | billing_check | reset_password */
  @Column({ type: 'varchar', length: 32 })
  purpose: OtpPurpose;

  /** whatsapp | email */
  @Column({ type: 'varchar', length: 16, default: 'whatsapp' })
  channel: string;

  @Column({ name: 'target_hash', type: 'char', length: 64 })
  targetHash: string;

  @Column({ name: 'target_masked', type: 'varchar', length: 64 })
  targetMasked: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ name: 'code_hash', type: 'char', length: 64 })
  codeHash: string;

  @Column({ type: 'smallint', default: 0 })
  attempts: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
