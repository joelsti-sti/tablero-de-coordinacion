const pool = require('../db/crm');

const EXCLUDED_USERS = '(5, 6, 7, 72)';

const FS_FROM = `
  FROM vtiger_users u
  INNER JOIN vtiger_crmentity e ON u.id = e.smownerid AND e.deleted = 0
  INNER JOIN vtiger_servicecontracts sc ON e.crmid = sc.servicecontractsid
  INNER JOIN vtiger_servicecontractscf scf ON e.crmid = scf.servicecontractsid
`;

const FS_ACCOUNT = `LEFT JOIN vtiger_account a ON sc.sc_related_to = a.accountid`;

const FS_WHERE = `
  WHERE scf.cf_960 = ?
  AND scf.cf_932 IS NOT NULL
  AND scf.cf_934 IS NOT NULL
  AND u.deleted = 0
  AND u.id NOT IN ${EXCLUDED_USERS}
`;

const AUSENCIA_CASE = `
  CASE
    WHEN scf.cf_1046 = 1 THEN '@@Ausente con Justificación'
    WHEN scf.cf_1048 = 1 THEN '@@Ausente sin aviso'
    WHEN scf.cf_1050 = 1 THEN '@@Ausente autorizado'
    WHEN scf.cf_1052 = 1 THEN '@@Llegada tarde autorizada'
    WHEN scf.cf_1054 = 1 THEN '@@Llegada tarde injustificada'
    WHEN scf.cf_1227 = 1 THEN '@@Licencia médica'
    ELSE ''
  END
`;

function buildRelSubquery(modules, alias) {
  const modList = modules.map(m => `'${m}'`).join(', ');
  return `
    SELECT fs_id, SUM(cnt) as ${alias} FROM (
      SELECT crmid as fs_id, COUNT(*) as cnt FROM vtiger_crmentityrel
      WHERE module = 'ServiceContracts' AND relmodule IN (${modList})
      GROUP BY crmid
      UNION ALL
      SELECT relcrmid as fs_id, COUNT(*) as cnt FROM vtiger_crmentityrel
      WHERE relmodule = 'ServiceContracts' AND module IN (${modList})
      GROUP BY relcrmid
    ) t GROUP BY fs_id
  `;
}

function parseTime(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':');
  const h = parseInt(parts[0]) || 0;
  const m = parseInt(parts[1]) || 0;
  return (h * 60) + m;
}

function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.start <= last.end) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

function minutesInHour(mergedIntervals, hourStart, hourEnd) {
  let total = 0;
  for (const interval of mergedIntervals) {
    const start = Math.max(interval.start, hourStart);
    const end = Math.min(interval.end, hourEnd);
    if (start < end) total += (end - start) / 60;
  }
  return total;
}

async function getHoras(date) {
  const d = date || new Date().toISOString().split('T')[0];
  const [rows] = await pool.query(`
    SELECT
      u.first_name, u.last_name,
      SUM(TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600) as total_hours,
      COUNT(*) as fs_count,
      GROUP_CONCAT(
        CONCAT(sc.contract_no, ' (', TIME_FORMAT(scf.cf_932, '%H:%i'), '-', TIME_FORMAT(scf.cf_934, '%H:%i'), ')',
          CASE WHEN COALESCE(scf.cf_1211, 0) + COALESCE(scf.cf_1213, 0) > 0
            THEN CONCAT('@@viaje:',
              FLOOR((COALESCE(scf.cf_1211, 0) + COALESCE(scf.cf_1213, 0)) / 60), ':',
              LPAD(MOD(COALESCE(scf.cf_1211, 0) + COALESCE(scf.cf_1213, 0), 60), 2, '0'))
            ELSE ''
          END,
          ${AUSENCIA_CASE}
        ) SEPARATOR '|'
      ) as fs_list
    ${FS_FROM}
    ${FS_WHERE}
    GROUP BY u.id
    ORDER BY u.last_name, u.first_name
  `, [d]);
  return rows;
}

async function getFsDetalle(date, tecnico) {
  const d = date || new Date().toISOString().split('T')[0];
  const params = [d];
  let tecnicoFilter = '';
  if (tecnico) {
    tecnicoFilter = 'AND CONCAT(u.first_name, " ", u.last_name) = ? ';
    params.push(tecnico);
  }
  const [rows] = await pool.query(`
    SELECT
      u.first_name, u.last_name,
      sc.servicecontractsid as fs_id,
      sc.subject as fs_name,
      sc.contract_no as fs_numero,
      a.accountname as cliente,
      TIME(scf.cf_932) as hora_inicio,
      TIME(scf.cf_934) as hora_fin,
      TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas,
      COALESCE(t.tickets, 0) as tickets,
      COALESCE(ta.tareas, 0) as tareas
    ${FS_FROM}${FS_ACCOUNT}
    LEFT JOIN (${buildRelSubquery(['HelpDesk'], 'tickets')}) t ON sc.servicecontractsid = t.fs_id
    LEFT JOIN (${buildRelSubquery(['ProjectTask'], 'tareas')}) ta ON sc.servicecontractsid = ta.fs_id
    ${FS_WHERE}${tecnicoFilter}
    ORDER BY u.last_name, u.first_name, scf.cf_932
  `, params);
  return rows;
}

