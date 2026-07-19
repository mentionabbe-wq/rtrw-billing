import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Konfigurasi integrasi eksternal (payment gateway + WhatsApp) yang bisa
 * diubah dari UI admin — menggantikan env vars. Env tetap dipakai sebagai
 * fallback bila kolom di sini kosong. Secret disimpan terenkripsi (BYTEA).
 */
@Entity('integration_settings')
export class IntegrationSetting {
  @PrimaryColumn({ type: 'int', default: 1 })
  id: number;

  // ── Tripay ──
  @Column({ name: 'tripay_api_key_enc', type: 'bytea', nullable: true })
  tripayApiKeyEnc: Buffer | null;

  @Column({ name: 'tripay_private_key_enc', type: 'bytea', nullable: true })
  tripayPrivateKeyEnc: Buffer | null;

  @Column({ name: 'tripay_merchant_code', nullable: true })
  tripayMerchantCode: string | null;

  @Column({ name: 'tripay_mode', default: 'sandbox' })
  tripayMode: string;

  // ── Midtrans ──
  @Column({ name: 'midtrans_server_key_enc', type: 'bytea', nullable: true })
  midtransServerKeyEnc: Buffer | null;

  @Column({ name: 'midtrans_mode', default: 'sandbox' })
  midtransMode: string;

  // ── WhatsApp gateway (Fonnte/Wablas-compatible) ──
  @Column({ name: 'wa_api_url', nullable: true })
  waApiUrl: string | null;

  @Column({ name: 'wa_api_token_enc', type: 'bytea', nullable: true })
  waApiTokenEnc: Buffer | null;

  /** Kirim pengingat pembayaran otomatis via WA. */
  @Column({ name: 'wa_reminder_enabled', default: false })
  waReminderEnabled: boolean;

  /** Berapa hari sebelum jatuh tempo pengingat dikirim. */
  @Column({ name: 'wa_reminder_days', type: 'int', default: 3 })
  waReminderDays: number;

  /** Nomor WA admin utk notifikasi kejadian (ONU LOS, pembayaran masuk). */
  @Column({ name: 'wa_admin_phone', nullable: true })
  waAdminPhone: string | null;

  /** Kirim notifikasi kejadian ke admin. */
  @Column({ name: 'wa_notify_enabled', default: false })
  waNotifyEnabled: boolean;

  // ── Telegram (notifikasi admin — gratis) ──
  @Column({ name: 'telegram_bot_token_enc', type: 'bytea', nullable: true })
  telegramBotTokenEnc: Buffer | null;

  /** Chat ID tujuan: ID pribadi admin atau grup (-100...). */
  @Column({ name: 'telegram_chat_id', nullable: true })
  telegramChatId: string | null;

  /** Kirim notifikasi kejadian ke Telegram (menggantikan WA admin bila aktif). */
  @Column({ name: 'telegram_notify_enabled', default: false })
  telegramNotifyEnabled: boolean;

  // ── GenieACS (TR-069) ──
  /** URL NBI GenieACS, mis. http://192.168.30.102:7557. */
  @Column({ name: 'genieacs_url', nullable: true })
  genieacsUrl: string | null;

  @Column({ name: 'genieacs_username', nullable: true })
  genieacsUsername: string | null;

  @Column({ name: 'genieacs_password_enc', type: 'bytea', nullable: true })
  genieacsPasswordEnc: Buffer | null;
}
