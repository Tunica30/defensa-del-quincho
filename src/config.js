// Todos los números de balance en un solo lugar.
export const CONFIG = {
  // Margen (m) que la cabeza puede pasar la línea límite antes de bloquear las armas.
  boundaryTolerance: 0.12,
  // Distancia (m) a la línea a la que un enemigo "llega" y daña la base.
  enemyReachZ: 0.6,
  baseMaxHp: 100,

  spawn: {
    minDist: 25,
    maxDist: 40,
    fanDeg: 35, // abanico a cada lado de la dirección de ataque
    convergence: 0.25, // cuánto se cierran hacia el centro de la base
    maxTargetX: 3, // ancho (m) a cada lado donde pueden llegar
  },

  startCoins: 0, // monedas al empezar una partida nueva

  waves: {
    baseCount: 8, // cantidad = baseCount + perLevel * n
    perLevel: 4,
    hpPerLevel: 0.22, // vida × (1 + 0.22 n)
    speedPerLevel: 0.06, // velocidad × (1 + 0.06 n)
    maxSpeedMult: 2.0,
    spawnInterval: 1.4,
    spawnIntervalPerLevel: 0.07,
    minSpawnInterval: 0.35,
    packChance: 0.35, // probabilidad de que salgan de a 2-3 juntos
    maxAlive: 26, // tope de enemigos vivos a la vez (rendimiento en el Quest)
    firstWaveDelay: 3,
    shopTime: 45, // segundos de pausa con el panel de mejoras (o hasta tocar "Siguiente oleada")
    clearBonus: (n) => 5 + 3 * n, // monedas extra al superar la oleada n
    // Desde qué nivel aparece cada tipo y con qué peso.
    mix: [
      { type: 'runner', from: 1, weight: 1 },
      { type: 'brute', from: 3, weight: 0.3 },
      { type: 'flyer', from: 4, weight: 0.35 },
      { type: 'jumper', from: 6, weight: 0.35 },
    ],
    // Élite: más grandes, dorados, con el doble de vida y de monedas.
    elite: { from: 4, chancePerLevel: 0.03, maxChance: 0.35, hpMult: 1.9, scale: 1.12 },
  },

  // Jefe: cada 5 niveles, es el último de la oleada. Cae en un meteorito y trae una horda.
  boss: {
    every: 5,
    triggerAlive: 4, // cae cuando quedan pocos enemigos vivos…
    triggerTimeout: 8, // …o a los 8 s del último que apareció
    fallTime: 2.6, // segundos de caída del meteorito
    impactDist: 26, // a qué distancia de la mesa cae
    hpPerLevel: 0.14, // el jefe escala menos que el resto
    escort: (n) => 6 + n, // la horda que viene con él
  },

  // headY: altura (en el modelo, antes de escalar) a partir de la cual el impacto cuenta como tiro a la cabeza.
  // glow: color de las partes que brillan (visor, núcleo).
  enemies: {
    runner: { name: 'Corredor', move: 'walk', hp: 45, speed: 3.3, baseDamage: 10, coins: 3, color: 0xff2d7a, glow: 0xfff35c, scale: 1, headY: 1.38 },
    brute: { name: 'Bruto', move: 'walk', hp: 210, speed: 1.5, baseDamage: 30, coins: 9, color: 0xff7a1a, glow: 0xff2a2a, scale: 1.35, headY: 1.36, bulk: true },
    flyer: { name: 'Volador', move: 'fly', hp: 35, speed: 3.7, baseDamage: 8, coins: 5, color: 0x34e8ff, glow: 0xff2d7a, scale: 1, headY: null },
    jumper: { name: 'Saltador', move: 'hop', hp: 60, speed: 3.3, baseDamage: 12, coins: 6, color: 0x7dff3a, glow: 0xff9cf5, scale: 0.85, headY: 1.38, antenna: true },
    boss: { name: 'Jefe', move: 'walk', hp: 750, speed: 1.0, baseDamage: 80, coins: 80, color: 0xb03cff, glow: 0x3dffea, scale: 2.3, headY: 1.36, bulk: true, crown: true },
  },

  // upgrades: qué mejoras se pueden comprar para cada arma.
  // unlock: null = arma inicial; si no, costo y requisitos para desbloquearla.
  weapons: {
    pistol: {
      name: 'Pistola',
      damage: 20,
      fireRate: 6, // disparos por segundo como máximo
      auto: false,
      magazine: 12,
      reloadTime: 1.1,
      spreadDeg: 0.5,
      pellets: 1,
      range: 80,
      headshotMult: 2.5, // tiro a la cabeza: 20 × 2.5 = 50 → un Corredor cae de un tiro
      tracerColor: 0xffe066,
      accent: 0x2ad4ff,
      unlock: null,
      copies: 2, // dos en el armero: una para cada mano
      upgrades: ['damage', 'fireRate', 'magazine', 'precision', 'multishot', 'pierce', 'explosive'],
    },
    shotgun: {
      name: 'Escopeta',
      damage: 11, // por perdigón
      fireRate: 1.4,
      auto: false,
      magazine: 6,
      reloadTime: 1.8,
      spreadDeg: 6,
      pellets: 8,
      range: 35,
      headshotMult: 1.5,
      tracerColor: 0xffa040,
      accent: 0xff7a1a,
      kick: 1, // vibración y retroceso fuertes
      unlock: null,
      copies: 2,
      upgrades: ['damage', 'fireRate', 'magazine', 'precision', 'multishot', 'pierce', 'explosive'],
    },
    rifle: {
      name: 'Fusil',
      damage: 13,
      fireRate: 10,
      auto: true,
      magazine: 30,
      reloadTime: 1.6,
      spreadDeg: 1.2,
      pellets: 1,
      range: 90,
      headshotMult: 2,
      tracerColor: 0xfff6c0,
      accent: 0x3dff6e,
      unlock: { cost: 220 },
      copies: 2,
      upgrades: ['damage', 'fireRate', 'magazine', 'precision', 'multishot', 'pierce', 'explosive'],
    },
    laser: {
      name: 'Rayo láser',
      beam: true, // haz continuo: daño por segundo, atraviesa todo
      damage: 90, // daño por segundo
      auto: true,
      magazine: 4, // segundos de energía
      reloadTime: 2.2, // recarga completa al vaciarse
      spreadDeg: 0,
      pellets: 1,
      range: 70,
      headshotMult: 1.5,
      tracerColor: 0xff2bd6,
      accent: 0xff2bd6,
      // Final del árbol: necesita el fusil y varias mejoras compradas.
      unlock: { cost: 600, requires: 'rifle', minUpgrades: 10 },
      upgrades: ['damage', 'magazine'],
    },
  },

  // Catálogo de mejoras de armas.
  weaponUpgrades: {
    damage: { label: 'Daño', max: 5, baseCost: 40, desc: '+25% por nivel' },
    fireRate: { label: 'Cadencia', max: 5, baseCost: 35, desc: '+20% por nivel' },
    magazine: { label: 'Cargador y recarga', max: 5, baseCost: 30, desc: '+25% capacidad, −8% tiempo' },
    precision: { label: 'Precisión', max: 5, baseCost: 25, desc: '−15% dispersión' },
    multishot: { label: 'Tiro múltiple', max: 3, baseCost: 120, desc: '2 → 3 → 5 en abanico', special: true },
    pierce: { label: 'Perforación', max: 3, baseCost: 100, desc: 'Atraviesa +1 enemigo por nivel', special: true },
    explosive: { label: 'Disparo explosivo', max: 3, baseCost: 150, desc: 'Explota al impactar', special: true },
  },
  multishotCounts: [1, 2, 3, 5],
  multishotFanDeg: 4, // separación entre proyectiles del abanico
  baseUpgrades: {
    repair: { label: 'Reparar base', amount: 30, cost: 35 },
    armor: { label: 'Blindaje de la base', perLevel: 20, max: 5, baseCost: 60 },
  },
  costGrowth: 1.7,

  grenades: {
    grabRadius: 0.35, // distancia mano-cajón para sacar una granada
    throwMult: 1.5, // multiplica la velocidad real del control (para llegar lejos sin romperse el brazo)
    maxSpeed: 24,
    fuse: 2.0, // segundos desde que la soltás
    restitution: 0.35, // rebote en el piso
    radius: 0.05,
    types: {
      frag: { name: 'Granada', short: 'Gr', color: 0x3fae3f, radius: 3.5, damage: 120, count: 3, unlock: null },
      cluster: {
        name: 'Racimo', short: 'Ra', color: 0xff7a1a, radius: 2.5, damage: 60, count: 2,
        bomblets: 6, bombletRadius: 2, bombletDamage: 50,
        unlock: { cost: 220 },
      },
      ice: {
        name: 'Hielo', short: 'Hi', color: 0x5fd7ff, radius: 4.5, damage: 15, count: 2,
        freeze: 1.5, slow: 4, slowMult: 0.35, // congela 1,5 s y después ralentiza 4 s al 35%
        unlock: { cost: 180 },
      },
    },
    upgrades: {
      capacity: { label: 'Capacidad', max: 3, baseCost: 80, desc: '+1 de cada tipo por oleada' },
      radius: { label: 'Radio de explosión', max: 3, baseCost: 90, desc: '+20% de radio' },
    },
  },

  // Ametralladora montada en la silla.
  turret: {
    unlockLevel: 8, // se desbloquea al llegar a este nivel (queda guardado)
    seatHeadHeight: 1.2, // sentado = cabeza por debajo de esto (m)…
    standHeadHeight: 1.32, // …y se desmonta al pararse por encima de esto
    seatRadius: 0.75, // y a esta distancia horizontal de la silla
    pivot: [0, 0.95, 0.55], // dónde gira el arma, relativo a la silla (z = hacia el parque)
    yawLimitDeg: 65, // giro máximo a cada lado
    pitchMinDeg: -15,
    pitchMaxDeg: 35,
    turnSpeed: 7, // qué tan rápido sigue al control
    damage: 16,
    fireRate: 16, // disparos por segundo con el cañón a full
    spinUp: 0.6, // segundos que tarda el cañón en girar a full
    spreadDeg: 1.6,
    range: 90,
    heatPerShot: 0.012, // ~5 s de fuego continuo hasta trabarse
    coolRate: 0.22, // calor que baja por segundo sin disparar
    overheatTime: 3, // segundos trabada
    upgrades: {
      damage: { label: 'Daño', max: 4, baseCost: 120, desc: '+25% por nivel' },
      cooling: { label: 'Enfriamiento', max: 4, baseCost: 100, desc: '+30% más rápido, calienta menos' },
      explosive: { label: 'Balas explosivas', max: 3, baseCost: 200, desc: 'Cada 3 balas, una explota', special: true },
    },
  },

  hand: {
    grabRadius: 0.22, // distancia mano-arma para agarrar
    returnRadius: 0.3, // distancia mano-armero para devolver
    // Desplazamiento del arma respecto del rayo del control (x, y, z en metros).
    weaponOffset: [0, -0.02, 0.05],
    // Desplazamiento del panel de muñeca respecto del grip izquierdo.
    wristOffset: [0, 0.05, 0.1],
  },

  // Panel de mejoras, relativo al armero (x a la derecha del armero, z hacia el jugador).
  shopPanel: { offset: [1.08, 0.0, 0.25], yaw: -0.35, width: 0.8 },

  recalibrateHoldSeconds: 2,
};
