const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.CRM_DB_HOST || '192.168.200.246',
  user: process.env.CRM_DB_USER || 'claw',
  password: process.env.CRM_DB_PASSWORD || 'Hxte12Yzz8K4CGlp',
  database: process.env.CRM_DB_NAME || 'vtigercrm600',
  port: parseInt(process.env.CRM_DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

module.exports = pool;
