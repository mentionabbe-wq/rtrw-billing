import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Jalur kabel fiber di peta: backbone/distribusi/drop. Lintasan disimpan
 * sebagai array titik [lat, lng] (jsonb) agar bisa berbelok mengikuti jalan.
 */
@Entity('map_cables')
export class MapCable {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column()
  name: string;

  /** backbone | distribution | drop */
  @Column({ default: 'distribution' })
  type: string;

  /** Jumlah core fiber. */
  @Column({ type: 'int', default: 12 })
  cores: number;

  /** Lintasan: [[lat, lng], ...]. */
  @Column({ type: 'jsonb', default: [] })
  path: [number, number][];

  @Column({ nullable: true })
  color: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
