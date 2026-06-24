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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => Subscription, (s) => s.customer)
  subscriptions: Subscription[];
}
