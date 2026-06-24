function normalizeMac(mac) {
  if (!mac) return null;
  const m = mac.replace(/[:.-]/g, '').toLowerCase().trim();
  return (m && m.length >= 12) ? m : null;
}

function normalizeSerial(sn) {
  if (!sn) return null;
  const s = sn.toString().trim().toUpperCase();
  const invalid = ['-', 'N/A', '0', 'NONE', 'UNKNOWN', 'TO BE FILLED BY O.E.M.', 'DEFAULT STRING', 'NOT APPLICABLE'];
  if (invalid.includes(s) || s.length < 4) return null;
  return s;
}

function normalizeHostname(name) {
  if (!name) return null;
  return name.split('.')[0].trim().toLowerCase();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = {
  normalizeMac,
  normalizeSerial,
  normalizeHostname,
  sleep
};
