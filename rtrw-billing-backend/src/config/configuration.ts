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
  monitoring: {
    snmpPollCron: process.env.SNMP_POLL_CRON || '*/5 * * * *',
    suspendCron: process.env.SUSPEND_CRON || '5 0 * * *',
    warnDbm: parseFloat(process.env.OPTICAL_WARN_DBM || '-25'),
    critDbm: parseFloat(process.env.OPTICAL_CRIT_DBM || '-27'),
  },
});
