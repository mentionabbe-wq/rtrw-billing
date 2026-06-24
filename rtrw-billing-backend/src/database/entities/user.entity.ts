import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AppRole } from '@common/decorators/roles.decorator';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', default: 'operator' })
  role: AppRole;

  @Column({ name: 'totp_secret_enc', type: 'bytea', nullable: true })
  totpSecretEnc: Buffer | null;

  @Column({ name: 'totp_enabled', default: false })
  totpEnabled: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
