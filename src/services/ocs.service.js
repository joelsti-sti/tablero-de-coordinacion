const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { OCS_DEFAULT, OCS_CACHE_PATH } = require('../config');
const { normalizeMac, normalizeSerial } = require('../utils/normalization');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const api = axios.create({ httpsAgent, timeout: 60000 });

function classifyDeviceType(osname) {
  return osname && /server/i.test(osname) ? 'server' : 'terminal';
}

let ocsCache = {}; // { TAG: [computers] }
let ocsCacheLoading = false;
let ocsCacheProgress = '';
let ocsCacheLoadPromise = null;

// Load initial cache from file
try {
  const cacheFile = path.resolve(OCS_CACHE_PATH);
  if (fs.existsSync(cacheFile)) {
    const cached = fs.readFileSync(cacheFile, 'utf-8');
    const parsed = JSON.parse(cached);
    if (parsed.data) {
      ocsCache = parsed.data;
      console.log(`OCS cache loaded from disk: ${Object.keys(ocsCache).length} tags`);
    }
  }
} catch (err) {
  console.error('Error reading OCS cache file:', err.message);
}

function saveCache() {
  try {
    fs.writeFileSync(OCS_CACHE_PATH, JSON.stringify({ timestamp: Date.now(), data: ocsCache }));
  } catch (err) {
    console.error('Error writing OCS cache file:', err.message);
  }
}

async function loadOcsCache() {
  if (ocsCacheLoading) {
    if (ocsCacheLoadPromise) await ocsCacheLoadPromise;
    return;
  }
  ocsCacheLoading = true;
  ocsCacheLoadPromise = (async () => {
  const startTime = Date.now();
  const config = OCS_DEFAULT;
  const authHeader = `Basic ${Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64')}`;
  
  const limit = 500;
  const concurrency = 15;
  let totalFetched = 0;
  const newCache = {};

  try {
    let offset = 0;
    let keepGoing = true;

    while (keepGoing) {
      ocsCacheProgress = `Crawling OCS... ${totalFetched} records found`;
      console.log(ocsCacheProgress);

      const batchPromises = [];
      for (let i = 0; i < concurrency; i++) {
        const currentOffset = offset + (i * limit);
        const url = `${config.baseURL}/computers?start=${currentOffset}&limit=${limit}`;
        batchPromises.push(
          api.get(url, { headers: { Authorization: authHeader, Accept: 'application/json' } })
            .catch(err => ({ error: true, message: err.message, offset: currentOffset }))
        );
      }

      const results = await Promise.all(batchPromises);
      
      let batchRecordsCount = 0;
      for (const res of results) {
        if (res.error) {
          console.error(`Error at offset ${res.offset}: ${res.message}`);
          continue;
        }

        const entries = Object.entries(res.data || {});
        if (entries.length === 0) {
          keepGoing = false;
          break;
        }

        batchRecordsCount += entries.length;
        for (const [id, computer] of entries) {
          const tag = computer?.accountinfo?.[0]?.TAG || 'NO_TAG';
          const tagUpper = tag.toUpperCase().trim();
          
          if (!newCache[tagUpper]) newCache[tagUpper] = [];
          
          const hw = computer?.hardware || {};
          const bios = computer?.bios || {};
          const networks = computer?.networks || [];
          const netList = Array.isArray(networks) ? networks : Object.values(networks);
          const macs = netList
            .filter(n => (n.TYPE === 'Ethernet' || n.TYPE === 'Wifi') && n.MACADDR)
            .map(n => normalizeMac(n.MACADDR))
            .filter(Boolean);

          const hostname = hw.NAME || null;
          const osname = hw.OSNAME || null;
          newCache[tagUpper].push({
            ocsId: hw.ID || parseInt(id),
            hostname,
            osname,
            type: classifyDeviceType(osname),
            serialNumber: normalizeSerial(bios.SSN),
            uuid: hw.UUID && hw.UUID.length > 8 ? hw.UUID : null,
            macAddress: macs.length > 0 ? [...new Set(macs)] : null,
          });
        }
      }

      totalFetched += batchRecordsCount;
      offset += (limit * concurrency);
      
      if (batchRecordsCount < (limit * concurrency)) {
        keepGoing = false;
      }
    }

    ocsCache = newCache;
    saveCache();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    ocsCacheProgress = `OCS Crawl complete: ${totalFetched} computers in ${duration}s`;
    console.log(ocsCacheProgress);

  } catch (err) {
    console.error('OCS Crawl error:', err.message);
  } finally {
    ocsCacheLoading = false;
  }
})();
  await ocsCacheLoadPromise;
}

