import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('portal_settings')
export class PortalSetting {
  @PrimaryColumn({ type: 'int', default: 1 })
  id: number;

  @Column({ name: 'company_name', default: 'RT/RW Net' })
  companyName: string;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl: string;

  @Column({ name: 'primary_color', default: '#012b6d' })
  primaryColor: string;

  @Column({ default: 'Layanan Internet Rumahan' })
  tagline: string;

  @Column({ name: 'suspend_message', type: 'text', default: 'Internet Anda ditangguhkan karena belum melakukan pembayaran bulan ini.' })
  suspendMessage: string;

  @Column({ name: 'whatsapp_number', nullable: true })
  whatsappNumber: string;

  @Column({ name: 'payment_instructions', type: 'text', nullable: true })
  paymentInstructions: string;

  @Column({ name: 'bank_accounts', type: 'jsonb', default: [] })
  bankAccounts: { bank: string; accountNo: string; accountName: string }[];

  @Column({ name: 'footer_text', nullable: true })
  footerText: string;

  /**
   * QRIS statis (data URI base64). Dipakai bila belum pakai payment gateway —
   * pelanggan scan lalu konfirmasi manual, admin menyetujui 1 klik.
   */
  @Column({ name: 'qris_image', type: 'text', nullable: true })
  qrisImage: string | null;
}