async function getHorasReales(date) {
  const d = date || new Date().toISOString().split('T')[0];
  const [rows] = await pool.query(`
    SELECT
      u.first_name, u.last_name,
      sc.subject as fs_name,
      sc.contract_no as fs_numero,
      a.accountname as cliente,
      TIME(scf.cf_932) as hora_inicio,
      TIME(scf.cf_934) as hora_fin,
      COALESCE(scf.cf_1211, 0) as viaje_ida,
      COALESCE(scf.cf_1213, 0) as viaje_vuelta,
      CASE
        WHEN scf.cf_1046 = 1 THEN 'Ausente con Justificación'
        WHEN scf.cf_1048 = 1 THEN 'Ausente sin aviso'
        WHEN scf.cf_1050 = 1 THEN 'Ausente autorizado'
        WHEN scf.cf_1052 = 1 THEN 'Llegada tarde autorizada'
        WHEN scf.cf_1054 = 1 THEN 'Llegada tarde injustificada'
        WHEN scf.cf_1227 = 1 THEN 'Licencia médica'
        ELSE ''
      END as ausencia_tipo
    ${FS_FROM}${FS_ACCOUNT}
    ${FS_WHERE}
    ORDER BY u.last_name, u.first_name, scf.cf_932
  `, [d]);

  const techMap = {};
  const techMinutes = {};

  for (const row of rows) {
    const key = `${row.first_name} ${row.last_name}`;
    if (!techMinutes[key]) {
      techMinutes[key] = { first_name: row.first_name, last_name: row.last_name, totalMinutes: 0 };
    }
    if (!techMap[key]) {
      techMap[key] = { intervals: [] };
    }

    const start = parseTime(row.hora_inicio);
    const end = parseTime(row.hora_fin);
    const minutes = end - start;

    if (minutes > 0) {
      techMinutes[key].totalMinutes += minutes;
    }

    if (end < start) {
      techMap[key].intervals.push({ start, end: 1440 });
      techMap[key].intervals.push({ start: 0, end });
    } else {
      techMap[key].intervals.push({ start, end });
    }
  }

  const allIntervals = [];
  for (const key in techMap) {
    const merged = mergeIntervals(techMap[key].intervals);
    allIntervals.push(...merged);
  }
  const allMergedIntervals = mergeIntervals(allIntervals);

  const horasSinCarga = [];
  for (let hour = 8; hour < 18; hour++) {
    const hourStart = hour * 60;
    const hourEnd = (hour + 1) * 60;
    if (minutesInHour(allMergedIntervals, hourStart, hourEnd) === 0) {
      horasSinCarga.push(`${hour}:00 - ${hour + 1}:00`);
    }
  }

  const finalResults = [];
  for (const key in techMinutes) {
    const tech = techMinutes[key];
    const horasReales = Math.round((tech.totalMinutes / 60) * 100) / 100;
    const cappedHoras = horasReales > 8 ? 8 : horasReales;

    const fsList = rows
      .filter(r => `${r.first_name} ${r.last_name}` === key)
      .map(r => {
        const inicio = String(r.hora_inicio || '').substring(0, 5);
        const fin = String(r.hora_fin || '').substring(0, 5);
        const parts = [`${r.fs_numero || 'FS'}`, `${r.cliente || r.fs_name}`, `${inicio}-${fin}`];
        if (r.ausencia_tipo) parts.push(r.ausencia_tipo);
        const viajeTotal = (r.viaje_ida || 0) + (r.viaje_vuelta || 0);
        if (viajeTotal > 0) {
          const vh = Math.floor(viajeTotal / 60);
          const vm = viajeTotal % 60;
          parts.push(`viaje:${vh}:${String(vm).padStart(2, '0')}`);
        }
        return parts.join(' | ');
      });

    finalResults.push({
      first_name: tech.first_name,
      last_name: tech.last_name,
      horasReales: cappedHoras,
      fs_count: fsList.length,
      fs_list: fsList
    });
  }

  finalResults.sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
  );

  return { tecnicos: finalResults, horasSinCarga };
}

