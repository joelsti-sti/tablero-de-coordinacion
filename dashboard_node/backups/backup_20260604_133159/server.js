require('dotenv').config();
const express = require('express');
const pool = require('./db');

const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const EXCLUDED_USERS = '(5, 6, 7, 72)';

app.get('/', (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    html = html.replace('__VTIGER_URL__', process.env.VTIGER_URL || '');
    res.send(html);
});

app.use(express.static('public'));

app.get('/api/config', (req, res) => {
    res.json({ vtigerUrl: process.env.VTIGER_URL || '' });
});

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

const FS_FROM = `
    FROM vtiger_users u
    INNER JOIN vtiger_crmentity e ON u.id = e.smownerid AND e.deleted = 0
    INNER JOIN vtiger_servicecontracts sc ON e.crmid = sc.servicecontractsid
    INNER JOIN vtiger_servicecontractscf scf ON e.crmid = scf.servicecontractsid
`;

const FS_ACCOUNT = `
    LEFT JOIN vtiger_account a ON sc.sc_related_to = a.accountid
`;

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

app.get('/api/horas', async (req, res, next) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
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
        `, [date]);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

app.get('/api/fsdetalle', async (req, res, next) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
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
            ${FS_WHERE}
            ORDER BY u.last_name, u.first_name, scf.cf_932
        `, [date]);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

app.get('/api/horasreales', async (req, res, next) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
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
        `, [date]);

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

        res.json({ tecnicos: finalResults, horasSinCarga });
    } catch (err) {
        next(err);
    }
});

app.get('/api/horas-mensual', async (req, res, next) => {
    try {
        const year = req.query.year || new Date().getFullYear();
        const month = req.query.month || String(new Date().getMonth() + 1).padStart(2, '0');
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
        `, [`${year}-${month}`]);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

app.get('/api/fs-sin-asociar', async (req, res, next) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];

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
        `, [date]);

        const sinAsociar = rows.filter(row => {
            const id = row.fs_id || row.servicecontractsid;
            if (relatedIds.has(id)) return false;
            if (row.sc_related_to === 2) return false;
            return true;
        });
        res.json(sinAsociar);
    } catch (err) {
        next(err);
    }
});

app.get('/api/fs-sin-asociar-mensual', async (req, res, next) => {
    try {
        const year = req.query.year || new Date().getFullYear();
        const month = req.query.month || String(new Date().getMonth() + 1).padStart(2, '0');
        const firstDay = `${year}-${month}-01`;
        const lastDay = new Date(year, parseInt(month), 0).toISOString().split('T')[0];

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

        const sinAsociar = rows.filter(row => {
            const id = row.fs_id || row.servicecontractsid;
            if (relatedIds.has(id)) return false;
            if (row.sc_related_to === 2) return false;
            return true;
        });
        res.json(sinAsociar);
    } catch (err) {
        next(err);
    }
});

app.get('/api/horas-mensual-detalle', async (req, res, next) => {
    try {
        const year = req.query.year || new Date().getFullYear();
        const month = req.query.month || String(new Date().getMonth() + 1).padStart(2, '0');

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
                TIME_TO_SEC(TIMEDIFF(scf.cf_934, scf.cf_932)) / 3600 as horas
            ${FS_FROM}${FS_ACCOUNT}
            WHERE DATE_FORMAT(scf.cf_960, '%Y-%m') = ?
            AND scf.cf_932 IS NOT NULL
            AND scf.cf_934 IS NOT NULL
            AND u.deleted = 0
            AND u.id NOT IN ${EXCLUDED_USERS}
            ORDER BY a.accountname, fecha, scf.cf_932
        `, [`${year}-${month}`]);

        const clientesMap = new Map();

        for (const row of rows) {
            const nombre = row.cliente || 'Sin Cliente';
            if (!clientesMap.has(nombre)) {
                clientesMap.set(nombre, {
                    nombre,
                    accountid: row.accountid,
                    total_horas: 0,
                    total_fs: 0,
                    dias: {}
                });
            }
            const cliente = clientesMap.get(nombre);
            const fecha = row.fecha || '';

            if (!cliente.dias[fecha]) {
                cliente.dias[fecha] = {
                    fecha,
                    dia_semana: new Date(fecha + 'T12:00:00').getDay(),
                    horas: 0,
                    fs_count: 0,
                    tecnicos: new Set(),
                    fs_list: []
                };
            }
            const dia = cliente.dias[fecha];
            const h = parseFloat(row.horas) || 0;
            dia.horas += h;
            dia.fs_count += 1;
            dia.tecnicos.add(`${row.first_name} ${row.last_name}`);

            const inicio = String(row.hora_inicio || '').substring(0, 5);
            const fin = String(row.hora_fin || '').substring(0, 5);
            dia.fs_list.push(`${row.fs_numero || 'FS'} | ${row.first_name} ${row.last_name} | ${inicio}-${fin} (${h.toFixed(1)}h)`);

            cliente.total_horas += h;
            cliente.total_fs += 1;
        }

        const clientes = [];
        for (const [, cliente] of clientesMap) {
            const diasArray = {};
            for (const [fecha, dia] of Object.entries(cliente.dias)) {
                diasArray[fecha] = {
                    fecha: dia.fecha,
                    dia_semana: dia.dia_semana,
                    horas: Math.round(dia.horas * 100) / 100,
                    fs_count: dia.fs_count,
                    tecnicos: dia.tecnicos.size,
                    fs_list: dia.fs_list
                };
            }
            clientes.push({
                nombre: cliente.nombre,
                accountid: cliente.accountid,
                total_horas: Math.round(cliente.total_horas * 100) / 100,
                total_fs: cliente.total_fs,
                dias_visitados: Object.keys(cliente.dias).length,
                dias: diasArray
            });
        }

        clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
        res.json(clientes);
    } catch (err) {
        next(err);
    }
});

