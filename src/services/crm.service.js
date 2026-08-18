const { createConnection } = require('mysql2/promise');
const { CRM_DB } = require('../config');
const { normalizeMac, normalizeSerial } = require('../utils/normalization');

async function getCrmComputers(cliente) {
  let conn;
  try {
    conn = await createConnection(CRM_DB);
    const parts = cliente.empresa.split('/').map(p => p.trim()).filter(Boolean);
    
    if (parts.length === 0) return { devices: [], contracts: [] };

    // Consulta para obtener cuentas con sus límites y TAG de OCS
    const accountConditions = parts.map(() => 'a.accountname LIKE ?').join(' OR ');
    const accountParams = parts.map(p => `%${p}%`);

    const [accounts] = await conn.execute(
      `SELECT a.accountid, a.accountname,
              ac.cf_1098 as estaciones_trabajo,
              ac.cf_1096 as servidores_fisicos,
              ac.cf_1104 as servidores_virtuales,
              ac.cf_1225 as tag_ocs,
              ac.cf_1267 as antivirus,
              ac.cf_1269 as fecha_vencimiento,
              ac.cf_1271 as cantidad_licencias,
              ac.cf_1273 as clave_licencia
       FROM vtiger_account a
       LEFT JOIN vtiger_accountscf ac ON a.accountid = ac.accountid
       WHERE ${accountConditions}`,
      accountParams
    );

    if (accounts.length === 0) return { devices: [], contracts: [] };

    const contracts = accounts.map(a => ({
      accountId: a.accountid,
      accountName: a.accountname,
      tagOcs: a.tag_ocs || null,
      estacionesTrabajo: a.estaciones_trabajo || 0,
      servidoresFisicos: a.servidores_fisicos || 0,
      servidoresVirtuales: a.servidores_virtuales || 0,
      antivirus: a.antivirus || null,
      fechaVencimiento: a.fecha_vencimiento || null,
      cantidadLicencias: a.cantidad_licencias || null,
      claveLicencia: a.clave_licencia || null,
    }));

    const ids = accounts.map(a => a.accountid);
    const placeholders = ids.map(() => '?').join(',');

    // Consulta para obtener contactos y sus 3 posibles equipos
    const [contacts] = await conn.execute(
      `SELECT 
         c.contactid, c.accountid, c.firstname, c.lastname,
         cf.cf_1163 as usuario_activo,
         -- Equipo 1
         cf.cf_1215 as host1, cf.cf_1217 as serial1, cf.cf_1223 as uuid1, cf.cf_1219 as mac_eth1, cf.cf_1221 as mac_wifi1,
         -- Equipo 2
         cf.cf_1233 as host2, cf.cf_1249 as serial2, cf.cf_1235 as uuid2, cf.cf_1241 as mac_eth2, cf.cf_1243 as mac_wifi2,
         -- Equipo 3
         cf.cf_1237 as host3, cf.cf_1251 as serial3, cf.cf_1239 as uuid3, cf.cf_1247 as mac_eth3, cf.cf_1245 as mac_wifi3
       FROM vtiger_contactdetails c
       JOIN vtiger_contactscf cf ON c.contactid = cf.contactid
       JOIN vtiger_crmentity e ON c.contactid = e.crmid
       WHERE e.deleted = 0 AND c.accountid IN (${placeholders})`,
      ids
    );

    const devices = [];

    for (const row of contacts) {
      const usuario = `${row.firstname || ''} ${row.lastname || ''}`.trim();
      const activo = row.usuario_activo === 'si';

      const addDevice = (host, serial, uuid, mac1, mac2, numEquipo) => {
        if (host || serial || uuid || mac1 || mac2) {
          const macs = [mac1, mac2].filter(m => m && m.trim() !== '').map(m => normalizeMac(m.trim()));
          devices.push({
            source: 'crm',
            contactId: row.contactid,
            accountId: row.accountid,
            usuario: usuario,
            usuarioActivo: activo,
            equipoAsignado: numEquipo,
            hostname: host ? host.trim() : null,
            serialNumber: serial ? normalizeSerial(serial.trim()) : null,
            uuid: uuid ? uuid.trim() : null,
            macAddress: macs.length > 0 ? [...new Set(macs)] : null,
          });
        }
      };

      addDevice(row.host1, row.serial1, row.uuid1, row.mac_eth1, row.mac_wifi1, 1);
      addDevice(row.host2, row.serial2, row.uuid2, row.mac_eth2, row.mac_wifi2, 2);
      addDevice(row.host3, row.serial3, row.uuid3, row.mac_eth3, row.mac_wifi3, 3);
    }

    return { devices, contracts };
  } catch (err) {
    console.error('CRM error:', err.message);
    return { devices: [], contracts: [] };
  } finally {
    if (conn) await conn.end();
  }
}

async function getCrmContracts(cliente) {
  let conn;
  try {
    conn = await createConnection(CRM_DB);
    const parts = cliente.empresa.split('/').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return [];

    const accountConditions = parts.map(() => 'a.accountname LIKE ?').join(' OR ');
    const accountParams = parts.map(p => `%${p}%`);

    const [accounts] = await conn.execute(
      `SELECT a.accountid, a.accountname,
              ac.cf_1098 as estaciones_trabajo,
              ac.cf_1096 as servidores_fisicos,
              ac.cf_1104 as servidores_virtuales,
              ac.cf_1267 as antivirus,
              ac.cf_1269 as fecha_vencimiento,
              ac.cf_1271 as cantidad_licencias,
              ac.cf_1273 as clave_licencia
       FROM vtiger_account a
       LEFT JOIN vtiger_accountscf ac ON a.accountid = ac.accountid
       WHERE ${accountConditions}`,
      accountParams
    );

    return accounts.map(a => ({
      accountId: a.accountid,
      accountName: a.accountname,
      estacionesTrabajo: a.estaciones_trabajo || 0,
      servidoresFisicos: a.servidores_fisicos || 0,
      servidoresVirtuales: a.servidores_virtuales || 0,
      antivirus: a.antivirus || null,
      fechaVencimiento: a.fecha_vencimiento || null,
      cantidadLicencias: a.cantidad_licencias || null,
      claveLicencia: a.clave_licencia || null,
    }));
  } catch (err) {
    console.error('CRM contracts error:', err.message);
    return [];
  } finally {
    if (conn) await conn.end();
  }
}

async function getAbonados() {
  let conn;
  try {
    conn = await createConnection(CRM_DB);
    const [rows] = await conn.execute(
      `SELECT DISTINCT a.accountid, a.accountname
       FROM vtiger_servicecontracts sc
       JOIN vtiger_crmentity e ON sc.servicecontractsid = e.crmid AND e.deleted = 0
       LEFT JOIN vtiger_servicecontractscf scf ON sc.servicecontractsid = scf.servicecontractsid
       LEFT JOIN vtiger_account a ON sc.sc_related_to = a.accountid
       WHERE scf.cf_958 = 'Abonado' AND a.accountname IS NOT NULL
       ORDER BY a.accountname`
    );
    return rows;
  } catch (err) {
    console.error('Error getting abonados:', err.message);
    return [];
  } finally {
    if (conn) await conn.end();
  }
}

module.exports = { getCrmComputers, getCrmContracts, getAbonados };
