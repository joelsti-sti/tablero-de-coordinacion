const { createConnection } = require('mysql2/promise');
const { CRM_DB } = require('../config');
const { normalizeMac, normalizeSerial } = require('../utils/normalization');

async function getCrmComputers(cliente) {
  let conn;
  try {
    conn = await createConnection(CRM_DB);
    const parts = cliente.empresa.split('/').map(p => p.trim()).filter(Boolean);
    
    if (parts.length === 0) return { devices: [], contracts: [] };

    // Consolidate account lookup
    const accountConditions = parts.map(() => 'a.accountname LIKE ?').join(' OR ');
    const accountParams = parts.map(p => `%${p}%`);

    const [accounts] = await conn.execute(
      `SELECT a.accountid, a.accountname,
              ac.cf_1098 as estaciones_trabajo,
              ac.cf_1096 as servidores_fisicos,
              ac.cf_1104 as servidores_virtuales
       FROM vtiger_account a
       LEFT JOIN vtiger_accountscf ac ON a.accountid = ac.accountid
       WHERE ${accountConditions}`,
      accountParams
    );

    if (accounts.length === 0) return { devices: [], contracts: [] };

    const contracts = accounts.map(a => ({
      accountId: a.accountid,
      accountName: a.accountname,
      estacionesTrabajo: a.estaciones_trabajo || 0,
      servidoresFisicos: a.servidores_fisicos || 0,
      servidoresVirtuales: a.servidores_virtuales || 0,
    }));

    const ids = accounts.map(a => a.accountid);
    const placeholders = ids.map(() => '?').join(',');
    const [contacts] = await conn.execute(
      `SELECT c.contactid, c.accountid, acc.accountname,
                c.firstname, c.lastname,
                cf.cf_1215 as hostname,
                cf.cf_1217 as serialnumber,
                cf.cf_1219 as mac_eth,
                cf.cf_1221 as mac_wifi,
                cf.cf_1223 as uuid,
                cf.cf_1163 as usuario_activo
       FROM vtiger_contactdetails c
       JOIN vtiger_contactscf cf ON c.contactid = cf.contactid
       JOIN vtiger_crmentity e ON c.contactid = e.crmid
       JOIN vtiger_account acc ON c.accountid = acc.accountid
       WHERE e.deleted = 0 AND c.accountid IN (${placeholders})`,
      ids
    );

    const devices = contacts.map(r => {
      const macs = [normalizeMac(r.mac_eth), normalizeMac(r.mac_wifi)].filter(Boolean);
      return {
        source: 'crm',
        contactId: r.contactid,
        accountId: r.accountid,
        accountName: r.accountname,
        contactName: `${r.firstname || ''} ${r.lastname || ''}`.trim(),
        usuarioActivo: r.usuario_activo === 'si',
        hostname: r.hostname || null,
        serialNumber: normalizeSerial(r.serialnumber),
        uuid: r.uuid || null,
        macAddress: macs.length > 0 ? [...new Set(macs)] : null,
      };
    });

    return { devices, contracts };
  } catch (err) {
    console.error('CRM error:', err.message);
    return { devices: [], contracts: [] };
  } finally {
    if (conn) await conn.end();
  }
}

module.exports = { getCrmComputers };
