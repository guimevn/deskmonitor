import assert from 'node:assert/strict';

// Polyfills mínimos de browser para testar os módulos ES puros em Node.js
globalThis.window = globalThis;
globalThis.localStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    clear: () => store.clear()
  };
})();

const { PostureAnalyzer, PostureState } = await import('../src/js/posture.js');
const { HydrationTracker, DoomscrollDetector, FocusManager } = await import('../src/js/habits.js');
const { DeskBonsai, BonsaiState } = await import('../src/js/bonsai.js');

// Helper para gerar 33 landmarks válidos em postura neutra
function makeLandmarks(overrides = {}) {
  const lms = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  lms[0] = { x: 0.5, y: 0.30, z: -0.10, visibility: 0.99 };  // nose
  lms[7] = { x: 0.43, y: 0.30, z: -0.05, visibility: 0.99 }; // left ear
  lms[8] = { x: 0.57, y: 0.30, z: -0.05, visibility: 0.99 }; // right ear
  lms[9] = { x: 0.48, y: 0.35, z: -0.09, visibility: 0.99 }; // left mouth
  lms[10] = { x: 0.52, y: 0.35, z: -0.09, visibility: 0.99 }; // right mouth
  lms[11] = { x: 0.35, y: 0.55, z: 0.00, visibility: 0.99 }; // left shoulder
  lms[12] = { x: 0.65, y: 0.55, z: 0.00, visibility: 0.99 }; // right shoulder
  lms[15] = { x: 0.25, y: 0.85, z: 0.00, visibility: 0.99 }; // left wrist (down)
  lms[16] = { x: 0.75, y: 0.85, z: 0.00, visibility: 0.99 }; // right wrist (down)
  for (const [idx, val] of Object.entries(overrides)) {
    lms[Number(idx)] = { ...lms[Number(idx)], ...val };
  }
  return lms;
}

// Simulação determinística de performance.now()
let mockNow = 1000;
const origNow = performance.now.bind(performance);
performance.now = () => mockNow;

