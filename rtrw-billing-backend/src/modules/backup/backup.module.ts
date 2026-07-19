import {
  BadRequestException, Controller, Get, Injectable, Logger, Module, Param, Post, Res, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { execFile } from 'child_process';
import { promises as fs, createReadStream, existsSync } from 'fs';
import { join } from 'path';
import type { Response } from 'express';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

/** Berapa file backup terbaru yang disimpan (harian → ±2 minggu). */
const RETENTION = 14;
const FILE_RE = /^rtrw-\d{4}-\d{2}-\d{2}-\d{4}\.dump$/;

/**
 * Backup otomatis PostgreSQL via pg_dump (format custom -Fc, terkompresi).
 * Jadwal harian 02:00 + tombol manual dari UI. File di BACKUP_DIR
 * (default /app/backups) — mount ke volume host agar selamat saat
 * container di-recreate. Restore: pg_restore -d rtrw_billing <file>.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private readonly config: ConfigService) {}

  private dir(): string {
    return process.env.BACKUP_DIR || '/app/backups';
  }

  async list() {
    const dir = this.dir();
    if (!existsSync(dir)) return [];
    const names = (await fs.readdir(dir)).filter((f) => FILE_RE.test(f)).sort().reverse();
    const rows = await Promise.all(
      names.map(async (name) => {
        const st = await fs.stat(join(dir, name));
        return { name, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
      }),
    );
    return rows;
  }

  async run(): Promise<{ name: string; sizeBytes: number }> {
    const dir = this.dir();
    await fs.mkdir(dir, { recursive: true });

    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const name = `rtrw-${stamp}.dump`;
    const path = join(dir, name);

    await new Promise<void>((resolve, reject) => {
      execFile(
        'pg_dump',
        [
          '-h', String(this.config.get('db.host')),
          '-p', String(this.config.get('db.port')),
          '-U', String(this.config.get('db.user')),
          '-d', String(this.config.get('db.name')),
          '-Fc', '-f', path,
        ],
        { env: { ...process.env, PGPASSWORD: String(this.config.get('db.pass')) }, timeout: 5 * 60_000 },
        (err, _stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve()),
      );
    });

    const st = await fs.stat(path);
    if (st.size < 1024) {
      await fs.unlink(path).catch(() => {});
      throw new Error('Hasil backup terlalu kecil — kemungkinan pg_dump gagal.');
    }

    await this.prune();
    this.logger.log(`Backup OK: ${name} (${(st.size / 1024).toFixed(0)} KB)`);
    return { name, sizeBytes: st.size };
  }

  /** Hapus backup lama, sisakan RETENTION file terbaru. */
  private async prune() {
    const rows = await this.list();
    for (const r of rows.slice(RETENTION)) {
      await fs.unlink(join(this.dir(), r.name)).catch(() => {});
    }
  }

  /** Harian 02:00 — backup otomatis. */
  @Cron('0 2 * * *', { name: 'db-backup' })
  async nightly() {
    try {
      await this.run();
    } catch (e) {
      this.logger.error(`Backup harian gagal: ${(e as Error).message}`);
    }
  }

  resolveFile(name: string): string {
    if (!FILE_RE.test(name)) throw new BadRequestException('Nama file tidak valid');
    const path = join(this.dir(), name);
    if (!existsSync(path)) throw new BadRequestException('File backup tidak ditemukan');
    return path;
  }
}

@ApiTags('backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('settings/backups')
export class BackupController {
  constructor(private readonly svc: BackupService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post('run')
  async run() {
    try {
      return await this.svc.run();
    } catch (e) {
      throw new BadRequestException(`Backup gagal: ${(e as Error).message}`);
    }
  }

  @Get(':name/download')
  download(@Param('name') name: string, @Res() res: Response) {
    const path = this.svc.resolveFile(name);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    createReadStream(path).pipe(res);
  }
}

@Module({
  providers: [BackupService],
  controllers: [BackupController],
})
export class BackupModule {}
