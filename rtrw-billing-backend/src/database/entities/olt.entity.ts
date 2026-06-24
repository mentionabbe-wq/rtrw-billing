import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * OLT chassis with SNMPv3 credentials. Auth/priv keys are AES-256-GCM encrypted.
 * The monitor worker resolves credentials from here (keyed by device.olt_host).
 */
@Entity('olts')
export class Olt {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column()
  name: string;

  @Column({ type: 'inet', unique: true })
  host: string;

  /** zte | huawei | bdcom | ... (drives which OID base to use) */
  @Column({ type: 'varchar', default: 'generic' })
  vendor: string;

  @Column({ name: 'snmp_user' })
  snmpUser: string;

  @Column({ name: 'snmp_auth_enc', type: 'bytea' })
  snmpAuthEnc: Buffer;

  @Column({ name: 'snmp_priv_enc', type: 'bytea' })
  snmpPrivEnc: Buffer;

  @Column({ type: 'varchar', default: 'unknown' })
  status: string;
}
