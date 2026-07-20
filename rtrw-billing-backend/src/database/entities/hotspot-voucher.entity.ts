import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { HotspotPackage } from './hotspot-package.entity';
import { Router } from './router.entity';

@Entity('hotspot_vouchers')
export class HotspotVoucher {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** Kode voucher yg ditampilkan ke pelanggan, mis. HS-ABCD-1234. Juga merchant_ref ke gateway. */
  @Column({ unique: true, length: 20 })
  code: string;

  /** Username hotspot Mikrotik (= code tanpa tanda hubung). */
  @Column({ unique: true, length: 20 })
  username: string;

  /** Password dienkripsi AES-256-GCM, disimpan sebagai BYTEA. */
  @Column({ name: 'password_enc', type: 'bytea' })
  passwordEnc: Buffer;

  @ManyToOne(() => HotspotPackage, { nullable: true, eager: false })
  @JoinColumn({ name: 'package_id' })
  package: HotspotPackage;

  @Column({ name: 'package_id', type: 'int', nullable: true })
  packageId: number;

  @ManyToOne(() => Router, { nullable: true, eager: false })
  @JoinColumn({ name: 'router_id' })
  router: Router;

  @Column({ name: 'router_id', type: 'bigint', nullable: true })
  routerId: string;

  /** pending → active → void. */
  @Column({ default: 'pending' })
  status: string;

  @Column({ name: 'buyer_name', nullable: true })
  buyerName: string;

  /** Nomor WA pembeli, dienkripsi AES-256-GCM, disimpan sebagai BYTEA. */
  @Column({ name: 'buyer_phone_enc', type: 'bytea', nullable: true })
  buyerPhoneEnc: Buffer | null;

  @Column({ name: 'payment_ref', nullable: true })
  paymentRef: string;

  @Column({ name: 'payment_gateway', nullable: true })
  paymentGateway: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  amount: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date;

  /** Waktu pembeli mengklaim "sudah bayar" (alur QRIS statis / transfer). */
  @Column({ name: 'payment_claimed_at', type: 'timestamptz', nullable: true })
  paymentClaimedAt: Date | null;

  /** Catatan pembeli saat klaim bayar (mis. nama pengirim / jam transfer). */
  @Column({ name: 'payment_note', nullable: true })
  paymentNote: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