async function getHorasMensual(year, month) {
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const [rows] = await pool.query(`
    SELECT
      u.first_name, u.last_name,
      SUM(TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600) as total_hours,
      COUNT(DISTINCT sc.servicecontractsid) as fs_count
    ${FS_FROM}
    WHERE DATE_FORMAT(scf.cf_960, '%Y-%m') = ?
    AND scf.cf_932 IS NOT NULL
    AND scf.cf_934 IS NOT NULL
    AND u.deleted = 0
    AND u.id NOT IN ${EXCLUDED_USERS}
    GROUP BY u.id, u.first_name, u.last_name
    ORDER BY total_hours DESC
  `, [`${y}-${m}`]);
  return rows;
}

async function getFsSinAsociar(date) {
  const d = date || new Date().toISOString().split('T')[0];

  const [relRows] = await pool.query(`
    SELECT fs_id FROM (
      SELECT crmid as fs_id FROM vtiger_crmentityrel
      WHERE module = 'ServiceContracts' AND relmodule IN ('HelpDesk', 'ProjectTask')
      UNION
      SELECT relcrmid as fs_id FROM vtiger_crmentityrel
      WHERE relmodule = 'ServiceContracts' AND module IN ('HelpDesk', 'ProjectTask')
    ) t GROUP BY fs_id
  `);
  const relatedIds = new Set(relRows.map(r => r.fs_id));

  const [rows] = await pool.query(`
    SELECT
      u.first_name, u.last_name,
      sc.servicecontractsid as fs_id,
      sc.sc_related_to,
      sc.subject as fs_name,
      sc.contract_no as fs_numero,
      scf.cf_960 as fs_fecha,
      a.accountname as cliente,
      TIME(scf.cf_932) as hora_inicio,
      TIME(scf.cf_934) as hora_fin,
      TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas
    ${FS_FROM}${FS_ACCOUNT}
    ${FS_WHERE}
    ORDER BY u.last_name, u.first_name, scf.cf_932
  `, [d]);

  return rows.filter(row => {
    const id = row.fs_id || row.servicecontractsid;
    if (relatedIds.has(id)) return false;
    if (row.sc_related_to === 2) return false;
    return true;
  });
}

async function getFsSinAsociarMensual(year, month) {
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const firstDay = `${y}-${m}-01`;
  const lastDay = new Date(y, parseInt(m), 0).toISOString().split('T')[0];

  const [relRows] = await pool.query(`
    SELECT fs_id FROM (
      SELECT crmid as fs_id FROM vtiger_crmentityrel
      WHERE module = 'ServiceContracts' AND relmodule IN ('HelpDesk', 'ProjectTask')
      UNION
      SELECT relcrmid as fs_id FROM vtiger_crmentityrel
      WHERE relmodule = 'ServiceContracts' AND module IN ('HelpDesk', 'ProjectTask')
    ) t GROUP BY fs_id
  `);
  const relatedIds = new Set(relRows.map(r => r.fs_id));

  const [rows] = await pool.query(`
    SELECT
      u.first_name, u.last_name,
      sc.servicecontractsid as fs_id,
      sc.sc_related_to,
      sc.subject as fs_name,
      sc.contract_no as fs_numero,
      scf.cf_960 as fs_fecha,
      a.accountname as cliente,
      TIME(scf.cf_932) as hora_inicio,
      TIME(scf.cf_934) as hora_fin,
      TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas
    ${FS_FROM}${FS_ACCOUNT}
    WHERE scf.cf_960 BETWEEN ? AND ?
      AND scf.cf_932 IS NOT NULL
      AND scf.cf_934 IS NOT NULL
      AND u.deleted = 0
      AND u.id NOT IN ${EXCLUDED_USERS}
    ORDER BY scf.cf_960, u.last_name, u.first_name, scf.cf_932
  `, [firstDay, lastDay]);

  return rows.filter(row => {
    const id = row.fs_id || row.servicecontractsid;
    if (relatedIds.has(id)) return false;
    if (row.sc_related_to === 2) return false;
    return true;
  });
}

