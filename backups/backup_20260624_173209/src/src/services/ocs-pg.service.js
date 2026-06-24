const pool = require('../db/ocs_pg');

async function getComputers(workgroup, search, showVirtual) {
  let query = 'SELECT * FROM sti_web.cache_ocs_computers';
  const conditions = [];
  const params = [];

  if (workgroup && workgroup !== 'TODOS') {
    conditions.push('workgroup = $' + (params.length + 1));
    params.push(workgroup);
  }
  if (search) {
    conditions.push('name ILIKE $' + (params.length + 1));
    params.push(`%${search}%`);
  }
  if (showVirtual === 'virtual') {
    conditions.push('is_virtual = true');
  } else if (showVirtual === 'fisico') {
    conditions.push('is_virtual = false');
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY workgroup, name';

  const result = await pool.query(query, params);
  return result.rows;
}

async function getComputersCross(workgroup) {
  let query = `SELECT name, workgroup, is_virtual, bios_serial, hardware_uuid, mac, ip, username, os
    FROM sti_web.cache_ocs_computers`;
  const params = [];
  if (workgroup && workgroup !== 'TODOS') {
    query += ' WHERE workgroup = $1';
    params.push(workgroup);
  }
  query += ' ORDER BY workgroup, name';
  const result = await pool.query(query, params);
  return result.rows;
}

async function getWorkgroups() {
  const result = await pool.query(
    'SELECT DISTINCT workgroup FROM sti_web.cache_ocs_computers ORDER BY workgroup'
  );
  return result.rows.map(r => r.workgroup);
}

async function getSummary() {
  const [total, virtual, wgCount, missingBios, missingUuid, health, osCounts, ramWg] = await Promise.all([
    pool.query('SELECT COUNT(*) as count FROM sti_web.cache_ocs_computers'),
    pool.query('SELECT COUNT(*) as count FROM sti_web.cache_ocs_computers WHERE is_virtual = true'),
    pool.query('SELECT COUNT(DISTINCT workgroup) as count FROM sti_web.cache_ocs_computers'),
    pool.query("SELECT COUNT(*) as count FROM sti_web.cache_ocs_computers WHERE bios_serial IS NULL OR bios_serial = ''"),
    pool.query("SELECT COUNT(*) as count FROM sti_web.cache_ocs_computers WHERE hardware_uuid IS NULL OR hardware_uuid = ''"),
    pool.query('SELECT disk_health, COUNT(*) as count FROM sti_web.cache_ocs_computers WHERE disk_health IS NOT NULL GROUP BY disk_health ORDER BY count DESC'),
    pool.query('SELECT os, COUNT(*) as count FROM sti_web.cache_ocs_computers WHERE os IS NOT NULL GROUP BY os ORDER BY count DESC'),
    pool.query('SELECT workgroup, ROUND(AVG(ram_mb)) as avg_ram FROM sti_web.cache_ocs_computers WHERE ram_mb IS NOT NULL GROUP BY workgroup ORDER BY avg_ram DESC')
  ]);

  return {
    total: parseInt(total.rows[0].count),
    virtuales: parseInt(virtual.rows[0].count),
    workgroups: parseInt(wgCount.rows[0].count),
    sin_bios_serial: parseInt(missingBios.rows[0].count),
    sin_uuid: parseInt(missingUuid.rows[0].count),
    disk_health: health.rows,
    os_distribution: osCounts.rows,
    ram_avg_by_wg: ramWg.rows
  };
}

async function getServiceRecords(search, tecnico) {
  let query = `SELECT fsid, contract_no, subject, tipo_soporte, tipo_servicio,
    fecha, hora_inicio, hora_fin, horas, facturable, tecnico,
    account_id, createdtime, modifiedtime, tipo_uso, cantidad_tecnicos,
    viaje_ida_min, viaje_vuelta_min
    FROM sti_web.cache_fs`;
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(contract_no ILIKE $1 OR subject ILIKE $1)');
    params.push(`%${search}%`);
  }
  if (tecnico) {
    conditions.push('tecnico ILIKE $' + (params.length + 1));
    params.push(`%${tecnico}%`);
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY fecha DESC';

  const result = await pool.query(query, params);
  return result.rows;
}

module.exports = {
  getComputers, getComputersCross, getWorkgroups,
  getSummary, getServiceRecords
};
