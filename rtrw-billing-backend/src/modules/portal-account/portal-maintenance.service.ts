import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomerAuthService } from './customer-auth.service';

/** Bersih-bersih harian sesi & OTP portal yang sudah kedaluwarsa. */
@Injectable()
export class PortalMaintenanceService {
  private readonly logger = new Logger(PortalMaintenanceService.name);

  constructor(private readonly auth: CustomerAuthService) {}

  @Cron('15 3 * * *')
  async purge() {
    try {
      await this.auth.purgeExpired();
    } catch (e) {
      this.logger.warn(`gagal membersihkan sesi/OTP: ${(e as Error).message}`);
    }
  }
}
