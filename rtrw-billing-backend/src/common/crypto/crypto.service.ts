import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * AES-256-GCM authenticated encryption for sensitive customer/device data.
 * Stored layout (Buffer): [ iv(12) | authTag(16) | ciphertext(n) ]
 * Map these to a BYTEA column in PostgreSQL.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private key: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const hex = this.config.get<string>('encKey');
    if (!hex || hex.length !== 64) {
      throw new Error('DATA_ENC_KEY must be 32 bytes (64 hex chars). Generate: openssl rand -hex 32');
    }
    this.key = Buffer.from(hex, 'hex');
  }

  encrypt(plain: string | null | undefined): Buffer | null {
    if (plain == null) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]);
  }

  decrypt(buf: Buffer | null | undefined): string | null {
    if (buf == null) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
