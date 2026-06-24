const mysql = require('mysql2/promise');

async function test() {
    const connection = await mysql.createConnection({
        host: '192.168.200.246',
        user: 'claw',
        password: 'Hxte12Yzz8K4CGlp',
        database: 'vtigercrm600'
    });

    const [rows] = await connection.execute(`
        SELECT 
            u.first_name, 
            u.last_name,
            sc.subject as fs_name,
            sc.contract_no as fs_numero,
            a.accountname as cliente,
            scf.cf_932 as hora_inicio,
            scf.cf_934 as hora_fin
        FROM vtiger_users u
        INNER JOIN vtiger_crmentity e ON u.id = e.smownerid AND e.deleted = 0
        INNER JOIN vtiger_servicecontracts sc ON e.crmid = sc.servicecontractsid
        INNER JOIN vtiger_servicecontractscf scf ON e.crmid = scf.servicecontractsid
        LEFT JOIN vtiger_account a ON sc.sc_related_to = a.accountid
        WHERE scf.cf_960 = '2026-05-07'
        AND scf.cf_932 IS NOT NULL 
        AND scf.cf_934 IS NOT NULL
        AND u.deleted = 0 
        AND u.id NOT IN (5, 6, 7, 72)
        LIMIT 3
    `);
    
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

test();