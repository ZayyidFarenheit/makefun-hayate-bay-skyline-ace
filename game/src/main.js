// HAYATE BAY: SKYLINE ACE — main game. Three.js (global THREE), procedural everything.
import { JETS, REFITS, SORTIES, BONUS, RADIO, CONTACTS, rankFor, RANK_NAMES } from './data.js';
import { World } from './world.js';
import { AudioEngine } from './audio.js';

const T = window.THREE;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const params = new URLSearchParams(location.search);
const SAFE = params.has('safe');
const AUTOPLAY = params.has('autoplay');
const SHOT = params.get('shot');
let loadPct = 5; const setLoad = (p, m) => { loadPct = p; $('loadfill').style.width = p + '%'; if (m) $('loadmsg').textContent = m; };
window.addEventListener('error', e => { const el = $('error'); el.style.display = 'block'; el.textContent = 'Error: ' + (e.message || e.error); });

// ---------- persistent progress ----------
let save = { cleared: [], xp: 190, money: 58400, day: 10, refits: [], jet: 'K-21', sortie: 5 };
try { const s = JSON.parse(localStorage.getItem('hayate-bay-save') || 'null'); if (s) save = Object.assign(save, s); } catch (e) {}
function persist() { try { localStorage.setItem('hayate-bay-save', JSON.stringify(save)); } catch (e) {} }
const hasRefit = id => save.refits.includes(id);

// ---------- state ----------
const S = {
  mode: 'menu', paused: false, time: 0, timeScale: 1,
  jetId: save.jet || 'K-21', sortie: null, sortieNum: save.sortie || 5, stageIdx: 0, stageDone: 0,
  pos: new T.Vector3(0, 120, 500), yaw: 0, pitch: 0, roll: 0, yawT: 0, pitchT: 0, rollT: 0,
  speed: 0, throttle: 0.6, heat: 0, fuel: 100, hull: 100, fever: 0, feverMult: 1,
  gear: false, flaps: false, hook: false, glideLock: true,
  score: 0, scoreShown: 0, scoreTarget: 0, combo: 0,
  gust: 26, wind: new T.Vector3(4, 0, 2), weather: 'golden',
  camMode: 'chase', cockpit: false, crashed: false, crashCause: '', crashTimer: 0,
  enemy: null, enemyHp: 100, escort: null, escortTimer: 0, crateDropped: null, crateDone: false,
  cds: { radar: 0, chill: 0, flare: 0 }, shake: 0, fovKick: 0, slowmo: 0,
  dialogueQueue: [], dlgTimer: 0, bannerTimer: 0, lightningTimer: 5, rainOn: false,
  fpsEMA: 60, quality: 2, frames: 0, fpsTime: 0, menuAngle: 0, orbitDrag: 0,
  startPos: new T.Vector3(), checkpoint: null, landingSink: 0, lastVertSpeed: 0,
};
const keys = {};
let mouseDown = false, mouseDX = 0, mouseDY = 0;

const audio = new AudioEngine();
let renderer, scene, camera, world, jetMesh, menuJet, trail, particlePoints, particleGeo, rainPoints, rainGeo;
let routePoints = [];
const tmpV = new T.Vector3(), tmpV2 = new T.Vector3();

// ---------- init ----------
function init() {
  setLoad(20, 'Building the bay…');
  const canvas = $('gl');
  renderer = new T.WebGLRenderer({ canvas, antialias: !SAFE, powerPreference: 'high-performance' });
  renderer.setPixelRatio(SAFE ? 1 : Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 6000);
  camera.position.set(0, 140, 700);
  world = new World(scene);
  setLoad(45, 'Painting the sunset…');
  buildParticles(); buildRain(); buildTrail();
  menuJet = world.buildJet(S.jetId); menuJet.position.set(0, 70, 320); menuJet.scale.set(2.2,2.2,2.2); scene.add(menuJet);
  jetMesh = world.buildJet(S.jetId); jetMesh.visible = false; scene.add(jetMesh);
  buildMenu(); applyWeather('golden'); updateClock();
  setLoad(80, 'Warming engines…');
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) S.paused = true; });
  bindInput();
  setLoad(100, 'Ready');
  setTimeout(() => { $('loading').style.display = 'none'; window.__kazebay.ready = true; }, 250);
  if (SHOT) setupShot(SHOT);
  else if (AUTOPLAY) { setTimeout(() => { selectSortie(5); launch(); }, 600); }
  requestAnimationFrame(loop);
}
function buildParticles() {
  particleGeo = new T.BufferGeometry();
  particleGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(500 * 3), 3));
  particlePoints = new T.Points(particleGeo, new T.PointsMaterial({ color: 0xffd76a, size: 2.2, transparent: true, opacity: 0.95 }));
  particlePoints.frustumCulled = false; scene.add(particlePoints);
}
function buildRain() {
  rainGeo = new T.BufferGeometry();
  const arr = new Float32Array(700 * 3);
  for (let i = 0; i < 700; i++) { arr[i * 3] = (Math.random() - 0.5) * 600; arr[i * 3 + 1] = Math.random() * 300; arr[i * 3 + 2] = (Math.random() - 0.5) * 600; }
  rainGeo.setAttribute('position', new T.BufferAttribute(arr, 3));
  rainPoints = new T.Points(rainGeo, new T.PointsMaterial({ color: 0xaaccee, size: 1.4, transparent: true, opacity: 0.6 }));
  rainPoints.visible = false; rainPoints.frustumCulled = false; scene.add(rainPoints);
}
function buildTrail() {
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(60 * 3), 3));
  trail = new T.Line(g, new T.LineBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.7 }));
  trail.frustumCulled = false; scene.add(trail);
  S.trailPts = [];
}