app.get('/api/fs-negativos', async (req, res, next) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
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
        `, [date]);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

app.get('/api/fs-negativos-mensual', async (req, res, next) => {
    try {
        const year = req.query.year || new Date().getFullYear();
        const month = req.query.month || String(new Date().getMonth() + 1).padStart(2, '0');
        const firstDay = `${year}-${month}-01`;
        const lastDay = new Date(year, parseInt(month), 0).toISOString().split('T')[0];
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
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
});

// ---------------------------------------------------------------
// Tareas: cerradas sin solución escrita, filtradas por mes
// ---------------------------------------------------------------
app.get('/api/tareas-pendientes', async (req, res, next) => {
    try {
        const now = new Date();
        const year = req.query.year || now.getFullYear();
        const month = req.query.month || String(now.getMonth() + 1).padStart(2, '0');
        const [rows] = await pool.query(`
            SELECT
                t.projecttaskid,
                t.projecttask_no as task_no,
                t.projecttaskname as task_name,
                t.projecttaskstatus as status,
                tf.cf_1134 as solucion,
                p.projectname,
                cr.createdtime as created_date,
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
        `, [parseInt(month), parseInt(year)]);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------
// Tickets: cerrados sin solución escrita, filtrados por mes
// ---------------------------------------------------------------
app.get('/api/tickets-pendientes', async (req, res, next) => {
    try {
        const now = new Date();
        const year = req.query.year || now.getFullYear();
        const month = req.query.month || String(now.getMonth() + 1).padStart(2, '0');
        const [rows] = await pool.query(`
            SELECT
                tk.ticketid,
                tk.ticket_no,
                tk.title,
                tk.status,
                tk.solution,
                a.accountname as cliente,
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
        `, [parseInt(month), parseInt(year)]);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

app.listen(port, () => console.log(`Servidor listo en puerto ${port}`));
