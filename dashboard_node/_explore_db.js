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

    // 1. Ticket priorities and statuses
    console.log('\n=== TICKET PRIORITIES ===');
    let [rows] = await pool.query('SELECT DISTINCT priority FROM vtiger_troubletickets ORDER BY priority');
    rows.forEach(r => console.log('  ' + r.priority));

    console.log('\n=== TICKET STATUSES ===');
    [rows] = await pool.query('SELECT DISTINCT status FROM vtiger_troubletickets ORDER BY status');
    rows.forEach(r => console.log('  ' + r.status));

    // 2. Ticket custom fields
    console.log('\n=== TICKET CF COLUMNS ===');
    [rows] = await pool.query('SHOW COLUMNS FROM vtiger_ticketcf');
    rows.forEach(r => console.log('  ' + r.Field + ' (' + r.Type + ')'));

    // 3. ProjectTask statuses
    console.log('\n=== PROJECT TASK STATUSES ===');
    [rows] = await pool.query('SELECT DISTINCT projecttaskstatus FROM vtiger_projecttask ORDER BY projecttaskstatus');
    rows.forEach(r => console.log('  ' + r.projecttaskstatus));

    // 4. ProjectTask CF
    console.log('\n=== PROJECT TASK CF COLUMNS ===');
    [rows] = await pool.query('SHOW COLUMNS FROM vtiger_projecttaskcf');
    rows.forEach(r => console.log('  ' + r.Field + ' (' + r.Type + ')'));

    // 5. Project statuses
    console.log('\n=== PROJECT STATUSES ===');
    [rows] = await pool.query('SELECT DISTINCT projectstatus FROM vtiger_project ORDER BY projectstatus');
    rows.forEach(r => console.log('  ' + r.projectstatus));

    // 6. Project CF
    console.log('\n=== PROJECT CF COLUMNS ===');
    [rows] = await pool.query('SHOW COLUMNS FROM vtiger_projectcf');
    rows.forEach(r => console.log('  ' + r.Field + ' (' + r.Type + ')'));

    // 7. ServiceContracts (FS) custom fields detail
    console.log('\n=== FS CF COLUMNS (all) ===');
    [rows] = await pool.query('SHOW COLUMNS FROM vtiger_servicecontractscf');
    rows.forEach(r => console.log('  ' + r.Field + ' (' + r.Type + ')'));

    // 8. FS statuses
    console.log('\n=== FS STATUSES ===');
    [rows] = await pool.query('SELECT DISTINCT contract_status FROM vtiger_servicecontracts ORDER BY contract_status');
    rows.forEach(r => console.log('  ' + r.contract_status));

    // 9. All FS columns
    console.log('\n=== FS COLUMNS ===');
    [rows] = await pool.query('SHOW COLUMNS FROM vtiger_servicecontracts');
    rows.forEach(r => console.log('  ' + r.Field + ' (' + r.Type + ')'));

    // 10. Users
    console.log('\n=== USERS ===');
    [rows] = await pool.query('SELECT id, first_name, last_name, deleted FROM vtiger_users ORDER BY last_name');
    rows.forEach(r => console.log('  ' + r.id + ': ' + r.first_name + ' ' + r.last_name + ' (deleted=' + r.deleted + ')'));

    // 11. Account columns
    console.log('\n=== ACCOUNT INDUSTRY/TYPE ===');
    [rows] = await pool.query('SELECT DISTINCT industry FROM vtiger_account WHERE industry IS NOT NULL AND industry != "" ORDER BY industry');
    rows.forEach(r => console.log('  industry: ' + r.industry));

    // 12. Check for any type/mode field in FS
    console.log('\n=== FS sc_related_to distribution ===');
    [rows] = await pool.query(`
        SELECT sc.sc_related_to, a.accountname 
        FROM vtiger_servicecontracts sc 
        LEFT JOIN vtiger_account a ON sc.sc_related_to = a.accountid
        WHERE sc.sc_related_to IS NOT NULL
        GROUP BY sc.sc_related_to
        ORDER BY COUNT(*) DESC
        LIMIT 10
    `);
    rows.forEach(r => console.log('  sc_related_to=' + r.sc_related_to + ' -> ' + (r.accountname || 'N/A')));

    await pool.end();
}

explore().catch(console.error);