// ---------- menu ----------
function allSorties() { return SORTIES.concat(BONUS.map(b => ({ ...b, bonus: true }))); }
function isUnlocked(s) {
  if (s.flagship) return true; // flagship is always open as the demo sortie
  if (s.bonus) return save.cleared.includes(4) || s.n === 'B1';
  return s.n === 1 || save.cleared.includes(s.n - 1);
}
function buildMenu() {
  const sl = $('sortieList'); sl.innerHTML = '';
  for (const s of SORTIES) {
    const d = document.createElement('div'); d.className = 'row' + (s.flagship ? ' flag' : '') + (isUnlocked(s) ? '' : ' locked') + (S.sortieNum === s.n ? ' sel' : '');
    d.innerHTML = `<span>${s.n} ${s.name}${s.flagship ? ' ★ FLAGSHIP' : ''}${save.cleared.includes(s.n) ? ' ✓' : ''}${isUnlocked(s) ? '' : ' 🔒'}</span><span class="xp">${s.xp} XP</span>`;
    d.onclick = () => { if (!isUnlocked(s)) { toast('Clear sortie ' + (s.n - 1) + ' first'); return; } selectSortie(s.n); };
    sl.appendChild(d);
  }
  const bl = $('bonusList'); bl.innerHTML = '';
  for (const s of BONUS) {
    const d = document.createElement('div'); d.className = 'row' + (isUnlocked(s) ? '' : ' locked') + (String(S.sortieNum) === String(s.n) ? ' sel' : '');
    d.innerHTML = `<span>${s.n} ${s.name}${save.cleared.includes(s.n) ? ' ✓' : ''}${isUnlocked(s) ? '' : ' 🔒'}</span><span class="xp">${s.xp} XP</span>`;
    d.onclick = () => { if (!isUnlocked(s)) { toast('Clear sortie 4 first'); return; } selectSortie(s.n); };
    bl.appendChild(d);
  }
  const jl = $('jetList'); jl.innerHTML = '';
  for (const id of Object.keys(JETS)) {
    const j = JETS[id];
    const d = document.createElement('div'); d.className = 'jetcard' + (S.jetId === id ? ' sel' : '');
    d.innerHTML = `<b>${j.name}</b><div class="small mint">${j.role}</div><div class="stats">SPD ${j.spd} · TRN ${j.trn} · ARM ${j.arm}</div>`;
    d.onclick = () => selectJet(id); jl.querySelectorAll('.jetcard').forEach(e => e.classList.remove('sel')); d.classList.add('sel');
    jl.appendChild(d);
  }
  const rl = $('refitList'); rl.innerHTML = '';
  for (const r of REFITS) {
    const b = document.createElement('button'); b.className = 'pill' + (hasRefit(r.id) ? ' on' : '');
    b.innerHTML = `${r.name} <span class="pr">$${r.price}</span>`;
    b.title = r.desc;
    b.onclick = () => toggleRefit(r, b);
    rl.appendChild(b);
  }
  updateDebrief();
}
function updateDebrief() {
  let last = 'No sortie flown yet — launch CANYON GOLDEN HOUR.';
  try { last = localStorage.getItem('hayate-bay-debrief') || last; } catch (e) {}
  $('debrief').innerHTML = `<span class="gold">DEBRIEF</span><br>${last}`;
}
function toggleRefit(r, btn) {
  if (hasRefit(r.id)) { save.refits = save.refits.filter(x => x !== r.id); save.money += Math.floor(r.price / 2); btn.classList.remove('on'); toast(r.name + ' removed — refund $' + Math.floor(r.price / 2)); }
  else {
    if (save.money < r.price) { toast('Not enough money for ' + r.name + ' ($' + r.price + ')'); return; }
    save.money -= r.price; save.refits.push(r.id); btn.classList.add('on'); toast(r.name + ' installed — ' + r.desc);
  }
  persist(); updateClock();
}
function selectJet(id) {
  S.jetId = id; save.jet = id; persist();
  scene.remove(menuJet); menuJet = world.buildJet(id); menuJet.position.set(0, 70, 320); menuJet.scale.set(2.2,2.2,2.2); scene.add(menuJet);
  scene.remove(jetMesh); jetMesh = world.buildJet(id); jetMesh.visible = false; scene.add(jetMesh);
  $('jetName').textContent = JETS[id].short;
}
function selectSortie(n) { S.sortieNum = n; save.sortie = n; persist(); buildMenu(); }
function toast(msg) { say('Kaze Tower', msg); }
function say(name, text) { S.dialogueQueue.push({ name, text }); }

// ---------- weather ----------
function applyWeather(w) {
  S.weather = w;
  const fog = scene.fog;
  if (w === 'storm') { fog.color.set(0x5a4a6a); world.sunLight.intensity = 0.5; S.rainOn = true; S.gust = 34; }
  else if (w === 'night') { fog.color.set(0x1a2440); world.sunLight.intensity = 0.35; S.rainOn = false; S.gust = 18; }
  else { fog.color.set(0xe8906a); world.sunLight.intensity = 1.25; S.rainOn = false; S.gust = w === 'golden' ? 26 : 20; }
  rainPoints.visible = S.rainOn && S.quality > 0;
  $('gustPill').textContent = 'GUST ' + S.gust + ' KT';
}
function updateClock() {
  const mins = 17 * 60 + 35 + Math.floor(S.time / 60);
  const hh = String(Math.floor(mins / 60) % 24).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
  $('clock').textContent = `${hh}:${mm} · DAY ${save.day} · $${save.money.toLocaleString()}`;
  const r = rankFor(save.xp);
  $('rankLine').textContent = `★ RANK ${r} · ${RANK_NAMES[r]} · ${save.xp} XP`;
}

// ---------- input ----------
function bindInput() {
  addEventListener('keydown', e => {
    if (e.repeat) return; keys[e.code] = true;
    if (e.code === 'Enter' && S.mode === 'menu') launch();
    if (e.code === 'KeyC') toggleCockpit();
    if (e.code === 'KeyV') { S.camMode = S.camMode === 'chase' ? 'orbit' : 'chase'; }
    if (e.code === 'KeyG') { S.gear = !S.gear; say('Capt. Kenji Sato', S.gear ? 'Gear down. Three green.' : 'Gear up.'); syncGear(); }
    if (e.code === 'KeyF') { S.flaps = !S.flaps; syncGear(); }
    if (e.code === 'KeyX') dropCrate();
    if (e.code === 'KeyR' && (S.mode === 'crashed' || S.mode === 'complete')) retry();
    if (e.code === 'KeyM') { const m = audio.toggleMute(); toast(m ? 'Sound muted' : 'Sound on'); }
    if (e.code === 'KeyP') { S.paused = !S.paused; }
    if (e.code === 'Digit1') useAbility('radar');
    if (e.code === 'Digit2') useAbility('chill');
    if (e.code === 'Digit3') useAbility('flare');
    if (e.code === 'Escape' && S.mode === 'flying') backToMenu();
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  const cv = $('gl');
  cv.addEventListener('pointerdown', e => { mouseDown = true; mouseDX = 0; mouseDY = 0; audio.init(); });
  addEventListener('pointermove', e => { if (mouseDown) { mouseDX += e.movementX || 0; mouseDY += e.movementY || 0; } });
  addEventListener('pointerup', () => { mouseDown = false; });
  cv.addEventListener('wheel', e => { if (S.mode === 'menu') S.orbitDrag = clamp(S.orbitDrag + e.deltaY * 0.01, -20, 40); }, { passive: true });
  $('launch').onclick = () => { audio.init(); launch(); };
  $('endMenu').onclick = backToMenu; $('endRetry').onclick = retry; $('endNext').onclick = () => { const next = typeof S.sortieNum === 'number' ? Math.min(12, S.sortieNum + 1) : 1; selectSortie(next); backToMenu(); setTimeout(launch, 100); };
  $('thr').addEventListener('pointerdown', e => { const r = $('thr').getBoundingClientRect(); const move = ev => { S.throttle = clamp(1 - (ev.clientY - r.top) / r.height, 0, 1); }; const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); }; addEventListener('pointermove', move); addEventListener('pointerup', up); move(e); });
  document.querySelectorAll('#touch button').forEach(b => {
    b.addEventListener('pointerdown', () => { keys[b.dataset.k] = true; });
    b.addEventListener('pointerup', () => { keys[b.dataset.k] = false; });
    b.addEventListener('pointerleave', () => { keys[b.dataset.k] = false; });
  });
  if ('ontouchstart' in window) $('touch').style.display = 'flex';
  if (navigator.getGamepads) setInterval(() => { const gp = navigator.getGamepads()[0]; if (gp) S.gamepad = gp; }, 500);
}
function syncGear() {
  const g = jetMesh.getObjectByName('gear'); if (g) g.visible = S.gear;
  $('chipGear').className = 'chip' + (S.gear ? ' lit' : '');
  $('chipFlaps').className = 'chip' + (S.flaps ? ' lit' : '');
  $('stGear').className = 'statBtn' + (S.gear ? ' lit' : '');
  $('stFlaps').className = 'statBtn' + (S.flaps ? ' lit' : '');
  $('stHook').className = 'statBtn' + (S.hook ? ' lit' : '');
  $('stGlide').className = 'statBtn' + (S.glideLock ? ' lit' : '');
}
function setCockpit(on) {
  S.cockpit = on;
  $('cockpit').style.display = on ? 'block' : 'none';
  $('feverWrap').style.display = on ? 'none' : 'block';
  $('dialog').style.display = on ? 'none' : 'flex';
  if (S.mode === 'flying') jetMesh.visible = !on;
}
function toggleCockpit() {
  if (S.mode !== 'flying') return;
  setCockpit(!S.cockpit);
}

