const { normalizeMac, normalizeSerial } = require('../utils/normalization');

const cleanStr = (str) => (str ? str.toString().trim().toLowerCase() : '');
const cleanMac = (mac) => (mac ? mac.toString().replace(/[:-]/g, '').trim().toLowerCase() : '');

function matchDevices(crmList, ocsList, esetList) {
  const matched = [];

  let remainingOcs = [...ocsList];
  let remainingEset = [...esetList];

  for (const crm of crmList) {
    let matchOcs = null;
    let matchEset = null;

    const crmSerial = cleanStr(crm.serialNumber);
    const crmUuid = cleanStr(crm.uuid);
    const crmMacs = (crm.macAddress || []).map(cleanMac);

    if (crmSerial) {
      matchOcs = remainingOcs.find(o => cleanStr(o.serialNumber) === crmSerial);
    }
    if (!matchOcs && crmUuid) {
      matchOcs = remainingOcs.find(o => cleanStr(o.uuid) === crmUuid);
    }
    if (!matchOcs && crmMacs.length > 0) {
      matchOcs = remainingOcs.find(o => {
        const ocsMacs = (o.macAddress || []).map(cleanMac);
        return crmMacs.some(crmMac => ocsMacs.includes(crmMac));
      });
    }

    if (crmSerial) {
      matchEset = remainingEset.find(e => cleanStr(e.serialNumber) === crmSerial);
    }
    if (!matchEset && crmUuid) {
      matchEset = remainingEset.find(e => cleanStr(e.uuid) === crmUuid);
    }
    if (!matchEset && crmMacs.length > 0) {
      matchEset = remainingEset.find(e => {
        const esetMacs = (e.macAddress || []).map(cleanMac);
        return crmMacs.some(crmMac => esetMacs.includes(crmMac));
      });
    }

    if (matchOcs) remainingOcs = remainingOcs.filter(o => o.ocsId !== matchOcs.ocsId);
    if (matchEset) remainingEset = remainingEset.filter(e => e.esetId !== matchEset.esetId);

    matched.push({
      crm: { present: true, data: crm },
      ocs: { present: !!matchOcs, data: matchOcs || null },
      eset: { present: !!matchEset, data: matchEset || null }
    });
  }

  for (const ocs of remainingOcs) {
    const ocsSerial = cleanStr(ocs.serialNumber);
    const ocsUuid = cleanStr(ocs.uuid);
    const ocsMacs = (ocs.macAddress || []).map(cleanMac);

    let matchEset = null;
    if (ocsSerial) matchEset = remainingEset.find(e => cleanStr(e.serialNumber) === ocsSerial);
    if (!matchEset && ocsUuid) matchEset = remainingEset.find(e => cleanStr(e.uuid) === ocsUuid);
    if (!matchEset && ocsMacs.length > 0) {
      matchEset = remainingEset.find(e => {
        const esetMacs = (e.macAddress || []).map(cleanMac);
        return ocsMacs.some(m => esetMacs.includes(m));
      });
    }

    if (matchEset) remainingEset = remainingEset.filter(e => e.esetId !== matchEset.esetId);

    matched.push({
      crm: { present: false, data: null },
      ocs: { present: true, data: ocs },
      eset: { present: !!matchEset, data: matchEset || null }
    });
  }

  for (const eset of remainingEset) {
    matched.push({
      crm: { present: false, data: null },
      ocs: { present: false, data: null },
      eset: { present: true, data: eset }
    });
  }

  return matched;
}

module.exports = { matchDevices };