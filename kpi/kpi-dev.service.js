const pool = require('../src/db/crm');

const EXCLUDED_USERS = '(5, 6, 7, 72)';

const MODALIDAD_CASE = `
  CASE
    WHEN scf.cf_922 LIKE 'Remoto%' OR scf.cf_922 LIKE '%IT Remoto%' THEN 'Remoto'
    WHEN scf.cf_922 LIKE 'Local%' OR scf.cf_922 LIKE '%IT Local%' OR scf.cf_922 IN ('Laboratorio Tecnico', 'Cadeteria') THEN 'Presencial'
    ELSE 'Otro'
  END
`;

function buildFSConditions(unidadNegocio, tipoSoporte) {
  const conds = [];
  if (unidadNegocio && unidadNegocio !== 'Todas') conds.push('scf.cf_1026 = ?');
  if (tipoSoporte && tipoSoporte !== 'Todos') conds.push('scf.cf_922 = ?');
  return conds.join(' AND ');
}

function buildFSConditionsParams(unidadNegocio, tipoSoporte) {
  const params = [];
  if (unidadNegocio && unidadNegocio !== 'Todas') params.push(unidadNegocio);
  if (tipoSoporte && tipoSoporte !== 'Todos') params.push(tipoSoporte);
  return params;
}

async function getFiltrosDev() {
  const [unidades] = await pool.query(`
    SELECT DISTINCT scf.cf_1026 as valor FROM vtiger_servicecontractscf scf
    WHERE scf.cf_1026 IS NOT NULL AND scf.cf_1026 != ''
    ORDER BY scf.cf_1026
  `);
  const [soportes] = await pool.query(`
    SELECT DISTINCT scf.cf_922 as valor FROM vtiger_servicecontractscf scf
    WHERE scf.cf_922 IS NOT NULL AND scf.cf_922 != ''
    ORDER BY scf.cf_922
  `);
  return {
    unidades_negocio: unidades.map(r => r.valor),
    tipos_soporte: soportes.map(r => r.valor)
  };
}

async function getTiempoPorCliente(year, month, unidadNegocio, tipoSoporte) {
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const firstDay = `${y}-${m}-01`;
  const lastDay = new Date(y, parseInt(m), 0).toISOString().split('T')[0];

  const filtro = buildFSConditions(unidadNegocio, tipoSoporte);

  const [rows] = await pool.query(`
    SELECT
      u.id as user_id,
      CONCAT(u.first_name, ' ', u.last_name) as nombre,
      COALESCE(a.accountname, 'STI') as cliente,
      TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas,
      COALESCE(scf.cf_1211, 0) as viaje_ida,
      COALESCE(scf.cf_1213, 0) as viaje_vuelta,
      ${MODALIDAD_CASE} as modalidad
    FROM vtiger_servicecontracts sc
    JOIN vtiger_crmentity e ON sc.servicecontractsid = e.crmid AND e.deleted = 0
    JOIN vtiger_users u ON e.smownerid = u.id AND u.deleted = 0
    LEFT JOIN vtiger_servicecontractscf scf ON sc.servicecontractsid = scf.servicecontractsid
    LEFT JOIN vtiger_account a ON sc.sc_related_to = a.accountid
    WHERE scf.cf_960 BETWEEN ? AND ?
      AND scf.cf_932 IS NOT NULL AND scf.cf_934 IS NOT NULL
      AND u.id NOT IN ${EXCLUDED_USERS}
      ${filtro ? `AND ${filtro}` : ''}
    ORDER BY u.last_name, u.first_name, a.accountname, scf.cf_932
  `, [firstDay, lastDay, ...buildFSConditionsParams(unidadNegocio, tipoSoporte)]);

  const techMap = new Map();
  for (const row of rows) {
    const key = row.nombre;
    if (!techMap.has(key)) {
      techMap.set(key, { user_id: row.user_id, nombre: row.nombre, clientes: new Map() });
    }
    const tm = techMap.get(key);
    if (!tm.clientes.has(row.cliente)) {
      tm.clientes.set(row.cliente, { horas: 0, viaje_min: 0, fs_count: 0, horas_presencial: 0, horas_remoto: 0, horas_otro: 0 });
    }
    const c = tm.clientes.get(row.cliente);
    const h = parseFloat(row.horas) || 0;
    c.horas += h;
    c.viaje_min += (parseInt(row.viaje_ida) || 0) + (parseInt(row.viaje_vuelta) || 0);
    c.fs_count++;
    if (row.modalidad === 'Presencial') c.horas_presencial += h;
    else if (row.modalidad === 'Remoto') c.horas_remoto += h;
    else c.horas_otro += h;
  }

  const result = [];
  for (const [, tm] of techMap) {
    const clientes = [];
    let totalHoras = 0;
    let totalViajeMin = 0;
    for (const [cliente, c] of tm.clientes) {
      totalHoras += c.horas;
      totalViajeMin += c.viaje_min;
      clientes.push({
        cliente,
        horas: Math.round(c.horas * 100) / 100,
        viaje_min: c.viaje_min,
        fs_count: c.fs_count,
        horas_presencial: Math.round(c.horas_presencial * 100) / 100,
        horas_remoto: Math.round(c.horas_remoto * 100) / 100,
        horas_otro: Math.round(c.horas_otro * 100) / 100
      });
    }
    clientes.sort((a, b) => b.horas - a.horas);
    result.push({
      user_id: tm.user_id,
      nombre: tm.nombre,
      total_horas: Math.round(totalHoras * 100) / 100,
      total_viaje_min: totalViajeMin,
      clientes
    });
  }
  result.sort((a, b) => a.nombre.localeCompare(b.nombre));

  return result;
}

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

