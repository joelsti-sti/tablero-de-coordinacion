require('dotenv').config({path: './.env'});
const mysql = require('mysql2/promise');
async function main() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306')
  });

  const [r1] = await c.execute('SELECT * FROM vtiger_projecttaskstatus');
  console.log('=== projecttaskstatus ===');
  r1.forEach(x => console.log(JSON.stringify(x)));

  const [r2] = await c.execute('SELECT * FROM vtiger_ticketstatus');
  console.log('\n=== ticketstatus ===');
  r2.forEach(x => console.log(JSON.stringify(x)));

  const [r3] = await c.execute(`SELECT t.projecttaskid, t.projecttaskname, t.projecttaskstatus,
    t.cf_comentarios, tf.cf_1134, tf.cf_1074, tf.cf_1084
    FROM vtiger_projecttask t LEFT JOIN vtiger_projecttaskcf tf ON t.projecttaskid = tf.projecttaskid
    WHERE t.projecttaskstatus = 'Cerrada' AND LENGTH(t.cf_comentarios) > 0 LIMIT 5`);
  console.log('\n=== closed tasks WITH cf_comentarios ===');
  r3.forEach(x => console.log(JSON.stringify(x)));

  const [r4] = await c.execute(`SELECT t.projecttaskid, t.projecttaskname, t.projecttaskstatus,
    t.cf_comentarios, tf.cf_1134, tf.cf_1074, tf.cf_1084
    FROM vtiger_projecttask t LEFT JOIN vtiger_projecttaskcf tf ON t.projecttaskid = tf.projecttaskid
    WHERE t.projecttaskstatus = 'Cerrada' AND (t.cf_comentarios IS NULL OR LENGTH(t.cf_comentarios) = 0) LIMIT 5`);
  console.log('\n=== closed tasks WITHOUT cf_comentarios ===');
  r4.forEach(x => console.log(JSON.stringify(x)));

  const [r5] = await c.execute(`SELECT t.ticketid, t.ticket_no, t.title, t.status, t.solution
    FROM vtiger_troubletickets t WHERE t.status LIKE '%Closed%' LIMIT 10`);
  console.log('\n=== closed tickets sample ===');
  r5.forEach(x => console.log(JSON.stringify(x)));

  await c.end();
}
main().catch(e => console.error(e.message));
