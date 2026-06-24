import 'reflect-metadata';
import 'dotenv/config';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import dataSource from './data-source';
import {
  User, ServicePackage, Router, Olt, Customer, Subscription, Device,
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
      pkgRepo.create({ name: 'Home 10Mbps', price: '150000', rateLimit: '10M/10M', pppoeProfile: 'home-10' }),
      pkgRepo.create({ name: 'Home 20Mbps', price: '200000', rateLimit: '20M/20M', pppoeProfile: 'home-20' }),
      pkgRepo.create({ name: 'Home 50Mbps', price: '350000', rateLimit: '50M/50M', pppoeProfile: 'home-50' }),
    ]);
    console.log(`✓ ${packages.length} paket`);
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
      const customer = await custRepo.save(custRepo.create({
        customerNo: 'CST' + String(n).padStart(6, '0'),
        fullName: s.name,
        phoneEnc: enc(s.phone)!,
        nikEnc: enc('32010100000000' + String(n).padStart(2, '0')),
        address: `Jl. Mawar No. ${n}, RT 0${n}`,
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
  }

  await dataSource.destroy();
  console.log('Seed complete.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