// ---------- mission setup ----------
function currentSortie() { return allSorties().find(s => String(s.n) === String(S.sortieNum)) || SORTIES[4]; }
function launch(force) {
  const s = currentSortie();
  if (!force && !isUnlocked(s)) { toast('Sortie locked — clear the previous one first'); return; }
  S.sortie = s; S.mode = 'flying'; S.crashed = false; S.stageIdx = 0; S.stageDone = 0;
  S.score = 0; S.scoreShown = 0; S.scoreTarget = 0; S.fever = 10; S.heat = 0; S.fuel = 100;
  S.hull = 100 + (hasRefit('titan') ? 25 : 0);
  S.throttle = 0.65; S.gear = false; S.flaps = false; S.hook = false; S.crateDone = false; S.crateDropped = null;
  S.pos.set(0, 130, 520); S.yaw = 0; S.pitch = 0; S.roll = 0; S.yawT = 0; S.pitchT = 0; S.rollT = 0; S.speed = 150;
  S.startPos.copy(S.pos); S.checkpoint = { pos: S.pos.clone(), yaw: 0 };
  applyWeather(s.weather || 'golden');
  $('menu').style.display = 'none'; $('menuHint').style.display = 'none'; $('hud').style.display = 'block';
  $('endScreen').style.display = 'none';
  jetMesh.visible = true; menuJet.visible = false;
  $('hudSortie').textContent = `SORTIE ${s.n}/12 · SKYLINE SEASON`;
  $('hudMission').textContent = s.name;
  $('jetName').textContent = JETS[S.jetId].short;
  $('goldhud') && null;
  document.body.style.setProperty('--gold', hasRefit('goldhud') ? '#ffe9a8' : '#ffd76a');
  clearStageObjects(); setupStage();
  S.dialogueQueue = []; say('Capt. Kenji Sato', RADIO.kenji[Math.floor(Math.random() * RADIO.kenji.length)]);
  if (s.n === 4) say('Capt. Kenji Sato', RADIO.kenji[1]);
  if (s.n === 12 || s.n === 11) say('VOID ACE', RADIO.boss[0]);
  syncGear(); setCockpit(false); audio.init(); updateClock();
}
function clearStageObjects() {
  for (const r of world.rings) scene.remove(r); world.rings = [];
  for (const c of world.crates) scene.remove(c); world.crates = [];
  if (S.enemy) { scene.remove(S.enemy); S.enemy = null; }
  if (S.escort) { scene.remove(S.escort); S.escort = null; }
}
function routeFor(stage, idx) {
  // waypoints running north (-z) through the canyon
  const base = [
    new T.Vector3(0, 110, 260), new T.Vector3(-50, 85, -40), new T.Vector3(30, 75, -320),
    new T.Vector3(-40, 95, -620), new T.Vector3(0, 110, -900), new T.Vector3(50, 90, -1180),
  ];
  return base;
}
function setupStage() {
  const s = S.sortie; if (!s) return;
  const st = s.stages[S.stageIdx]; if (!st) { completeMission(); return; }
  S.stageDone = 0; S.stageTarget = st.count;
  $('hudStage').textContent = `STAGE ${S.stageIdx + 1}/${s.stages.length}`;
  renderObjectives();
  routePoints = routeFor(st, S.stageIdx);
  clearStageObjects();
  const wp = routePoints;
  if (st.type === 'rings' || st.type === 'arch') {
    for (let i = 0; i < st.count; i++) {
      const p = wp[i % wp.length].clone(); if (st.type === 'arch') { p.set(0, 95, -700 - i * 30); }
      const ring = world.makeRing(i + 1, st.type === 'arch' ? 18 : 14);
      ring.position.copy(p); scene.add(ring); world.rings.push(ring);
    }
    $('routePill').textContent = `ROUTE PLAN · ${st.count} STOPS ${Array.from({ length: st.count }, (_, i) => '(' + (i + 1) + ')').join('→')} · 1.0s`;
  } else if (st.type === 'bridge') {
    const ring = world.makeRing(1, 20); ring.position.set(0, 52, -320); scene.add(ring); world.rings.push(ring);
    say('Capt. Kenji Sato', 'Under the span — not over it. The deck is at 78 feet.');
  } else if (st.type === 'carrier') {
    const ring = world.makeRing(1, 22); ring.position.set(180, 90, 900); scene.add(ring); world.rings.push(ring);
    S.gear = true; S.hook = true; syncGear();
    say('Capt. Kenji Sato', 'Kaze Tower — cleared for Carrier Quals. Meatball is lit, call the ball.');
  } else if (st.type === 'crate') {
    const pier = new T.Mesh(new T.BoxGeometry(40, 4, 40), new T.MeshLambertMaterial({ color: 0x8a6d3b })); pier.position.set(60, 2, 420); scene.add(pier); world.crates.push(pier);
    const ring = world.makeRing(1, 16); ring.position.set(60, 60, 420); scene.add(ring); world.rings.push(ring);
    say('Maya', 'Pier 4 is marked. Press X over the pier to drop the crate.');
  } else if (st.type === 'escort') {
    const npc = world.buildJet('S-50'); npc.position.set(-30, 120, 300); scene.add(npc); S.escort = npc; S.escortTimer = 0;
    say('JADE-2', 'JADE-2 on station. Stay close, we fly through this together.');
  } else if (st.type === 'intercept' || st.type === 'duel') {
    const en = world.buildJet('Z-9'); en.position.set(0, 150, -300); scene.add(en); S.enemy = en; S.enemyHp = st.type === 'duel' ? 150 : 100;
    say(st.type === 'duel' ? 'TEMPEST' : 'Kaze Tower', st.type === 'duel' ? RADIO.boss[1] : 'Bandit on scope, 12 o\'clock. Intercept it — get close and hold your guns on him.');
  }
  renderObjectives();
}
function renderObjectives() {
  const s = S.sortie; if (!s) return;
  $('objectives').innerHTML = s.stages.map((st, i) => {
    const done = i < S.stageIdx || (i === S.stageIdx && S.stageDone >= st.count);
    const cur = i === S.stageIdx ? ` (${S.stageDone}/${st.count})` : '';
    return `<div class="${done ? 'done' : 'todo'}">${done ? '☑' : '☐'} ${st.text}${cur}</div>`;
  }).join('');
}
function addScore(base, label) {
  const pts = Math.round(base * S.feverMult);
  S.scoreTarget += pts;
  showBanner(`★ ${label} · +${pts.toLocaleString()} PTS`);
  audio.chime();
}
function showBanner(text) {
  const b = $('banner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function warn(text, ms) {
  const w = $('warn'); w.textContent = text; w.style.display = 'block';
  clearTimeout(S.warnT); S.warnT = setTimeout(() => { w.style.display = 'none'; }, ms || 1800);
}

// ---------- abilities ----------
function useAbility(kind) {
  if (S.mode !== 'flying' || S.crashed) return;
  if (kind === 'radar' && S.cds.radar <= 0) { S.cds.radar = hasRefit('radar') ? 9 : 15; say('Kenji', RADIO.kenji[2]); flashContacts(); audio.blip(1200, 0.2, 'sine', 0.2); }
  if (kind === 'chill' && S.cds.chill <= 0) { S.cds.chill = 12; S.heat = Math.max(0, S.heat - 55); say('Maya', RADIO.maya[0]); }
  if (kind === 'flare' && S.cds.flare <= 0) { S.cds.flare = 18; world.burst(S.pos, 0xffd76a, 30); say('Tariq', RADIO.tariq[0]); if (S.enemy) S.enemyHp -= 10; }
}
function flashContacts() { $('contacts').innerHTML = CONTACTS.map(c => `<div>✈ ${c.name} <span class="mint">[${c.tag}]</span></div>`).join(''); }
function dropCrate() {
  if (S.mode !== 'flying' || S.crateDropped || !S.sortie) return;
  const st = S.sortie.stages[S.stageIdx]; if (!st || st.type !== 'crate') return;
  const crate = world.makeCrate(); crate.position.copy(S.pos); scene.add(crate); world.crates.push(crate);
  S.crateDropped = crate; say('Maya', 'Crate away — chute is open.');
}

// ---------- flight step (fixed 1/60) ----------
function step(dt) {
  const jet = JETS[S.jetId];
  const turnBoost = hasRefit('vector') ? 1.2 : 1;
  // input -> smoothed targets (critically damped-ish)
  let pitchIn = 0, yawIn = 0, rollIn = 0;
  if (keys['ArrowUp'] || keys['KeyW']) pitchIn -= 1;
  if (keys['ArrowDown'] || keys['KeyS']) pitchIn += 1;
  if (keys['ArrowLeft'] || keys['KeyA']) { yawIn -= 1; rollIn -= 1; }
  if (keys['ArrowRight'] || keys['KeyD']) { yawIn += 1; rollIn += 1; }
  if (keys['KeyQ']) rollIn -= 1; if (keys['KeyE']) rollIn += 1;
  if (mouseDown) { pitchIn += clamp(mouseDY * 0.004, -1, 1); yawIn += clamp(mouseDX * 0.004, -1, 1); rollIn += clamp(mouseDX * 0.004, -1, 1); mouseDX *= 0.9; mouseDY *= 0.9; }
  if (S.gamepad) { const gp = S.gamepad; pitchIn += gp.axes[1] || 0; yawIn += gp.axes[0] || 0; rollIn += gp.axes[0] || 0; }
  if (AUTOPLAY && S.mode === 'flying' && !S.crashed) { const a = botInput(); pitchIn = a.pitch; yawIn = a.yaw; rollIn = a.roll; }
  S.pitchT = lerp(S.pitchT, pitchIn * 0.55, 1 - Math.exp(-8 * dt));
  S.yawT = lerp(S.yawT, yawIn * jet.turn * turnBoost * 0.55, 1 - Math.exp(-8 * dt));
  S.rollT = lerp(S.rollT, rollIn * 1.1, 1 - Math.exp(-8 * dt));
  S.pitch = lerp(S.pitch, S.pitchT, 1 - Math.exp(-6 * dt));
  S.roll = lerp(S.roll, S.rollT, 1 - Math.exp(-6 * dt));
  // throttle
  if (keys['ShiftLeft'] || keys['ShiftRight']) S.throttle = clamp(S.throttle + dt * 0.8, 0, 1);
  if (keys['ControlLeft']) S.throttle = clamp(S.throttle - dt * 0.8, 0, 1);
  if (S.gamepad) S.throttle = clamp(S.throttle + ((S.gamepad.buttons[7]?.value || 0) - (S.gamepad.buttons[6]?.value || 0)) * dt, 0, 1);
  const afterburner = (keys['ShiftLeft'] || keys['ShiftRight']) && S.throttle > 0.7;
  // speed model
  const maxSpd = jet.maxSpeed * (hasRefit('ab2') ? 1.12 : 1) * (afterburner ? 1.35 : 1);
  const targetSpeed = S.throttle * maxSpd * (S.flaps ? 0.75 : 1) * (S.gear ? 0.85 : 1);
  S.speed = lerp(S.speed, targetSpeed, 1 - Math.exp(-0.7 * dt));
  if (keys['Space']) S.speed = lerp(S.speed, S.speed * 0.6, dt * 2); // airbrake
  // stall: soft, recoverable
  if (S.speed < 70) { S.pitch = lerp(S.pitch, 0.25, dt * 1.5); S.pos.y -= 12 * dt; }
  // heading / pitch integration
  S.yaw += S.yawT * dt * (0.5 + S.speed / 300);
  S.pos.y += Math.sin(-S.pitch) * S.speed * dt * 0.55;
  const fwdX = Math.sin(S.yaw), fwdZ = -Math.cos(S.yaw);
  S.pos.x += fwdX * S.speed * dt * 0.55;
  S.pos.z += fwdZ * S.speed * dt * 0.55;
  // gusts push
  const gustPush = S.weather === 'storm' ? 14 : S.weather === 'night' ? 4 : 7;
  S.pos.x += (S.wind.x + Math.sin(S.time * 0.7) * gustPush) * dt * 0.35;
  S.pos.z += S.wind.z * dt * 0.35;
  S.lastVertSpeed = Math.sin(-S.pitch) * S.speed * 0.55 * 60; // ft/min approx
  // fuel / heat
  S.fuel = Math.max(0, S.fuel - dt * (0.12 + (afterburner ? 0.5 : 0) + S.throttle * 0.1) * (hasRefit('tanks') ? 0.7 : 1));
  if (afterburner) S.heat = clamp(S.heat + dt * 22, 0, 100); else S.heat = clamp(S.heat - dt * (hasRefit('chill') ? 15 : 10), 0, 100);
  if (S.heat >= 100) { S.heat = 70; S.speed *= 0.85; warn('⚠ OVERHEAT — THROTTLE BACK'); }
  if (S.fuel <= 0) { S.throttle = 0.3; if (Math.random() < dt * 0.2) warn('⚠ FUEL LOW — FIND THE CARRIER'); }
  // fever
  const low = S.pos.y < 55 && S.speed > 170;
  if (low) S.fever = clamp(S.fever + dt * 9, 0, 100);
  else if (S.speed > 200) S.fever = clamp(S.fever + dt * 2, 0, 100);
  else S.fever = clamp(S.fever - dt * (hasRefit('fever') ? 2.4 : 4), 0, 100);
  S.feverMult = S.fever >= 75 ? 8 : S.fever >= 50 ? 4 : S.fever >= 25 ? 2 : 1;
  if (S.fever >= 75 && S.feverMult !== S.prevMult) { showBanner('★ JETSTREAM FEVER! ×8'); audio.riser(); }
  S.prevMult = S.feverMult;
  // cooldowns
  for (const k of Object.keys(S.cds)) S.cds[k] = Math.max(0, S.cds[k] - dt);
  // rings / stage progress
  checkStage(dt);
  // NPCs
  updateNPCs(dt);
  // collisions
  checkCollisions();
  // crate fall
  if (S.crateDropped) {
    const c = S.crateDropped; c.position.y -= 22 * dt; c.position.x += Math.sin(S.time * 2) * dt * 3;
    if (c.position.y <= 4) {
      const d = Math.hypot(c.position.x - 60, c.position.z - 420);
      if (d < 30) { stageProgress(1, 'Medical crate delivered to Pier 4'); addScore(750, 'FEVER DROP ×8 · STORM BONUS!'); }
      else { say('Maya', 'Crate missed the pier — it splashed down short.'); S.crateDropped = null; }
    }
  }
  // particles update
  updateParticles(dt);
  // jet mesh transform
  jetMesh.position.copy(S.pos);
  jetMesh.rotation.set(S.pitch, S.yaw, S.roll, 'YXZ');
  jetMesh.rotation.order = 'YXZ';
  const flames = []; jetMesh.traverse(o => { if (o.name === 'flame') flames.push(o); });
  for (const f of flames) { f.visible = S.throttle > 0.25; const sc = afterburner ? 1.8 : 0.7 + S.throttle * 0.5; f.scale.set(sc, sc, sc); }
  // trail
  S.trailPts.unshift(S.pos.clone()); if (S.trailPts.length > 60) S.trailPts.pop();
  const tp = trail.geometry.attributes.position.array;
  for (let i = 0; i < 60; i++) { const p = S.trailPts[Math.min(i, S.trailPts.length - 1)] || S.pos; tp[i * 3] = p.x; tp[i * 3 + 1] = p.y; tp[i * 3 + 2] = p.z + 8; }
  trail.geometry.attributes.position.needsUpdate = true;
  trail.material.opacity = S.speed > 120 ? 0.7 : 0.25;
  audio.setEngine(S.throttle, afterburner, S.speed);
  // storm lightning
  if (S.weather === 'storm') { S.lightningTimer -= dt; if (S.lightningTimer <= 0) { S.lightningTimer = 4 + Math.random() * 6; world.strikeLightning(); audio.thunder(); if (Math.random() < 0.4) warn('⚡ LIGHTNING — GUST ' + S.gust + ' KT'); } }
}
function checkStage(dt) {
  const s = S.sortie; if (!s || S.crashed) return;
  const st = s.stages[S.stageIdx]; if (!st) return;
  if (st.type === 'rings' || st.type === 'arch' || st.type === 'bridge') {
    for (const ring of [...world.rings]) {
      if (S.pos.distanceTo(ring.position) < (st.type === 'arch' ? 19 : 15)) {
        scene.remove(ring); world.rings.splice(world.rings.indexOf(ring), 1);
        world.burst(ring.position, 0xffffff, 26); audio.chime();
        addScore(st.type === 'arch' ? 500 : 350, st.type === 'arch' ? 'ARCH THREADED' : 'RING PASS');
        if (st.type === 'bridge') addScore(400, 'UNDER THE SPAN');
        stageProgress(1);
        break;
      }
    }
    // bridge under-span check (no ring hit needed as backup)
    if (st.type === 'bridge' && Math.abs(S.pos.z + 320) < 8 && S.pos.y < 74 && S.pos.y > 8 && Math.abs(S.pos.x) < 140) { stageProgress(1); addScore(400, 'UNDER THE SPAN'); }
  } else if (st.type === 'carrier') {
    const cp = world.carrierPos;
    if (S.pos.y <= 17 && Math.abs(S.pos.x - cp.x) < 26 && Math.abs(S.pos.z - cp.z) < 120) {
      const sink = Math.abs(S.lastVertSpeed) * 6 + 40;
      const wire = 1 + Math.floor(Math.abs(S.pos.z - (cp.z - 70)) / 14) % 3 + 1; // 1..3ish
      const w = clamp(wire, 1, 3);
      const grade = sink < 200 ? 'PERFECT' : sink < 400 ? 'GOOD' : sink < 650 ? 'HARD' : 'WAVE-OFF';
      if (grade === 'WAVE-OFF') { warn('WAVE-OFF — GO AROUND'); S.pos.y = 120; S.pos.z += 200; S.speed = 220; return; }
      S.landingSink = sink;
      stageProgress(1, `${w}-WIRE TRAP (${Math.round(sink)} FPM) · ${grade}`);
      addScore(grade === 'PERFECT' ? 1200 : grade === 'GOOD' ? 800 : 400, `${w}-WIRE TRAP (${Math.round(sink)} FPM)`);
      audio.thud(); S.shake = 0.4;
    }
    // wave-off if overshoot
    if (S.pos.z < world.carrierPos.z - 160 && S.pos.y < 60) { S.pos.y = 160; S.pos.z = world.carrierPos.z + 260; S.yaw = 0; warn('WAVE-OFF — GO AROUND'); }
  } else if (st.type === 'escort') {
    S.escortTimer += dt;
    if (S.escort && S.pos.distanceTo(S.escort.position) < 120) {
      if (S.escortTimer > 14) stageProgress(1, 'Escort complete — JADE-2 is safe');
    } else if (S.escortTimer > 30) { say('JADE-2', 'You are falling behind — get back on my wing!'); S.escortTimer = 20; }
  } else if (st.type === 'intercept' || st.type === 'duel') {
    if (S.enemy) {
      const d = S.pos.distanceTo(S.enemy.position);
      const behind = (S.enemy.position.clone().sub(S.pos).normalize().dot(new T.Vector3(Math.sin(S.yaw), 0, -Math.cos(S.yaw)))) > 0.6;
      if (d < 90 && behind) { S.enemyHp -= dt * 26; if (Math.random() < dt * 2) world.burst(S.enemy.position, 0xffaa00, 6); }
      if (S.enemyHp <= 0) {
        world.burst(S.enemy.position, 0xff6600, 40); scene.remove(S.enemy); S.enemy = null;
        addScore(st.type === 'duel' ? 1500 : 900, st.type === 'duel' ? 'TEMPEST SPLASHED' : 'BANDIT SPLASHED');
        stageProgress(1, st.type === 'duel' ? 'TEMPEST splashed' : 'Bandit splashed');
      }
    }
  }
}
function stageProgress(n, note) {
  S.stageDone += n; renderObjectives();
  $('stagefill').style.width = Math.min(100, (S.stageDone / S.stageTarget) * 100) + '%';
  if (S.stageDone >= S.stageTarget) {
    S.stageIdx++;
    if (S.stageIdx >= S.sortie.stages.length) completeMission();
    else { showBanner('★ STAGE CLEAR · +' + (200 * S.feverMult) + ' PTS'); S.scoreTarget += 200 * S.feverMult; setupStage(); }
  }
}
function updateNPCs(dt) {
  if (S.escort) {
    const e = S.escort; e.position.z -= 42 * dt; e.position.x = -30 + Math.sin(S.time * 0.4) * 20; e.position.y = 120 + Math.sin(S.time * 0.6) * 8;
    e.rotation.y = 0;
    if (e.position.z < -1000) e.position.z = 500;
  }
  if (S.enemy) {
    const e = S.enemy; const t = S.time * 0.5;
    e.position.set(Math.sin(t) * 220, 150 + Math.sin(t * 1.7) * 40, -300 - Math.cos(t * 0.8) * 350);
    e.rotation.y = Math.atan2(Math.cos(t * 0.8) * 0.8 * 350, -Math.sin(t) * 220) + Math.PI;
    // boss telegraphs: occasional missile warning
    if ((S.sortie.n === 12 || S.sortie.n === 'B4') && Math.random() < dt * 0.12) { warn('⚠ VOID ACE MISSILE — FLARE! [3]'); if (S.cds.flare <= 0) { /* player must flare */ } }
  }
  for (const b of world.birds) { b.position.x += 8 * dt; if (b.position.x > 400) b.position.x = -400; }
  for (const c of world.clouds) { c.position.x += 2 * dt; if (c.position.x > 1200) c.position.x = -1200; }
}
function checkCollisions() {
  if (S.crashed) return;
  const p = S.pos;
  // sea
  if (p.y <= 2) return crash('water', 'Ditched in the bay — the sea took the jet');
  // pillars (only near ones)
  for (const pil of world.pillars) {
    const dx = p.x - pil.x, dz = p.z - pil.z;
    if (dx * dx + dz * dz < (pil.r + 4) * (pil.r + 4) && p.y < pil.h) return crash('pillar', 'Wing hit the karst pillar');
  }
  // bridge deck
  if (Math.abs(p.z + 320) < 10 && Math.abs(p.x) < 170 && p.y > 74 && p.y < 84) return crash('bridge', 'Clipped the Dragon Bridge deck');
  // carrier hull (not deck landing)
  const cp = world.carrierPos;
  if (Math.abs(p.x - cp.x) < 30 && Math.abs(p.z - cp.z) < 135 && p.y < 12 && p.y > 2) {
    if (S.speed > 200 || !S.gear) return crash('carrier', 'Slammed into the carrier deck — gear was up');
  }
  // hull damage from near miss with pillar edge handled above; low-speed scrape
  if (p.y < 6 && Math.abs(p.x) < 400) { /* skimming sea spray, no crash */ }
}
function crash(type, cause) {
  if (S.crashed) return;
  S.crashed = true; S.crashCause = cause; S.mode = 'crashed'; S.slowmo = 1; S.shake = 1; jetMesh.visible = true; if (S.cockpit) setCockpit(false);
  world.burst(S.pos, 0xff6600, 50); world.burst(S.pos, 0xffd76a, 30);
  audio.crashSound();
  S.hull = Math.max(0, S.hull - 45);
  const sink = type === 'water';
  showBanner(sink ? '💥 DITCHED IN THE BAY' : '💥 CRASHED');
  setTimeout(() => showEnd(false, cause), 900);
}
function completeMission() {
  S.mode = 'complete';
  const s = S.sortie;
  const xpGain = s.xp, moneyGain = 400 + s.xp * 4;
  save.xp += xpGain; save.money += moneyGain;
  if (!save.cleared.includes(s.n)) save.cleared.push(s.n);
  save.day += 1; persist();
  const rank = rankFor(save.xp);
  const debrief = `${S.landingSink ? Math.round(S.landingSink) + ' FPM TRAP' : 'SORTIE CLEAR'} · MAX FEVER ×${S.feverMult} · ★ RANK ${rank} · ${RANK_NAMES[rank]} · ${xpGain} XP`;
  try { localStorage.setItem('hayate-bay-debrief', debrief); } catch (e) {}
  addScore(500, 'SORTIE CLEAR');
  showEnd(true, `Mission complete — ${s.name}<br>+${xpGain} XP · +$${moneyGain}<br>SCORE ${S.scoreTarget.toLocaleString()} · ${debrief}`);
}
function showEnd(win, body) {
  $('endScreen').style.display = 'flex';
  $('endTitle').textContent = win ? 'SORTIE COMPLETE ★' : 'CRASHED — ' + (S.crashCause || '');
  $('endBody').innerHTML = body + (win ? '' : '<br><br><span class="mint">Tip: ' + (S.crashCause || 'watch your altitude') + '. Press R to retry from the checkpoint.</span>');
  $('endNext').style.display = win ? 'inline-block' : 'none';
}
function retry() {
  if (S.checkpoint) { S.pos.copy(S.checkpoint.pos); S.yaw = S.checkpoint.yaw; }
  S.crashed = false; S.mode = 'flying'; S.hull = Math.max(60, S.hull); S.speed = 160; S.pos.y = Math.max(S.pos.y, 120);
  $('endScreen').style.display = 'none'; S.slowmo = 0;
  say('Capt. Kenji Sato', 'Back in the air. Fly it clean this time.');
}
function backToMenu() {
  S.mode = 'menu'; S.crashed = false;
  $('hud').style.display = 'none'; $('cockpit').style.display = 'none'; $('endScreen').style.display = 'none';
  $('menu').style.display = 'flex'; $('menuHint').style.display = 'block';
  jetMesh.visible = false; menuJet.visible = true;
  clearStageObjects(); buildMenu(); updateClock();
}
function updateParticles(dt) {
  const arr = particleGeo.attributes.position.array;
  for (let i = 0; i < 500; i++) {
    const p = world.particles[i];
    if (p) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 20 * dt; arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; if (p.life <= 0) world.particles[i] = null; }
    else { arr[i * 3 + 1] = -9999; }
  }
  particleGeo.attributes.position.needsUpdate = true;
  if (S.rainOn && rainPoints.visible) {
    const ra = rainGeo.attributes.position.array;
    for (let i = 0; i < 700; i++) { ra[i * 3 + 1] -= 260 * dt; if (ra[i * 3 + 1] < 0) ra[i * 3 + 1] = 280; ra[i * 3] = S.pos.x + ((ra[i * 3] - S.pos.x + 300) % 600) - 300; }
    rainGeo.attributes.position.needsUpdate = true;
  }
}
function botInput() {
  // steer toward next ring / carrier / enemy
  let target = null;
  if (world.rings.length) target = world.rings[0].position;
  else if (S.enemy) target = S.enemy.position;
  else if (S.sortie && S.sortie.stages[S.stageIdx]?.type === 'carrier') target = world.carrierPos;
  else target = new T.Vector3(0, 110, -600);
  const dx = target.x - S.pos.x, dz = target.z - S.pos.z;
  const desiredYaw = Math.atan2(dx, -dz);
  let dyaw = desiredYaw - S.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  const desiredPitch = clamp((target.y - S.pos.y) * 0.01, -0.4, 0.4);
  S.throttle = 0.85;
  return { yaw: clamp(dyaw * 1.6, -1, 1), pitch: clamp(-desiredPitch * 2 + (S.pos.y < 40 ? -0.5 : 0), -1, 1), roll: clamp(dyaw * 1.2, -1, 1) };
}

