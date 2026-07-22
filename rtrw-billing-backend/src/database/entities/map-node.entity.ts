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

  /** up | down — bila down, memutus aliran ke titik & kabel di bawahnya. */
  @Column({ default: 'up' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
