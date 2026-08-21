import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Customer } from './customer.entity';
import { ServicePackage } from './service-package.entity';
import { User } from './user.entity';

export type CustomerRequestStatus = 'pending' | 'contacted' | 'approved' | 'rejected';

/**
 * Formulir pendaftaran calon pelanggan dari landing page (§36).
 * Nomor telepon disimpan terenkripsi + hash pencarian, sama seperti `customers`.
 */
@Entity('customer_requests')
@Index('idx_cust_requests_status', ['status', 'createdAt'])
export class CustomerRequest {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'request_no', type: 'varchar', length: 24, unique: true })
  requestNo: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'phone_enc', type: 'bytea' })
  phoneEnc: Buffer;

  @Column({ name: 'phone_hash', type: 'char', length: 64 })
  phoneHash: string;

  @Column({ name: 'phone_masked', type: 'varchar', length: 32 })
  phoneMasked: string;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'text' })
  address: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  rt: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  rw: string | null;

  @Column({ name: 'geo_lat', type: 'numeric', precision: 10, scale: 7, nullable: true })
  geoLat: string | null;

  @Column({ name: 'geo_lng', type: 'numeric', precision: 10, scale: 7, nullable: true })
  geoLng: string | null;

  @ManyToOne(() => ServicePackage, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'package_id' })
  package: ServicePackage | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** pending | contacted | approved | rejected */
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: CustomerRequestStatus;

  @Column({ name: 'reject_reason', type: 'text', nullable: true })
  rejectReason: string | null;

  /** Terisi bila pendaftaran disetujui & akun pelanggan dibuat. */
  @ManyToOne(() => Customer, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'handled_by' })
  handledBy: User | null;

  @Column({ name: 'handled_at', type: 'timestamptz', nullable: true })
  handledAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