// ---------- HUD ----------
function updateHUD() {
  $('score').textContent = Math.round(S.scoreShown).toLocaleString();
  if (S.scoreShown < S.scoreTarget) S.scoreShown = Math.min(S.scoreTarget, S.scoreShown + Math.max(1, (S.scoreTarget - S.scoreShown) * 0.12));
  const hdg = ((Math.round((-S.yaw * 180 / Math.PI) % 360) + 360) % 360);
  $('hdg').textContent = 'HDG ' + String(hdg).padStart(3, '0') + '°';
  const c = [32, 47, 62, 77, 92, 107, 122].map(n => String(((n + hdg - 92) % 360 + 360) % 360).padStart(3, '0')).join('  ');
  $('compass').textContent = c;
  $('feverLabel').textContent = '★ JETSTREAM FEVER! ×' + S.feverMult;
  $('feverFill').style.width = S.fever + '%';
  $('fuelPct').textContent = Math.round(S.fuel) + '%'; $('fuelBar').style.width = S.fuel + '%';
  $('hullPct').textContent = Math.round(S.hull) + '%'; $('hullBar').style.width = clamp(S.hull, 0, 100) + '%';
  $('heatPct').textContent = Math.round(S.heat) + '%'; $('heatBar').style.width = S.heat + '%';
  $('speed').textContent = Math.round(S.speed) + ' KT';
  $('altHdg').textContent = Math.round(S.pos.y * 3.28) + ' FT · HDG ' + String(hdg).padStart(3, '0') + '°';
  $('chipFever').textContent = 'FEVER ×' + S.feverMult;
  $('chipFever').className = 'chip' + (S.feverMult >= 4 ? ' litY' : S.feverMult >= 2 ? ' lit' : '');
  $('cd1').textContent = S.cds.radar > 0 ? '(' + Math.ceil(S.cds.radar) + 's)' : 'READY';
  $('cd2').textContent = S.cds.chill > 0 ? '(' + Math.ceil(S.cds.chill) + 's)' : 'READY';
  $('cd3').textContent = S.cds.flare > 0 ? '(' + Math.ceil(S.cds.flare) + 's)' : 'READY';
  if (!$('contacts').innerHTML) flashContacts();
  // cockpit gauges
  if (S.cockpit) {
    $('cockpitRead').textContent = `HDG ${String(hdg).padStart(3, '0')}° · ${Math.round(S.speed)} KT · ${Math.round(S.pos.y * 3.28)} FT`;
    $('vAtt').textContent = Math.round(-S.pitch * 57) + '°'; $('ndAtt').style.transform = `translateX(-50%) rotate(${clamp(-S.pitch * 120, -120, 120)}deg)`;
    $('vKias').textContent = Math.round(S.speed); $('ndKias').style.transform = `translateX(-50%) rotate(${clamp(-120 + S.speed * 0.7, -120, 120)}deg)`;
    $('vAlt').textContent = Math.round(S.pos.y * 3.28); $('ndAlt').style.transform = `translateX(-50%) rotate(${clamp(-120 + S.pos.y * 0.35, -120, 120)}deg)`;
    $('vIls').textContent = S.glideLock ? 'LOCKED' : 'OFF';
    $('thrKnob').style.bottom = (S.throttle * 78 + 6) + '%';
    const sc = $('scope').getContext('2d'); sc.clearRect(0, 0, 70, 70);
    sc.strokeStyle = '#39ff88'; sc.beginPath(); sc.arc(35, 35, 30, 0, 7); sc.stroke();
    const a = S.time * 2; sc.beginPath(); sc.moveTo(35, 35); sc.lineTo(35 + Math.cos(a) * 30, 35 + Math.sin(a) * 30); sc.stroke();
    sc.fillStyle = '#ffd76a'; sc.beginPath(); sc.arc(35, 35, 3, 0, 7); sc.fill();
  }
  drawRadar();
  updateClock();
}
function drawRadar() {
  const cv = $('radar'); if (!cv) return;
  const g = cv.getContext('2d'); const W = 300, C = 150;
  g.clearRect(0, 0, W, W);
  g.fillStyle = '#062a24'; g.beginPath(); g.arc(C, C, 148, 0, 7); g.fill();
  g.strokeStyle = 'rgba(127,240,212,.4)'; for (const r of [50, 100, 145]) { g.beginPath(); g.arc(C, C, r, 0, 7); g.stroke(); }
  g.fillStyle = '#7ff0d4'; g.font = '11px Arial'; g.fillText('Hayate Bay', 8, 16);
  const map = (x, z) => [C + x * 0.09, C + (z - 100) * 0.09];
  // pillars
  g.fillStyle = 'rgba(255,150,80,.7)';
  for (const p of world.pillars) { const [x, y] = map(p.x, p.z); if (x > 0 && x < W && y > 0 && y < W) g.fillRect(x, y, 3, 3); }
  // carrier
  const [cx, cy] = map(world.carrierPos.x, world.carrierPos.z); g.fillStyle = '#ffd76a'; g.fillRect(cx - 4, cy - 8, 8, 16);
  // rings
  world.rings.forEach((r, i) => { const [x, y] = map(r.position.x, r.position.z); g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, 8, 0, 7); g.stroke(); g.fillStyle = '#fff'; g.fillText(String(i + 1), x - 3, y + 3); });
  // player arrow
  const [px, py] = map(S.pos.x, S.pos.z);
  g.save(); g.translate(px, py); g.rotate(-S.yaw); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
  // dialogue (main HUD, not cockpit)
  if (S.dialogueQueue.length && S.dlgTimer <= 0) {
    const d = S.dialogueQueue.shift();
    $('dlgName').textContent = (d.name || 'CAPT. KENJI SATO').toUpperCase();
    $('dlgText').textContent = d.text;
    const cd = $('cockpitDlg'); if (cd) { cd.querySelector('#dlgName').textContent = (d.name || '').toUpperCase(); cd.querySelector('#dlgText').textContent = d.text; }
    S.dlgTimer = 4;
  }
  if (S.dlgTimer > 0) S.dlgTimer -= 1 / 60;
}

