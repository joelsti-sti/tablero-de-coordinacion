const axios = require('axios');
const https = require('https');
const { URLSearchParams } = require('url');
const { normalizeMac, normalizeSerial } = require('../utils/normalization');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const api = axios.create({ httpsAgent, timeout: 30000 });

const REGIONS = ['us', 'eu', 'de', 'ca', 'jpn'];

async function fetchDevicesFromRegion(cliente, region, normalizedClientTags) {
  const iamUrl = `https://${region}.business-account.iam.eset.systems`;
  const deviceApiUrl = `https://${region}.device-management.eset.systems`;

  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('username', cliente.email_eset);
  params.append('password', cliente.password_eset);

  const loginRes = await api.post(`${iamUrl}/oauth/token`, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const token = loginRes.data?.access_token;
  if (!token) return [];

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
      const deviceTags = d.tags || [];
      const deviceTagList = Array.isArray(deviceTags) ? deviceTags : [deviceTags];

      const netMacs = (d.hardwareProfiles?.[0]?.networkAdapters || [])
        .map(n => normalizeMac(n.macAddress))
        .filter(Boolean);
      const macs = [...new Set(netMacs)];

      results.push({
        source: 'eset',
        esetId: d.uuid,
        hostname: d.displayName || d.originalDisplayName || null,
        serialNumber: normalizeSerial(d.hardwareProfiles?.[0]?.bios?.serialNumber),
        tag: deviceTagList.join(', '),
        uuid: d.uuid,
        macAddress: macs.length > 0 ? macs : null,
        esetRegion: region,
      });
    }
  } while (nextPageToken);

  return results;
}

async function getEsetComputers(cliente) {
  if (!cliente.email_eset || !cliente.password_eset) return [];

  const clientTags = Array.isArray(cliente.tag_ocs) ? cliente.tag_ocs : [cliente.tag_ocs];
  const normalizedClientTags = clientTags.map(t => t.toUpperCase().trim()).filter(Boolean);

  const allResults = [];
  let lastError = null;

  for (const region of REGIONS) {
    try {
      const devices = await fetchDevicesFromRegion(cliente, region, normalizedClientTags);
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

module.exports = { getEsetComputers };
