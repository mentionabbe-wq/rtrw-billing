export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'rtrw',
    pass: process.env.DB_PASS || 'changeme',
    name: process.env.DB_NAME || 'rtrw_billing',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expires: process.env.JWT_EXPIRES || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  encKey: process.env.DATA_ENC_KEY,
  payment: {
    // Tripay — https://tripay.co.id/member/merchant/api
    tripayApiKey: process.env.TRIPAY_API_KEY || '',
    tripayPrivateKey: process.env.TRIPAY_PRIVATE_KEY || '',
    tripayMerchantCode: process.env.TRIPAY_MERCHANT_CODE || '',
    tripayMode: process.env.TRIPAY_MODE || 'sandbox', // 'sandbox' | 'production'
    // Midtrans — https://dashboard.midtrans.com (opsional, alternatif Tripay)
    midtransServerKey: process.env.MIDTRANS_SERVER_KEY || '',
    midtransClientKey: process.env.MIDTRANS_CLIENT_KEY || '',
    midtransMode: process.env.MIDTRANS_MODE || 'sandbox', // 'sandbox' | 'production'
    // URL publik app billing (untuk callback & customer redirect)
    appUrl: process.env.APP_URL || 'http://localhost:3000',
  },
  genieacs: {
    // URL NBI GenieACS, mis. http://192.168.88.5:7557 (kosong = fitur nonaktif)
    url: process.env.GENIEACS_URL || '',
    username: process.env.GENIEACS_USERNAME || '',
    password: process.env.GENIEACS_PASSWORD || '',
  },
  monitoring: {
    snmpPollCron: process.env.SNMP_POLL_CRON || '*/5 * * * *',
    suspendCron: process.env.SUSPEND_CRON || '5 0 * * *',
    warnDbm: parseFloat(process.env.OPTICAL_WARN_DBM || '-25'),
    critDbm: parseFloat(process.env.OPTICAL_CRIT_DBM || '-27'),
  },
});
