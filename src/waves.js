import { CONFIG } from './config.js';

// Oleadas: cantidad = 8 + 4n, vida ×(1 + 0.22n), velocidad ×(1 + 0.06n) con tope.
// Salen a veces en grupos, hay élites y, cada 5 niveles, el Jefe llega ÚLTIMO
// cayendo en un meteorito y trae una horda.
export class WaveManager {
  constructor(game) {
    this.game = game;
    this.level = 0;
    this.state = 'idle'; // idle | active | cleared
    this.queue = [];
    this.total = 0;
    this.bossState = 'none'; // none | pending | falling | done
  }

  static pickType(n) {
    const pool = CONFIG.waves.mix.filter((m) => n >= m.from);
    const sum = pool.reduce((a, m) => a + m.weight, 0);
    let r = Math.random() * sum;
    for (const m of pool) {
      r -= m.weight;
      if (r <= 0) return m.type;
    }
    return pool[0].type;
  }

  static composition(n) {
    const c = CONFIG.waves;
    const count = c.baseCount + c.perLevel * n;
    const list = [];
    for (let i = 0; i < count; i++) list.push(WaveManager.pickType(n));
    // El primer nivel en que aparece un tipo nuevo, garantizamos al menos uno.
    for (const m of c.mix) if (m.from === n && !list.includes(m.type)) list[list.length - 1] = m.type;
    return list;
  }

  isBossLevel(n) {
    return n % CONFIG.boss.every === 0;
  }

  startLevel(n) {
    const c = CONFIG.waves;
    this.level = n;
    this.queue = WaveManager.composition(n);
    this.bossState = this.isBossLevel(n) ? 'pending' : 'none';
    this.total = this.queue.length + (this.bossState === 'pending' ? 1 + CONFIG.boss.escort(n) : 0);
    this.hpMult = 1 + c.hpPerLevel * n;
    this.speedMult = Math.min(1 + c.speedPerLevel * n, c.maxSpeedMult);
    this.interval = Math.max(c.minSpawnInterval, c.spawnInterval - c.spawnIntervalPerLevel * n);
    this.eliteChance = n >= c.elite.from ? Math.min(c.elite.maxChance, c.elite.chancePerLevel * n) : 0;
    this.spawnTimer = 1.2;
    this.sinceSpawn = 0;
    this.state = 'active';
    this.game.onWaveStart(n);
  }

  stop() {
    this.state = 'idle';
    this.queue = [];
    this.bossState = 'none';
  }

  get remaining() {
    const bossLeft = this.bossState === 'pending' || this.bossState === 'falling' ? 1 + CONFIG.boss.escort(this.level) : 0;
    return this.queue.length + this.game.enemies.aliveCount + bossLeft;
  }

  _spawn(type, at = null) {
    const E = CONFIG.waves.elite;
    const elite = type !== 'boss' && Math.random() < this.eliteChance;
    this.game.enemies.spawn(type, this.hpMult * (elite ? E.hpMult : 1), this.speedMult, { elite, at });
  }

  update(dt) {
    if (this.state !== 'active') return;
    const c = CONFIG.waves;
    const enemies = this.game.enemies;
    this.sinceSpawn += dt;
    this.spawnTimer -= dt;

    if (this.queue.length && this.spawnTimer <= 0 && enemies.aliveCount < c.maxAlive) {
      // A veces salen de a 2 o 3 juntos.
      const pack = Math.random() < c.packChance ? 2 + (Math.random() < 0.4 ? 1 : 0) : 1;
      for (let i = 0; i < pack && this.queue.length; i++) this._spawn(this.queue.shift());
      this.spawnTimer = this.interval * (0.6 + Math.random() * 0.8) * (pack > 1 ? 1.5 : 1);
      this.sinceSpawn = 0;
    }

    // Jefe: último de la oleada, cuando quedan pocos vivos.
    if (!this.queue.length && this.bossState === 'pending') {
      const B = CONFIG.boss;
      if (enemies.aliveCount <= B.triggerAlive || this.sinceSpawn > B.triggerTimeout) {
        this.bossState = 'falling';
        this.game.startBossMeteor();
      }
    }

    const bossBusy = this.bossState === 'pending' || this.bossState === 'falling';
    if (!this.queue.length && !bossBusy && enemies.aliveCount === 0) {
      this.state = 'cleared';
      this.game.onWaveCleared(this.level);
    }
  }

  // El meteorito tocó el piso en (x, z) local: sale el jefe con su horda.
  onMeteorLanded(x, z) {
    if (this.bossState !== 'falling') return;
    this.bossState = 'done';
    const B = CONFIG.boss;
    const n = this.level;
    this.game.enemies.spawn('boss', 1 + B.hpPerLevel * n, Math.min(this.speedMult, 1.3), { at: { x, z }, portal: false });
    const count = B.escort(n);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const r = 2.5 + Math.random() * 2.5;
      this._spawn(WaveManager.pickType(n), { x: x + Math.cos(a) * r, z: z + Math.max(-1, Math.sin(a)) * r });
    }
  }
}
