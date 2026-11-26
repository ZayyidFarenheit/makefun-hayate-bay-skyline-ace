// Hayate Bay world: procedural textures, karst canyon, sea, sky, carrier, jets, particles.
const T = window.THREE;
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4; return t;
}
export function stripeTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b06a35'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = ['#c07a3e', '#8f4f24', '#d98d4a', '#a05a2c'][x % 4]; g.fillRect(x, 0, 6, h); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,30,10,.25)'; g.fillRect(Math.random() * w, Math.random() * h, 3, 20 + Math.random() * 50); }
  });
}
export function foliageTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#2e7d32'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = ['#3f9e44', '#1f5c26', '#66bb5a', '#8bc34a'][i % 4]; const r = 3 + Math.random() * 7; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill(); }
  });
}
export function glowTexture(inner, outer) {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, inner); gr.addColorStop(0.4, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
export function numberTexture(n) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = 'rgba(5,38,34,.9)'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
    g.strokeStyle = '#7ff0d4'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 68);
  });
}
export class World {
  constructor(scene) {
    this.scene = scene; this.pillars = []; this.particles = [];
    this.buildSky(); this.buildSea(); this.buildCanyon(); this.buildBridge(); this.buildCarrier(); this.buildCity(); this.buildClouds(); this.buildBirds();
    this.flashLight = new T.PointLight(0xccccff, 0, 900); scene.add(this.flashLight); this.lightning = null;
    this.rings = []; this.crates = []; this.npcs = [];
  }
  buildSky() {
    const s = this.scene;
    s.fog = new T.Fog(0xe8906a, 250, 2400);
    const geo = new T.SphereGeometry(2600, 24, 16);
    const mat = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new T.Color(0x2a4d7a) }, mid: { value: new T.Color(0xff9a4d) }, bot: { value: new T.Color(0xffc98a) } },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h=normalize(vP).y; vec3 c=h>0.12?mix(mid,top,smoothstep(0.12,0.65,h)):mix(bot,mid,smoothstep(-0.08,0.12,h)); gl_FragColor=vec4(c,1.0); }' });
    s.add(new T.Mesh(geo, mat));
    const sunTex = glowTexture('rgba(255,240,190,1)', 'rgba(255,150,50,.85)');
    const sun = new T.Sprite(new T.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false }));
    sun.scale.set(420, 420, 1); sun.position.set(-900, 180, -2100); s.add(sun);
    const sun2 = new T.Sprite(new T.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, opacity: 0.5, fog: false }));
    sun2.scale.set(900, 900, 1); sun2.position.copy(sun.position); s.add(sun2);
    const dl = new T.DirectionalLight(0xffc27a, 1.25); dl.position.set(-600, 220, -900); s.add(dl);
    s.add(new T.AmbientLight(0x7a9ab0, 0.55));
    s.add(new T.HemisphereLight(0xffb070, 0x0e4a44, 0.5));
    this.sunLight = dl;
  }
  buildSea() {
    const tex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#0e5f66'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 20, 2); }
      for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(53,224,208,.15)'; g.fillRect(Math.random() * w, Math.random() * h, 4, 4); }
    }, [24, 24]);
    const sea = new T.Mesh(new T.PlaneGeometry(5200, 5200, 1, 1), new T.MeshPhongMaterial({ color: 0x1a7a80, map: tex, shininess: 120, specular: 0xffb060 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = 0; this.scene.add(sea); this.sea = sea;
    const pathTex = canvasTex(64, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,190,90,0)'); gr.addColorStop(0.5, 'rgba(255,200,110,.85)'); gr.addColorStop(1, 'rgba(255,190,90,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const path = new T.Mesh(new T.PlaneGeometry(260, 2600), new T.MeshBasicMaterial({ map: pathTex, transparent: true, opacity: 0.55, depthWrite: false }));
    path.rotation.x = -Math.PI / 2; path.position.set(-450, 0.6, -1100); path.rotation.z = 0.42; this.scene.add(path);
  }
  buildCanyon() {
    const stripe = stripeTexture(), fol = foliageTexture();
    const geo = new T.CylinderGeometry(1, 1.35, 1, 7);
    const mat = new T.MeshLambertMaterial({ map: stripe, flatShading: true });
    const count = 64;
    const inst = new T.InstancedMesh(geo, mat, count);
    const m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), pos = new T.Vector3();
    let i = 0; const spots = [];
    for (let z = 500; z > -1600; z -= 55) {
      for (const side of [-1, 1]) {
        if (i >= count) break;
        const x = side * (150 + Math.random() * 160);
        const h = 90 + Math.random() * 170, r = 16 + Math.random() * 22;
        pos.set(x + (Math.random() - 0.5) * 40, h / 2 - 4, z + (Math.random() - 0.5) * 30);
        q.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.random() * 3);
        sc.set(r, h, r); m.compose(pos, q, sc); inst.setMatrixAt(i, m);
        spots.push({ x: pos.x, z: pos.z, r: r * 0.9, h }); i++;
      }
    }
    inst.count = i; this.scene.add(inst); this.pillars = spots;
    const capGeo = new T.IcosahedronGeometry(1, 0);
    const capMat = new T.MeshLambertMaterial({ map: fol, flatShading: true });
    const caps = new T.InstancedMesh(capGeo, capMat, i * 2);
    let ci = 0;
    for (const p of spots) for (let k = 0; k < 2; k++) {
      pos.set(p.x + (Math.random() - 0.5) * p.r, p.h - 2 + Math.random() * 6, p.z + (Math.random() - 0.5) * p.r);
      q.identity(); sc.set(p.r * 0.7, p.r * 0.35, p.r * 0.7); m.compose(pos, q, sc); caps.setMatrixAt(ci++, m);
    }
    caps.count = ci; this.scene.add(caps);
    const islGeo = new T.DodecahedronGeometry(1, 0);
    const isl = new T.InstancedMesh(islGeo, mat, 14);
    for (let k = 0; k < 14; k++) {
      pos.set((Math.random() - 0.5) * 900, 2, 300 - Math.random() * 1500);
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.random() * 3);
      const r = 10 + Math.random() * 22; sc.set(r, r * 0.4, r); m.compose(pos, q, sc); isl.setMatrixAt(k, m);
    }
    this.scene.add(isl);
  }
  buildBridge() {
    const g = new T.Group();
    const mat = new T.MeshLambertMaterial({ color: 0xc0392b, flatShading: true });
    const deck = new T.Mesh(new T.BoxGeometry(340, 6, 16), mat); deck.position.set(0, 78, -320); g.add(deck);
    for (const x of [-150, 150]) { const tower = new T.Mesh(new T.BoxGeometry(10, 120, 10), new T.MeshLambertMaterial({ color: 0x8e2f22 })); tower.position.set(x, 60, -320); g.add(tower); }
    const arch = new T.Mesh(new T.TorusGeometry(150, 6, 8, 24, Math.PI), mat); arch.position.set(0, 78, -320); g.add(arch);
    const cableMat = new T.LineBasicMaterial({ color: 0xdddddd });
    for (let k = -6; k <= 6; k++) { const pts = [new T.Vector3(k * 22, 78, -320), new T.Vector3(k * 22, 78 + 60 - Math.abs(k) * 7, -320)]; g.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), cableMat)); }
    this.scene.add(g); this.bridge = { x: 0, z: -320, y: 78 };
  }
  buildCarrier() {
    const g = new T.Group();
    const hull = new T.Mesh(new T.BoxGeometry(46, 14, 260), new T.MeshLambertMaterial({ color: 0x3a4a52, flatShading: true })); hull.position.y = 4; g.add(hull);
    const deck = new T.Mesh(new T.BoxGeometry(56, 3, 260), new T.MeshLambertMaterial({ color: 0x5a6a72 })); deck.position.y = 12; g.add(deck);
    const island = new T.Mesh(new T.BoxGeometry(10, 22, 34), new T.MeshLambertMaterial({ color: 0x6a7a82 })); island.position.set(20, 24, 40); g.add(island);
    const stripe = new T.Mesh(new T.BoxGeometry(2, 0.4, 240), new T.MeshBasicMaterial({ color: 0xffd76a })); stripe.position.set(-12, 13.8, 0); g.add(stripe);
    this.wires = [];
    for (let k = 0; k < 4; k++) { const w = new T.Mesh(new T.BoxGeometry(44, 0.5, 1.2), new T.MeshBasicMaterial({ color: 0x222222 })); w.position.set(0, 13.8, -70 + k * 14); g.add(w); this.wires.push(w); }
    this.meatball = [];
    for (let k = 0; k < 5; k++) { const s = new T.Mesh(new T.SphereGeometry(1.4, 8, 8), new T.MeshBasicMaterial({ color: k === 2 ? 0x33ff66 : 0xffaa00 })); s.position.set(24, 16 + k * 3, 10); g.add(s); this.meatball.push(s); }
    g.position.set(180, 0, 620); g.rotation.y = Math.PI; this.scene.add(g); this.carrier = g;
    this.carrierPos = new T.Vector3(180, 14, 620);
  }
  buildCity() {
    const g = new T.Group(); const mat = new T.MeshLambertMaterial({ color: 0x3a4a66, flatShading: true });
    for (let k = 0; k < 26; k++) { const h = 40 + Math.random() * 130; const b = new T.Mesh(new T.BoxGeometry(18 + Math.random() * 22, h, 18 + Math.random() * 22), mat); b.position.set(-700 + k * 58 + (Math.random() - 0.5) * 20, h / 2, 900 + (Math.random() - 0.5) * 120); g.add(b); }
    this.scene.add(g);
  }
  buildClouds() {
    const tex = glowTexture('rgba(255,220,180,.9)', 'rgba(255,150,90,.5)'); this.clouds = [];
    for (let k = 0; k < 26; k++) { const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.35 + Math.random() * 0.3, depthWrite: false })); s.scale.set(180 + Math.random() * 260, 40 + Math.random() * 60, 1); s.position.set((Math.random() - 0.5) * 2200, 200 + Math.random() * 260, 400 - Math.random() * 2200); this.scene.add(s); this.clouds.push(s); }
  }
  buildBirds() {
    this.birds = []; const mat = new T.MeshBasicMaterial({ color: 0x1a1a1a });
    for (let k = 0; k < 10; k++) { const b = new T.Mesh(new T.ConeGeometry(1.2, 5, 4), mat); b.rotation.x = Math.PI / 2; b.position.set((Math.random() - 0.5) * 600, 120 + Math.random() * 120, -Math.random() * 900); this.scene.add(b); this.birds.push(b); }
    for (let k = 0; k < 3; k++) {
      const bal = new T.Mesh(new T.SphereGeometry(9, 10, 8), new T.MeshLambertMaterial({ color: [0xff5a5a, 0xffd76a, 0x35e0d0][k] })); bal.position.set(-300 + k * 260, 190, -500 - k * 120); this.scene.add(bal);
      const basket = new T.Mesh(new T.BoxGeometry(5, 4, 5), new T.MeshLambertMaterial({ color: 0x6b4423 })); basket.position.set(bal.position.x, 178, bal.position.z); this.scene.add(basket);
    }
  }
  buildJet(id) {
    const spec = { 'K-21': { body: 0xf2e8d5, wing: 0x0e5f5a, accent: 0xffd76a }, 'S-50': { body: 0xff8c42, wing: 0x2a6f9e, accent: 0xffffff }, 'Z-9': { body: 0x2b2f3a, wing: 0x8a1f2d, accent: 0x35e0d0 } }[id] || { body: 0xf2e8d5, wing: 0x0e5f5a, accent: 0xffd76a };
    const g = new T.Group();
    const bodyMat = new T.MeshPhongMaterial({ color: spec.body, shininess: 90, flatShading: true });
    const wingMat = new T.MeshPhongMaterial({ color: spec.wing, shininess: 60, flatShading: true });
    const darkMat = new T.MeshPhongMaterial({ color: 0x14181f, shininess: 40 });
    const accentMat = new T.MeshPhongMaterial({ color: spec.accent, shininess: 80, emissive: spec.accent, emissiveIntensity: 0.25 });
    const fus = new T.Mesh(new T.SphereGeometry(1.6, 12, 10), bodyMat); fus.scale.set(1, 1, 4.2); g.add(fus);
    const nose = new T.Mesh(new T.ConeGeometry(1.15, 3.4, 12), darkMat); nose.rotation.x = Math.PI / 2; nose.position.z = -7.6; g.add(nose);
    const canopy = new T.Mesh(new T.SphereGeometry(1.05, 10, 8), new T.MeshPhongMaterial({ color: 0x1a7a8a, shininess: 140, transparent: true, opacity: 0.9 })); canopy.scale.set(1, 0.75, 1.9); canopy.position.set(0, 1.05, -2.2); g.add(canopy);
    const stripe = new T.Mesh(new T.BoxGeometry(3.3, 0.28, 6.4), new T.MeshBasicMaterial({ color: 0xd43d2a })); stripe.position.set(0, 0.15, 0.5); g.add(stripe);
    const stripe2 = new T.Mesh(new T.BoxGeometry(3.3, 0.28, 6.4), new T.MeshBasicMaterial({ color: 0x2fae5f })); stripe2.position.set(0, -0.35, 0.5); g.add(stripe2);
    for (const s of [-1, 1]) {
      const wing = new T.Mesh(new T.BoxGeometry(5.4, 0.22, 2.6), wingMat); wing.position.set(s * 3.6, -0.25, 1.4); wing.rotation.y = s * 0.55; wing.rotation.z = s * -0.06; g.add(wing);
      const led = new T.Mesh(new T.BoxGeometry(5.4, 0.1, 0.35), accentMat); led.position.set(s * 3.6, -0.12, 0.05); led.rotation.y = s * 0.55; g.add(led);
      const tail = new T.Mesh(new T.BoxGeometry(2.2, 0.18, 1.5), wingMat); tail.position.set(s * 1.5, 0.5, 5.6); tail.rotation.y = s * 0.5; g.add(tail);
      const nac = new T.Mesh(new T.CylinderGeometry(0.62, 0.72, 3.4, 10), darkMat); nac.rotation.x = Math.PI / 2; nac.position.set(s * 1.25, -0.35, 4.6); g.add(nac);
      const flame = new T.Mesh(new T.ConeGeometry(0.55, 2.6, 8), new T.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.85 })); flame.rotation.x = -Math.PI / 2; flame.position.set(s * 1.25, -0.35, 7.2); flame.name = 'flame'; g.add(flame);
    }
    const fin = new T.Mesh(new T.BoxGeometry(0.22, 2.4, 2.2), wingMat); fin.position.set(0, 1.3, 5.4); fin.rotation.x = -0.35; g.add(fin);
    const gear = new T.Group(); gear.name = 'gear';
    for (const [x, z] of [[-1.1, -2.5], [1.1, -2.5], [0, -5.5]]) {
      const leg = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 1.4, 6), darkMat); leg.position.set(x, -1.9, z); gear.add(leg);
      const wheel = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.3, 10), darkMat); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, -2.55, z); gear.add(wheel);
    }
    gear.visible = false; g.add(gear);
    if (id === 'S-50') for (const s of [-1, 1]) { const hull = new T.Mesh(new T.CylinderGeometry(0.8, 0.9, 6, 8), bodyMat); hull.rotation.x = Math.PI / 2; hull.position.set(s * 1.6, -1.1, 0); g.add(hull); }
    if (id === 'Z-9') g.scale.set(0.9, 0.9, 1.15);
    return g;
  }
  makeRing(num, radius) {
    const g = new T.Group();
    const ring = new T.Mesh(new T.TorusGeometry(radius || 14, 0.9, 10, 40), new T.MeshBasicMaterial({ color: 0x7ff0d4 }));
    g.add(ring);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture('rgba(127,240,212,.9)', 'rgba(127,240,212,.25)'), transparent: true, depthWrite: false }));
    glow.scale.set((radius || 14) * 3.4, (radius || 14) * 3.4, 1); g.add(glow);
    const badge = new T.Sprite(new T.SpriteMaterial({ map: numberTexture(num), transparent: true, depthWrite: false }));
    badge.scale.set(12, 12, 1); badge.position.set(0, (radius || 14) + 9, 0); g.add(badge);
    g.userData.ring = ring; g.userData.glow = glow;
    return g;
  }
  makeCrate() {
    const g = new T.Group();
    const chute = new T.Mesh(new T.SphereGeometry(3.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshLambertMaterial({ color: 0xff7a1a, side: T.DoubleSide }));
    chute.position.y = 4.4; g.add(chute);
    const box = new T.Mesh(new T.BoxGeometry(2.6, 2.6, 2.6), new T.MeshLambertMaterial({ color: 0x8a6d3b })); g.add(box);
    return g;
  }
  burst(pos, color, n) {
    for (let i = 0; i < (n || 24); i++) this.particles.push({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, vz: (Math.random() - 0.5) * 40, life: 0.9, max: 0.9 });
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }
  strikeLightning() {
    if (this.lightning) this.scene.remove(this.lightning);
    const pts = []; let x = (Math.random() - 0.5) * 800, y = 500, z = -Math.random() * 1200;
    for (let i = 0; i < 8; i++) { pts.push(new T.Vector3(x, y, z)); x += (Math.random() - 0.5) * 90; y -= 70; z += (Math.random() - 0.5) * 60; }
    this.lightning = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0xffffff }));
    this.scene.add(this.lightning);
    this.flashLight.position.set(x, 200, z); this.flashLight.intensity = 3;
    setTimeout(() => { if (this.lightning) { this.scene.remove(this.lightning); this.lightning = null; } this.flashLight.intensity = 0; }, 180);
  }
}