async function getMantenimientosPendientes(year, month) {
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const mesNombre = MESES_ES[parseInt(m) - 1];

  const [rows] = await pool.query(`
    SELECT
      p.projectid, p.project_no, p.projectname, p.projectstatus, p.progress,
      CAST(p.linktoaccountscontacts AS UNSIGNED) as accountid,
      a.accountname as cliente,
      pf.cf_1253 as modalidad,
      DATE_FORMAT(p.startdate, '%Y-%m-%d') as startdate,
      DATE_FORMAT(p.targetenddate, '%Y-%m-%d') as targetenddate
    FROM vtiger_project p
    JOIN vtiger_crmentity e ON p.projectid = e.crmid AND e.deleted = 0
    LEFT JOIN vtiger_projectcf pf ON p.projectid = pf.projectid
    LEFT JOIN vtiger_account a ON a.accountid = CAST(p.linktoaccountscontacts AS UNSIGNED)
    WHERE p.projecttype = 'Mantenimiento'
      AND LOWER(pf.cf_1255) = ?
      AND pf.cf_1090 = ?
      AND p.projectstatus NOT IN ('completed', 'archived', 'Cancelado')
    ORDER BY a.accountname, p.projectname
  `, [mesNombre, String(y)]);

  return rows.map(r => ({
    projectid: r.projectid,
    project_no: r.project_no,
    projectname: r.projectname,
    projectstatus: r.projectstatus,
    progress: r.progress,
    cliente: r.cliente || 'STI',
    modalidad: r.modalidad || 'Presencial',
    startdate: r.startdate,
    targetenddate: r.targetenddate
  }));
}

async function getProyectosActivosPorTipo(tipos) {
  if (!tipos.length) return [];
  const placeholders = tipos.map(() => '?').join(',');
  const [rows] = await pool.query(`
    SELECT
      p.projectid, p.project_no, p.projectname, p.projecttype, p.projectstatus, p.progress,
      CAST(p.linktoaccountscontacts AS UNSIGNED) as accountid,
      a.accountname as cliente,
      pf.cf_1253 as modalidad,
      DATE_FORMAT(p.startdate, '%Y-%m-%d') as startdate,
      DATE_FORMAT(p.targetenddate, '%Y-%m-%d') as targetenddate
    FROM vtiger_project p
    JOIN vtiger_crmentity e ON p.projectid = e.crmid AND e.deleted = 0
    LEFT JOIN vtiger_projectcf pf ON p.projectid = pf.projectid
    LEFT JOIN vtiger_account a ON a.accountid = CAST(p.linktoaccountscontacts AS UNSIGNED)
    WHERE p.projecttype IN (${placeholders})
      AND p.projectstatus NOT IN ('completed', 'archived', 'Cancelado')
    ORDER BY p.projecttype, a.accountname, p.projectname
  `, tipos);

  return rows.map(r => ({
    projectid: r.projectid,
    project_no: r.project_no,
    projectname: r.projectname,
    projecttype: r.projecttype,
    projectstatus: r.projectstatus,
    progress: r.progress,
    cliente: r.cliente || 'STI',
    modalidad: r.modalidad || 'Presencial',
    startdate: r.startdate,
    targetenddate: r.targetenddate
  }));
}

