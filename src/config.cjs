'use strict';
// v2 persistence for the desktop pet. The config lives at ~/.dsh-pet/pet.json,
// is written atomically with a private mode, and never throws into the host.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  enabled: false,
  position: null,
  sound: true,
  balanceThreshold: Object.freeze({ currency: 'CNY', amount: 5 }),
});

const DEFAULT_FILE = path.join(os.homedir(), '.dsh-pet', 'pet.json');
const CONFIG_VERSION = 1;
const CURRENCY = 'CNY';
const DEFAULT_AMOUNT = 5;

function defaults() {
  return {
    version: CONFIG_VERSION,
    enabled: false,
    position: null,
    sound: true,
    balanceThreshold: { currency: CURRENCY, amount: DEFAULT_AMOUNT },
  };
}

function normalizePosition(value) {
  if (!value || typeof value !== 'object') return null;
  const { x, y } = value;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function normalizeThreshold(value) {
  if (value && typeof value === 'object' && value.currency === CURRENCY
      && Number.isFinite(value.amount) && value.amount > 0) {
    return { currency: CURRENCY, amount: value.amount };
  }
  return { currency: CURRENCY, amount: DEFAULT_AMOUNT };
}

function normalizeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return defaults();
  return {
    version: CONFIG_VERSION,
    enabled: input.enabled === true,
    position: normalizePosition(input.position),
    sound: typeof input.sound === 'boolean' ? input.sound : true,
    balanceThreshold: normalizeThreshold(input.balanceThreshold),
  };
}

function configFile(options) {
  const file = options && typeof options === 'object' ? options.file : undefined;
  return typeof file === 'string' && file ? file : DEFAULT_FILE;
}

function loadConfig(options) {
  const file = configFile(options);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return normalizeConfig(JSON.parse(raw));
  } catch {
    // Missing, unreadable, corrupt, or a directory in place of the file: the
    // documented defaults are always safe and never create anything on disk.
    return defaults();
  }
}

function saveConfig(config, options) {
  const file = configFile(options);
  const normalized = normalizeConfig(config);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temp, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
    // writeFile's mode is filtered by umask; force the documented mode.
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, file);
  } finally {
    try { fs.unlinkSync(temp); } catch { /* renamed already or never created */ }
  }
  return normalized;
}

module.exports = { DEFAULT_CONFIG, loadConfig, saveConfig };
