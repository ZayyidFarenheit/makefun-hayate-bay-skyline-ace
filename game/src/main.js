// HAYATE BAY: SKYLINE ACE — main game. Three.js (global THREE), procedural everything.
import { JETS, REFITS, SORTIES, BONUS, RADIO, CONTACTS, rankFor, RANK_NAMES } from './data.js';
import { World, glowTexture } from './world.js';
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
  strafeV: 0, vertV: 0, // 6DOF: lateral strafe + vertical thrust velocities (units/s, jet-local frame)
  gear: false, flaps: false, hook: false, glideLock: true,
  score: 0, scoreShown: 0, scoreTarget: 0, combo: 0,
  gust: 26, wind: new T.Vector3(4, 0, 2), weather: 'golden',
  camMode: 'chase', cockpit: false, crashed: false, crashCause: '', crashTimer: 0,
  enemy: null, enemyHp: 100, escort: null, escortTimer: 0, crateDropped: null, crateDone: false,
  cds: { radar: 0, chill: 0, flare: 0 }, shake: 0, fovKick: 0, slowmo: 0,
  dialogueQueue: [], dlgTimer: 0, bannerTimer: 0, lightningTimer: 5, rainOn: false,
  fpsEMA: 60, quality: 2, frames: 0, fpsTime: 0, menuAngle: 0.38, orbitDrag: 0,
  startPos: new T.Vector3(), checkpoint: null, landingSink: 0, lastVertSpeed: 0,
  chaseDist: 16, shotChase: false, lookAhead: 18, chaseH: 6.5, shotFreeze: false, // staged shots freeze SCORE so it always equals the banner number
  debris: [], smokeArr: [], crashT: 0, wreckVy: 0, wreckSpin: 0, fireball: null, foam: null, flashT: 0,
};
const keys = {};
let mouseDown = false, mouseDX = 0, mouseDY = 0;

