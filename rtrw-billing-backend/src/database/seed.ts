import 'reflect-metadata';
import 'dotenv/config';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import dataSource from './data-source';
import {
  User, ServicePackage, Router, Olt, Customer, Subscription, Device,
  PortalSetting, CoverageArea,
} from './entities';

/**
 * Full seeder: admin + packages + 1 Mikrotik router + 1 OLT + dummy customers,
 * subscriptions and ONUs. Sensitive fields use the same AES-256-GCM layout as
 * CryptoService: [ iv(12) | authTag(16) | ciphertext ].
 *
 * Run AFTER the schema exists:
 *   npm run migration:run && npm run seed
 */
function enc(plain: string | null): Buffer | null {
  if (plain == null) return null;
  const key = Buffer.from(process.env.DATA_ENC_KEY || '', 'hex');
  if (key.length !== 32) throw new Error('DATA_ENC_KEY must be 32 bytes (64 hex chars)');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

/** Sama dengan CryptoService.hmac — hash pencarian utk nomor telepon. */
function hmac(value: string): string {
  const key = Buffer.from(process.env.DATA_ENC_KEY || '', 'hex');
  if (key.length !== 32) throw new Error('DATA_ENC_KEY must be 32 bytes (64 hex chars)');
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}

/** 081234567001 → 6281234567001 (sinkron dengan normalizePhone di backend). */
function e164(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};

async function run() {
  await dataSource.initialize();
  const today = new Date();

  // ---- admin ----
  const userRepo = dataSource.getRepository(User);
  if (!(await userRepo.findOne({ where: { email: 'admin@rtrw.local' } }))) {
    await userRepo.save(userRepo.create({
      email: 'admin@rtrw.local',
      passwordHash: await argon2.hash('admin12345', { type: argon2.argon2id }),
      role: 'admin',
    }));
    console.log('✓ admin: admin@rtrw.local / admin12345 (GANTI!)');
  }

  // ---- packages ----
  const pkgRepo = dataSource.getRepository(ServicePackage);
  let packages = await pkgRepo.find();
  if (packages.length === 0) {
    packages = await pkgRepo.save([
      pkgRepo.create({
        name: 'BASIC', price: '150000', rateLimit: '10M/10M', pppoeProfile: 'home-10',
        speedDownMbps: 10, speedUpMbps: 10, sortOrder: 1, isPublic: true,
        description: 'Cocok untuk 1–3 perangkat: browsing, media sosial, dan streaming SD.',
        features: ['Unlimited tanpa FUP', 'Gratis pemasangan WiFi', 'Dukungan WhatsApp'],
      }),
      pkgRepo.create({
        name: 'FAMILY', price: '200000', rateLimit: '20M/20M', pppoeProfile: 'home-20',
        speedDownMbps: 20, speedUpMbps: 20, sortOrder: 2, isPublic: true, badge: 'POPULER',
        description: 'Pilihan keluarga: streaming HD di beberapa perangkat sekaligus.',
        features: ['Unlimited tanpa FUP', 'Gratis pemasangan WiFi', 'Portal pelanggan', 'Dukungan WhatsApp'],
      }),
      pkgRepo.create({
        name: 'PRO', price: '350000', rateLimit: '50M/50M', pppoeProfile: 'home-50',
        speedDownMbps: 50, speedUpMbps: 50, sortOrder: 3, isPublic: true,
        description: 'Untuk work from home, streaming 4K, dan banyak perangkat.',
        features: ['Unlimited tanpa FUP', 'Prioritas dukungan', 'Portal pelanggan', 'Gratis pemasangan WiFi'],
      }),
    ]);
    console.log(`✓ ${packages.length} paket`);
  }

  // ---- konten landing page & portal ----
  const settingRepo = dataSource.getRepository(PortalSetting);
  if (!(await settingRepo.findOne({ where: { id: 1 } }))) {
    await settingRepo.save(settingRepo.create({
      id: 1,
      companyName: 'RT/RW Net Warga',
      tagline: 'Internet Rumahan Cepat & Terjangkau',
      heroTitle: 'Internet Cepat & Stabil untuk Rumah Anda',
      heroSubtitle: 'Kelola layanan internet, tagihan, pembayaran, dan WiFi Anda dengan mudah.',
      whatsappNumber: '6281200000000',
      contactEmail: 'admin@rtrw.local',
      officeAddress: 'Sekretariat RW 05, Jl. Mawar No. 1',
      coverageNote: 'Belum masuk area? Kirim titik lokasi Anda via WhatsApp — kami cek kemungkinan penarikan jaringan baru.',
      paymentInstructions: 'Pembayaran dapat dilakukan via transfer bank atau QRIS. Konfirmasi otomatis setelah pembayaran terverifikasi.',
      registrationEnabled: true,
      networkStatus: 'operational',
    }));
    console.log('✓ pengaturan portal & konten landing page');
  }

  // ---- area coverage ----
  const coverageRepo = dataSource.getRepository(CoverageArea);
  if ((await coverageRepo.count()) === 0) {
    await coverageRepo.save([
      coverageRepo.create({ name: 'RT 01 / RW 05', rt: '01', rw: '05', village: 'Sukamaju', status: 'available', radiusM: 700 }),
      coverageRepo.create({ name: 'RT 02 / RW 05', rt: '02', rw: '05', village: 'Sukamaju', status: 'available', radiusM: 700 }),
      coverageRepo.create({ name: 'RT 03 / RW 05', rt: '03', rw: '05', village: 'Sukamaju', status: 'full', radiusM: 700, note: 'Kapasitas ODP penuh, menunggu penambahan.' }),
      coverageRepo.create({ name: 'RW 06', rw: '06', village: 'Sukamaju', status: 'planned', radiusM: 900, note: 'Rencana penarikan kabel kuartal berikutnya.' }),
    ]);
    console.log('✓ 4 area coverage');
  }

  // ---- router (Mikrotik) ----
  const routerRepo = dataSource.getRepository(Router);
  let router = await routerRepo.findOne({ where: { name: 'RB-Core' } });
  if (!router) {
    router = await routerRepo.save(routerRepo.create({
      name: 'RB-Core',
      host: '192.168.88.1',
      apiPort: 8729,
      apiUsername: 'svc-billing',
      apiSecretEnc: enc('ganti-password-api-mikrotik')!,
      status: 'unknown',
    }));
    console.log('✓ router RB-Core (192.168.88.1)');
  }

  // ---- OLT ----
  const oltRepo = dataSource.getRepository(Olt);
  let olt = await oltRepo.findOne({ where: { host: '192.168.88.2' } });
  if (!olt) {
    olt = await oltRepo.save(oltRepo.create({
      name: 'OLT-1',
      host: '192.168.88.2',
      vendor: 'zte',
      snmpUser: 'monitor',
      snmpAuthEnc: enc('ganti-snmp-auth-key')!,
      snmpPrivEnc: enc('ganti-snmp-priv-key')!,
      status: 'unknown',
    }));
    console.log('✓ OLT-1 (192.168.88.2, vendor zte)');
  }

  // ---- dummy customers + subscriptions + devices ----
  const custRepo = dataSource.getRepository(Customer);
  const subRepo = dataSource.getRepository(Subscription);
  const devRepo = dataSource.getRepository(Device);

  if ((await custRepo.count()) === 0) {
    const samples = [
      { name: 'Budi Santoso', phone: '081234567001', due: 5,  status: 'active' },
      { name: 'Siti Aminah',  phone: '081234567002', due: 2,  status: 'active' },
      { name: 'Agus Pratama', phone: '081234567003', due: -3, status: 'suspended' }, // overdue
      { name: 'Dewi Lestari', phone: '081234567004', due: 12, status: 'active' },
      { name: 'Eko Wijaya',   phone: '081234567005', due: -1, status: 'active' },     // due, akan ke-suspend cron
    ];

    let n = 0;
    for (const s of samples) {
      n++;
      const phone = e164(s.phone);
      const customer = await custRepo.save(custRepo.create({
        customerNo: 'CST' + String(n).padStart(6, '0'),
        fullName: s.name,
        phoneEnc: enc(phone)!,
        phoneHash: hmac(phone),
        nikEnc: enc('32010100000000' + String(n).padStart(2, '0')),
        address: `Jl. Mawar No. ${n}, RT 0${n} RW 05`,
        rt: '0' + n,
        rw: '05',
        email: `${s.name.split(' ')[0].toLowerCase()}@contoh.local`,
        // Kata sandi portal demo — GANTI di produksi (atau pakai tombol
        // "Reset kata sandi portal" di halaman Pelanggan).
        passwordHash: await argon2.hash('pelanggan123', { type: argon2.argon2id }),
        portalEnabled: true,
        status: s.status === 'suspended' ? 'suspended' : 'active',
      }));

      const pkg = packages[n % packages.length];
      const sub = await subRepo.save(subRepo.create({
        customer,
        package: pkg,
        router,
        connType: 'pppoe',
        pppoeUser: `user${String(n).padStart(3, '0')}`,
        pppoePassEnc: enc(crypto.randomBytes(6).toString('hex')),
        status: s.status,
        activatedAt: addDays(today, -60),
        dueDate: addDays(today, s.due),
      }));

      await devRepo.save(devRepo.create({
        subscription: sub,
        type: 'onu',
        serialNumber: `ZTEG${String(10000000 + n)}`,
        oltHost: olt.host,
        oltIfIndex: 1,
        onuId: n,
        lastRxPower: (-22 - n * 0.8).toFixed(2),
        lastStatus: n === 3 ? 'los' : 'online',
        updatedAt: new Date(),
      }));
    }
    console.log(`✓ ${samples.length} pelanggan + langganan + ONU`);
    console.log('  login portal demo: CST000001 / pelanggan123 (GANTI!)');
  }

  // ---- backfill hash telepon utk data lama (dipasang sebelum Phase 1) ----
  const needHash = await custRepo
    .createQueryBuilder('c')
    .where('c.phone_hash IS NULL')
    .getMany();
  let filled = 0;
  for (const c of needHash) {
    try {
      const key = Buffer.from(process.env.DATA_ENC_KEY || '', 'hex');
      const buf = c.phoneEnc;
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      decipher.setAuthTag(buf.subarray(12, 28));
      const plain = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
      const norm = e164(plain);
      if (!norm) continue;
      await custRepo.update(c.id, { phoneHash: hmac(norm) });
      filled++;
    } catch {
      // Nomor tak terbaca (kunci berbeda) — lewati, admin dapat memperbaiki manual.
    }
  }
  if (filled) console.log(`✓ hash telepon diisi untuk ${filled} pelanggan lama`);

  await dataSource.destroy();
  console.log('Seed complete.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
