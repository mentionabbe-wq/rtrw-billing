import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Titik inventaris di peta jaringan: server/OLT, ODC, ODP, tiang, ONU
 * pelanggan, dll. Koordinat disimpan sbg numeric (lat/lng).
 */
@Entity('map_nodes')
export class MapNode {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** server | olt | odc | odp | pole | onu | join | other */
  @Column({ default: 'odp' })
  type: string;

  @Column()
  name: string;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  lat: string;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  lng: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Kapasitas total port/splitter (mis. ODP 1:8 → 8). */
  @Column({ name: 'capacity_total', type: 'int', nullable: true })
  capacityTotal: number | null;

  /** Port terpakai. */
  @Column({ name: 'capacity_used', type: 'int', nullable: true })
  capacityUsed: number | null;

  /** Warna marker kustom (opsional, override default per-tipe). */
  @Column({ nullable: true })
  color: string | null;

  /** up | down manual (fallback bila tak ditautkan ke perangkat). */
  @Column({ default: 'up' })
  status: string;

  /**
   * Tautan ke perangkat nyata utk status otomatis:
   * 'olt' | 'router' | 'subscription' (ONU pelanggan). Kosong = pakai `status` manual.
   */
  @Column({ name: 'ref_type', nullable: true })
  refType: string | null;

  @Column({ name: 'ref_id', nullable: true })
  refId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
