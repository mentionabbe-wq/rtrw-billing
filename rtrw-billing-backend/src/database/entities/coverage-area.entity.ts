import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type CoverageStatus = 'available' | 'full' | 'planned';

/**
 * Area layanan untuk fitur "Cek Ketersediaan Internet" di landing page (§35).
 * Pencocokan dilakukan dua arah: teks (RT/RW/kelurahan) dan jarak GPS
 * terhadap titik pusat area (`radius_m`).
 */
@Entity('coverage_areas')
export class CoverageArea {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  village: string | null;

  @Column({ type: 'varchar', nullable: true })
  district: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  rt: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  rw: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  lat: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  lng: string | null;

  @Column({ name: 'radius_m', type: 'int', default: 700 })
  radiusM: number;

  /** available | full | planned */
  @Column({ type: 'varchar', length: 16, default: 'available' })
  status: CoverageStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
