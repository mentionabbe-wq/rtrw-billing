/**
 * Uji util QRIS. Dijalankan tanpa framework: `npx ts-node src/common/qris/qris.util.spec.ts`
 * (modul ini sengaja tidak punya dependensi Nest supaya bisa diuji berdiri sendiri).
 */
import { buildDynamicQris, buildTlv, crc16, inspectQris, parseTlv } from './qris.util';

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

/** Rangkai payload QRIS statis lengkap dengan CRC yang benar. */
function makeStatic(merchant: string, city: string): string {
  const body =
    buildTlv([
      { tag: '00', value: '01' },
      { tag: '01', value: '11' },
      { tag: '26', value: '0013ID.CO.QRIS.WWW0215ID20200000000001' },
      { tag: '52', value: '4899' },
      { tag: '53', value: '360' },
      { tag: '58', value: 'ID' },
      { tag: '59', value: merchant },
      { tag: '60', value: city },
      { tag: '61', value: '12345' },
    ]) + '6304';
  return body + crc16(body);
}

// ── CRC ─────────────────────────────────────────────────────────────────────
// Vektor uji baku CRC-16/CCITT-FALSE.
check('crc16 vektor baku "123456789" = 29B1', crc16('123456789') === '29B1', crc16('123456789'));
check('crc16 selalu 4 digit', crc16('A').length === 4, crc16('A'));

// ── Parser ──────────────────────────────────────────────────────────────────
const tlv = parseTlv('000201010211');
check('parseTlv menghasilkan 2 elemen', tlv.length === 2);
check('parseTlv membaca tag & isi', tlv[0].tag === '00' && tlv[0].value === '01');
check('buildTlv membalik parseTlv', buildTlv(tlv) === '000201010211');

// "00" = tag, "XX" menempati posisi panjang → harus ditolak.
let threw = false;
try {
  parseTlv('00XX0101');
} catch {
  threw = true;
}
check('parseTlv menolak panjang non-angka', threw);

// Panjang menyebut 20 karakter padahal isinya kurang.
let cut = false;
try {
  parseTlv('0020abc');
} catch {
  cut = true;
}
check('parseTlv menolak isi terpotong', cut);

// ── Payload dengan SPASI di nama merchant (kasus yang dilaporkan) ───────────
const withSpace = makeStatic('TOKO SAYA JAYA', 'JAKARTA PUSAT');
const infoSpace = inspectQris(withSpace);
check('payload bernama berspasi dianggap valid', infoSpace.valid, infoSpace.error ?? '');
check('nama merchant terbaca utuh', infoSpace.merchantName === 'TOKO SAYA JAYA', infoSpace.merchantName ?? '');
check('kota terbaca utuh', infoSpace.merchantCity === 'JAKARTA PUSAT', infoSpace.merchantCity ?? '');
check('payload statis dikenali statis', infoSpace.dynamic === false);

// Membuang spasi di tengah HARUS merusak payload — inilah bug yang diperbaiki.
const stripped = withSpace.replace(/\s+/g, '');
check('payload tanpa spasi jadi tidak valid', inspectQris(stripped).valid === false);

// ── Pembuatan QRIS dinamis ──────────────────────────────────────────────────
const dyn = buildDynamicQris(withSpace, 150000);
const infoDyn = inspectQris(dyn);
check('QRIS dinamis valid (CRC dihitung ulang)', infoDyn.valid, infoDyn.error ?? '');
check('penanda dinamis tag 01 = 12', infoDyn.dynamic === true);
check('nominal tertanam benar', infoDyn.amount === 150000, String(infoDyn.amount));
check('nama merchant tidak berubah', infoDyn.merchantName === 'TOKO SAYA JAYA');

const dynTags = parseTlv(dyn).map((t) => t.tag);
check('tag 54 disisipkan setelah 53', dynTags.indexOf('54') === dynTags.indexOf('53') + 1, dynTags.join(','));
check('urutan tag menaik', dynTags.slice(0, -1).every((t, i) => Number(t) < Number(dynTags[i + 1])), dynTags.join(','));
check('tag informasi merchant utuh', parseTlv(dyn).find((t) => t.tag === '26')?.value === '0013ID.CO.QRIS.WWW0215ID20200000000001');

// Nominal diganti, bukan ditumpuk, saat payload sudah dinamis.
const dyn2 = buildDynamicQris(dyn, 200000);
check('nominal ditimpa pada payload dinamis', inspectQris(dyn2).amount === 200000, String(inspectQris(dyn2).amount));
check('hanya ada satu tag 54', parseTlv(dyn2).filter((t) => t.tag === '54').length === 1);

// Pembulatan ke rupiah penuh.
check('nominal dibulatkan', inspectQris(buildDynamicQris(withSpace, 99999.6)).amount === 100000);

// ── Penolakan masukan keliru ────────────────────────────────────────────────
check('tautan ditolak', inspectQris('https://qris.example/abc').valid === false);
check('teks acak ditolak', inspectQris('halo dunia').valid === false);
check('CRC salah ditolak', inspectQris(withSpace.slice(0, -4) + '0000').valid === false);
check('payload terpotong ditolak', inspectQris(withSpace.slice(0, 40)).valid === false);

for (const n of [0, -1, NaN]) {
  let bad = false;
  try {
    buildDynamicQris(withSpace, n);
  } catch {
    bad = true;
  }
  check(`nominal ${n} ditolak`, bad);
}

// ── Hasil ───────────────────────────────────────────────────────────────────
console.log(`${passed} lolos, ${failures.length} gagal`);
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
