module.exports = {
  CRM_DB: {
    host: process.env.CRM_DB_HOST || '192.168.200.246',
    port: parseInt(process.env.CRM_DB_PORT || '3306'),
    user: process.env.CRM_DB_USER || 'claw',
    password: process.env.CRM_DB_PASSWORD || 'Hxte12Yzz8K4CGlp',
    database: process.env.CRM_DB_NAME || 'vtigercrm600',
  },
  OCS_PG: {
    host: process.env.OCS_PG_HOST || '192.168.200.134',
    port: parseInt(process.env.OCS_PG_PORT || '5432'),
    user: process.env.OCS_PG_USER || 'fsuser',
    password: process.env.OCS_PG_PASSWORD || 'Sti,33784!',
    database: process.env.OCS_PG_DATABASE || 'postgres',
  },
  OCS_DEFAULT: {
    baseURL: process.env.OCS_API_URL || 'https://ocs.stinetwork.com.ar:44380/ocsapi/v1',
    auth: {
      username: process.env.OCS_API_USER || 'stinetwork',
      password: process.env.OCS_API_PASS || 'Sti,33784!',
    },
  },
  ESET_CONFIG: {
    iamUrl: 'https://us.business-account.iam.eset.systems',
    deviceApiUrl: 'https://us.device-management.eset.systems',
  },
  PORT: parseInt(process.env.PORT || '3005'),
  OCS_CACHE_PATH: process.env.OCS_CACHE_PATH || './ocs_cache.json',
  OCS_CACHE_REFRESH_INTERVAL: parseInt(process.env.OCS_CACHE_REFRESH_INTERVAL || '300000'), // 5 min
};
