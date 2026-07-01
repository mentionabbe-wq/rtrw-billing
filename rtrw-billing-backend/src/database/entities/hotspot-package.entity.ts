import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('hotspot_packages')
export class HotspotPackage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  /** Total durasi koneksi dalam menit. 60=1jam, 1440=1hari, 10080=7hari. */
  @Column({ name: 'duration_minutes', type: 'int', default: 1440 })
  durationMinutes: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  price: string;

  /** Nama profile di /ip/hotspot/user-profile Mikrotik. */
  @Column({ name: 'mikrotik_profile', default: 'default' })
  mikrotikProfile: string;

  /** Rate limit Mikrotik format: "2M/2M" (upload/download). Opsional. */
  @Column({ name: 'rate_limit', nullable: true })
  rateLimit: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
