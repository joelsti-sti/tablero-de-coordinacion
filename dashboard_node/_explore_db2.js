const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function explore() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '3306'),
        connectionLimit: 2
    });

    // Check cf_930 and cf_958 distributions for presencial/remoto distinction
    console.log('\n=== cf_930 distribution (type?) ===');
    let [rows] = await pool.query('SELECT cf_930, COUNT(*) as cnt FROM vtiger_servicecontractscf GROUP BY cf_930 ORDER BY cnt DESC LIMIT 20');
    rows.forEach(r => console.log('  cf_930=' + r.cf_930 + ' (' + typeof r.cf_930 + ') count=' + r.cnt));

    console.log('\n=== cf_958 distribution (Abonado?) ===');
    [rows] = await pool.query('SELECT cf_958, COUNT(*) as cnt FROM vtiger_servicecontractscf GROUP BY cf_958 ORDER BY cnt DESC LIMIT 20');
    rows.forEach(r => console.log('  cf_958="' + r.cf_958 + '" count=' + r.cnt));

    console.log('\n=== cf_922 distribution ===');
    [rows] = await pool.query('SELECT cf_922, COUNT(*) as cnt FROM vtiger_servicecontractscf GROUP BY cf_922 ORDER BY cnt DESC LIMIT 20');
    rows.forEach(r => console.log('  cf_922="' + r.cf_922 + '" count=' + r.cnt));

    console.log('\n=== cf_1026 distribution ===');
    [rows] = await pool.query('SELECT cf_1026, COUNT(*) as cnt FROM vtiger_servicecontractscf GROUP BY cf_1026 ORDER BY cnt DESC LIMIT 20');
    rows.forEach(r => console.log('  cf_1026="' + r.cf_1026 + '" count=' + r.cnt));

    console.log('\n=== cf_1030 distribution ===');
    [rows] = await pool.query('SELECT cf_1030, COUNT(*) as cnt FROM vtiger_servicecontractscf GROUP BY cf_1030 ORDER BY cnt DESC LIMIT 20');
    rows.forEach(r => console.log('  cf_1030="' + r.cf_1030 + '" count=' + r.cnt));

    console.log('\n=== contract_type distribution ===');
    [rows] = await pool.query('SELECT contract_type, COUNT(*) as cnt FROM vtiger_servicecontracts GROUP BY contract_type ORDER BY cnt DESC');
    rows.forEach(r => console.log('  contract_type="' + r.contract_type + '" count=' + r.cnt));

    // Sample a few FS records with full details
    console.log('\n=== Sample FS (5 records with all details) ===');
    [rows] = await pool.query(`
        SELECT sc.servicecontractsid, sc.contract_no, sc.subject, sc.contract_type, sc.contract_status,
               scf.cf_922, scf.cf_930, scf.cf_958, scf.cf_960, scf.cf_1026, scf.cf_1030, scf.cf_1034,
               a.accountname
        FROM vtiger_servicecontracts sc
        JOIN vtiger_crmentity e ON sc.servicecontractsid = e.crmid AND e.deleted = 0
        LEFT JOIN vtiger_servicecontractscf scf ON sc.servicecontractsid = scf.servicecontractsid
        LEFT JOIN vtiger_account a ON sc.sc_related_to = a.accountid
        WHERE scf.cf_960 IS NOT NULL
        ORDER BY scf.cf_960 DESC
        LIMIT 10
    `);
    rows.forEach(r => console.log(JSON.stringify(r, null, 2)));

    // Check for ticket - FS relationships by month
    console.log('\n=== Tickets created in que hay? ===');
    [rows] = await pool.query(`
        SELECT priority, COUNT(*) as cnt,
               SUM(CASE WHEN status NOT IN ('Closed', 'Cerrado/Para Entregar', 'Resuelto') THEN 1 ELSE 0 END) as abiertos
        FROM vtiger_troubletickets
        GROUP BY priority
    `);
    rows.forEach(r => console.log('  priority="' + r.priority + '" total=' + r.cnt + ' abiertos=' + r.abiertos));

    await pool.end();
}

explore().catch(console.error);
