import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Subscription } from './subscription.entity';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'customer_no', unique: true })
  customerNo: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'nik_enc', type: 'bytea', nullable: true })
  nikEnc: Buffer | null;

  @Column({ name: 'phone_enc', type: 'bytea' })
  phoneEnc: Buffer;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ name: 'geo_lat', type: 'numeric', precision: 9, scale: 6, nullable: true })
  geoLat: string;

  @Column({ name: 'geo_lng', type: 'numeric', precision: 9, scale: 6, nullable: true })
  geoLng: string;

  /** active | suspended | terminated */
  @Column({ type: 'varchar', default: 'active' })
  status: string;

  // ── Akun portal pelanggan (Phase 1) ───────────────────────────────────────

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  /** Argon2id. Null = pelanggan belum pernah menyetel kata sandi portal. */
  @Column({ name: 'password_hash', type: 'varchar', nullable: true, select: false })
  passwordHash: string | null;

  /**
   * HMAC-SHA256 nomor telepon (kunci DATA_ENC_KEY) — dipakai mencari pelanggan
   * dari nomor WhatsApp tanpa mendekripsi seluruh tabel. Diisi otomatis oleh
   * CustomerAuthService saat pertama kali dibutuhkan.
   */
  @Column({ name: 'phone_hash', type: 'char', length: 64, nullable: true })
  phoneHash: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  rt: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  rw: string | null;

  /** Admin dapat menutup akses portal per pelanggan. */
  @Column({ name: 'portal_enabled', default: true })
  portalEnabled: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => Subscription, (s) => s.customer)
  subscriptions: Subscription[];
}
