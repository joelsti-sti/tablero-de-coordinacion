const { createConnection } = require('mysql2/promise');
const { CRM_DB } = require('./src/config');

async function q() {
  const conn = await createConnection(CRM_DB);
  const [r] = await conn.execute('SHOW TABLES LIKE "vtiger_%tag%"');
  console.log(JSON.stringify(r, null, 2));
  
  // Also check account-related tag fields
  const [fields] = await conn.execute('SELECT fieldname, columnname, fieldlabel FROM vtiger_field WHERE fieldlabel LIKE "%TAG%" OR fieldname LIKE "%tag%" OR columnname LIKE "%tag%"');
  console.log('\n--- TAG FIELDS ---');
  console.log(JSON.stringify(fields, null, 2));
  
  await conn.end();
}

q().catch(console.error);