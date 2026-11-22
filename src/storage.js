const KEYS = {
  calibration: 'quincho.calibration.v1',
  records: 'quincho.records.v1', // récord (nivel máximo): se guarda siempre
  run: 'quincho.run.v1', // partida en curso (monedas, mejoras, nivel): se puede continuar
  legacyProgress: 'quincho.progress.v1', // versión vieja: monedas y mejoras eternas
};

function read(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('No se pudo guardar', key, e);
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nada */
  }
}

// Migración: el progreso viejo guardaba monedas y mejoras para siempre (por eso
// cada partida nueva arrancaba muy fácil). Nos quedamos solo con el récord.
(function migrate() {
  const old = read(KEYS.legacyProgress);
  if (!old) return;
  const rec = read(KEYS.records) || { maxLevel: 0 };
  rec.maxLevel = Math.max(rec.maxLevel || 0, old.maxLevel || 0);
  write(KEYS.records, rec);
  remove(KEYS.legacyProgress);
})();

export const Storage = {
  // La calibración se guarda en coordenadas relativas a la línea límite,
  // así se puede "re-anclar" con un solo gatillo en la próxima sesión.
  loadCalibration() {
    const c = read(KEYS.calibration);
    return c && c.version === 1 && c.rack && c.crates && c.chair ? c : null;
  },
  saveCalibration(c) {
    write(KEYS.calibration, { ...c, version: 1, savedAt: Date.now() });
  },
  clearCalibration() {
    remove(KEYS.calibration);
  },

  loadRecords() {
    return { maxLevel: 0, ...(read(KEYS.records) || {}) };
  },
  saveRecords(r) {
    write(KEYS.records, r);
  },

  // Partida guardada al terminar cada oleada (y al comprar en el panel).
  loadRun() {
    const r = read(KEYS.run);
    return r && r.level > 0 ? r : null;
  },
  saveRun(r) {
    write(KEYS.run, { ...r, savedAt: Date.now() });
  },
  clearRun() {
    remove(KEYS.run);
  },

  clearAll() {
    remove(KEYS.run);
    remove(KEYS.records);
  },
};