try {
  // 1. PostureAnalyzer: calibração + slouch + debounce -> ALERT -> recovery -> GOOD
  const analyzer = new PostureAnalyzer();
  analyzer.startCalibration();
  const neutral = makeLandmarks();

  analyzer.process(neutral);
  assert.equal(analyzer.state, PostureState.CALIBRATING);

  mockNow += 3100;
  analyzer.process(neutral);
  assert.equal(analyzer.isCalibrated, true);
  assert.equal(analyzer.state, PostureState.GOOD);

  // Slouch (nariz desce perto dos ombros)
  const slouched = makeLandmarks({ 0: { y: 0.48 } });
  for (let i = 0; i < 10; i++) {
    mockNow += 300;
    analyzer.process(slouched);
  }
  assert.equal(analyzer.state, PostureState.WARNING);

  // Sustenta > 8s
  mockNow += 6000;
  analyzer.process(slouched);
  assert.equal(analyzer.state, PostureState.ALERT);

  // Recupera por > 2s
  for (let i = 0; i < 12; i++) {
    mockNow += 300;
    analyzer.process(neutral);
  }
  assert.equal(analyzer.state, PostureState.GOOD);

  // Nerd Neck (cabeça projetada para frente no eixo Z)
  const nerdNeck = makeLandmarks({ 0: { z: -0.30 } });
  for (let i = 0; i < 10; i++) {
    mockNow += 300;
    analyzer.process(nerdNeck);
  }
  assert.equal(analyzer.currentMetrics.isForwardHead, true);
  for (let i = 0; i < 12; i++) {
    mockNow += 300;
    analyzer.process(neutral);
  }

  // Assimetria Escapular (ombro inclinado > 7 graus)
  const tilted = makeLandmarks({ 11: { y: 0.50 }, 12: { y: 0.62 } });
  for (let i = 0; i < 10; i++) {
    mockNow += 300;
    analyzer.process(tilted);
  }
  assert.equal(analyzer.currentMetrics.isShoulderTilted, true);

  // 2. HydrationTracker: gesto de beber >= 1.2s, sem cooldown e filtrando falsos positivos
  let hydrationEvents = 0;
  const hydration = new HydrationTracker(() => { hydrationEvents++; });

  // Falso positivo: mão acima do nariz (óculos/testa/cabelo) não deve registrar
  const touchingForehead = makeLandmarks({ 15: { x: 0.50, y: 0.20 }, 13: { x: 0.38, y: 0.55 } });
  hydration.process(touchingForehead, 0.30);
  mockNow += 1500;
  hydration.process(touchingForehead, 0.30);
  assert.equal(hydration.glasses, 0);

  // Falso positivo: mão na lateral (orelha/bochecha) não deve registrar
  const touchingEar = makeLandmarks({ 15: { x: 0.28, y: 0.35 }, 13: { x: 0.25, y: 0.55 } });
  hydration.process(touchingEar, 0.30);
  mockNow += 1500;
  hydration.process(touchingEar, 0.30);
  assert.equal(hydration.glasses, 0);

  // Gesto real de beber (mão alinhada à boca, cotovelo abaixo do pulso)
  const drinking = makeLandmarks({ 15: { x: 0.50, y: 0.36 }, 13: { x: 0.38, y: 0.60 } });
  hydration.process(drinking, 0.30);
  assert.equal(hydration.glasses, 0);
  mockNow += 1300;
  const hRes = hydration.process(drinking, 0.30);
  assert.equal(hRes.isRegistered, true);
  assert.equal(hydration.glasses, 1);
  assert.equal(hydration.totalMl, 250);
  assert.equal(hydrationEvents, 1);

  // Sem cooldown: baixa a mão (>600ms) e sobe de novo imediatamente para o 2º gole
  hydration.process(neutral, 0.30);
  mockNow += 700;
  hydration.process(neutral, 0.30);
  hydration.process(drinking, 0.30);
  mockNow += 1300;
  hydration.process(drinking, 0.30);
  assert.equal(hydration.glasses, 2);
  assert.equal(hydration.totalMl, 500);

  hydration.addManualGlass();
  assert.equal(hydration.glasses, 3);
  hydration.removeManualGlass();
  assert.equal(hydration.glasses, 2);

  // 3. DoomscrollDetector: olhar para baixo > 15s
  let doomAlerts = 0;
  const doom = new DoomscrollDetector(() => { doomAlerts++; });
  const lookingDown = makeLandmarks({ 0: { y: 0.48 }, 7: { y: 0.25 }, 8: { y: 0.25 } });

  doom.process(lookingDown, 0.30);
  mockNow += 15500;
  const dRes = doom.process(lookingDown, 0.30);
  assert.equal(dRes.isDoomscrolling, true);
  assert.equal(doomAlerts, 1);

  // 4. FocusManager: auto-pause após 30s ausente e retomada após 2s presente
  const focusEvents = [];
  const focus = new FocusManager((st) => focusEvents.push(st));
  mockNow += 1000;
  focus.process(true);
  assert.equal(focus.getState().focusedSeconds, 1);

  // Simula ausência por 31s em passos de 1s
  for (let i = 0; i < 32; i++) {
    mockNow += 1000;
    focus.process(false);
  }
  assert.equal(focus.getState().isAutoPaused, true);
  assert.ok(focusEvents.includes('AUTO_PAUSED'));

  // Retorna por 3s
  for (let i = 0; i < 3; i++) {
    mockNow += 1000;
    focus.process(true);
  }
  assert.equal(focus.getState().isAutoPaused, false);
  assert.ok(focusEvents.includes('RESUMED'));

  // 5. DeskBonsai: estados + level up + render sem erros
  const fakeContainer = { innerHTML: '' };
  let leveledUpTo = null;
  const bonsai = new DeskBonsai(fakeContainer, (lvl) => { leveledUpTo = lvl; });
  bonsai.update(95, false, 2, 10);
  assert.equal(bonsai.state, BonsaiState.BLOOMING);
  assert.ok(fakeContainer.innerHTML.includes('FLORESCENDO'));

  bonsai.addXp(120);
  assert.equal(bonsai.level, 2);
  assert.equal(leveledUpTo, 2);
  assert.equal(bonsai.xp, 20);

  bonsai.update(50, true, 0, 10);
  assert.equal(bonsai.state, BonsaiState.WITHERING);

  console.log('ALL TESTS PASSED (Posture, Hydration, Doomscroll, Focus, Bonsai)');
} finally {
  performance.now = origNow;
}
