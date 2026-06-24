require('dotenv').config({path:'./.env'});
const mysql = require('mysql2/promise');
async function main(){
  const c = await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,port:parseInt(process.env.DB_PORT||'3306')});
  const [r] = await c.execute("SELECT * FROM vtiger_projecttask t WHERE t.projecttask_no = 'TAR-5053'");
  if (r.length > 0) {
    console.log(JSON.stringify(r[0], null, 2));
    // also check cf table
    const [r2] = await c.execute("SELECT * FROM vtiger_projecttaskcf WHERE projecttaskid = ?", [r[0].projecttaskid]);
    console.log('\n=== CF table ===');
    console.log(JSON.stringify(r2[0], null, 2));
  } else {
    console.log('Not found');
    // search with LIKE
    const [r3] = await c.execute("SELECT projecttask_no, projecttaskname, projecttaskstatus, cf_comentarios FROM vtiger_projecttask WHERE projecttask_no LIKE '%5053%' OR projecttaskname LIKE '%5053%'");
    r3.forEach(x => console.log(JSON.stringify(x)));
  }
  await c.end();
}
main().catch(e=>console.error(e.message));
