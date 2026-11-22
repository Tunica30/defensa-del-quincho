import * as THREE from 'three';
import { Game } from './game.js';
import { Storage } from './storage.js';

const $ = (id) => document.getElementById(id);
const overlay = $('overlay');
const btnAr = $('btn-ar');
const btnDesktop = $('btn-desktop');
const btnRecal = $('btn-recal');
const statusEl = $('status');
const logEl = $('log');
const help = $('desktop-help');
const cross = $('crosshair');

let game = null;

// Errores visibles en la página y, dentro del visor, en un cartel rojo.
function log(msg) {
  console.error(msg);
  logEl.textContent = (logEl.textContent + '\n' + msg).trim().split('\n').slice(-8).join('\n');
  if (game && game.hud) game.hud.showError(msg);
}
window.addEventListener('error', (e) => log(`Error: ${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
window.addEventListener('unhandledrejection', (e) => log(`Promesa rechazada: ${(e.reason && e.reason.message) || e.reason}`));

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0); // fondo transparente = passthrough
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

game = new Game(renderer);
window.game = game; // para depurar desde la consola (chrome://inspect)

const continueRow = $('continue-row');
const continueBox = $('chk-continue');
const continueLabel = $('continue-label');

function refreshStatus(extra = '') {
  const cal = Storage.loadCalibration();
  const rec = Storage.loadRecords();
  const run = Storage.loadRun();
  statusEl.textContent =
    (cal ? 'Calibración guardada: se re-ancla con un gatillo.' : 'Sin calibración: te va a guiar en 4 pasos.') +
    (rec.maxLevel ? ` · Récord: nivel ${rec.maxLevel}.` : '') +
    (extra ? ' ' + extra : '');
  // Por defecto, partida nueva. Si hay una guardada, se puede elegir continuarla.
  continueRow.hidden = !run;
  if (run) continueLabel.textContent = `Continuar partida guardada (nivel ${run.level + 1}, $${run.coins})`;
  else continueBox.checked = false;
}

function applyContinueChoice() {
  game.wantContinue = continueBox.checked && !!Storage.loadRun();
  continueBox.checked = false; // la próxima vez vuelve a ser partida nueva
}

async function checkXR() {
  if (!navigator.xr) {
    btnAr.textContent = 'WebXR no disponible';
    refreshStatus(window.isSecureContext ? 'Este navegador no soporta WebXR.' : 'WebXR necesita HTTPS o localhost.');
    return;
  }
  try {
    const ok = await navigator.xr.isSessionSupported('immersive-ar');
    btnAr.disabled = !ok;
    btnAr.textContent = ok ? 'Entrar en realidad mixta' : 'AR no soportado en este dispositivo';
  } catch (err) {
    btnAr.textContent = 'AR no disponible';
    log('isSessionSupported: ' + err.message);
  }
  refreshStatus();
}

btnAr.addEventListener('click', async () => {
  game.audio.resume(); // tiene que ser dentro del gesto del usuario
  applyContinueChoice();
  try {
    const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['local-floor'] });
    session.addEventListener('end', () => {
      overlay.hidden = false;
      game.onXREnd();
      refreshStatus();
    });
    await renderer.xr.setSession(session);
    overlay.hidden = true;
    game.startXR();
  } catch (err) {
    log('No se pudo iniciar AR: ' + err.message);
    overlay.hidden = false;
  }
});

btnDesktop.addEventListener('click', () => {
  game.audio.resume();
  applyContinueChoice();
  overlay.hidden = true;
  help.hidden = false;
  cross.hidden = false;
  game.startDesktop();
});

game.onExitDesktop = () => {
  overlay.hidden = false;
  help.hidden = true;
  cross.hidden = true;
  refreshStatus();
};

btnRecal.addEventListener('click', () => {
  Storage.clearCalibration();
  refreshStatus('(Calibración borrada.)');
});

$('btn-reset').addEventListener('click', () => {
  if (!window.confirm('¿Borrar la partida guardada y el récord? No se puede deshacer.')) return;
  game.resetProgress();
  refreshStatus('(Progreso borrado.)');
});

checkXR();
