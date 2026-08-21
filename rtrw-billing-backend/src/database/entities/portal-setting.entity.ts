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

  // ── Konten landing page publik (Phase 1) ──────────────────────────────────

  @Column({ name: 'hero_title', type: 'varchar', nullable: true })
  heroTitle: string | null;

  @Column({ name: 'hero_subtitle', type: 'text', nullable: true })
  heroSubtitle: string | null;

  @Column({ name: 'coverage_note', type: 'text', nullable: true })
  coverageNote: string | null;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  faq: { q: string; a: string }[];

  /** Tiga-empat keunggulan singkat di bawah hero. */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  highlights: { title: string; text: string }[];

  @Column({ name: 'office_address', type: 'text', nullable: true })
  officeAddress: string | null;

  @Column({ name: 'contact_email', type: 'varchar', nullable: true })
  contactEmail: string | null;

  /** operational | degraded | outage — dipakai halaman Status Jaringan (§41). */
  @Column({ name: 'network_status', type: 'varchar', length: 16, default: 'operational' })
  networkStatus: 'operational' | 'degraded' | 'outage';

  @Column({ name: 'network_status_note', type: 'text', nullable: true })
  networkStatusNote: string | null;

  @Column({ name: 'registration_enabled', default: true })
  registrationEnabled: boolean;

  /**
   * Saklar fitur portal pelanggan (§48). Kunci yang dikenal:
   * wifiName, wifiPassword, restartRouter, guestWifi, advancedWifi,
   * packageUpgrade, packageDowngrade, speedTest, ticket.
   */
  @Column({ name: 'portal_features', type: 'jsonb', default: () => `'{}'` })
  portalFeatures: Record<string, boolean>;
}