const audio = new AudioEngine();
let renderer, scene, camera, world, jetMesh, menuJet, menuLight, menuRim, menuSunGlow, windStreaks, trail, particlePoints, particleGeo, rainPoints, rainGeo, rainStreaks, rainStreakGeo, smokePoints, smokeGeo;
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
  buildParticles(); buildRain(); buildTrail(); buildSmoke();
  menuJet = world.buildJet(S.jetId); menuJet.position.set(6, 74, 520); menuJet.scale.set(3.1,3.1,3.1); scene.add(menuJet); decorateMenuJet(); // menu staging sits at z 520, SOUTH of the close mountain wall (z 90-330) — the old z 320 put the jet inside the wall cones and the (180,220) peak's outer wall filled the frame and hid the jet's tail
  // warm fill light from the camera side so the menu jet's flank reads (sun is behind it)
  menuLight = new T.PointLight(0xffd9a0, 2.2, 260); menuLight.position.set(70, 120, 430); scene.add(menuLight);
  // hot orange rim light from behind-left so the jet's far edges glow against the sunset
  menuRim = new T.PointLight(0xff7a30, 1.8, 240); menuRim.position.set(-70, 100, 180); scene.add(menuRim);
  // big warm sun halo in the menu camera's view (upper right) — fake bloom for the cover
  menuSunGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture('rgba(255,240,190,1)', 'rgba(255,150,50,.8)'), transparent: true, opacity: 0.32, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
  menuSunGlow.scale.set(420, 420, 1); menuSunGlow.position.set(330, 210, -1050); scene.add(menuSunGlow);
  buildWindStreaks();
  jetMesh = world.buildJet(S.jetId); jetMesh.visible = false; jetMesh.scale.set(1.25, 1.25, 1.25); scene.add(jetMesh);
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
function decorateMenuJet() {
  // afterburner: orange flames + a hot glow sprite at the tail, flickered in updateCamera
  menuJet.traverse(o => { if (o.name === 'flame') { o.scale.set(1.25, 1.7, 1.25); o.material.color.set(0xff8a2a); } });
  if (menuJet.userData.abGlow) menuJet.remove(menuJet.userData.abGlow);
  const ab = new T.Sprite(new T.SpriteMaterial({ map: glowTexture('rgba(255,240,180,1)', 'rgba(255,120,20,.7)'), transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending }));
  ab.scale.set(17, 17, 1); ab.position.set(0, -0.35, 8.8); menuJet.add(ab); menuJet.userData.abGlow = ab;
}
function buildWindStreaks() {
  // fast horizontal speed-lines streaming past the menu jet — the cover should feel windy/busy
  const c = document.createElement('canvas'); c.width = 128; c.height = 16;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,230,190,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 6, 128, 4);
  const tex = new T.CanvasTexture(c);
  windStreaks = [];
  for (let i = 0; i < 36; i++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.28 + Math.random() * 0.2, depthWrite: false, blending: T.AdditiveBlending }));
    s.scale.set(26 + Math.random() * 22, 1.6 + Math.random() * 1.4, 1);
    s.position.set(-220 + Math.random() * 520, 25 + Math.random() * 195, 350 - Math.random() * 1050);
    s.userData.vx = -(110 + Math.random() * 90); scene.add(s); windStreaks.push(s);
  }
}
function updateWindStreaks(dt) {
  for (const s of windStreaks) { s.position.x += s.userData.vx * dt; if (s.position.x < -240) { s.position.x = 300 + Math.random() * 40; s.position.y = 25 + Math.random() * 195; s.position.z = 350 - Math.random() * 1050; } }
}
function buildParticles() {
  particleGeo = new T.BufferGeometry();
  particleGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(500 * 3), 3));
  // round soft sparkles (a bare PointsMaterial renders hard squares)
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,220,140,.8)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  particlePoints = new T.Points(particleGeo, new T.PointsMaterial({ color: 0xffd76a, size: 1.4, map: new T.CanvasTexture(c), transparent: true, opacity: 0.95, depthWrite: false }));
  particlePoints.frustumCulled = false; scene.add(particlePoints);
}
function buildRain() {
  rainGeo = new T.BufferGeometry();
  const arr = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) { arr[i * 3] = (Math.random() - 0.5) * 600; arr[i * 3 + 1] = Math.random() * 300; arr[i * 3 + 2] = (Math.random() - 0.5) * 600; }
  rainGeo.setAttribute('position', new T.BufferAttribute(arr, 3));
  // rain as short vertical streaks (a bare PointsMaterial renders hard squares)
  const c = document.createElement('canvas'); c.width = 8; c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 32);
  gr.addColorStop(0, 'rgba(200,220,255,0)'); gr.addColorStop(0.5, 'rgba(200,220,255,1)'); gr.addColorStop(1, 'rgba(200,220,255,0)');
  g.fillStyle = gr; g.fillRect(3, 0, 2, 32);
  rainPoints = new T.Points(rainGeo, new T.PointsMaterial({ color: 0xaaccee, size: 3, map: new T.CanvasTexture(c), transparent: true, opacity: 0.85, depthWrite: false }));
  rainPoints.visible = false; rainPoints.frustumCulled = false; scene.add(rainPoints);
  // second rain layer: long slanted streaks (line segments read as rain in a still; points alone do not)
  rainStreakGeo = new T.BufferGeometry();
  const sa = new Float32Array(1200 * 6);
  for (let i = 0; i < 1200; i++) {
    const x = (Math.random() - 0.5) * 600, y = Math.random() * 300, z = (Math.random() - 0.5) * 600;
    sa[i * 6] = x; sa[i * 6 + 1] = y; sa[i * 6 + 2] = z;
    sa[i * 6 + 3] = x - 4; sa[i * 6 + 4] = y - 36; sa[i * 6 + 5] = z;
  }
  rainStreakGeo.setAttribute('position', new T.BufferAttribute(sa, 3));
  rainStreaks = new T.LineSegments(rainStreakGeo, new T.LineBasicMaterial({ color: 0xbcd8ff, transparent: true, opacity: 0.6 }));
  rainStreaks.visible = false; rainStreaks.frustumCulled = false; scene.add(rainStreaks);
}
function buildSmoke() {
  smokeGeo = new T.BufferGeometry();
  smokeGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(240 * 3), 3));
  smokePoints = new T.Points(smokeGeo, new T.PointsMaterial({ color: 0xbbbbbb, size: 5, transparent: true, opacity: 0.55 }));
  smokePoints.frustumCulled = false; scene.add(smokePoints);
  for (let i = 0; i < 240; i++) smokeGeo.attributes.position.array[i * 3 + 1] = -9999;
}
function spawnSmoke(pos, n, up) {
  for (let i = 0; i < (n || 20); i++) S.smokeArr.push({ x: pos.x + (Math.random() - 0.5) * 6, y: pos.y + (Math.random() - 0.5) * 3, z: pos.z + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 14, vy: (up || 14) * (0.5 + Math.random()), vz: (Math.random() - 0.5) * 14, life: 2.2 + Math.random() * 1.2 });
  if (S.smokeArr.length > 240) S.smokeArr.splice(0, S.smokeArr.length - 240);
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
    const cleared = save.cleared.includes(s.n);
    const d = document.createElement('div'); d.className = 'row' + (s.flagship ? ' flag' : '') + (isUnlocked(s) ? '' : ' locked') + (S.sortieNum === s.n ? ' sel' : '');
    d.innerHTML = `<span>${s.n} ${s.name}${s.flagship ? ' ★ FLAGSHIP' : ''}${isUnlocked(s) ? '' : ' 🔒'}</span><span class="medal">${cleared ? '★ GOLD' : ''}</span><span class="xp">${s.xp} XP</span>`;
    d.onclick = () => { if (!isUnlocked(s)) { toast('Clear sortie ' + (s.n - 1) + ' first'); return; } selectSortie(s.n); };
    sl.appendChild(d);
  }
  const bl = $('bonusList'); bl.innerHTML = '';
  for (const s of BONUS) {
    const cleared = save.cleared.includes(s.n);
    const d = document.createElement('div'); d.className = 'row' + (isUnlocked(s) ? '' : ' locked') + (String(S.sortieNum) === String(s.n) ? ' sel' : '');
    d.innerHTML = `<span>${s.n} ${s.name}${isUnlocked(s) ? '' : ' 🔒'}</span><span class="medal">${cleared ? '★ GOLD' : ''}</span><span class="xp">${s.xp} XP</span>`;
    d.onclick = () => { if (!isUnlocked(s)) { toast('Clear sortie 4 first'); return; } selectSortie(s.n); };
    bl.appendChild(d);
  }
  // career stats (CALDERA hangar header): sorties flown, gold medals, career %
  const gold = save.cleared.length;
  $('csSorties').textContent = 12;
  $('csGold').textContent = gold + '/12';
  $('csCareer').textContent = Math.round((gold / 16) * 100) + '%';
  drawMenuMap();
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
function drawMenuMap() {
  // hangar map strip (CALDERA-style): bay outline, dashed route, waypoints HCN / CLD / CV-04
  const cv = $('menuMap'); if (!cv) return;
  const g = cv.getContext('2d'); const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#062a24'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#7fffd4'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(20, 40); g.bezierCurveTo(300, 12, 700, 42, 1080, 18); g.stroke(); // bay shoreline
  g.beginPath(); g.moveTo(80, 46); g.bezierCurveTo(400, 28, 800, 40, 1040, 26); g.stroke();
  // dashed gold route
  g.strokeStyle = '#ffd76a'; g.setLineDash([12, 9]); g.lineWidth = 3;
  g.beginPath(); g.moveTo(150, 24); g.lineTo(560, 16); g.lineTo(980, 26); g.stroke(); g.setLineDash([]);
  const stops = [[150, 24, 'HCN · RWY 09'], [560, 16, 'CLD · RWY 27'], [980, 26, 'CV-04 SOLSTICE']];
  for (const [x, y, label] of stops) {
    g.fillStyle = '#ffd76a'; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill();
    g.fillStyle = '#eafff6'; g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.fillText(label, x, y + 22);
  }
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
  scene.remove(menuJet); menuJet = world.buildJet(id); menuJet.position.set(6, 74, 520); menuJet.scale.set(3.1,3.1,3.1); scene.add(menuJet); decorateMenuJet();
  scene.remove(jetMesh); jetMesh = world.buildJet(id); jetMesh.visible = false; jetMesh.scale.set(1.25, 1.25, 1.25); scene.add(jetMesh);
  $('jetName').textContent = JETS[id].short;
}
function selectSortie(n) { S.sortieNum = n; save.sortie = n; persist(); buildMenu(); }
function toast(msg) { say('Kaze Tower', msg); }
function say(name, text) { S.dialogueQueue.push({ name, text }); }

