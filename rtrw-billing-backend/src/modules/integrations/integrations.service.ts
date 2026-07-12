import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationSetting } from '@database/entities';
import { CryptoService } from '@common/crypto/crypto.service';

export interface ResolvedPaymentConfig {
  tripayApiKey: string;
  tripayPrivateKey: string;
  tripayMerchantCode: string;
  tripayMode: string;
  midtransServerKey: string;
  midtransMode: string;
}

export interface ResolvedWaConfig {
  apiUrl: string;
  apiToken: string;
  reminderEnabled: boolean;
  reminderDays: number;
}

export interface ResolvedGenieacsConfig {
  url: string;
  username: string;
  password: string;
}

/**
 * Konfigurasi integrasi (payment gateway + WA) dari DB, dengan fallback env.
 * Diedit lewat UI admin → PATCH /settings/integrations.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(IntegrationSetting) private readonly repo: Repository<IntegrationSetting>,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  async getRow(): Promise<IntegrationSetting> {
    let row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) row = await this.repo.save(this.repo.create({ id: 1 }));
    return row;
  }

  /** Nilai efektif utk payment gateway: DB dulu, env sebagai fallback. */
  async resolvePayment(): Promise<ResolvedPaymentConfig> {
    const row = await this.getRow();
    return {
      tripayApiKey:
        this.crypto.decrypt(row.tripayApiKeyEnc) || this.config.get('payment.tripayApiKey') || '',
      tripayPrivateKey:
        this.crypto.decrypt(row.tripayPrivateKeyEnc) || this.config.get('payment.tripayPrivateKey') || '',
      tripayMerchantCode:
        row.tripayMerchantCode || this.config.get('payment.tripayMerchantCode') || '',
      tripayMode: row.tripayMode || this.config.get('payment.tripayMode') || 'sandbox',
      midtransServerKey:
        this.crypto.decrypt(row.midtransServerKeyEnc) || this.config.get('payment.midtransServerKey') || '',
      midtransMode: row.midtransMode || this.config.get('payment.midtransMode') || 'sandbox',
    };
  }

  /** Nilai efektif utk WhatsApp gateway: DB dulu, env sebagai fallback. */
  async resolveWa(): Promise<ResolvedWaConfig> {
    const row = await this.getRow();
    return {
      apiUrl: row.waApiUrl || process.env.WA_API_URL || '',
      apiToken: this.crypto.decrypt(row.waApiTokenEnc) || process.env.WA_API_TOKEN || '',
      reminderEnabled: row.waReminderEnabled,
      reminderDays: row.waReminderDays,
    };
  }

  /** Nilai efektif utk GenieACS: DB dulu, env sebagai fallback. */
  async resolveGenieacs(): Promise<ResolvedGenieacsConfig> {
    const row = await this.getRow();
    return {
      url: row.genieacsUrl || this.config.get('genieacs.url') || '',
      username: row.genieacsUsername || this.config.get('genieacs.username') || '',
      password:
        this.crypto.decrypt(row.genieacsPasswordEnc) || this.config.get('genieacs.password') || '',
    };
  }

  /** Utk UI admin — secret tidak dikembalikan, hanya flag terisi/tidak. */
  async getMasked() {
    const row = await this.getRow();
    const pay = await this.resolvePayment();
    const wa = await this.resolveWa();
    const acs = await this.resolveGenieacs();
    return {
      tripay: {
        hasApiKey: !!pay.tripayApiKey,
        hasPrivateKey: !!pay.tripayPrivateKey,
        merchantCode: row.tripayMerchantCode ?? '',
        mode: row.tripayMode,
        fromEnv: !row.tripayApiKeyEnc && !!this.config.get('payment.tripayApiKey'),
      },
      midtrans: {
        hasServerKey: !!pay.midtransServerKey,
        mode: row.midtransMode,
        fromEnv: !row.midtransServerKeyEnc && !!this.config.get('payment.midtransServerKey'),
      },
      whatsapp: {
        apiUrl: row.waApiUrl ?? '',
        hasToken: !!wa.apiToken,
        fromEnv: !row.waApiUrl && !!process.env.WA_API_URL,
        reminderEnabled: row.waReminderEnabled,
        reminderDays: row.waReminderDays,
      },
      genieacs: {
        url: row.genieacsUrl ?? '',
        username: row.genieacsUsername ?? '',
        hasPassword: !!acs.password,
        fromEnv: !row.genieacsUrl && !!this.config.get('genieacs.url'),
      },
    };
  }

  async update(dto: {
    tripayApiKey?: string;
    tripayPrivateKey?: string;
    tripayMerchantCode?: string;
    tripayMode?: string;
    midtransServerKey?: string;
    midtransMode?: string;
    waApiUrl?: string;
    waApiToken?: string;
    waReminderEnabled?: boolean;
    waReminderDays?: number;
    genieacsUrl?: string;
    genieacsUsername?: string;
    genieacsPassword?: string;
  }) {
    const row = await this.getRow();

    // Secret: hanya di-overwrite bila diisi (kosongkan = tetap).
    if (dto.tripayApiKey) row.tripayApiKeyEnc = this.crypto.encrypt(dto.tripayApiKey);
    if (dto.tripayPrivateKey) row.tripayPrivateKeyEnc = this.crypto.encrypt(dto.tripayPrivateKey);
    if (dto.midtransServerKey) row.midtransServerKeyEnc = this.crypto.encrypt(dto.midtransServerKey);
    if (dto.waApiToken) row.waApiTokenEnc = this.crypto.encrypt(dto.waApiToken);
    if (dto.genieacsPassword) row.genieacsPasswordEnc = this.crypto.encrypt(dto.genieacsPassword);

    if (dto.tripayMerchantCode !== undefined) row.tripayMerchantCode = dto.tripayMerchantCode || null;
    if (dto.tripayMode) row.tripayMode = dto.tripayMode;
    if (dto.midtransMode) row.midtransMode = dto.midtransMode;
    if (dto.waApiUrl !== undefined) row.waApiUrl = dto.waApiUrl || null;
    if (dto.waReminderEnabled !== undefined) row.waReminderEnabled = dto.waReminderEnabled;
    if (dto.waReminderDays !== undefined && dto.waReminderDays >= 0) {
      row.waReminderDays = dto.waReminderDays;
    }
    if (dto.genieacsUrl !== undefined) row.genieacsUrl = dto.genieacsUrl || null;
    if (dto.genieacsUsername !== undefined) row.genieacsUsername = dto.genieacsUsername || null;

    await this.repo.save(row);
    return this.getMasked();
  }
}
