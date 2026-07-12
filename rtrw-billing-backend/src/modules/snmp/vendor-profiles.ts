/**
 * Per-vendor SNMP OID maps + dBm conversion for ONU/ONT optical monitoring.
 *
 * ⚠️ OID dan skala bisa berbeda antar firmware. Sebelum produksi, VALIDASI dengan:
 *     snmpwalk -v3 -l authPriv -u <user> -a SHA -A <authkey> -x AES -X <privkey> \
 *              <olt-ip> <rxPowerOid>
 *   lalu samakan `toDbm()` dengan nilai mentah yang muncul.
 *
 * Index OID = `${rxPowerOid}.${ifIndex}.${onuId}` (ifIndex = PON port, onuId = ONU/ONT id).
 */
export type OltVendor = 'zte' | 'huawei' | 'cdata' | 'cdata-gpon' | 'generic';

/** Sentinel "tidak ada sinyal / LOS" yang umum dikembalikan OLT. */
const NO_SIGNAL = [2147483647, -2147483648, 65535, 0];

export interface VendorProfile {
  label: string;
  rxPowerOid: string;
  txPowerOid: string;
  adminStatusOid: string;
  adminUp: number;
  adminDown: number;
  /** raw integer SNMP -> dBm. Return null bila LOS / tak ada sinyal. */
  toDbm: (raw: number) => number | null;
  /**
   * Susun suffix index OID dari (ifIndex, onuId). Default `${ifIndex}.${onuId}`.
   * C-Data GPON memakai 3 bagian: `${ifIndex}.0.${onuId}`.
   */
  buildIndex?: (ifIndex: number, onuId: number) => string;
}

export const VENDOR_PROFILES: Record<OltVendor, VendorProfile> = {
  // ---------------- Huawei (MA5600T / MA5800) ----------------
  // hwGponOntOpticalDdmRxPower — unit 0.01 dBm (signed). dBm = raw / 100.
  huawei: {
    label: 'Huawei MA56xx/MA58xx',
    rxPowerOid: '1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4',
    txPowerOid: '1.3.6.1.4.1.2011.6.128.1.1.2.51.1.6',
    // hwGponDeviceOntControlMgntStatus (1=up/online enable, 2=down). Verifikasi MIB Anda.
    adminStatusOid: '1.3.6.1.4.1.2011.6.128.1.1.2.43.1.5',
    adminUp: 1,
    adminDown: 2,
    toDbm: (raw) => (NO_SIGNAL.includes(raw) ? null : raw / 100),
  },

  // ---------------- ZTE (ZXAN C300 / C320) ----------------
  // zxGponOnuRxPower — banyak firmware mengembalikan unit 0.001 dBm (signed),
  // jadi dBm = raw / 1000. Sebagian firmware lama pakai (raw/100)-? — VALIDASI.
  zte: {
    label: 'ZTE C300/C320',
    rxPowerOid: '1.3.6.1.4.1.3902.1012.3.50.12.1.1.10',
    txPowerOid: '1.3.6.1.4.1.3902.1012.3.50.12.1.1.14',
    // zxGponOnuAdminState (1=enable, 2=disable/lock). Verifikasi MIB ZXAN Anda.
    adminStatusOid: '1.3.6.1.4.1.3902.1012.3.28.2.1.1',
    adminUp: 1,
    adminDown: 2,
    toDbm: (raw) => (NO_SIGNAL.includes(raw) ? null : raw / 1000),
  },

  // ---------------- C-Data (FD11xx / FD12xx EPON-GPON) ----------------
  // ⚠️ BELUM DIVALIDASI. OID di bawah adalah titik-awal yang paling umum dipakai
  // C-Data; firmware C-Data sangat bervariasi (banyak yang hanya SNMP v2c community,
  // bukan v3). Begitu Anda bisa akses OLT, jalankan:
  //   snmpwalk -v2c -c <community> <ip-olt> 1.3.6.1.4.1 | grep -i -E "power|optical|rx|tx"
  // lalu samakan rxPowerOid/txPowerOid + skala `toDbm()` di bawah.
  cdata: {
    label: 'C-Data FD11xx/FD12xx (UNVALIDATED)',
    rxPowerOid: '1.3.6.1.4.1.17409.2.8.4.1.1.5',
    txPowerOid: '1.3.6.1.4.1.17409.2.8.4.1.1.4',
    adminStatusOid: '1.3.6.1.4.1.17409.2.8.2.1.1.2',
    adminUp: 1,
    adminDown: 2,
    // Banyak EPON OLT mengembalikan unit 0.1 dBm (dBm = raw/10). VALIDASI dulu —
    // jika hasil tampak ~10x terlalu besar/kecil, ganti pembagi ke /100 atau /1.
    toDbm: (raw) => (NO_SIGNAL.includes(raw) ? null : raw / 10),
  },

  // ---------------- C-Data GPON (FD1601S/FD11xx/FD12xx seri GPON) ----------------
  // ✅ RX/TX DIVALIDASI pada FD1601S-B1 fw V3.2.10 (2026-07): tabel DDM ONU di
  // 17409.2.8.4.4.1 dgn kolom .4=rx, .5=tx, .6=bias, .7=volt, .8=suhu (semua ÷100).
  // Index = <ponPort>.0.<onuIdx> (3 bagian), mis. 4718593.0.1310721 = -1053 → -10.53 dBm.
  // ⚠️ adminStatusOid masih perkiraan — verifikasi sebelum dipakai enable/disable ONU.
  'cdata-gpon': {
    label: 'C-Data GPON FD1601S/FD11xx/FD12xx',
    rxPowerOid: '1.3.6.1.4.1.17409.2.8.4.4.1.4',
    txPowerOid: '1.3.6.1.4.1.17409.2.8.4.4.1.5',
    adminStatusOid: '1.3.6.1.4.1.17409.2.8.4.1.1.3',
    adminUp: 1,
    adminDown: 2,
    // Unit 0.01 dBm; -3000 (=-30 dBm) dipakai firmware sbg sentinel "tak ada data".
    toDbm: (raw) => (NO_SIGNAL.includes(raw) || raw <= -3000 ? null : raw / 100),
    buildIndex: (ifIndex, onuId) => `${ifIndex}.0.${onuId}`,
  },

  // ---------------- Fallback ----------------
  generic: {
    label: 'Generic',
    rxPowerOid: '1.3.6.1.4.1.0.0.0.0',
    txPowerOid: '1.3.6.1.4.1.0.0.0.0',
    adminStatusOid: '1.3.6.1.4.1.0.0.0.0',
    adminUp: 1,
    adminDown: 2,
    toDbm: (raw) => (NO_SIGNAL.includes(raw) ? null : raw / 100),
  },
};

export function getProfile(vendor?: string): VendorProfile {
  return VENDOR_PROFILES[(vendor as OltVendor)] ?? VENDOR_PROFILES.generic;
}