async function getHorasMensualDetalle(year, month) {
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');

  const [rows] = await pool.query(`
    SELECT
      COALESCE(a.accountname, 'Sin Cliente') as cliente,
      a.accountid,
      DATE_FORMAT(scf.cf_960, '%Y-%m-%d') as fecha,
      u.first_name, u.last_name,
      sc.subject as fs_name,
      sc.contract_no as fs_numero,
      TIME(scf.cf_932) as hora_inicio,
      TIME(scf.cf_934) as hora_fin,
      TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas,
      COALESCE(t.tickets, 0) as tickets
    ${FS_FROM}${FS_ACCOUNT}
    LEFT JOIN (${buildRelSubquery(['HelpDesk'], 'tickets')}) t ON sc.servicecontractsid = t.fs_id
    WHERE DATE_FORMAT(scf.cf_960, '%Y-%m') = ?
    AND scf.cf_932 IS NOT NULL
    AND scf.cf_934 IS NOT NULL
    AND u.deleted = 0
    AND u.id NOT IN ${EXCLUDED_USERS}
    ORDER BY a.accountname, fecha, scf.cf_932
  `, [`${y}-${m}`]);

  const clientesMap = new Map();
  for (const row of rows) {
    const nombre = row.cliente || 'Sin Cliente';
    if (!clientesMap.has(nombre)) {
      clientesMap.set(nombre, { nombre, accountid: row.accountid, total_horas: 0, total_fs: 0, total_tickets: 0, dias: {} });
    }
    const cliente = clientesMap.get(nombre);
    const fecha = row.fecha || '';
    if (!cliente.dias[fecha]) {
      cliente.dias[fecha] = {
        fecha, dia_semana: new Date(fecha + 'T12:00:00').getDay(),
        horas: 0, fs_count: 0, tecnicos: new Set(), fs_list: [], tickets: 0
      };
    }
    const dia = cliente.dias[fecha];
    const h = parseFloat(row.horas) || 0;
    const tkts = parseInt(row.tickets) || 0;
    dia.horas += h;
    dia.fs_count += 1;
    dia.tickets += tkts;
    dia.tecnicos.add(`${row.first_name} ${row.last_name}`);
    const inicio = String(row.hora_inicio || '').substring(0, 5);
    const fin = String(row.hora_fin || '').substring(0, 5);
    const tktLabel = tkts > 0 ? ` 🎫${tkts}` : '';
    const hrs = Math.floor(Math.abs(h));
    const mins = Math.round((Math.abs(h) - hrs) * 60);
    const hhmm = (h < 0 ? '-' : '') + hrs + ':' + String(mins).padStart(2, '0');
    dia.fs_list.push(`${row.fs_numero || 'FS'} | ${row.first_name} ${row.last_name} | ${inicio}-${fin} (${hhmm}${tktLabel})`);
    cliente.total_horas += h;
    cliente.total_fs += 1;
    cliente.total_tickets += tkts;
  }

  const clientes = [];
  for (const [, cliente] of clientesMap) {
    const diasArray = {};
    for (const [fecha, dia] of Object.entries(cliente.dias)) {
      diasArray[fecha] = {
        fecha: dia.fecha, dia_semana: dia.dia_semana,
        horas: Math.round(dia.horas * 100) / 100,
        fs_count: dia.fs_count, tickets: dia.tickets,
        tecnicos: dia.tecnicos.size, fs_list: dia.fs_list
      };
    }
    clientes.push({
      nombre: cliente.nombre, accountid: cliente.accountid,
      total_horas: Math.round(cliente.total_horas * 100) / 100,
      total_fs: cliente.total_fs, total_tickets: cliente.total_tickets,
      dias_visitados: Object.keys(cliente.dias).length,
      dias: diasArray
    });
  }
  clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return clientes;
}

async function getFsNegativos(date) {
  const d = date || new Date().toISOString().split('T')[0];
  const [rows] = await pool.query(`
    SELECT
      u.first_name, u.last_name,
      sc.subject as fs_name,
      sc.contract_no as fs_numero,
      a.accountname as cliente,
      TIME(scf.cf_932) as hora_inicio,
      TIME(scf.cf_934) as hora_fin,
      TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas
    ${FS_FROM}${FS_ACCOUNT}
    ${FS_WHERE}
    HAVING horas < 0
    ORDER BY u.last_name, u.first_name, scf.cf_932
  `, [d]);
  return rows;
}

async function getFsNegativosMensual(year, month) {
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const firstDay = `${y}-${m}-01`;
  const lastDay = new Date(y, parseInt(m), 0).toISOString().split('T')[0];
  const [rows] = await pool.query(`
    SELECT
      u.first_name, u.last_name,
      sc.servicecontractsid,
      sc.subject as fs_name,
      sc.contract_no as fs_numero,
      a.accountname as cliente,
      TIME(scf.cf_932) as hora_inicio,
      TIME(scf.cf_934) as hora_fin,
      TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas,
      scf.cf_960 as fs_fecha
    ${FS_FROM}${FS_ACCOUNT}
    WHERE scf.cf_960 BETWEEN ? AND ?
      AND scf.cf_932 IS NOT NULL
      AND scf.cf_934 IS NOT NULL
      AND u.deleted = 0
      AND u.id NOT IN ${EXCLUDED_USERS}
    HAVING horas < 0
    ORDER BY scf.cf_960, u.last_name, u.first_name, scf.cf_932
  `, [firstDay, lastDay]);
  return rows;
}

