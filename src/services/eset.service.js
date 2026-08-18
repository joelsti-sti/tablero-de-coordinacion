const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URLSearchParams } = require('url');
const { normalizeMac, normalizeSerial } = require('../utils/normalization');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const api = axios.create({ httpsAgent, timeout: 30000 });

const REGIONS = ['us', 'eu', 'de', 'ca', 'jpn'];
const ESET_CACHE_PATH = process.env.ESET_CACHE_PATH || './eset_cache.json';

let esetCache = {};
let esetCacheLoading = false;
let esetCacheProgress = '';
let esetCacheLoadPromise = null;

// Load initial cache from disk
try {
  if (fs.existsSync(ESET_CACHE_PATH)) {
    const cached = fs.readFileSync(ESET_CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(cached);
    if (parsed.data) {
      esetCache = parsed.data;
      console.log(`ESET cache loaded from disk: ${Object.keys(esetCache).length} accounts`);
    }
  }
} catch (err) {
  console.error('Error reading ESET cache file:', err.message);
}

function saveEsetCache() {
  try {
    fs.writeFileSync(ESET_CACHE_PATH, JSON.stringify({ timestamp: Date.now(), data: esetCache }));
  } catch (err) {
    console.error('Error writing ESET cache file:', err.message);
  }
}

// Token cache per client+region
const tokenCache = new Map();

async function getEsetToken(email, password, region) {
  const key = `${email}|${region}`;
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt - 60000) {
    return cached.token;
  }

  const iamUrl = `https://${region}.business-account.iam.eset.systems`;
  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('username', email);
  params.append('password', password);

  const res = await api.post(`${iamUrl}/oauth/token`, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  const token = res.data?.access_token;
  const expiresIn = res.data?.expires_in || 3600;
  if (token) {
    tokenCache.set(key, { token, expiresAt: Date.now() + expiresIn * 1000 });
  }
  return token;
}

async function fetchDevicesWithPagination(region, token) {
  const deviceApiUrl = `https://${region}.device-management.eset.systems`;
  const results = [];
  let nextPageToken = null;

  do {
    const url = nextPageToken
      ? `${deviceApiUrl}/v1/devices?pageSize=1000&pageToken=${nextPageToken}`
      : `${deviceApiUrl}/v1/devices?pageSize=1000`;

    const res = await api.get(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      timeout: 30000,
    });

    const data = res.data;
    const devices = data?.devices || [];
    nextPageToken = data?.nextPageToken;

    for (const d of devices) {
      const netMacs = (d.hardwareProfiles?.[0]?.networkAdapters || [])
        .map(n => normalizeMac(n.macAddress))
        .filter(Boolean);
      const macs = [...new Set(netMacs)];

      results.push({
        source: 'eset',
        esetId: d.uuid,
        hostname: d.displayName || d.originalDisplayName || null,
        serialNumber: normalizeSerial(d.hardwareProfiles?.[0]?.bios?.serialNumber),
        uuid: d.uuid,
        macAddress: macs.length > 0 ? macs : null,
        esetRegion: region,
        deviceType: d.deviceType ? d.deviceType.replace('DEVICE_TYPE_', '') : null,
        functionalityStatus: d.functionalityStatus || null,
        lastSyncTime: d.lastSyncTime || null,
        operatingSystem: d.operatingSystem?.displayName || null,
        manufacturer: d.hardwareProfiles?.[0]?.manufacturer || null,
        model: d.hardwareProfiles?.[0]?.model || null,
      });
    }
  } while (nextPageToken);

  return results;
}

async function loadEsetCache(clientesList) {
  if (esetCacheLoading) {
    if (esetCacheLoadPromise) await esetCacheLoadPromise;
    return;
  }
  esetCacheLoading = true;
  esetCacheLoadPromise = (async () => {
    const startTime = Date.now();
    const newCache = {};
    let totalDevices = 0;

    try {
      const clients = clientesList || [];
      let processed = 0;

      for (const cliente of clients) {
        const email = cliente.email_eset;
        if (!email) continue;

        processed++;
        esetCacheProgress = `ESET: ${processed}/${clients.length} clientes (${totalDevices} dispositivos)`;
        console.log(esetCacheProgress);

        const password = cliente.password_eset || process.env.ESET_MASTER_PASSWORD;

        for (const region of REGIONS) {
          try {
            const token = await getEsetToken(email, password, region);
            if (!token) continue;

            const devices = await fetchDevicesWithPagination(region, token);

            const key = cliente.empresa || email;
            if (!newCache[key]) newCache[key] = [];
            const clientTags = (Array.isArray(cliente.tag_ocs) ? cliente.tag_ocs : [cliente.tag_ocs])
              .map(t => t?.toUpperCase().trim()).filter(Boolean);

            for (const d of devices) {
              const entry = { ...d, cliente: key, clienteEmail: email };
              if (clientTags.length > 0) {
                entry.clienteTagOcs = clientTags.join(', ');
              }
              newCache[key].push(entry);
            }

            totalDevices += devices.length;
            if (devices.length > 0) break;
          } catch (err) {
            console.log(`ESET region '${region}' failed for ${email}: ${err.response?.status || err.message}`);
          }
        }
      }

      esetCache = newCache;
      saveEsetCache();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      esetCacheProgress = `ESET cache complete: ${totalDevices} devices in ${duration}s`;
      console.log(esetCacheProgress);
    } catch (err) {
      console.error('ESET cache error:', err.message);
    } finally {
      esetCacheLoading = false;
    }
  })();
  await esetCacheLoadPromise;
}

async function getEsetComputers(cliente) {
  const key = cliente.empresa;
  if (esetCache[key]) return esetCache[key];

  // Fallback: fetch directly
  if (!cliente.email_eset) return [];
  const esetPassword = cliente.password_eset || process.env.ESET_MASTER_PASSWORD;
  const allResults = [];
  let lastError = null;

  for (const region of REGIONS) {
    try {
      const token = await getEsetToken(cliente.email_eset, esetPassword, region);
      if (!token) continue;
      const devices = await fetchDevicesWithPagination(region, token);
      if (devices.length > 0) {
        console.log(`ESET: ${devices.length} devices from region '${region}' for ${cliente.empresa}`);
        allResults.push(...devices);
        break;
      }
    } catch (err) {
      lastError = err;
      console.log(`ESET region '${region}' failed for ${cliente.empresa}: ${err.response?.status || err.message}`);
    }
  }

  if (allResults.length === 0 && lastError) {
    console.error(`ESET error for ${cliente.empresa} (all regions):`, lastError.response?.data || lastError.message);
  }

  return allResults;
}

function getEsetCacheStatus() {
  let totalCount = 0;
  Object.values(esetCache).forEach(list => totalCount += list.length);
  return {
    loading: esetCacheLoading,
    progress: esetCacheProgress,
    count: totalCount,
    accounts: Object.keys(esetCache).length,
  };
}

function getAllEsetDevices() {
  const allDevices = [];
  for (const [clienteNombre, devices] of Object.entries(esetCache)) {
    for (const d of devices) {
      allDevices.push({ ...d, cliente: clienteNombre });
    }
  }
  return allDevices;
}

module.exports = { getEsetComputers, loadEsetCache, getEsetCacheStatus, getAllEsetDevices };