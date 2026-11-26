// Procedural WebAudio: engine, wind, thunder, chimes, Kaze FM 101.5 generative synth.
export class AudioEngine {
  constructor() { this.ctx = null; this.muted = false; this.started = false; this.track = 'Emerald Jetstream'; this.step = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(this.ctx.destination);
      // engine: two detuned oscillators + noise
      this.engGain = this.ctx.createGain(); this.engGain.gain.value = 0.05; this.engGain.connect(this.master);
      this.osc1 = this.ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 60;
      this.osc2 = this.ctx.createOscillator(); this.osc2.type = 'square'; this.osc2.frequency.value = 30;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; this.engFilter = f;
      this.osc1.connect(f); this.osc2.connect(f); f.connect(this.engGain); this.osc1.start(); this.osc2.start();
      // wind noise
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = this.ctx.createBufferSource(); this.noise.buffer = buf; this.noise.loop = true;
      const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 400; this.windFilter = nf;
      this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0.02;
      this.noise.connect(nf); nf.connect(this.windGain); this.windGain.connect(this.master); this.noise.start();
      this.started = true;
      this.musicTimer = setInterval(() => this.musicStep(), 240);
    } catch (e) { /* audio unavailable: game continues silent */ }
  }
  setEngine(throttle, afterburner, speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(55 + throttle * 90 + (afterburner ? 70 : 0) + speed * 0.12, t, 0.1);
    this.osc2.frequency.setTargetAtTime(28 + throttle * 45 + speed * 0.06, t, 0.1);
    this.engGain.gain.setTargetAtTime(0.03 + throttle * 0.07 + (afterburner ? 0.05 : 0), t, 0.15);
    this.windGain.gain.setTargetAtTime(0.01 + speed * 0.00012, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 2, t, 0.2);
  }
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    try {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || 'sine'; o.frequency.value = freq || 880;
      g.gain.setValueAtTime(vol || 0.15, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (dur || 0.15));
      o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + (dur || 0.15) + 0.02);
    } catch (e) {}
  }
  chime() { this.blip(880, 0.18, 'sine', 0.2); setTimeout(() => this.blip(1318, 0.25, 'sine', 0.18), 90); }
  riser() { if (!this.ctx) return; const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(200, this.ctx.currentTime); o.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.6); g.gain.setValueAtTime(0.08, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.7); o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + 0.75); }
  thunder() { if (!this.ctx) return; const s = this.ctx.createBufferSource(); s.buffer = this.noise.buffer; const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 120; const g = this.ctx.createGain(); g.gain.setValueAtTime(0.35, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.6); s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(this.ctx.currentTime + 1.7); }
  thud() { this.blip(70, 0.3, 'sine', 0.35); }
  crashSound() { this.thunder(); this.blip(45, 0.8, 'sawtooth', 0.3); }
  musicStep() {
    if (!this.ctx || this.muted || document.hidden) return;
    // Generative future-synth: pentatonic arpeggio, root shifts every 16 steps
    const scale = [0, 3, 5, 7, 10, 12, 15]; const roots = [220, 196, 174.6, 146.8];
    const root = roots[Math.floor(this.step / 16) % 4];
    const note = scale[this.step % 7] + (this.step % 14 >= 7 ? 12 : 0);
    const freq = root * Math.pow(2, note / 12);
    if (this.step % 2 === 0) this.blip(freq, 0.35, 'triangle', 0.05);
    if (this.step % 8 === 0) this.blip(root / 2, 0.5, 'sine', 0.09);
    this.step++;
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; return this.muted; }
}