async function getKpiMensualDev(year, month, unidadNegocio, tipoSoporte) {
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const firstDay = `${y}-${m}-01`;
  const lastDay = new Date(y, parseInt(m), 0).toISOString().split('T')[0];

  const filtroFS = buildFSConditions(unidadNegocio, tipoSoporte);

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
      scf.cf_1026 as unidad_negocio,
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
      ${filtroFS ? `AND ${filtroFS}` : ''}
    ORDER BY u.last_name, u.first_name, scf.cf_960, scf.cf_932
  `, [firstDay, lastDay, ...buildFSConditionsParams(unidadNegocio, tipoSoporte)]);

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

  const [ticketsCreadosRows] = await pool.query(`
    SELECT cr.smownerid as user_id, CONCAT(u.first_name, ' ', u.last_name) as nombre,
      COUNT(*) as total
    FROM vtiger_troubletickets tk
    JOIN vtiger_crmentity cr ON tk.ticketid = cr.crmid AND cr.deleted = 0
    JOIN vtiger_users u ON cr.smownerid = u.id AND u.deleted = 0
    WHERE DATE_FORMAT(cr.createdtime, '%Y-%m') = ?
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
    SELECT tk.ticketid, tk.ticket_no, tk.title, tk.status, tk.priority,
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

  const proximosMantenimientos = await getMantenimientosPendientes(nextYear, String(nextMonth).padStart(2, '0'));

  const tecMap = new Map();
  for (const fs of fsRows) {
    const key = fs.nombre;
    if (!tecMap.has(key)) {
      tecMap.set(key, {
        user_id: fs.user_id, nombre: fs.nombre, horas_totales: 0,
        dias_trabajados: new Set(), fs_total: 0,
        fs_presenciales: 0, fs_remotos: 0, fs_otros: 0,
        viaje_total: 0, ausencias: [], demoras: [], fs_list: [],
        horas_por_dia: {}, dias_con_incidencia: new Set()
      });
    }
    const t = tecMap.get(key);
    const horasVal = parseFloat(fs.horas) || 0;
    t.horas_totales += horasVal;
    if (fs.fecha) {
      const dateKey = fs.fecha.substring(0, 10);
      t.dias_trabajados.add(dateKey);
      t.horas_por_dia[dateKey] = (t.horas_por_dia[dateKey] || 0) + horasVal;
      if (fs.ausencia_tipo) t.dias_con_incidencia.add(dateKey);
    }
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
      tipo_servicio: fs.tipo_servicio, unidad_negocio: fs.unidad_negocio || '',
      sin_asociar: sinTicket
    });
  }

  const tareasMap = new Map();
  for (const r of tareasRows) tareasMap.set(r.user_id, r);
  const ticketsMap = new Map();
  for (const r of ticketsRows) ticketsMap.set(r.user_id, r);
  const ticketsCreadosMap = new Map();
  for (const r of ticketsCreadosRows) ticketsCreadosMap.set(r.user_id, r);

  const tecnicos = [];
  for (const [, t] of tecMap) {
    const tareas = tareasMap.get(t.user_id);
    const tickets = ticketsMap.get(t.user_id);
    const ticketsCreados = ticketsCreadosMap.get(t.user_id);
    const totalDias = t.dias_trabajados.size;
    const diasIncidencias = t.dias_con_incidencia.size;
    const diasSinIncidencias = totalDias - diasIncidencias;
    let horasSinIncidencias = 0;
    for (const [dateKey, hrs] of Object.entries(t.horas_por_dia)) {
      if (!t.dias_con_incidencia.has(dateKey)) horasSinIncidencias += hrs;
    }
    const promCon = totalDias > 0 ? t.horas_totales / totalDias : 0;
    const promSin = diasSinIncidencias > 0 ? horasSinIncidencias / diasSinIncidencias : 0;
    tecnicos.push({
      user_id: t.user_id, nombre: t.nombre,
      horas_totales: Math.round(t.horas_totales * 100) / 100,
      dias_trabajados: totalDias,
      dias_sin_incidencia: diasSinIncidencias,
      horas_sin_incidencia: Math.round(horasSinIncidencias * 100) / 100,
      promedio_diario: Math.round(promCon * 100) / 100,
      promedio_sin_incidencias: Math.round(promSin * 100) / 100,
      fs_total: t.fs_total,
      fs_presenciales: t.fs_presenciales, fs_remotos: t.fs_remotos, fs_otros: t.fs_otros,
      viaje_total: t.viaje_total, ausencias: t.ausencias, demoras: t.demoras, fs_list: t.fs_list,
      viaje_total_hms: t.viaje_total > 0
        ? `${Math.floor(t.viaje_total / 60)}:${String(t.viaje_total % 60).padStart(2, '0')}`
        : '0:00',
      tareas_completadas: tareas ? parseInt(tareas.total) : 0,
      tareas_sin_solucion: tareas ? parseInt(tareas.sin_solucion) : 0,
      tickets_creados: ticketsCreados ? parseInt(ticketsCreados.total) : 0,
      tickets_resueltos: tickets ? parseInt(tickets.total) : 0,
      tickets_sin_solucion: tickets ? parseInt(tickets.sin_solucion) : 0
    });
  }
  tecnicos.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const mantenimientosPendientes = await getMantenimientosPendientes(y, m);
  const pendPorEstado = mantenimientosPendientes.reduce((acc, p) => {
    acc[p.projectstatus] = (acc[p.projectstatus] || 0) + 1;
    return acc;
  }, {});

  const proyectosActivos = await getProyectosActivosPorTipo(['IT', 'Obras']);
  const activosPorTipo = proyectosActivos.reduce((acc, p) => {
    if (!acc[p.projecttype]) acc[p.projecttype] = [];
    acc[p.projecttype].push(p);
    return acc;
  }, {});

  const urgentes24h = ticketsAbiertos.filter(t => t.priority === 'Urgent' && t.dias_abierto >= 1);
  const alta7d = ticketsAbiertos.filter(t => t.priority === 'High' && t.dias_abierto >= 7);
  const baja30d = ticketsAbiertos.filter(t => (t.priority === 'Low' || t.priority === '') && t.dias_abierto >= 30);

  const desgloseUnidad = new Map();
  const desgloseSoporte = new Map();
  for (const fs of fsRows) {
    const un = fs.unidad_negocio || 'Sin definir';
    if (!desgloseUnidad.has(un)) desgloseUnidad.set(un, { fs: 0, horas: 0 });
    desgloseUnidad.get(un).fs++;
    desgloseUnidad.get(un).horas += parseFloat(fs.horas) || 0;
    const sop = fs.tipo_servicio || 'Sin definir';
    if (!desgloseSoporte.has(sop)) desgloseSoporte.set(sop, { fs: 0, horas: 0 });
    desgloseSoporte.get(sop).fs++;
    desgloseSoporte.get(sop).horas += parseFloat(fs.horas) || 0;
  }
  const desgloseUnidadArr = [...desgloseUnidad.entries()].map(([nombre, v]) => ({ nombre, fs: v.fs, horas: Math.round(v.horas * 100) / 100 })).sort((a, b) => b.fs - a.fs);
  const desgloseSoporteArr = [...desgloseSoporte.entries()].map(([nombre, v]) => ({ nombre, fs: v.fs, horas: Math.round(v.horas * 100) / 100 })).sort((a, b) => b.fs - a.fs);

  return {
    periodo: { year: parseInt(y), month: parseInt(m) },
    mes_nombre: new Date(y, m - 1, 1).toLocaleString('es', { month: 'long', year: 'numeric' }),
    filtros: {
      unidad_negocio: unidadNegocio || 'Todas',
      tipo_soporte: tipoSoporte || 'Todos'
    },
    desglose_unidad: desgloseUnidadArr,
    desglose_tipo_soporte: desgloseSoporteArr,
    tecnicos,
    mantenimientos_pendientes: {
      total: mantenimientosPendientes.length,
      proyectos: mantenimientosPendientes,
      por_estado: pendPorEstado
    },
    proyectos_activos: {
      src_it: activosPorTipo['IT'] || [],
      src_obras: activosPorTipo['Obras'] || []
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
    proximos_mantenimientos: proximosMantenimientos
  };
}

module.exports = { getKpiMensualDev, getTiempoPorCliente, getMantenimientosPendientes, getProyectosActivosPorTipo, getFiltrosDev };