import { HttpException, HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';

interface Bucket {
  hits: number[];
  blockedUntil?: number;
}

/**
 * Pembatas laju sederhana berbasis memori (sliding window).
 *
 * Cukup untuk satu instance aplikasi — pola penerapan RT/RW Net umumnya satu
 * kontainer. Bila nanti di-scale ke banyak replica, ganti isi kelas ini dengan
 * Redis (INCR + EXPIRE) tanpa mengubah pemanggilnya.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly buckets = new Map<string, Bucket>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    // Buang bucket yang sudah kedaluwarsa agar memori tidak tumbuh terus.
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  /**
   * Catat satu percobaan. Melempar 429 bila kuota habis.
   *
   * @param key      identitas kuota, mis. `otp:login:<hash>` atau `login:<ip>`
   * @param limit    jumlah percobaan yang diizinkan dalam jendela waktu
   * @param windowMs panjang jendela waktu (ms)
   * @param blockMs  lama diblokir setelah kuota habis (default = windowMs)
   */
  hit(key: string, limit: number, windowMs: number, blockMs = windowMs): void {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { hits: [] };

    if (bucket.blockedUntil && bucket.blockedUntil > now) {
      throw this.tooMany(bucket.blockedUntil - now);
    }

    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    bucket.hits.push(now);

    if (bucket.hits.length > limit) {
      bucket.blockedUntil = now + blockMs;
      this.buckets.set(key, bucket);
      throw this.tooMany(blockMs);
    }

    this.buckets.set(key, bucket);
  }

  /** Bersihkan kuota (mis. setelah login berhasil). */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  private tooMany(retryInMs: number): HttpException {
    const secs = Math.max(1, Math.ceil(retryInMs / 1000));
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Terlalu banyak percobaan. Coba lagi dalam ${secs} detik.`,
        retryAfter: secs,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, b] of this.buckets) {
      const last = b.hits[b.hits.length - 1] ?? 0;
      const blocked = b.blockedUntil ?? 0;
      if (now - last > 3_600_000 && blocked < now) this.buckets.delete(key);
    }
  }
}
