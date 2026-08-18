require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { PORT } = require('./src/config');
const { getCrmComputers, getCrmContracts, getAbonados } = require('./src/services/crm.service');
const { loadOcsCache, getOcsComputers, getCacheStatus } = require('./src/services/ocs.service');
const { getEsetComputers, loadEsetCache, getEsetCacheStatus, getAllEsetDevices } = require('./src/services/eset.service');
const { matchDevices } = require('./src/utils/matcher');
const {
  getHoras, getFsDetalle, getHorasReales, getHorasMensual,
  getFsSinAsociar, getFsSinAsociarMensual, getHorasMensualDetalle,
  getFsNegativos, getFsNegativosMensual,
  getTareasPendientes, getTicketsPendientes, getKpiMensual,
  getFsSinAsociarFull, getTecnicosMenor6Horas
} = require('./src/services/horas.service');
const {
  getComputers, getComputersCross, getWorkgroups,
  getSummary, getServiceRecords
} = require('./src/services/ocs-pg.service');

const app = express();

app.use(cors());
app.use(express.json());

let clientesFile = [];
try {
  const data = fs.readFileSync(path.join(__dirname, 'clientes.json'), 'utf-8');
  clientesFile = JSON.parse(data);
} catch (error) {
  console.error('[ERROR CRÍTICO] Fallo al leer clientes.json. Verifica que el formato sea correcto.');
  console.error(error.message);
  process.exit(1);
}
let clientes = [...clientesFile];
let clientesLastUpdate = null;

