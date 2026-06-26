import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('routers')
export class Router {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column()
  name: string;

  @Column({ type: 'inet' })
  host: string;

  @Column({ name: 'api_port', type: 'int', default: 8729 })
  apiPort: number;

  @Column({ name: 'api_username' })
  apiUsername: string;

  /** AES-256-GCM encrypted API password */
  @Column({ name: 'api_secret_enc', type: 'bytea' })
  apiSecretEnc: Buffer;

  @Column({ type: 'varchar', default: 'unknown' })
  status: string;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  /** Nama PPP profile di Mikrotik untuk pelanggan suspend (captive portal mode).
   *  Kosong = mode lama (disable secret, internet total mati). */
  @Column({ name: 'suspend_profile', nullable: true })
  suspendProfile: string | null;
}
