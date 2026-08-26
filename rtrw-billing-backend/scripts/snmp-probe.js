#!/usr/bin/env node
/**
 * Diagnostik SNMP OLT — pengganti `snmpwalk` (memakai net-snmp yang sudah jadi
 * dependensi backend, jadi bisa dijalankan di dalam container).
 *
 * Tujuannya: MEMBUKTIKAN apakah OID yang dipakai aplikasi benar-benar
 * mengembalikan data dari OLT Anda, dan menemukan kolom mana yang berisi
 * status/redaman ONU — bukan menebak dari MIB.
 *
 * Contoh pakai (di server, di dalam container backend):
 *   docker exec -it rtrw-billing node scripts/snmp-probe.js 192.168.30.5 public
 *   docker exec -it rtrw-billing node scripts/snmp-probe.js 192.168.30.5 public --rows=5
 *   docker exec -it rtrw-billing node scripts/snmp-probe.js 10.0.0.2 --v3 --user=admin --auth=AUTHKEY --priv=PRIVKEY
 *   docker exec -it rtrw-billing node scripts/snmp-probe.js 192.168.30.5 public --oid=1.3.6.1.4.1.17409.2.8.4.1.1
 *
 * Tanpa --oid, script memindai subtree tabel ONU C-Data GPON:
 *   17409.2.8.4.1.1  = tabel ONU (nama, deskripsi, status, dll)
 *   17409.2.8.4.4.1  = tabel DDM (rx, tx, bias, tegangan, suhu)
 * lalu MERINGKAS per kolom supaya kelihatan kolom mana berisi apa.
 */
const snmp = require('net-snmp');

// ---------- argumen ----------
const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
// --oid boleh diulang, jadi dikumpulkan sendiri (Object.fromEntries hanya simpan yg terakhir).
const oidFlags = argv
  .filter((a) => a.startsWith('--oid='))
  .map((a) => a.slice('--oid='.length));
const positional = argv.filter((a) => !a.startsWith('--'));
const host = positional[0];
const community = positional[1] ?? 'public';
const maxRows = Number(flags.rows ?? 8);

if (!host) {
  console.error('Pemakaian: node scripts/snmp-probe.js <ip-olt> [community] [--rows=N] [--oid=OID]');
  console.error('       v3: node scripts/snmp-probe.js <ip-olt> --v3 --user=U --auth=AUTHKEY --priv=PRIVKEY');
  process.exit(1);
}

// Subtree default: tabel ONU + tabel DDM C-Data GPON.
const DEFAULT_OIDS = ['1.3.6.1.4.1.17409.2.8.4.1.1', '1.3.6.1.4.1.17409.2.8.4.4.1'];
const oids = oidFlags.length ? oidFlags : DEFAULT_OIDS;

// OID yang DIPAKAI APLIKASI saat ini (profil cdata-gpon) — untuk dicocokkan.
const APP_OIDS = {
  '1.3.6.1.4.1.17409.2.8.4.4.1.4': 'rxPowerOid  (redaman RX, dibagi 100)',
  '1.3.6.1.4.1.17409.2.8.4.4.1.5': 'txPowerOid  (daya TX, dibagi 100)',
  '1.3.6.1.4.1.17409.2.8.4.1.1.2': 'nameOid     (nama/posisi ONU)',
  '1.3.6.1.4.1.17409.2.8.4.1.1.3': 'descOid     (deskripsi ONU)  ⚠ juga dipakai sbg adminStatusOid',
};

function makeSession() {
  const opts = { timeout: 8000, retries: 2 };
  if (flags.v3) {
    return snmp.createV3Session(host, {
      name: flags.user,
      level: snmp.SecurityLevel.authPriv,
      authProtocol: snmp.AuthProtocols.sha,
      authKey: flags.auth,
      privProtocol: snmp.PrivProtocols.aes,
      privKey: flags.priv,
      ...opts,
    });
  }
  return snmp.createSession(host, community, { version: snmp.Version2c, ...opts });
}

