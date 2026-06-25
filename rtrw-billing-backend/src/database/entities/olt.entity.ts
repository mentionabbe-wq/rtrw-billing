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

  /** zte | huawei | cdata | generic (drives which OID base to use) */
  @Column({ type: 'varchar', default: 'generic' })
  vendor: string;

  /** SNMP transport: 'v3' (authPriv) atau 'v2c' (community = snmpUser). */
  @Column({ name: 'snmp_version', type: 'varchar', default: 'v3' })
  snmpVersion: string;

  /** v3 SNMPv3 user, atau community string saat snmpVersion = 'v2c'. */
  @Column({ name: 'snmp_user' })
  snmpUser: string;

  @Column({ name: 'snmp_auth_enc', type: 'bytea' })
  snmpAuthEnc: Buffer;

  @Column({ name: 'snmp_priv_enc', type: 'bytea' })
  snmpPrivEnc: Buffer;

  @Column({ type: 'varchar', default: 'unknown' })
  status: string;
}