// ---------- weather ----------
function applyWeather(w) {
  S.weather = w;
  const fog = scene.fog;
  if (w === 'storm') { fog.color.set(0x5a4a6a); world.sunLight.intensity = 0.5; S.rainOn = true; S.gust = 34; world.setSkyMode('storm'); }
  else if (w === 'night') { fog.color.set(0x1a2440); world.sunLight.intensity = 0.35; S.rainOn = false; S.gust = 18; world.setSkyMode('night'); }
  else if (w === 'dusk') { fog.color.set(0x4a1a24); world.sunLight.intensity = 0.7; S.rainOn = false; S.gust = 19; world.setSkyMode('dusk'); }
  else { fog.color.set(0xe8906a); world.sunLight.intensity = 1.25; S.rainOn = false; S.gust = w === 'golden' ? 26 : 20; world.setSkyMode('golden'); }
  rainPoints.visible = S.rainOn && S.quality > 0;
  if (rainStreaks) rainStreaks.visible = S.rainOn && S.quality > 0;
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
  $('thr2').addEventListener('pointerdown', e => { const r = $('thr2').getBoundingClientRect(); const move = ev => { S.mixture = clamp(1 - (ev.clientY - r.top) / r.height, 0, 1); $('thrKnob2').style.bottom = (S.mixture * 78 + 6) + '%'; }; const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); }; addEventListener('pointermove', move); addEventListener('pointerup', up); move(e); });
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
  $('bottombar').style.display = on ? 'none' : 'flex';
  $('dialog').style.display = on ? 'none' : 'flex';
  // cockpit has its own instrument panel: hide the chase cluster / speed block / route pill (CALDERA cockpit keeps only top HUD + side tapes)
  $('cluster').style.display = on ? 'none' : 'flex';
  $('hudBR').style.display = on ? 'none' : 'block';
  $('routePill').style.display = on ? 'none' : 'block';
  $('navMode').textContent = on ? 'COCKPIT [V]' : 'CHASE [V]';
  if (S.mode === 'flying') jetMesh.visible = !on;
}
function showTouchdown(sink, centerM, rolloutM) {
  // CALDERA-style landing grade box: sink rate / centerline / stop rollout
  const grade = sink < 200 ? 'A+ BUTTER <b>(98/100)</b>' : sink < 400 ? 'A- SMOOTH <b>(91/100)</b>' : sink < 650 ? 'B+ FIRM <b>(82/100)</b>' : 'C HARD <b>(64/100)</b>';
  $('tdGrade').innerHTML = grade;
  $('tdNote').textContent = sink < 200 ? 'Text-book STOL flare on RWY 27 — smooth oleo compression, +1m centerline, 347m stop.' : 'Flare on RWY 27 — firm oleo compression, stay on centerline.';
  $('tdSink').textContent = '-' + Math.round(sink) + ' FPM';
  $('tdCenter').textContent = '+' + Math.round(centerM) + 'm OFF';
  $('tdRoll').textContent = Math.round(rolloutM) + 'm (35° FLP)';
  const box = $('tdBox'); box.style.display = 'block';
  clearTimeout(S.tdT); S.tdT = setTimeout(() => { box.style.display = 'none'; }, 7000);
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
  clearCrashFx();
  if (world) { world.clearBolts(); world.holdLightning = false; } // a held menu/storm bolt must not leak into live flight
  if (menuLight) menuLight.visible = false;
  if (menuRim) menuRim.visible = false;
  if (menuSunGlow) menuSunGlow.visible = false;
  if (windStreaks) for (const s of windStreaks) s.visible = false;
  S.sortie = s; S.mode = 'flying'; S.crashed = false; S.stageIdx = 0; S.stageDone = 0;
  S.shotChase = false; S.chaseDist = 16; S.lookAhead = 18; S.chaseH = 6.5; S.slowmo = 0;
  S.score = 0; S.scoreShown = 0; S.scoreTarget = 0; S.shotFreeze = false; S.fever = 10; S.heat = 0; S.fuel = 100;
  S.hull = 100 + (hasRefit('titan') ? 25 : 0);
  S.throttle = 0.65; S.gear = false; S.flaps = false; S.hook = false; S.crateDone = false; S.crateDropped = null;
  S.strafeV = 0; S.vertV = 0; // 6DOF velocities reset on launch
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
  if (!S.shotFreeze) S.scoreTarget += pts; // staged shots freeze the score so bot ring passes can't push SCORE past the banner number
  if (S.shotFreeze) return; // staged shots: the shot's own banner interval owns the banner — bot ring passes must not overwrite it with RING PASS
  showBanner(`★ ${label} · +${pts.toLocaleString()} PTS`);
  audio.chime();
}
function showBanner(text) {
  // JS-driven (not a CSS animation): headless Chromium never advances CSS animations, so a CSS pop stayed at opacity 0 in every screenshot
  const b = $('banner'); b.textContent = text;
  b.style.transition = 'transform .15s ease, opacity .4s ease';
  b.style.opacity = '1'; b.style.transform = 'translate(-50%,-50%) scale(1.05)';
  clearTimeout(S.bannerT);
  setTimeout(() => { b.style.transform = 'translate(-50%,-50%) scale(1)'; }, 150);
  S.bannerT = setTimeout(() => { b.style.opacity = '0'; }, 1600);
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
  if (SHOT && S.mode === 'flying' && !S.crashed) {
    if (SHOT === 'carrier') { pitchIn = 0; yawIn = 0; rollIn = 0; } // carrier shot: hold the staged diagonal approach (yaw 0.7) — any bank/yaw input turns the jet away from the deck before the still
    else if (SHOT === 'storm') { pitchIn = 0.1; yawIn = 0; rollIn = 0; } // storm cover: LEVEL final like ref 1 — wings level, straight down the runway centreline, gentle ~3° descent (pitch ≈ 0.055). No bot steering: the bot chased the carrier and pitched the jet nose-up 25° while diving, which is what made the cover jet look like it was climbing steeply.
    else { const a = botInput(); pitchIn = a.pitch; yawIn = a.yaw; rollIn = clamp(a.roll, -0.35, 0.35); } // play shot: bot steers to the rings, but the bank is capped at ~20° — a gentle bank toward the bridge like ref 3, never the 50° diagonal of the old take
  }
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
  // ---- TRUE 6DOF: independent lateral strafe + vertical thrust (no yaw/pitch change) ----
  // Keys: J strafe left, L strafe right, I thrust up, K thrust down (PgUp/PgDn = up/down too).
  // None of these collide with existing bindings (Space airbrake, C cockpit, F flaps, X crate, R retry).
  let strafeIn = 0, vertIn = 0;
  if (keys['KeyJ']) strafeIn -= 1;
  if (keys['KeyL']) strafeIn += 1;
  if (keys['KeyI'] || keys['PageUp']) vertIn += 1;
  if (keys['KeyK'] || keys['PageDown']) vertIn -= 1;
  const STRF_ACC = 55, VERT_ACC = 50, STRF_MAX = 45, VERT_MAX = 40; // caps stay well below forward speed (~80-175 u/s), so the jet still flies like a jet, not a drone
  S.strafeV = clamp(S.strafeV + strafeIn * STRF_ACC * dt, -STRF_MAX, STRF_MAX);
  S.vertV = clamp(S.vertV + vertIn * VERT_ACC * dt, -VERT_MAX, VERT_MAX);
  if (!strafeIn) S.strafeV = lerp(S.strafeV, 0, 1 - Math.exp(-2.2 * dt)); // damping when released
  if (!vertIn) S.vertV = lerp(S.vertV, 0, 1 - Math.exp(-2.2 * dt));
  const rX = Math.cos(S.yaw), rZ = Math.sin(S.yaw); // jet-local right vector, kept level (strafe is horizontal, vertical is pure world-up)
  S.pos.x += rX * S.strafeV * dt;
  S.pos.z += rZ * S.strafeV * dt;
  S.pos.y += S.vertV * dt;
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
  // jet mesh transform — attitude sign: positive S.pitch is a nose-DOWN descent
  // (flight path uses sin(-pitch); the HUD att ball agrees), and positive S.roll
  // is a RIGHT bank (HUD att ball rotates clockwise). The mesh must match, so
  // both signs are flipped here: before this fix the jet visibly pitched nose-UP
  // while descending and banked the wrong way through every turn — the "weird
  // diagonal pose" in the storm and bridge covers.
  jetMesh.position.copy(S.pos);
  jetMesh.rotation.set(-S.pitch, S.yaw, -S.roll, 'YXZ');
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
      showTouchdown(sink, Math.abs(S.pos.x - cp.x) * 0.3, 300 + S.speed * 0.35);
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
    else { showBanner('★ STAGE CLEAR · +' + (200 * S.feverMult) + ' PTS'); if (!S.shotFreeze) S.scoreTarget += 200 * S.feverMult; setupStage(); }
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
function makeFireballTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.35, 'rgba(255,160,40,.95)');
  gr.addColorStop(0.7, 'rgba(255,80,20,.55)'); gr.addColorStop(1, 'rgba(255,60,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(c);
}
function spawnDebris(type) {
  // parts separate with inherited velocity, tumble, bounce and settle — the jet never just stops dead
  const fwd = new T.Vector3(Math.sin(S.yaw), 0, -Math.cos(S.yaw));
  const baseV = fwd.clone().multiplyScalar(S.speed * 0.35);
  const wingMat = new T.MeshPhongMaterial({ color: 0x0e5f5a, flatShading: true });
  const bodyMat = new T.MeshPhongMaterial({ color: 0xf2e8d5, flatShading: true });
  const darkMat = new T.MeshPhongMaterial({ color: 0x14181f });
  const parts = [
    { geo: new T.BoxGeometry(5.4, 0.22, 2.6), mat: wingMat, off: new T.Vector3(-3.6, 0, 1.4) },
    { geo: new T.BoxGeometry(5.4, 0.22, 2.6), mat: wingMat, off: new T.Vector3(3.6, 0, 1.4) },
    { geo: new T.CylinderGeometry(0.62, 0.72, 3.4, 8), mat: darkMat, off: new T.Vector3(-1.25, -0.35, 4.6) },
    { geo: new T.CylinderGeometry(0.62, 0.72, 3.4, 8), mat: darkMat, off: new T.Vector3(1.25, -0.35, 4.6) },
    { geo: new T.BoxGeometry(0.22, 2.4, 2.2), mat: wingMat, off: new T.Vector3(0, 1.3, 5.4) },
    { geo: new T.SphereGeometry(1.05, 8, 6), mat: bodyMat, off: new T.Vector3(0, 1.05, -2.2) },
  ];
  for (const p of parts) {
    const m = new T.Mesh(p.geo, p.mat);
    m.position.copy(S.pos).add(p.off);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    scene.add(m);
    S.debris.push({ mesh: m, vel: baseV.clone().add(new T.Vector3((Math.random() - 0.5) * 50, 18 + Math.random() * 30, (Math.random() - 0.5) * 50)), ang: new T.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), life: 5, water: type === 'water' });
  }
}
function crash(type, cause) {
  if (S.crashed) return;
  S.crashed = true; S.crashCause = cause; S.mode = 'crashed'; S.slowmo = 1; S.shake = 1; S.crashT = 0; S.autoRetryT = 0;
  jetMesh.visible = true; if (S.cockpit) setCockpit(false);
  audio.crashSound();
  S.hull = Math.max(0, S.hull - 45);
  const sink = type === 'water';
  // 1) screen flash 2) fireball 3) sparks + smoke 4) separating debris 5) wreck tumble/sink
  const fl = $('flash'); if (fl) { fl.style.transition = 'none'; fl.style.opacity = '0.85'; S.flashT = 0; }
  const tex = makeFireballTexture();
  const fb = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  fb.position.copy(S.pos); fb.scale.set(12, 12, 1); scene.add(fb); S.fireball = fb;
  world.burst(S.pos, 0xff6600, 50); world.burst(S.pos, 0xffd76a, 30);
  spawnSmoke(S.pos, 34, 16);
  spawnDebris(type);
  if (sink) {
    // splash column + foam ring + floating debris; the wreck sinks
    spawnSmoke(S.pos, 26, 55);
    world.burst(S.pos, 0xffffff, 24);
    const ring = new T.Mesh(new T.RingGeometry(4, 6.5, 32), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(S.pos.x, 1.2, S.pos.z); scene.add(ring); S.foam = ring;
    S.wreckVy = -6;
  } else {
    S.wreckVy = -30; // wreck drops and tumbles
    S.wreckSpin = (Math.random() - 0.5) * 4;
  }
  showBanner(sink ? '💥 DITCHED IN THE BAY' : '💥 CRASHED');
  setTimeout(() => { if (S.crashed) { S.slowmo = 0; showEnd(false, cause); } }, 1700);
}
function crashStep(dt) {
  // runs while the wreck is on screen: nothing freezes — particles, smoke, debris, fireball, wreck all keep moving in slow-mo
  S.crashT += dt;
  if (S.fireball) {
    const t = S.crashT / 0.8;
    S.fireball.scale.set(12 + t * 55, 12 + t * 55, 1);
    S.fireball.material.opacity = Math.max(0, 1 - t);
    if (t >= 1) { scene.remove(S.fireball); S.fireball = null; }
  }
  if (S.foam) {
    const t = S.crashT / 1.6, s = 1 + t * 7;
    S.foam.scale.set(s, s, 1); S.foam.material.opacity = Math.max(0, 0.8 - t * 0.8);
    if (t >= 1) { scene.remove(S.foam); S.foam = null; }
  }
  const fl = $('flash');
  if (fl && S.flashT < 1) { S.flashT += dt * 1.4; fl.style.transition = 'opacity .5s'; fl.style.opacity = String(Math.max(0, 0.85 - S.flashT * 0.85)); }
  // wreck: falls, tumbles, bounces once, then settles (water: sinks slowly, tilting)
  if (S.crashCause && S.crashCause.indexOf('sea') >= 0 || S.wreckVy === -6) {
    S.pos.y = Math.max(-14, S.pos.y + S.wreckVy * dt);
    jetMesh.rotation.z += 0.25 * dt; jetMesh.position.copy(S.pos);
  } else {
    S.wreckVy = S.pos.y > 3 ? S.wreckVy - 90 * dt : (Math.abs(S.wreckVy) > 8 ? -S.wreckVy * 0.3 : 0);
    S.pos.y = Math.max(3, S.pos.y + S.wreckVy * dt);
    jetMesh.rotation.z += S.wreckSpin * dt; S.wreckSpin *= (1 - dt * 0.8);
    jetMesh.position.copy(S.pos);
  }
  for (const d of S.debris) {
    d.life -= dt;
    if (d.water) {
      // float and bob on the surface
      if (d.mesh.position.y > 1.6) { d.vel.y -= 60 * dt; d.mesh.position.addScaledVector(d.vel, dt); }
      else { d.mesh.position.y = 1.6 + Math.sin(S.time * 2 + d.mesh.position.x) * 0.4; d.vel.multiplyScalar(1 - dt * 2); }
    } else {
      d.vel.y -= 90 * dt; d.mesh.position.addScaledVector(d.vel, dt);
      if (d.mesh.position.y < 1) { d.mesh.position.y = 1; d.vel.y = Math.abs(d.vel.y) > 10 ? -d.vel.y * 0.35 : 0; d.vel.x *= 0.7; d.vel.z *= 0.7; d.ang.multiplyScalar(0.6); }
    }
    d.mesh.rotation.x += d.ang.x * dt; d.mesh.rotation.y += d.ang.y * dt; d.mesh.rotation.z += d.ang.z * dt;
    if (d.life < 1) { d.mesh.material.transparent = true; d.mesh.material.opacity = Math.max(0, d.life); }
  }
  S.debris = S.debris.filter(d => { if (d.life <= 0) { scene.remove(d.mesh); return false; } return true; });
  updateParticles(dt);
  if (S.crashT > 0.4) spawnSmoke(S.pos, 1, 10); // smoke column keeps rising while the wreck burns
}
function clearCrashFx() {
  for (const d of S.debris) scene.remove(d.mesh);
  S.debris = []; S.smokeArr = [];
  if (S.fireball) { scene.remove(S.fireball); S.fireball = null; }
  if (S.foam) { scene.remove(S.foam); S.foam = null; }
  const fl = $('flash'); if (fl) fl.style.opacity = '0';
  S.slowmo = 0; S.crashT = 0; S.wreckVy = 0; S.wreckSpin = 0;
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
  clearCrashFx();
  if (S.checkpoint) { S.pos.copy(S.checkpoint.pos); S.yaw = S.checkpoint.yaw; }
  S.crashed = false; S.mode = 'flying'; S.hull = Math.max(60, S.hull); S.speed = 160; S.pos.y = Math.max(S.pos.y, 120);
  S.strafeV = 0; S.vertV = 0; // 6DOF velocities reset on retry
  jetMesh.rotation.set(0, S.yaw, 0, 'YXZ');
  $('endScreen').style.display = 'none'; S.slowmo = 0; S.autoRetryT = 0;
  say('Capt. Kenji Sato', 'Back in the air. Fly it clean this time.');
}
function backToMenu() {
  clearCrashFx();
  if (menuLight) menuLight.visible = true;
  if (menuRim) menuRim.visible = true;
  if (menuSunGlow) menuSunGlow.visible = true;
  if (windStreaks) for (const s of windStreaks) s.visible = true;
  S.mode = 'menu'; S.crashed = false; S.slowmo = 0;
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
  const sa = smokeGeo.attributes.position.array;
  for (let i = 0; i < 240; i++) {
    const p = S.smokeArr[i];
    if (p) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy += 6 * dt; sa[i * 3] = p.x; sa[i * 3 + 1] = p.y; sa[i * 3 + 2] = p.z; if (p.life <= 0) S.smokeArr[i] = null; }
    else sa[i * 3 + 1] = -9999;
  }
  S.smokeArr = S.smokeArr.filter(Boolean);
  smokeGeo.attributes.position.needsUpdate = true;
  if (S.rainOn && rainPoints.visible) {
    const ra = rainGeo.attributes.position.array;
    for (let i = 0; i < 1500; i++) { ra[i * 3 + 1] -= 260 * dt; ra[i * 3] -= 40 * dt; if (ra[i * 3 + 1] < 0) ra[i * 3 + 1] = 280; ra[i * 3] = S.pos.x + ((ra[i * 3] - S.pos.x + 300) % 600) - 300; ra[i * 3 + 2] = S.pos.z + ((ra[i * 3 + 2] - S.pos.z + 300) % 600) - 300; }
    rainGeo.attributes.position.needsUpdate = true;
    if (rainStreaks && rainStreaks.visible) { // streak layer falls with the same wrap
      const rs = rainStreakGeo.attributes.position.array;
      for (let i = 0; i < 1200; i++) {
        rs[i * 6 + 1] -= 260 * dt; rs[i * 6 + 4] -= 260 * dt; rs[i * 6] -= 40 * dt; rs[i * 6 + 3] -= 40 * dt;
        if (rs[i * 6 + 1] < 0) { rs[i * 6 + 1] = 280; rs[i * 6 + 4] = 256; }
        rs[i * 6] = S.pos.x + ((rs[i * 6] - S.pos.x + 300) % 600) - 300; rs[i * 6 + 3] = rs[i * 6] - 4;
        rs[i * 6 + 2] = S.pos.z + ((rs[i * 6 + 2] - S.pos.z + 300) % 600) - 300; rs[i * 6 + 5] = rs[i * 6 + 2];
      }
      rainStreakGeo.attributes.position.needsUpdate = true;
    }
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
function drawDial(cv, frac, color) {
  const g = cv.getContext('2d'); const W = cv.width, C = W / 2;
  g.clearRect(0, 0, W, W);
  g.strokeStyle = '#39ff88'; g.lineWidth = 5; g.beginPath(); g.arc(C, C, C - 6, 0, 7); g.stroke();
  g.strokeStyle = color || '#ffd76a'; g.lineWidth = 6; g.beginPath(); g.arc(C, C, C - 12, -Math.PI * 0.75, -Math.PI * 0.75 + frac * Math.PI * 1.5); g.stroke();
  const a = -Math.PI * 0.75 + frac * Math.PI * 1.5;
  g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a) * (C - 16), C + Math.sin(a) * (C - 16)); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(C, C, 5, 0, 7); g.fill();
}
function drawAttBall() {
  const cv = $('attBall'); if (!cv) return;
  const g = cv.getContext('2d'); const W = cv.width, C = W / 2;
  g.clearRect(0, 0, W, W);
  g.save(); g.beginPath(); g.arc(C, C, C - 4, 0, 7); g.clip();
  g.translate(C, C); g.rotate(S.roll * 0.5); g.translate(0, -S.pitch * 90);
  g.fillStyle = '#3a7bd5'; g.fillRect(-W, -W, W * 2, W); // sky
  g.fillStyle = '#8a5a2a'; g.fillRect(-W, 0, W * 2, W); // ground
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(-W, 0); g.lineTo(W, 0); g.stroke();
  g.restore();
  g.strokeStyle = '#ffd76a'; g.lineWidth = 4; g.beginPath(); g.moveTo(C - 26, C); g.lineTo(C + 26, C); g.stroke(); // fixed wings
  g.fillStyle = '#ffd76a'; g.beginPath(); g.arc(C, C, 5, 0, 7); g.fill();
}
function updateHUD() {
  $('score').textContent = Math.round(S.scoreShown).toLocaleString();
  if (S.scoreShown < S.scoreTarget) S.scoreShown = Math.min(S.scoreTarget, S.scoreShown + Math.max(1, (S.scoreTarget - S.scoreShown) * 0.12));
  const hdg = ((Math.round((-S.yaw * 180 / Math.PI) % 360) + 360) % 360);
  $('hdg').innerHTML = 'HDG <b>' + String(hdg).padStart(3, '0') + '°</b> · RWY <b>' + (S.sortie && S.sortie.stages.some(st => st.type === 'carrier') ? '27' : '09') + '</b> (0.37 NM)';
  const c = [32, 47, 62, 77, 92, 107, 122].map(n => String(((n + hdg - 92) % 360 + 360) % 360).padStart(3, '0')).join('  ');
  $('compass').textContent = c;
  // side tapes (CALDERA-style IAS / ALT)
  const spd = Math.round(S.speed), alt = Math.round(S.pos.y * 3.28);
  $('tapeLVal').textContent = spd + ' KT'; $('tapeRVal').textContent = alt + ' FT';
  $('tapeThr').textContent = Math.round(S.throttle * 100) + '%'; $('tapeAgl').textContent = alt;
  $('tapeLTicks').innerHTML = [spd + 30, spd + 15, spd, spd - 15, spd - 30].map(v => Math.max(0, v)).join('<br>');
  $('tapeRTicks').innerHTML = [alt + 200, alt + 100, alt, Math.max(0, alt - 100), Math.max(0, alt - 200)].join('<br>');
  // sortie advisor (CALDERA-style, under objectives)
  $('advisor').innerHTML = `<span class="gold">SORTIE ADVISOR · RWY ${S.sortie && S.sortie.stages.some(st => st.type === 'carrier') ? '27' : '09'} (0.37 NM)</span><br>AUTO CRUISE [M] (29.6 GPH) · +${Math.round(50 + S.fuel * 0.3)}% reserve · Hull ${Math.round(S.hull)}%`;
  // NAV & ILS panel
  $('navRwy').textContent = 'RWY ' + (S.sortie && S.sortie.stages.some(st => st.type === 'carrier') ? '27 (270°)' : '09 (090°)');
  $('navIls').textContent = S.glideLock ? 'LOCK 2.8° 2W/2R' : 'OFF';
  $('navWind').textContent = '284° / ' + S.gust + 'K';
  $('navAir').textContent = Math.round(S.hull) + '% OK';
  $('feverLabel').textContent = '★ JETSTREAM FEVER! ×' + S.feverMult;
  $('feverFill').style.width = S.fever + '%';
  $('fuelPct').textContent = Math.round(S.fuel) + '%'; $('fuelBar').style.width = S.fuel + '%';
  $('hullPct').textContent = Math.round(S.hull) + '%'; $('hullBar').style.width = clamp(S.hull, 0, 100) + '%';
  $('heatPct').textContent = Math.round(S.heat) + '%'; $('heatBar').style.width = S.heat + '%';
  $('speed').textContent = spd + ' KT';
  $('altHdg').textContent = alt + ' FT · HDG ' + String(hdg).padStart(3, '0') + '°';
  $('chipFever').textContent = 'FEVER ×' + S.feverMult;
  const d6 = $('dof6'); if (d6) d6.textContent = `6DOF · STRF ${S.strafeV >= 0 ? '+' : ''}${Math.round(S.strafeV)} · VERT ${S.vertV >= 0 ? '+' : ''}${Math.round(S.vertV)}`;
  $('chipFever').className = 'chip' + (S.feverMult >= 4 ? ' litY' : S.feverMult >= 2 ? ' lit' : '');
  $('cd1').textContent = S.cds.radar > 0 ? '(' + Math.ceil(S.cds.radar) + 's)' : 'READY';
  $('cd2').textContent = S.cds.chill > 0 ? '(' + Math.ceil(S.cds.chill) + 's)' : 'READY';
  $('cd3').textContent = S.cds.flare > 0 ? '(' + Math.ceil(S.cds.flare) + 's)' : 'READY';
  if (!$('contacts').innerHTML) flashContacts();
  // bottom instrument cluster (CALDERA-style 5 dials)
  drawDial($('gSpd'), clamp(spd / 360, 0, 1), '#22c55e'); $('cvSpd').textContent = spd + ' KT';
  drawAttBall(); $('cvAtt').textContent = Math.round(-S.pitch * 57) + '°';
  drawDial($('gAlt'), clamp(alt / 1200, 0, 1), '#35e0d0'); $('cvAlt').textContent = alt + ' FT';
  drawDial($('gHdg'), hdg / 360, '#ffd76a'); $('cvHdg').textContent = String(hdg).padStart(3, '0') + '°';
  drawDial($('gVsi'), clamp((S.lastVertSpeed + 1000) / 2000, 0, 1), '#ff9a3d'); $('cvVsi').textContent = Math.round(S.lastVertSpeed) + ' FPM';
  // cockpit gauges
  if (S.cockpit) {
    $('cockpitRead').textContent = `HDG ${String(hdg).padStart(3, '0')}° · ${spd} KT · ${alt} FT`;
    $('vAtt').textContent = Math.round(-S.pitch * 57) + '°';
    $('vKias').textContent = spd; $('ndKias').style.transform = `translateX(-50%) rotate(${clamp(-120 + spd * 0.7, -120, 120)}deg)`;
    $('vAlt').textContent = alt; $('ndAlt').style.transform = `translateX(-50%) rotate(${clamp(-120 + S.pos.y * 0.35, -120, 120)}deg)`;
    $('vHdg').textContent = String(hdg).padStart(3, '0') + '°'; $('ndHdg').style.transform = `translateX(-50%) rotate(${clamp(-120 + hdg * 0.67, -120, 120)}deg)`;
    $('vVsi').textContent = Math.round(S.lastVertSpeed); $('ndVsi').style.transform = `translateX(-50%) rotate(${clamp(S.lastVertSpeed * 0.12, -120, 120)}deg)`;
    $('vIls').textContent = S.glideLock ? 'LOCKED' : 'OFF';
    $('thrKnob').style.bottom = (S.throttle * 78 + 6) + '%';
    $('thrKnob2').style.bottom = (S.throttle * 70 + 6) + '%';
    $('cockFuel').textContent = Math.round(S.fuel) + '%'; $('cockFuelBar').style.width = S.fuel + '%';
    $('cockHeat').textContent = Math.round(S.heat) + '%'; $('cockHeatBar').style.width = S.heat + '%';
    $('cockHull').textContent = Math.round(S.hull) + '%';
    $('ccFlaps').textContent = S.flaps ? 'FLAPS 40°' : 'FLAPS 15°';
    $('ccGear').textContent = S.gear ? 'GEAR 3-GRN' : 'GEAR UP';
    $('ccIls').textContent = S.glideLock ? 'ILS LOC+GS' : 'ILS OFF';
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
    // fixed hero angle: the jet never drifts into a rear view — 3/4 front, nose toward camera-left, wings LEVEL, big on the right (ref 2: the plane is parked level on display, not diving diagonally — the old pitch -0.55 / roll 0.45 made it look nose-down)
    const r = 64 + S.orbitDrag;
    camera.position.set(Math.sin(S.menuAngle) * r, 76 + Math.sin(S.time * 0.2) * 4, 520 + Math.cos(S.menuAngle) * r);
    camera.lookAt(-14, 88, 520);
    menuJet.rotation.set(0, 2.05, 0, 'YXZ'); // level 3/4 front: pitch 0, roll 0, yaw 2.05 puts the nose toward camera-left with the wings horizontal
    menuJet.position.y = 74 + Math.sin(S.time * 0.8) * 3;
    // afterburner flicker
    if (menuJet.userData.abGlow) { const f = 1 + Math.sin(S.time * 13) * 0.12 + Math.sin(S.time * 29) * 0.06; menuJet.userData.abGlow.scale.set(17 * f, 17 * f, 1); }
    // wind streaks streaming past + occasional lightning in the sunset sky
    if (windStreaks) updateWindStreaks(dt);
    S.lightningTimer -= dt; if (S.lightningTimer <= 0) { S.lightningTimer = 6 + Math.random() * 5; world.strikeLightning(-120 + Math.random() * 240, -350 - Math.random() * 250); }
    return;
  }
  if (S.crashed) {
    // crash cam detaches and eases to a wide view of the wreck — never a snap cut
    camera.position.lerp(new T.Vector3(S.pos.x + 55, S.pos.y + 38, S.pos.z + 55), 1 - Math.exp(-1.6 * dt));
    camera.lookAt(S.pos); return;
  }
  const fwd = new T.Vector3(Math.sin(S.yaw), 0, -Math.cos(S.yaw));
  if (S.cockpit && !S.shotChase) {
    camera.position.copy(S.pos).addScaledVector(fwd, -2).add(new T.Vector3(0, 1.6, 0));
    camera.rotation.set(S.pitch - 0.06, S.yaw, S.roll * 0.4, 'YXZ'); // pitched slightly down so the carrier deck sits in the view window
    camera.fov = lerp(camera.fov, 68, 0.1); camera.updateProjectionMatrix(); return;
  }
  const target = S.camMode === 'orbit'
    ? S.pos.clone().add(new T.Vector3(Math.sin(S.time * 0.3) * 90, 35, Math.cos(S.time * 0.3) * 90))
    : S.pos.clone().addScaledVector(fwd, 26).add(new T.Vector3(0, 9, 0));
  // chase: close, behind and above, offset so the jet sits left-centre and reads large
  const chase = S.pos.clone().addScaledVector(fwd, -S.chaseDist).add(new T.Vector3(0, S.chaseH, 0));
  chase.x += -fwd.z * 7; chase.z += fwd.x * 7;
  const dest = S.camMode === 'orbit' ? target : chase;
  camera.position.lerp(dest, 1 - Math.exp(-10 * dt)); // fast follow: a slow camera trails ~30 units behind a fast jet and shrinks it to a dot
  camera.lookAt(S.pos.x + fwd.x * S.lookAhead, S.pos.y + Math.sin(-S.pitch) * S.lookAhead * 0.5, S.pos.z + fwd.z * S.lookAhead);
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
    if (S.fpsEMA < 45 && S.quality > 0) { S.quality--; renderer.setPixelRatio(S.quality === 0 ? 1 : 1.25); rainPoints.visible = false; if (rainStreaks) rainStreaks.visible = false; }
    else if (S.fpsEMA > 58 && S.quality < 2 && !SAFE) { S.quality++; renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); }
  }
  if (S.paused) { renderer.render(scene, camera); return; }
  const ts = S.slowmo > 0 ? 0.3 : 1;
  S.time += dt * ts;
  if (S.mode === 'flying' && !S.crashed) {
    acc += dt * ts;
    const h = 1 / 60; let n = 0;
    while (acc >= h && n < 8) { step(h); acc -= h; n++; }
    if (n === 8) acc = 0;
    // NaN guard
    if (!isFinite(S.pos.x) || !isFinite(S.pos.y) || !isFinite(S.pos.z) || !isFinite(S.speed)) { S.pos.set(0, 130, 520); S.speed = 150; S.yaw = 0; S.pitch = 0; }
    S.pos.y = clamp(S.pos.y, 2, 900); S.pos.x = clamp(S.pos.x, -1200, 1200); S.pos.z = clamp(S.pos.z, -1800, 1000);
  }
  if (S.mode === 'crashed') { crashStep(dt * ts); if (AUTOPLAY) { S.autoRetryT = (S.autoRetryT || 0) + dt; if (S.autoRetryT > 3) { S.autoRetryT = 0; retry(); } } } // autoplay: watch the wreck settle, then get back in the air instead of sitting on the end screen
  hudT += dt; if (hudT > 0.1) { hudT = 0; if (S.mode === 'flying') updateHUD(); }
  updateCamera(dt * ts);
  renderer.render(scene, camera);
}

