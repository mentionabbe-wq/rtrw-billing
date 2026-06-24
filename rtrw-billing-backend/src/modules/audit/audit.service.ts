import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '@database/entities';

export interface AuditEntry {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  ip?: string | null;
  statusCode?: number | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.repo.save(this.repo.create(entry));
    } catch (e) {
      // Audit must never break the request.
      this.logger.warn(`audit write failed: ${(e as Error).message}`);
    }
  }

  list(limit = 200) {
    return this.repo.find({ order: { id: 'DESC' }, take: limit });
  }
}
