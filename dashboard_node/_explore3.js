require('dotenv').config({path:'./.env'});
const mysql = require('mysql2/promise');
async function main(){
  const c = await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,port:parseInt(process.env.DB_PORT||'3306')});
  try {
    const [r] = await c.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vtiger_project'");
    r.forEach(x => console.log(x.COLUMN_NAME));
  } catch(e) { console.log('Error:', e.message); }
  await c.end();
}
main().catch(e=>console.error(e.message));