// ---------- shot modes (for screenshots) ----------
function setupShot(shot) {
  setTimeout(() => {
    if (shot === 'menu') {
      // cover: hold a lightning bolt in the sunset sky so the still catches it; pause the menu lightning timer meanwhile
      world.holdLightning = true; world.strikeLightning(-180, -450); world.flashLight.intensity = 0.7; S.lightningTimer = 30;
    }
    else if (shot === 'storm') {
      // CALDERA storm landing, v2 (reference: plane LOW on final over a lit runway, ONE HUGE
      // WHITE-HOT bolt centre-frame over snowy mountains): jet low at y 70 on the glide path,
      // rings lowered onto the final, hero bolt dead-centre on the approach line, tall enough
      // (topY 300) to span the frame from the top edge down to the runway.
      selectSortie(6); launch(true); S.pos.set(180, 70, 860); S.yaw = 0; S.speed = 200; S.fever = 82; S.feverMult = 8;
      S.gear = true; S.flaps = true; S.hook = true; syncGear();
      // storm cover: clear the approach — the rings sit between the camera and the hero bolt and the bot
      // flies into them, so they end up huge in the centre of the frame and hide the bolt. With the rings
      // gone and the stage set to the carrier landing, the jet holds a LEVEL final (attitude hold in
      // step(): pitch 0.1 / yaw 0 / roll 0) straight down the approach line toward the carrier — wings
      // level, gentle descent, like ref 1 — and the bolt has a clear line of sight.
      for (const r of [...world.rings]) scene.remove(r);
      world.rings.length = 0;
      S.stageIdx = 2; S.stageDone = 0; $('hudStage').textContent = 'STAGE 3/3'; renderObjectives(); // panel now shows STAGE 3/3 + the carrier-landing objective
      addScore(750, 'FEVER DROP ×8 · STORM BONUS!'); // real award: 750 × 8 = +6,000 — banner and SCORE now agree
      S.scoreShown = S.scoreTarget; S.shotFreeze = true; // staged shot: show the awarded score at once (real play still counts up)
      setInterval(() => { if (S.mode === 'flying' && !S.crashed) showBanner('★ FEVER DROP ×8 · STORM BONUS! · +6,000 PTS'); }, 1700);
      world.holdLightning = true;
      // HERO bolt dead-centre on the approach line over the mountains + two smaller white companions off-axis.
      // Hero sits at z 560 — in FRONT of the nearest karst pillar row (z 500), which occluded it at z 450 —
      // and TALL (topY 300, 12 segments) so it spans from above the top edge of the frame down behind the jet,
      // like the CALDERA reference bolt. Chase camera pulled in (12 vs 16) so the jet reads bigger on final.
      S.chaseDist = 17; // pulled back from 12: with the jet flying LEVEL the tail sat right against the bottom bar and cropped — 17 frames the whole jet with the lit runway ahead
      world.strikeLightning(180, 560, true, 300); // ONE hero bolt only — companions read as a second competing bolt and broke the reference's single-bolt look
      // Kill the strike's flash light: a HELD hero bolt leaves the white point light on forever, and it
      // bleaches the whole storm scene pale (bright turquoise sea, tan pillars, washed-out sky) — verified
      // by A/B test: flash 0 = the dark slate storm of the 172f943 take, flash 3.5/5 = daytime washout.
      // The bolt itself is unlit white MeshBasicMaterial, so it stays crisp and bright with no flash.
      world.flashLight.intensity = 0;
      S.dialogueQueue = [{ name: 'Capt. Kenji Sato', text: RADIO.kenji[3] }]; S.dlgTimer = 0;
      S.lightningTimer = 30; // pause the live storm timer so no extra bolts pile up during the still
    }
    else if (shot === 'carrier') {
      // CALDERA dusk cockpit: first-person ILS approach to the lit carrier under a red dusk sky.
      // LOW SHORT FINAL along the deck's west edge: the jet sits at (140,25,700), yaw 0.15 —
      // only 11 units above the deck, so the deck + yellow centreline stripe run away from the
      // bottom-centre of the cockpit window toward the island and meatball ahead-right, while
      // the centreline pillar (x ~180, z ~680) falls to the frame's right edge.
      selectSortie(4); launch(true); applyWeather('dusk');
      S.pos.set(140, 25, 700); S.yaw = 0.15; S.speed = 150;
      S.gear = true; S.flaps = true; S.hook = true; S.glideLock = true; syncGear();
      setCockpit(true); S.shotChase = false; jetMesh.visible = false;
      addScore(800, '3-WIRE TRAP (86 FPM)'); // staged award so banner and SCORE agree
      S.scoreShown = S.scoreTarget; S.shotFreeze = true;
      showTouchdown(86, 1, 347);
      setInterval(() => { if (S.mode === 'flying' && !S.crashed) showBanner('★ 3-WIRE TRAP (86 FPM) · +800 PTS'); }, 1700);
      S.dialogueQueue = [{ name: 'Capt. Kenji Sato', text: RADIO.kenji[1] }]; S.dlgTimer = 0;
    }
    else {
      // ref 4: big banking jet under the red Dragon Bridge at sunset, glowing ring ahead bursting, +2,800 banner
      selectSortie(5); launch(true); S.pos.set(0, 88, -100); S.yaw = 0; S.speed = 200; S.fever = 82; S.feverMult = 8;
      S.dialogueQueue = [{ name: 'Capt. Kenji Sato', text: RADIO.kenji[0] }]; S.dlgTimer = 0;
      // rings re-staged nearly straight ahead under/through the bridge so the bot
      // flies a gentle S toward the span with a small bank, not a hard zigzag —
      // the old ±40 offsets made it bank ~50° and dive diagonally across the frame
      if (world.rings[0]) world.rings[0].position.set(0, 85, -300);
      if (world.rings[1]) world.rings[1].position.set(-18, 88, -480);
      if (world.rings[2]) world.rings[2].position.set(12, 84, -660);
      addScore(350, 'JETSTREAM FEVER! ×8'); // real award: 350 × 8 = +2,800 — banner and SCORE now agree
      S.scoreShown = S.scoreTarget; S.shotFreeze = true; // staged shot: show the awarded score at once (real play still counts up)
      setInterval(() => { if (S.mode === 'flying' && !S.crashed) showBanner('★ JETSTREAM FEVER! ×8 · +2,800 PTS'); }, 1700);
      setInterval(() => { if (world.rings.length && S.mode === 'flying' && !S.crashed) world.burst(world.rings[0].position, 0xffffff, 30); }, 600);
    }
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
  getStats() { return { mode: S.mode, score: S.scoreTarget, scoreShown: Math.round(S.scoreShown), fever: S.fever, mult: S.feverMult, speed: Math.round(S.speed), alt: Math.round(S.pos.y * 3.28), hull: Math.round(S.hull), fuel: Math.round(S.fuel), heat: Math.round(S.heat), stage: S.stageIdx, stageDone: S.stageDone, sortie: S.sortieNum, jet: S.jetId, fps: Math.round(S.fpsEMA), crashed: S.crashed, yaw: +S.yaw.toFixed(3), pitch: +S.pitch.toFixed(3), x: Math.round(S.pos.x), y: Math.round(S.pos.y), z: Math.round(S.pos.z), strafe: Math.round(S.strafeV), vert: Math.round(S.vertV) }; },
};

try { init(); } catch (e) { const el = $('error'); el.style.display = 'block'; el.textContent = 'Failed to start WebGL: ' + e.message; }