// ---------- camera + loop ----------
function updateCamera(dt) {
  if (S.mode === 'menu') {
    S.menuAngle += dt * 0.12;
    const r = 95 + S.orbitDrag;
    camera.position.set(Math.sin(S.menuAngle) * r, 85 + Math.sin(S.time * 0.2) * 6, 320 + Math.cos(S.menuAngle) * r);
    camera.lookAt(-55, 68, 320);
    menuJet.rotation.y = Math.PI + Math.sin(S.time * 0.3) * 0.3; menuJet.position.y = 70 + Math.sin(S.time * 0.8) * 4;
    return;
  }
  if (S.crashed) {
    camera.position.lerp(new T.Vector3(S.pos.x + 60, S.pos.y + 40, S.pos.z + 60), 1 - Math.exp(-2 * dt));
    camera.lookAt(S.pos); return;
  }
  const fwd = new T.Vector3(Math.sin(S.yaw), 0, -Math.cos(S.yaw));
  if (S.cockpit) {
    camera.position.copy(S.pos).addScaledVector(fwd, -2).add(new T.Vector3(0, 1.6, 0));
    camera.rotation.set(S.pitch, S.yaw, S.roll * 0.4, 'YXZ');
    camera.fov = lerp(camera.fov, 68, 0.1); camera.updateProjectionMatrix(); return;
  }
  const target = S.camMode === 'orbit'
    ? S.pos.clone().add(new T.Vector3(Math.sin(S.time * 0.3) * 90, 35, Math.cos(S.time * 0.3) * 90))
    : S.pos.clone().addScaledVector(fwd, 26).add(new T.Vector3(-fwd.z * 0, 0, 0)).add(new T.Vector3(0, 9, 0)).addScaledVector(new T.Vector3(-fwd.x, 0, -fwd.z), -0);
  // chase: behind (+z of forward is back), above, slightly left
  const chase = S.pos.clone().addScaledVector(fwd, -26).add(new T.Vector3(0, 9, 0));
  chase.x += -fwd.z * 6; chase.z += fwd.x * 6;
  const dest = S.camMode === 'orbit' ? target : chase;
  camera.position.lerp(dest, 1 - Math.exp(-5 * dt));
  camera.lookAt(S.pos.x + fwd.x * 40, S.pos.y + Math.sin(-S.pitch) * 20, S.pos.z + fwd.z * 40);
  if (S.shake > 0) { camera.position.x += (Math.random() - 0.5) * S.shake * 2; camera.position.y += (Math.random() - 0.5) * S.shake * 2; S.shake = Math.max(0, S.shake - dt * 1.5); }
  const targetFov = 62 + (S.feverMult >= 8 ? 14 : S.feverMult >= 4 ? 8 : 0) + (S.speed > 280 ? 6 : 0);
  camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-3 * dt)); camera.updateProjectionMatrix();
}
let lastT = performance.now(), acc = 0, hudT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  // fps / adaptive quality
  S.frames++; S.fpsTime += dt;
  if (S.fpsTime > 1) { S.fpsEMA = S.frames / S.fpsTime; S.frames = 0; S.fpsTime = 0;
    if (S.fpsEMA < 45 && S.quality > 0) { S.quality--; renderer.setPixelRatio(S.quality === 0 ? 1 : 1.25); rainPoints.visible = false; }
    else if (S.fpsEMA > 58 && S.quality < 2 && !SAFE) { S.quality++; renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); }
  }
  if (S.paused) { renderer.render(scene, camera); return; }
  const ts = S.slowmo > 0 ? 0.3 : 1;
  S.time += dt * ts;
  if (S.mode === 'flying' && !S.crashed) {
    acc += dt * ts;
    const h = 1 / 60; let n = 0;
    while (acc >= h && n < 5) { step(h); acc -= h; n++; }
    if (n === 5) acc = 0;
    // NaN guard
    if (!isFinite(S.pos.x) || !isFinite(S.pos.y) || !isFinite(S.pos.z) || !isFinite(S.speed)) { S.pos.set(0, 130, 520); S.speed = 150; S.yaw = 0; S.pitch = 0; }
    S.pos.y = clamp(S.pos.y, 2, 900); S.pos.x = clamp(S.pos.x, -1200, 1200); S.pos.z = clamp(S.pos.z, -1800, 1000);
  }
  hudT += dt; if (hudT > 0.1) { hudT = 0; if (S.mode === 'flying') updateHUD(); }
  updateCamera(dt * ts);
  renderer.render(scene, camera);
}

