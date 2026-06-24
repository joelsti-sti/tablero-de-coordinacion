const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.OCS_PG_HOST || '192.168.200.134',
  port: parseInt(process.env.OCS_PG_PORT || '5432'),
  user: process.env.OCS_PG_USER || 'fsuser',
  password: process.env.OCS_PG_PASSWORD || 'Sti,33784!',
  database: process.env.OCS_PG_DATABASE || 'postgres',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

module.exports = pool;
