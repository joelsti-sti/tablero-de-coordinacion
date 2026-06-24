const { normalizeHostname } = require('../utils/normalization');

function matchDevices(crmDevices, ocsDevices, esetDevices) {
  const all = [];
  const usedOcs = new Set();
  const usedEset = new Set();

  // Pre-index OCS for O(1) lookup
  const ocsBySerial = new Map();
  const ocsByUuid = new Map();
  const ocsByMac = new Map();
  const ocsByHostname = new Map();

  ocsDevices.forEach(d => {
    if (d.serialNumber) ocsBySerial.set(d.serialNumber, d);
    if (d.uuid) ocsByUuid.set(d.uuid, d);
    if (d.macAddress) d.macAddress.forEach(mac => ocsByMac.set(mac, d));
    const h = normalizeHostname(d.hostname);
    if (h) ocsByHostname.set(h, d);
  });

  // Pre-index ESET for O(1) lookup
  const esetBySerial = new Map();
  const esetByMac = new Map();
  const esetByHostname = new Map();

  esetDevices.forEach(d => {
    if (d.serialNumber) esetBySerial.set(d.serialNumber, d);
    if (d.macAddress) d.macAddress.forEach(mac => esetByMac.set(mac, d));
    const h = normalizeHostname(d.hostname);
    if (h) esetByHostname.set(h, d);
  });

  function findInPool(dev, poolType) {
    const isOcs = poolType === 'ocs';
    const serialMap = isOcs ? ocsBySerial : esetBySerial;
    const macMap = isOcs ? ocsByMac : esetByMac;
    const hostMap = isOcs ? ocsByHostname : esetByHostname;
    const usedSet = isOcs ? usedOcs : usedEset;
    const idProp = isOcs ? 'ocsId' : 'esetId';

    // Priority 1: Serial
    if (dev.serialNumber) {
      const m = serialMap.get(dev.serialNumber);
      if (m && !usedSet.has(m[idProp])) return { match: m, method: 'serial' };
    }
    // Priority 2: UUID (OCS only)
    if (isOcs && dev.uuid) {
      const m = ocsByUuid.get(dev.uuid);
      if (m && !usedSet.has(m[idProp])) return { match: m, method: 'uuid' };
    }
    // Priority 3: MAC
    if (dev.macAddress && dev.macAddress.length > 0) {
      for (const mac of dev.macAddress) {
        const m = macMap.get(mac);
        if (m && !usedSet.has(m[idProp])) return { match: m, method: 'mac' };
      }
    }
    // Priority 4: Hostname
    const h = normalizeHostname(dev.hostname);
    if (h) {
      const m = hostMap.get(h);
      if (m && !usedSet.has(m[idProp])) return { match: m, method: 'hostname' };
    }
    return null;
  }

  // 1. Process CRM as base
  for (const crm of crmDevices) {
    const oMatch = findInPool(crm, 'ocs');
    if (oMatch) usedOcs.add(oMatch.match.ocsId);

    const eMatch = findInPool(crm, 'eset');
    if (eMatch) usedEset.add(eMatch.match.esetId);

    all.push({
      matchMethod: oMatch ? oMatch.method : (eMatch ? eMatch.method : 'none'),
      crm: { 
        present: true, 
        hostname: crm.hostname, 
        serialNumber: crm.serialNumber,
        macAddress: crm.macAddress,
        uuid: crm.uuid,
        info: crm.accountName,
        contactName: crm.contactName,
        usuarioActivo: crm.usuarioActivo
      },
      ocs: oMatch ? { 
        present: true, 
        hostname: oMatch.match.hostname, 
        serialNumber: oMatch.match.serialNumber, 
        uuid: oMatch.match.uuid, 
        macAddress: oMatch.match.macAddress, 
        info: oMatch.match.tagOcs 
      } : { present: false },
      eset: eMatch ? { 
        present: true, 
        hostname: eMatch.match.hostname, 
        serialNumber: eMatch.match.serialNumber, 
        macAddress: eMatch.match.macAddress, 
        uuid: null,
        info: eMatch.match.tag 
      } : { present: false },
    });
  }

  // 2. Remaining OCS
  for (const ocs of ocsDevices) {
    if (usedOcs.has(ocs.ocsId)) continue;
    
    // Check if this OCS device matches any ESET device
    const eMatch = findInPool(ocs, 'eset');
    if (eMatch) usedEset.add(eMatch.match.esetId);

    all.push({
      matchMethod: eMatch ? eMatch.method : 'none',
      crm: { present: false },
      ocs: { 
        present: true, 
        hostname: ocs.hostname, 
        serialNumber: ocs.serialNumber, 
        uuid: ocs.uuid, 
        macAddress: ocs.macAddress, 
        info: ocs.tagOcs 
      },
      eset: eMatch ? { 
        present: true, 
        hostname: eMatch.match.hostname, 
        serialNumber: eMatch.match.serialNumber, 
        macAddress: eMatch.match.macAddress, 
        uuid: null,
        info: eMatch.match.tag 
      } : { present: false },
    });
  }

  // 3. Remaining ESET
  for (const eset of esetDevices) {
    if (usedEset.has(eset.esetId)) continue;
    all.push({
      matchMethod: 'none',
      crm: { present: false },
      ocs: { present: false },
      eset: { 
        present: true, 
        hostname: eset.hostname, 
        serialNumber: eset.serialNumber, 
        macAddress: eset.macAddress, 
        uuid: null,
        info: eset.tag 
      },
    });
  }

  return all;
}

module.exports = { matchDevices };
