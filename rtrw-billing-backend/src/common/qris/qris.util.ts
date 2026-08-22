/**
 * Pembuat QRIS dinamis dari payload QRIS statis milik merchant sendiri.
 *
 * QRIS memakai format TLV EMVCo: setiap elemen = tag 2 digit + panjang 2 digit +
 * isi. Untuk mengubah QR statis menjadi dinamis (nominal sudah terisi):
 *   1. tag 01 "point of initiation" diubah dari 11 (statis) → 12 (dinamis)
 *   2. tag 54 "transaction amount" disisipkan/diganti
 *   3. tag 63 (CRC16-CCITT) dihitung ulang atas seluruh payload
 *
 * Uang tetap masuk ke rekening merchant yang sama karena tag informasi merchant
 * (26–51, 59, 60) tidak disentuh sama sekali.
 */

export interface QrisTlv {
  tag: string;
  value: string;
}

const TAG_POINT_OF_INITIATION = '01';
const TAG_AMOUNT = '54';
const TAG_MERCHANT_NAME = '59';
const TAG_MERCHANT_CITY = '60';
const TAG_CRC = '63';

/** CRC16-CCITT (poly 0x1021, init 0xFFFF) — 4 digit heksadesimal huruf besar. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Pecah payload menjadi daftar TLV. Melempar bila strukturnya rusak. */
export function parseTlv(payload: string): QrisTlv[] {
  const out: QrisTlv[] = [];
  let i = 0;
  while (i < payload.length) {
    const tag = payload.slice(i, i + 2);
    const lenRaw = payload.slice(i + 2, i + 4);
    if (tag.length < 2 || lenRaw.length < 2 || !/^\d{2}$/.test(lenRaw)) {
      throw new Error(
        `Struktur QRIS tidak valid: panjang elemen tidak terbaca pada posisi ${i + 2} ` +
          `(seharusnya 2 digit angka, ditemukan "${lenRaw}").`,
      );
    }
    const len = parseInt(lenRaw, 10);
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length !== len) {
      throw new Error(
        `Struktur QRIS tidak valid: isi elemen tag ${tag} terpotong ` +
          `(butuh ${len} karakter, tersisa ${value.length}).`,
      );
    }
    out.push({ tag, value });
    i += 4 + len;
  }
  if (!out.length) throw new Error('Payload QRIS kosong.');
  return out;
}

/** Rangkai kembali daftar TLV menjadi string. */
export function buildTlv(items: QrisTlv[]): string {
  return items
    .map(({ tag, value }) => `${tag}${String(value.length).padStart(2, '0')}${value}`)
    .join('');
}

export interface QrisInfo {
  valid: boolean;
  error?: string;
  merchantName?: string;
  merchantCity?: string;
  /** true bila payload yang dipasang sudah berupa QRIS dinamis. */
  dynamic?: boolean;
  /** Nominal yang sudah tertanam (hanya ada pada QRIS dinamis). */
  amount?: number | null;
}

/**
 * Periksa payload QRIS: struktur TLV benar dan CRC-nya cocok.
 * Dipakai saat admin menempel payload di Pengaturan, supaya kesalahan salin
 * ketahuan langsung, bukan saat pelanggan gagal membayar.
 */
export function inspectQris(payload: string): QrisInfo {
  const raw = (payload ?? '').trim();
  if (!raw) return { valid: false, error: 'Payload QRIS kosong.' };

  if (/^https?:\/\//i.test(raw)) {
    return {
      valid: false,
      error:
        'Isi QR ini berupa tautan, bukan payload QRIS. QR yang dipakai harus QRIS merchant ' +
        '(teks panjang diawali 00020101), bukan QR personal e-wallet.',
    };
  }
  if (!raw.startsWith('0002')) {
    return {
      valid: false,
      error: `Bukan payload QRIS: seharusnya diawali "0002", ditemukan "${raw.slice(0, 8)}".`,
    };
  }
  // Panjang elemen TLV dihitung per karakter ASCII. Karakter non-ASCII berarti
  // hasil salin tidak utuh (atau tercampur teks lain) — hentikan lebih awal
  // dengan pesan yang jelas daripada gagal di tengah parsing.
  const bad = [...raw].find((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) > 0x7e);
  if (bad) {
    return {
      valid: false,
      error:
        `Payload memuat karakter yang tidak semestinya (kode ${bad.charCodeAt(0)}). ` +
        'Salin ulang seluruh teks hasil pemindaian QR, tanpa tambahan apa pun.',
    };
  }

  let items: QrisTlv[];
  try {
    items = parseTlv(raw);
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }

  const crcItem = items.find((t) => t.tag === TAG_CRC);
  if (!crcItem) return { valid: false, error: 'Payload QRIS tidak memuat CRC (tag 63).' };

  // CRC dihitung atas seluruh payload sampai dengan "6304" (tanpa nilai CRC).
  const body = raw.slice(0, raw.length - 4);
  if (crc16(body).toUpperCase() !== crcItem.value.toUpperCase()) {
    return {
      valid: false,
      error: 'CRC QRIS tidak cocok — kemungkinan payload tersalin sebagian atau ada karakter tambahan.',
    };
  }

  const amountRaw = items.find((t) => t.tag === TAG_AMOUNT)?.value;
  return {
    valid: true,
    merchantName: items.find((t) => t.tag === TAG_MERCHANT_NAME)?.value?.trim(),
    merchantCity: items.find((t) => t.tag === TAG_MERCHANT_CITY)?.value?.trim(),
    dynamic: items.find((t) => t.tag === TAG_POINT_OF_INITIATION)?.value === '12',
    amount: amountRaw ? Number(amountRaw) : null,
  };
}

/**
 * Hasilkan payload QRIS dinamis dengan nominal `amount` (rupiah penuh).
 * `staticPayload` adalah QRIS statis merchant yang dipasang admin.
 */
export function buildDynamicQris(staticPayload: string, amount: number): string {
  const info = inspectQris(staticPayload);
  if (!info.valid) throw new Error(info.error ?? 'Payload QRIS tidak valid.');

  const nominal = Math.round(Number(amount));
  if (!Number.isFinite(nominal) || nominal <= 0) {
    throw new Error('Nominal tagihan tidak valid untuk QRIS.');
  }
  // Tag 54 dibatasi 13 karakter oleh spesifikasi EMVCo.
  const amountValue = String(nominal);
  if (amountValue.length > 13) throw new Error('Nominal tagihan terlalu besar untuk QRIS.');

  const items = parseTlv(staticPayload.trim())
    // CRC lama dibuang, nanti dihitung ulang di akhir.
    .filter((t) => t.tag !== TAG_CRC)
    .map((t) => (t.tag === TAG_POINT_OF_INITIATION ? { ...t, value: '12' } : t));

  const existingAmount = items.findIndex((t) => t.tag === TAG_AMOUNT);
  if (existingAmount >= 0) {
    items[existingAmount] = { tag: TAG_AMOUNT, value: amountValue };
  } else {
    // Tag harus urut menaik; sisipkan 54 sebelum tag pertama yang lebih besar.
    const at = items.findIndex((t) => Number(t.tag) > Number(TAG_AMOUNT));
    const entry = { tag: TAG_AMOUNT, value: amountValue };
    if (at < 0) items.push(entry);
    else items.splice(at, 0, entry);
  }

  const body = `${buildTlv(items)}${TAG_CRC}04`;
  return `${body}${crc16(body)}`;
}