async function getTareasPendientes(year, month) {
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const [rows] = await pool.query(`
    SELECT
      t.projecttaskid, t.projecttask_no as task_no,
      t.projecttaskname as task_name, t.projecttaskstatus as status,
      tf.cf_1134 as solucion, p.projectname,
      p.project_no as project_no, cr.createdtime as created_date,
      CONCAT(u.first_name, ' ', u.last_name) as assigned_user
    FROM vtiger_projecttask t
    JOIN vtiger_crmentity cr ON t.projecttaskid = cr.crmid AND cr.deleted = 0
    LEFT JOIN vtiger_projecttaskcf tf ON t.projecttaskid = tf.projecttaskid
    LEFT JOIN vtiger_project p ON t.projectid = p.projectid
    LEFT JOIN vtiger_users u ON cr.smownerid = u.id
    WHERE t.projecttaskstatus IN ('Completed', 'Cerrada')
      AND (tf.cf_1134 IS NULL OR tf.cf_1134 = '')
      AND MONTH(cr.createdtime) = ?
      AND YEAR(cr.createdtime) = ?
    ORDER BY cr.createdtime DESC
  `, [parseInt(m), parseInt(y)]);
  return rows;
}

async function getTicketsPendientes(year, month) {
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const [rows] = await pool.query(`
    SELECT
      tk.ticketid, tk.ticket_no, tk.title, tk.status,
      tk.solution, a.accountname as cliente,
      cr.createdtime as created_date,
      CONCAT(u.first_name, ' ', u.last_name) as assigned_user
    FROM vtiger_troubletickets tk
    JOIN vtiger_crmentity cr ON tk.ticketid = cr.crmid AND cr.deleted = 0
    LEFT JOIN vtiger_account a ON tk.parent_id = a.accountid
    LEFT JOIN vtiger_users u ON cr.smownerid = u.id
    WHERE tk.status IN ('Closed', 'Cerrado/Para Entregar', 'Resuelto')
      AND (tk.solution IS NULL OR tk.solution = '')
      AND MONTH(cr.createdtime) = ?
      AND YEAR(cr.createdtime) = ?
    ORDER BY cr.createdtime DESC
  `, [parseInt(m), parseInt(y)]);
  return rows;
}