/** Nilai varbind → teks yang enak dibaca (Buffer/OctetString jadi string). */
function renderValue(vb) {
  const v = vb.value;
  if (Buffer.isBuffer(v)) {
    const txt = v.toString('utf8').replace(/[^\x20-\x7e]/g, '');
    return txt.trim() || `<hex ${v.toString('hex')}>`;
  }
  return String(v);
}

function walk(base) {
  return new Promise((resolve) => {
    const session = makeSession();
    const rows = [];
    session.subtree(
      base,
      20,
      (varbinds) => {
        for (const vb of varbinds) {
          if (snmp.isVarbindError(vb)) continue;
          rows.push({ oid: String(vb.oid), value: renderValue(vb), type: vb.type });
        }
      },
      (err) => {
        session.close();
        resolve({ rows, error: err ? err.message : null });
      },
    );
  });
}

function get(oid) {
  return new Promise((resolve) => {
    const session = makeSession();
    session.get([oid], (err, varbinds) => {
      session.close();
      if (err) return resolve({ error: err.message });
      const vb = varbinds[0];
      if (snmp.isVarbindError(vb)) return resolve({ error: snmp.varbindError(vb) });
      resolve({ value: renderValue(vb) });
    });
  });
}

/** Kelompokkan hasil walk per KOLOM (OID induk), sisakan index sbg baris. */
function groupByColumn(rows, base) {
  const cols = new Map();
  for (const r of rows) {
    const clean = r.oid.replace(/^\./, '');
    const suffix = clean.startsWith(base) ? clean.slice(base.length + 1) : clean;
    const parts = suffix.split('.');
    const col = `${base}.${parts[0]}`;
    const index = parts.slice(1).join('.');
    if (!cols.has(col)) cols.set(col, []);
    cols.get(col).push({ index, value: r.value, type: r.type });
  }
  return cols;
}

(async () => {
  console.log(`\n=== SNMP probe ke ${host} (${flags.v3 ? 'v3 authPriv' : `v2c community="${community}"`}) ===\n`);

  const sys = await get('1.3.6.1.2.1.1.1.0');
  if (sys.error) {
    console.log(`sysDescr: GAGAL — ${sys.error}`);
    console.log('\n⚠ Tidak bisa bicara dgn OLT sama sekali. Cek IP, community/kredensial,');
    console.log('  firewall UDP/161, dan apakah SNMP diaktifkan di OLT.\n');
    process.exit(2);
  }
  console.log(`sysDescr: ${sys.value}\n`);

  for (const base of oids) {
    console.log(`--- WALK ${base} ---`);
    const { rows, error } = await walk(base);
    if (error) {
      console.log(`  GAGAL: ${error}\n`);
      continue;
    }
    if (!rows.length) {
      console.log('  (KOSONG — OID ini tidak mengembalikan data di OLT ini)\n');
      continue;
    }
    const cols = groupByColumn(rows, base);
    console.log(`  ${rows.length} nilai, ${cols.size} kolom.\n`);
    for (const [col, items] of [...cols.entries()].sort()) {
      const label = APP_OIDS[col] ? `  ← DIPAKAI APP: ${APP_OIDS[col]}` : '';
      console.log(`  kolom ${col}  (${items.length} baris)${label}`);
      for (const it of items.slice(0, maxRows)) {
        // Kolom RX/TX C-Data = 0.01 dBm → tampilkan konversinya sbg bantuan.
        const n = Number(it.value);
        const dbm = Number.isFinite(n) && Math.abs(n) > 99 && Math.abs(n) < 10000
          ? `   (÷100 = ${(n / 100).toFixed(2)})`
          : '';
        console.log(`      [${it.index}] = ${it.value}${dbm}`);
      }
      if (items.length > maxRows) console.log(`      … ${items.length - maxRows} baris lagi`);
      console.log('');
    }
  }

  console.log('Selesai. Cocokkan: kolom mana berisi angka redaman (nilai ~-1000..-3000),');
  console.log('dan kolom mana berisi status ONU (angka kecil 1/2/3 = online/offline/LOS).\n');
  process.exit(0);
})();