// ---------- shot modes (for screenshots) ----------
function setupShot(shot) {
  setTimeout(() => {
    if (shot === 'menu') { /* menu is default */ }
    else if (shot === 'storm') { selectSortie(6); launch(true); S.pos.set(-20, 90, -100); S.speed = 240; }
    else if (shot === 'carrier') { selectSortie(4); launch(true); S.pos.set(180, 70, 850); S.yaw = 0; S.speed = 160; S.gear = true; syncGear(); setCockpit(true); }
    else { selectSortie(5); launch(true); S.pos.set(10, 85, -40); S.speed = 250; S.fever = 82; }
    window.__kazebay.ready = true;
  }, 800);
}

// ---------- debug API ----------
window.__kazebay = {
  ready: false,
  setSortie(n) { selectSortie(n); if (S.mode === 'menu') launch(); return S.sortie?.name; },
  setJet(id) { selectJet(id); return id; },
  forceCrash(type) { if (S.mode !== 'flying') launch(); crash(type || 'pillar', 'Forced crash: ' + (type || 'pillar')); return 'crashed'; },
  forceLanding(quality) { if (S.mode !== 'flying') launch(); S.pos.set(180, 16, 620); S.speed = 140; S.gear = true; S.landingSink = quality === 'perfect' ? 86 : quality === 'good' ? 320 : 600; const w = 3; stageProgress(0); showBanner(`★ ${w}-WIRE TRAP (${S.landingSink} FPM)`); addScore(800, `${w}-WIRE TRAP (${S.landingSink} FPM)`); return S.landingSink; },
  setWeather(w) { applyWeather(w); return w; },
  setFever(tier) { S.fever = tier === 8 ? 85 : tier === 4 ? 60 : tier === 2 ? 35 : 10; return S.feverMult; },
  getStats() { return { mode: S.mode, score: S.scoreTarget, scoreShown: Math.round(S.scoreShown), fever: S.fever, mult: S.feverMult, speed: Math.round(S.speed), alt: Math.round(S.pos.y * 3.28), hull: Math.round(S.hull), fuel: Math.round(S.fuel), heat: Math.round(S.heat), stage: S.stageIdx, stageDone: S.stageDone, sortie: S.sortieNum, jet: S.jetId, fps: Math.round(S.fpsEMA), crashed: S.crashed }; },
};

try { init(); } catch (e) { const el = $('error'); el.style.display = 'block'; el.textContent = 'Failed to start WebGL: ' + e.message; }