async function getKpiMensual(year, month) {
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const firstDay = `${y}-${m}-01`;
  const lastDay = new Date(y, parseInt(m), 0).toISOString().split('T')[0];

  const [fsRows] = await pool.query(`
    SELECT
      u.id as user_id, CONCAT(u.first_name, ' ', u.last_name) as nombre,
      sc.servicecontractsid as fs_id, sc.contract_no, sc.subject,
      a.accountname as cliente, sc.sc_related_to,
      DATE_FORMAT(scf.cf_960, '%Y-%m-%d') as fecha,
      TIME(scf.cf_932) as hora_inicio, TIME(scf.cf_934) as hora_fin,
      TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas,
      COALESCE(scf.cf_1211, 0) as viaje_ida, COALESCE(scf.cf_1213, 0) as viaje_vuelta,
      scf.cf_922 as tipo_servicio, scf.cf_930 as codigo_tipo, scf.cf_958 as abonado_tipo,
      CASE
        WHEN scf.cf_1046 = 1 THEN 'Ausente con Justificación'
        WHEN scf.cf_1048 = 1 THEN 'Ausente sin aviso'
        WHEN scf.cf_1050 = 1 THEN 'Ausente autorizado'
        WHEN scf.cf_1052 = 1 THEN 'Llegada tarde autorizada'
        WHEN scf.cf_1054 = 1 THEN 'Llegada tarde injustificada'
        WHEN scf.cf_1227 = 1 THEN 'Licencia médica'
        ELSE ''
      END as ausencia_tipo,
      CASE
        WHEN scf.cf_922 LIKE 'Remoto%' OR scf.cf_922 LIKE '%IT Remoto%' THEN 'Remoto'
        WHEN scf.cf_922 LIKE 'Local%' OR scf.cf_922 LIKE '%IT Local%' OR scf.cf_922 IN ('Laboratorio Tecnico', 'Cadeteria') THEN 'Presencial'
        ELSE 'Otro'
      END as modalidad
    FROM vtiger_servicecontracts sc
    JOIN vtiger_crmentity e ON sc.servicecontractsid = e.crmid AND e.deleted = 0
    JOIN vtiger_users u ON e.smownerid = u.id AND u.deleted = 0
    LEFT JOIN vtiger_servicecontractscf scf ON sc.servicecontractsid = scf.servicecontractsid
    LEFT JOIN vtiger_account a ON sc.sc_related_to = a.accountid
    WHERE scf.cf_960 BETWEEN ? AND ?
      AND scf.cf_932 IS NOT NULL AND scf.cf_934 IS NOT NULL
      AND u.id NOT IN ${EXCLUDED_USERS}
    ORDER BY u.last_name, u.first_name, scf.cf_960, scf.cf_932
  `, [firstDay, lastDay]);

  const [relRows] = await pool.query(`
    SELECT fs_id FROM (
      SELECT crmid as fs_id FROM vtiger_crmentityrel
      WHERE module = 'ServiceContracts' AND relmodule IN ('HelpDesk', 'ProjectTask')
      UNION
      SELECT relcrmid as fs_id FROM vtiger_crmentityrel
      WHERE relmodule = 'ServiceContracts' AND module IN ('HelpDesk', 'ProjectTask')
    ) t GROUP BY fs_id
  `);
  const relatedIds = new Set(relRows.map(r => r.fs_id));

  const [tareasRows] = await pool.query(`
    SELECT cr.smownerid as user_id, CONCAT(u.first_name, ' ', u.last_name) as nombre,
      COUNT(*) as total,
      SUM(CASE WHEN (tf.cf_1134 IS NULL OR tf.cf_1134 = '') THEN 1 ELSE 0 END) as sin_solucion
    FROM vtiger_projecttask t
    JOIN vtiger_crmentity cr ON t.projecttaskid = cr.crmid AND cr.deleted = 0
    JOIN vtiger_users u ON cr.smownerid = u.id AND u.deleted = 0
    LEFT JOIN vtiger_projecttaskcf tf ON t.projecttaskid = tf.projecttaskid
    WHERE t.projecttaskstatus IN ('Completed', 'Cerrada')
      AND DATE_FORMAT(cr.createdtime, '%Y-%m') = ?
      AND u.id NOT IN ${EXCLUDED_USERS}
    GROUP BY cr.smownerid
  `, [`${y}-${m}`]);

  const [ticketsRows] = await pool.query(`
    SELECT cr.smownerid as user_id, CONCAT(u.first_name, ' ', u.last_name) as nombre,
      COUNT(*) as total,
      SUM(CASE WHEN (tk.solution IS NULL OR tk.solution = '') THEN 1 ELSE 0 END) as sin_solucion
    FROM vtiger_troubletickets tk
    JOIN vtiger_crmentity cr ON tk.ticketid = cr.crmid AND cr.deleted = 0
    JOIN vtiger_users u ON cr.smownerid = u.id AND u.deleted = 0
    WHERE tk.status IN ('Closed', 'Cerrado/Para Entregar', 'Resuelto')
      AND DATE_FORMAT(cr.createdtime, '%Y-%m') = ?
      AND u.id NOT IN ${EXCLUDED_USERS}
    GROUP BY cr.smownerid
  `, [`${y}-${m}`]);

  const [ticketsAbiertos] = await pool.query(`
    SELECT tk.ticketid, tk.ticket_no, tk.title, tk.status, tk.priority,
      a.accountname as cliente, CONCAT(u.first_name, ' ', u.last_name) as assigned_user,
      cr.createdtime, DATEDIFF(NOW(), cr.createdtime) as dias_abierto
    FROM vtiger_troubletickets tk
    JOIN vtiger_crmentity cr ON tk.ticketid = cr.crmid AND cr.deleted = 0
    LEFT JOIN vtiger_account a ON tk.parent_id = a.accountid
    LEFT JOIN vtiger_users u ON cr.smownerid = u.id
    WHERE tk.status NOT IN ('Closed', 'Cerrado/Para Entregar', 'Resuelto')
      AND cr.smownerid NOT IN ${EXCLUDED_USERS}
    ORDER BY cr.createdtime ASC
  `);

  const [tareasSinSolucion] = await pool.query(`
    SELECT t.projecttaskid, t.projecttask_no, t.projecttaskname, t.projecttaskstatus,
      p.projectname, CONCAT(u.first_name, ' ', u.last_name) as assigned_user, cr.createdtime
    FROM vtiger_projecttask t
    JOIN vtiger_crmentity cr ON t.projecttaskid = cr.crmid AND cr.deleted = 0
    LEFT JOIN vtiger_projecttaskcf tf ON t.projecttaskid = tf.projecttaskid
    LEFT JOIN vtiger_project p ON t.projectid = p.projectid
    LEFT JOIN vtiger_users u ON cr.smownerid = u.id
    WHERE t.projecttaskstatus IN ('Completed', 'Cerrada')
      AND (tf.cf_1134 IS NULL OR tf.cf_1134 = '')
      AND DATE_FORMAT(cr.createdtime, '%Y-%m') = ?
      AND u.id NOT IN ${EXCLUDED_USERS}
    ORDER BY cr.createdtime DESC
  `, [`${y}-${m}`]);

  const [ticketsSinSolucion] = await pool.query(`
    SELECT tk.ticketid, tk.ticket_no, tk.title, tk.status,
      a.accountname as cliente, CONCAT(u.first_name, ' ', u.last_name) as assigned_user, cr.createdtime
    FROM vtiger_troubletickets tk
    JOIN vtiger_crmentity cr ON tk.ticketid = cr.crmid AND cr.deleted = 0
    LEFT JOIN vtiger_account a ON tk.parent_id = a.accountid
    LEFT JOIN vtiger_users u ON cr.smownerid = u.id
    WHERE tk.status IN ('Closed', 'Cerrado/Para Entregar', 'Resuelto')
      AND (tk.solution IS NULL OR tk.solution = '')
      AND DATE_FORMAT(cr.createdtime, '%Y-%m') = ?
      AND u.id NOT IN ${EXCLUDED_USERS}
    ORDER BY cr.createdtime DESC
  `, [`${y}-${m}`]);

  const nextMonth = parseInt(m) + 1 > 12 ? 1 : parseInt(m) + 1;
  const nextYear = nextMonth === 1 ? parseInt(y) + 1 : parseInt(y);
  const nextFirstDay = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  const nextLastDay = new Date(nextYear, nextMonth, 0).toISOString().split('T')[0];

  const [proximosFS] = await pool.query(`
    SELECT sc.servicecontractsid, sc.contract_no, sc.subject,
      a.accountname as cliente, DATE_FORMAT(scf.cf_960, '%Y-%m-%d') as fecha,
      CONCAT(u.first_name, ' ', u.last_name) as assigned_user,
      CASE
        WHEN scf.cf_922 LIKE 'Remoto%' THEN 'Remoto'
        WHEN scf.cf_922 LIKE 'Local%' OR scf.cf_922 IN ('Laboratorio Tecnico', 'Cadeteria') THEN 'Presencial'
        ELSE 'Otro'
      END as modalidad
    FROM vtiger_servicecontracts sc
    JOIN vtiger_crmentity e ON sc.servicecontractsid = e.crmid AND e.deleted = 0
    JOIN vtiger_users u ON e.smownerid = u.id AND u.deleted = 0
    LEFT JOIN vtiger_servicecontractscf scf ON sc.servicecontractsid = scf.servicecontractsid
    LEFT JOIN vtiger_account a ON sc.sc_related_to = a.accountid
    WHERE scf.cf_960 BETWEEN ? AND ?
      AND u.id NOT IN ${EXCLUDED_USERS}
      AND sc.sc_related_to != 2
    ORDER BY scf.cf_960
    LIMIT 50
  `, [nextFirstDay, nextLastDay]);

  const tecMap = new Map();
  for (const fs of fsRows) {
    const key = fs.nombre;
    if (!tecMap.has(key)) {
      tecMap.set(key, {
        user_id: fs.user_id, nombre: fs.nombre, horas_totales: 0,
        dias_trabajados: new Set(), fs_total: 0,
        fs_presenciales: 0, fs_remotos: 0, fs_otros: 0,
        viaje_total: 0, ausencias: [], demoras: [], fs_list: []
      });
    }
    const t = tecMap.get(key);
    t.horas_totales += parseFloat(fs.horas) || 0;
    if (fs.fecha) t.dias_trabajados.add(fs.fecha.substring(0, 10));
    t.fs_total++;
    if (fs.modalidad === 'Presencial') t.fs_presenciales++;
    else if (fs.modalidad === 'Remoto') t.fs_remotos++;
    else t.fs_otros++;
    t.viaje_total += (fs.viaje_ida || 0) + (fs.viaje_vuelta || 0);
    if (fs.ausencia_tipo) {
      if (fs.ausencia_tipo.includes('Llegada tarde')) {
        t.demoras.push({ fecha: fs.fecha, tipo: fs.ausencia_tipo, fs: fs.contract_no });
      } else {
        t.ausencias.push({ fecha: fs.fecha, tipo: fs.ausencia_tipo, fs: fs.contract_no });
      }
    }
    const sinTicket = !relatedIds.has(fs.fs_id) && fs.sc_related_to !== 2;
    t.fs_list.push({
      fs_id: fs.fs_id, contract_no: fs.contract_no, subject: fs.subject,
      cliente: fs.cliente || 'STI', fecha: fs.fecha,
      hora_inicio: fs.hora_inicio, hora_fin: fs.hora_fin,
      horas: fs.horas, modalidad: fs.modalidad,
      tipo_servicio: fs.tipo_servicio, sin_asociar: sinTicket
    });
  }

  const tareasMap = new Map();
  for (const r of tareasRows) tareasMap.set(r.user_id, r);
  const ticketsMap = new Map();
  for (const r of ticketsRows) ticketsMap.set(r.user_id, r);

  const tecnicos = [];
  for (const [, t] of tecMap) {
    const tareas = tareasMap.get(t.user_id);
    const tickets = ticketsMap.get(t.user_id);
    tecnicos.push({
      ...t, dias_trabajados: t.dias_trabajados.size,
      horas_totales: Math.round(t.horas_totales * 100) / 100,
      viaje_total_hms: t.viaje_total > 0
        ? `${Math.floor(t.viaje_total / 60)}:${String(t.viaje_total % 60).padStart(2, '0')}`
        : '0:00',
      tareas_completadas: tareas ? parseInt(tareas.total) : 0,
      tareas_sin_solucion: tareas ? parseInt(tareas.sin_solucion) : 0,
      tickets_resueltos: tickets ? parseInt(tickets.total) : 0,
      tickets_sin_solucion: tickets ? parseInt(tickets.sin_solucion) : 0
    });
  }
  tecnicos.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const mantenimientosSinAsociar = fsRows.filter(fs =>
    !relatedIds.has(fs.fs_id) && fs.sc_related_to !== 2
  ).map(fs => ({
    fs_id: fs.fs_id, contract_no: fs.contract_no, subject: fs.subject,
    cliente: fs.cliente || 'STI', fecha: fs.fecha, tecnico: fs.nombre,
    modalidad: fs.modalidad, horas: fs.horas, motivo: 'Sin ticket ni tarea asociada'
  }));

  const urgentes24h = ticketsAbiertos.filter(t => t.priority === 'Urgent' && t.dias_abierto >= 1);
  const alta7d = ticketsAbiertos.filter(t => t.priority === 'High' && t.dias_abierto >= 7);
  const baja30d = ticketsAbiertos.filter(t => (t.priority === 'Low' || t.priority === '') && t.dias_abierto >= 30);

  return {
    periodo: { year: parseInt(y), month: parseInt(m) },
    mes_nombre: new Date(y, m - 1, 1).toLocaleString('es', { month: 'long', year: 'numeric' }),
    tecnicos,
    mantenimientos_pendientes: {
      total_sin_asociar: mantenimientosSinAsociar.length,
      presenciales: mantenimientosSinAsociar.filter(m => m.modalidad === 'Presencial'),
      remotos: mantenimientosSinAsociar.filter(m => m.modalidad === 'Remoto'),
      otros: mantenimientosSinAsociar.filter(m => m.modalidad === 'Otro')
    },
    kpi_tickets: {
      totales_abiertos: ticketsAbiertos.length,
      urgentes_mas_24h: {
        cantidad: urgentes24h.length,
        detalle: urgentes24h.map(t => ({
          ticketid: t.ticketid, ticket_no: t.ticket_no, title: t.title, cliente: t.cliente,
          asignado: t.assigned_user, dias_abierto: t.dias_abierto
        }))
      },
      alta_mas_7d: {
        cantidad: alta7d.length,
        detalle: alta7d.map(t => ({
          ticketid: t.ticketid, ticket_no: t.ticket_no, title: t.title, cliente: t.cliente,
          asignado: t.assigned_user, dias_abierto: t.dias_abierto
        }))
      },
      baja_mas_30d: {
        cantidad: baja30d.length,
        detalle: baja30d.map(t => ({
          ticketid: t.ticketid, ticket_no: t.ticket_no, title: t.title, cliente: t.cliente,
          asignado: t.assigned_user, dias_abierto: t.dias_abierto
        }))
      }
    },
    tareas_sin_solucion: tareasSinSolucion,
    tickets_sin_solucion: ticketsSinSolucion,
    proximos_mantenimientos: proximosFS
  };
}

module.exports = {
  getHoras, getFsDetalle, getHorasReales, getHorasMensual,
  getFsSinAsociar, getFsSinAsociarMensual, getHorasMensualDetalle,
  getFsNegativos, getFsNegativosMensual,
  getTareasPendientes, getTicketsPendientes, getKpiMensual
};
