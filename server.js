require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { PORT } = require('./src/config');
const { getCrmComputers } = require('./src/services/crm.service');
const { loadOcsCache, getOcsComputers, getCacheStatus } = require('./src/services/ocs.service');
const { getEsetComputers } = require('./src/services/eset.service');
const { matchDevices } = require('./src/utils/matcher');
const {
  getHoras, getFsDetalle, getHorasReales, getHorasMensual,
  getFsSinAsociar, getFsSinAsociarMensual, getHorasMensualDetalle,
  getFsNegativos, getFsNegativosMensual,
  getTareasPendientes, getTicketsPendientes, getKpiMensual
} = require('./src/services/horas.service');
const {
  getComputers, getComputersCross, getWorkgroups,
  getSummary, getServiceRecords
} = require('./src/services/ocs-pg.service');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const clientes = JSON.parse(fs.readFileSync(path.join(__dirname, 'clientes.json'), 'utf-8'));

// ============================================================
// UI
// ============================================================
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('__VTIGER_URL__', process.env.VTIGER_URL || '');
  res.send(html);
});

// ============================================================
// CRM/OCS/ESET Comparison
// ============================================================
app.get('/api/clientes', (req, res) => {
  res.json(clientes.map((c, i) => ({ id: i, empresa: c.empresa, tag_ocs: c.tag_ocs, has_eset: !!c.email_eset })));
});

app.get('/api/ocs-cache-status', (req, res) => {
  res.json(getCacheStatus());
});

app.post('/api/load-ocs-cache', async (req, res) => {
  const status = getCacheStatus();
  if (status.loading) return res.json({ status: 'already_loading', progress: status.progress });
  loadOcsCache(clientes).catch(() => {});
  res.json({ status: 'started' });
});

app.post('/api/compare/:clienteIndex', async (req, res) => {
  const idx = parseInt(req.params.clienteIndex);
  if (isNaN(idx) || idx < 0 || idx >= clientes.length)
    return res.status(404).json({ error: 'Cliente no encontrado' });

  const cliente = clientes[idx];
  try {
    const [crmResult, eset, ocs] = await Promise.all([
      getCrmComputers(cliente),
      getEsetComputers(cliente),
      getOcsComputers(cliente)
    ]);

    const crm = crmResult.devices || [];
    const contracts = crmResult.contracts || [];
    const matched = matchDevices(crm, ocs, eset);

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard Unificado: http://localhost:${PORT}`);
  loadOcsCache(clientes).catch(console.error);
});