async function refreshClientes() {
  try {
    const abonados = await getAbonados();
    const mapa = new Map();
    for (const c of clientesFile) {
      const key = c.empresa.toLowerCase().replace(/[\s\/]+/g, ' ').replace(/\s+/g, ' ').trim();
      mapa.set(key, c);
      if (c.empresa.includes('/')) {
        for (const part of c.empresa.split('/').map(p => p.trim().toLowerCase()).filter(Boolean)) {
          if (part.length >= 3) mapa.set(part, c);
        }
      }
      const base = c.empresa.replace(/\s*[\(\[].*$/, '').trim().toLowerCase();
      if (base.length >= 3 && base !== key) mapa.set(base, c);
    }

    const merged = [];
    const usados = new Set();

    for (const ab of abonados) {
      const nombre = ab.accountname;
      if (!nombre) continue;
      const key = nombre.toLowerCase().replace(/\s+/g, ' ').trim();
      let found = mapa.get(key);

      if (!found) {
        for (const part of key.split(/\s*[-\/]\s*/)) {
          const trimmed = part.trim();
          if (trimmed.length >= 3 && mapa.has(trimmed)) {
            found = mapa.get(trimmed);
            break;
          }
        }
      }

      if (!found) {
        for (const [k, v] of mapa) {
          if (key.startsWith(k) || k.startsWith(key)) { found = v; break; }
        }
      }

      if (found) {
        if (!usados.has(found.empresa)) {
          merged.push({ ...found, accountid: ab.accountid });
          usados.add(found.empresa);
        }
      } else {
        merged.push({
          empresa: nombre,
          email_eset: null,
          password_eset: null,
          tag_ocs: null,
          sheets: null,
          accountid: ab.accountid,
        });
      }
    }

    for (const c of clientesFile) {
      if (!usados.has(c.empresa)) {
        merged.push(c);
      }
    }

    clientes = merged;
    clientesLastUpdate = new Date();
    console.log(`[clientes] Refrescados: ${merged.length} total (${abonados.length} abonados CRM, ${clientesFile.length} en JSON)`);
  } catch (err) {
    console.error('[clientes] Error refrescando:', err.message);
  }
}

// ============================================================
// UI
// ============================================================
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('__VTIGER_URL__', process.env.VTIGER_URL || '');
  res.send(html);
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// CRM/OCS/ESET Comparison
// ============================================================
app.get('/api/clientes', (req, res) => {
  res.json(clientes.map((c, i) => ({
    id: i,
    empresa: c.empresa,
    tag_ocs: c.tag_ocs,
    has_eset: !!c.email_eset,
    fromCrm: !!(c.accountid && !clientesFile.some(f => f.empresa === c.empresa)),
  })));
});

app.post('/api/clientes/refresh', async (req, res) => {
  await refreshClientes();
  res.json({ ok: true, total: clientes.length, lastUpdate: clientesLastUpdate });
});

app.get('/api/clientes/last-update', (req, res) => {
  res.json({ lastUpdate: clientesLastUpdate, total: clientes.length });
});

// ============================================================
// CRM Inventory (all clients)
// ============================================================
app.get('/api/crm/inventory', async (req, res, next) => {
  try {
    const allDevices = [];
    for (const cliente of clientes) {
      const result = await getCrmComputers(cliente);
      for (const d of result.devices) {
        allDevices.push({
          ...d,
          cliente: cliente.empresa,
          clienteTagOcs: cliente.tag_ocs,
          hasEset: !!cliente.email_eset,
        });
      }
    }
    res.json(allDevices);
  } catch (err) { next(err); }
});

// ============================================================
// ESET Inventory (all clients)
// ============================================================
app.get('/api/eset/inventory', async (req, res, next) => {
  try {
    const status = getEsetCacheStatus();
    if (!status.loading && status.count > 0) {
      return res.json(getAllEsetDevices());
    }
    const allDevices = [];
    for (const cliente of clientes) {
      if (!cliente.email_eset) continue;
      const devices = await getEsetComputers(cliente);
      for (const d of devices) {
        allDevices.push({
          ...d,
          cliente: cliente.empresa,
          clienteTagOcs: cliente.tag_ocs,
        });
      }
    }
    res.json(allDevices);
  } catch (err) { next(err); }
});

app.get('/api/eset-cache-status', (req, res) => {
  res.json(getEsetCacheStatus());
});

app.post('/api/load-eset-cache', async (req, res) => {
  const status = getEsetCacheStatus();
  if (status.loading) return res.json({ status: 'already_loading', progress: status.progress });
  loadEsetCache(clientes).catch(console.error);
  res.json({ status: 'started' });
});

app.get('/api/eset/clients', (req, res) => {
  const esetClients = clientes
    .filter(c => c.email_eset)
    .map(c => ({ empresa: c.empresa, email_eset: c.email_eset, tag_ocs: c.tag_ocs }));
  res.json(esetClients);
});

app.get('/api/eset/licencias', async (req, res, next) => {
  try {
    const results = [];
    for (const cliente of clientes) {
      if (!cliente.email_eset) continue;
      results.push({
        empresa: cliente.empresa,
        tag_ocs: cliente.tag_ocs,
        contracts: await getCrmContracts(cliente),
      });
    }
    res.json(results);
  } catch (err) { next(err); }
});

app.get('/api/contracts', async (req, res, next) => {
  try {
    const results = [];
    for (const cliente of clientes) {
      results.push({
        empresa: cliente.empresa,
        tag_ocs: cliente.tag_ocs,
        contracts: await getCrmContracts(cliente),
      });
    }
    res.json(results);
  } catch (err) { next(err); }
});

app.get('/api/eset/inventory/:clienteName', async (req, res, next) => {
  try {
    const name = decodeURIComponent(req.params.clienteName);
    const cliente = clientes.find(c => c.empresa === name);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!cliente.email_eset) return res.json([]);
    const devices = await getEsetComputers(cliente);
    res.json(devices.map(d => ({ ...d, cliente: cliente.empresa, clienteTagOcs: cliente.tag_ocs })));
  } catch (err) { next(err); }
});

app.get('/api/ocs-cache-status', (req, res) => {
  res.json(getCacheStatus());
});

app.post('/api/load-ocs-cache', async (req, res) => {
  const status = getCacheStatus();
  if (status.loading) return res.json({ status: 'already_loading', progress: status.progress });
  loadOcsCache(clientes.filter(c => c.tag_ocs)).catch(console.error);
  res.json({ status: 'started' });
});

app.post('/api/compare/:clienteIndex', async (req, res) => {
  const idx = parseInt(req.params.clienteIndex);
  if (isNaN(idx) || idx < 0 || idx >= clientes.length)
    return res.status(404).json({ error: 'Cliente no encontrado' });

  const cliente = clientes[idx];
  try {
    if (cliente.tag_ocs) {
      await loadOcsCache(clientes.filter(c => c.tag_ocs)).catch(err => {
        console.error(`[Advertencia] No se pudo actualizar la caché de OCS para ${cliente.tag_ocs}:`, err.message);
      });
    }
    const [crmResult, eset, ocs] = await Promise.all([
      getCrmComputers(cliente),
      cliente.email_eset ? getEsetComputers(cliente) : Promise.resolve([]),
      cliente.tag_ocs ? getOcsComputers(cliente) : Promise.resolve([])
    ]);

    const crm = crmResult.devices || [];
    const contracts = crmResult.contracts || [];
    const matched = matchDevices(crm, ocs, eset);

    const ocsServers = ocs.filter(d => d.type === 'server').length;
    const ocsTerminals = ocs.filter(d => d.type !== 'server').length;
    const enTres = matched.filter(d => d.crm.present && d.ocs.present && d.eset.present);
    const crmOcs = matched.filter(d => d.crm.present && d.ocs.present && !d.eset.present);
    const crmEset = matched.filter(d => d.crm.present && !d.ocs.present && d.eset.present);
    const ocsEset = matched.filter(d => !d.crm.present && d.ocs.present && d.eset.present);
    const soloCrm = matched.filter(d => d.crm.present && !d.ocs.present && !d.eset.present);
    const soloOcs = matched.filter(d => !d.crm.present && d.ocs.present && !d.eset.present);
    const soloEset = matched.filter(d => !d.crm.present && !d.ocs.present && d.eset.present);

    res.json({
      cliente: cliente.empresa,
      totalCRM: crm.length,
      totalOCS: ocs.length,
      totalOCSservers: ocsServers,
      totalOCSterminals: ocsTerminals,
      totalESET: eset.length,
      contracts,
      matchedDevices: matched,
      summary: {
        enTres: enTres.length, crmOcs: crmOcs.length, crmEset: crmEset.length,
        ocsEset: ocsEset.length, soloCrm: soloCrm.length, soloOcs: soloOcs.length, soloEset: soloEset.length,
      }
    });
  } catch (err) {
    console.error('Compare error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Technical Hours (vTiger CRM)
// ============================================================
app.get('/api/horas', async (req, res, next) => {
  try { res.json(await getHoras(req.query.date)); } catch (err) { next(err); }
});

app.get('/api/fsdetalle', async (req, res, next) => {
  try { res.json(await getFsDetalle(req.query.date, req.query.tecnico)); } catch (err) { next(err); }
});

app.get('/api/horasreales', async (req, res, next) => {
  try { res.json(await getHorasReales(req.query.date)); } catch (err) { next(err); }
});

app.get('/api/horas-mensual', async (req, res, next) => {
  try { res.json(await getHorasMensual(req.query.year, req.query.month)); } catch (err) { next(err); }
});

app.get('/api/fs-sin-asociar', async (req, res, next) => {
  try { res.json(await getFsSinAsociar(req.query.date)); } catch (err) { next(err); }
});

app.get('/api/fs-sin-asociar-mensual', async (req, res, next) => {
  try { res.json(await getFsSinAsociarMensual(req.query.year, req.query.month)); } catch (err) { next(err); }
});

app.get('/api/horas-mensual-detalle', async (req, res, next) => {
  try { res.json(await getHorasMensualDetalle(req.query.year, req.query.month)); } catch (err) { next(err); }
});

app.get('/api/fs-negativos', async (req, res, next) => {
  try { res.json(await getFsNegativos(req.query.date)); } catch (err) { next(err); }
});

app.get('/api/fs-negativos-mensual', async (req, res, next) => {
  try { res.json(await getFsNegativosMensual(req.query.year, req.query.month)); } catch (err) { next(err); }
});

app.get('/api/tareas-pendientes', async (req, res, next) => {
  try { res.json(await getTareasPendientes(req.query.year, req.query.month)); } catch (err) { next(err); }
});

app.get('/api/tickets-pendientes', async (req, res, next) => {
  try { res.json(await getTicketsPendientes(req.query.year, req.query.month)); } catch (err) { next(err); }
});

app.get('/api/fs-sin-asociar-full', async (req, res, next) => {
  try { res.json(await getFsSinAsociarFull(req.query.year, req.query.month)); } catch (err) { next(err); }
});

app.get('/api/tecnicos-menor6', async (req, res, next) => {
  try { res.json(await getTecnicosMenor6Horas(req.query.year, req.query.month)); } catch (err) { next(err); }
});

app.get('/api/kpi-mensual', async (req, res, next) => {
  try { res.json(await getKpiMensual(req.query.year, req.query.month)); } catch (err) { next(err); }
});

// ============================================================
// OCS Inventory (PostgreSQL cache)
// ============================================================
app.get('/api/ocs/computers', async (req, res, next) => {
  try {
    const { workgroup, search, tipo } = req.query;
    res.json(await getComputers(workgroup, search, tipo));
  } catch (err) { next(err); }
});

app.get('/api/ocs/computers-cross', async (req, res, next) => {
  try { res.json(await getComputersCross(req.query.workgroup)); } catch (err) { next(err); }
});

app.get('/api/ocs/workgroups', async (req, res, next) => {
  try { res.json(await getWorkgroups()); } catch (err) { next(err); }
});

app.get('/api/ocs/summary', async (req, res, next) => {
  try { res.json(await getSummary()); } catch (err) { next(err); }
});

app.get('/api/fs/registros', async (req, res, next) => {
  try { res.json(await getServiceRecords(req.query.search, req.query.tecnico)); } catch (err) { next(err); }
});

// ============================================================
// Error handler
// ============================================================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Dashboard Unificado: http://localhost:${PORT}`);
  await refreshClientes();
  loadOcsCache(clientes.filter(c => c.tag_ocs)).catch(console.error);
  setInterval(refreshClientes, 60 * 60 * 1000);
});