async function getOcsComputers(cliente) {
  const tags = (Array.isArray(cliente.tag_ocs) ? cliente.tag_ocs : [cliente.tag_ocs]).filter(Boolean);
  const results = [];

  // Always use the local cache for speed. 
  // If cache is empty, user should trigger load-ocs-cache once.
  for (const tag of tags) {
    const tagUpper = tag.toUpperCase().trim();
    const computers = ocsCache[tagUpper] || [];
    for (const c of computers) {
      results.push({ ...c, source: 'ocs', tagOcs: tag });
    }
  }

  // Handle external OCS separately (they are usually smaller or specific)
  if (cliente.ocs_custom_url) {
    const external = await getOcsComputersExternal(cliente);
    results.push(...external);
  }

  return results;
}

async function getOcsComputersExternal(cliente) {
  const tags = (Array.isArray(cliente.tag_ocs) ? cliente.tag_ocs : [cliente.tag_ocs]).filter(Boolean);
  const baseURL = `${cliente.ocs_custom_url}/ocsapi/v1`;
  const auth = { 
    username: cliente.ocs_custom_user, 
    password: cliente.ocs_custom_pass || process.env.OCS_CUSTOM_MASTER_PASSWORD 
  };

  const tagPromises = tags.map(async (tag) => {
    const tagResults = [];
    try {
      // For external, we use the simple computers endpoint with a large limit 
      // since we don't have a global cache for it.
      const url = `${baseURL}/computers?limit=2000`;
      const authH = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
      const res = await api.get(url, { headers: { Authorization: authH, Accept: 'application/json' }, timeout: 15000 });
      const data = res.data;
      const entries = Object.entries(data || {});

      for (const [id, computer] of entries) {
        const tagInfo = computer?.accountinfo?.[0]?.TAG || '';
        if (tagInfo.toUpperCase().trim() !== tag.toUpperCase().trim()) continue;

        const hw = computer?.hardware || {};
        const bios = computer?.bios || {};
        const networks = computer?.networks || [];
        const netList = Array.isArray(networks) ? networks : Object.values(networks);
        const macs = netList
          .filter(n => (n.TYPE === 'Ethernet' || n.TYPE === 'Wifi') && n.MACADDR)
          .map(n => normalizeMac(n.MACADDR))
          .filter(Boolean);

        const hostname = hw.NAME || null;
        const osname = hw.OSNAME || null;
        tagResults.push({
          source: 'ocs',
          ocsId: hw.ID || parseInt(id),
          tagOcs: tag,
          hostname,
          osname,
          type: classifyDeviceType(osname),
          serialNumber: normalizeSerial(bios.SSN),
          uuid: hw.UUID && hw.UUID.length > 8 ? hw.UUID : null,
          macAddress: macs.length > 0 ? [...new Set(macs)] : null
        });
      }
    } catch (err) {
      console.error(`External OCS error for ${tag}:`, err.message);
    }
    return tagResults;
  });

  const allTagResults = await Promise.all(tagPromises);
  return allTagResults.flat();
}

function getCacheStatus() {
  let totalCount = 0;
  Object.values(ocsCache).forEach(list => totalCount += list.length);
  return {
    loading: ocsCacheLoading,
    progress: ocsCacheProgress,
    count: totalCount,
    tags: Object.keys(ocsCache).length,
    refreshIntervalMs: parseInt(process.env.OCS_CACHE_REFRESH_INTERVAL || '300000'),
  };
}

module.exports = {
  loadOcsCache,
  getOcsComputers,
  getCacheStatus
};
