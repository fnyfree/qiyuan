/* Every sound on this page is synthesised with Web Audio. Nothing is loaded, nothing plays until asked. */
window.QYAudio = (function () {
  return class Sound {
    constructor() { this.ctx = null; this.on = false; this.reduced = false; this.bpm = 0; this.nextBeat = 0; }

    enable() {
      if (!this.ctx) this.build();
      this.on = true;
      this.ctx.resume();
      const g = this.master.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(Math.max(g.value, 0.0001), t);
      g.exponentialRampToValueAtTime(0.6, t + 0.8);
    }
    disable() {
      if (!this.ctx) return;
      this.on = false;
      const g = this.master.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(Math.max(g.value, 0.0001), t);
      g.exponentialRampToValueAtTime(0.0001, t + 0.25);
    }
    build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      const c = (this.ctx = new AC());
      const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
      this.master = gain(0);
      const lim = c.createDynamicsCompressor();       // hard ceiling so nothing can ever get truly loud
      lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 14; lim.attack.value = 0.002; lim.release.value = 0.15;
      this.master.connect(lim); lim.connect(c.destination);
      this.dry = gain(1); this.dry.connect(this.master);
      this.shots = gain(1); this.shots.connect(this.master);

      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const noiseSrc = () => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random()); return s; };
      const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; return b; };
      const set = (p, v, tc = 0.1) => p.setTargetAtTime(v, c.currentTime, tc);

      // the showroom pad
      this.padGain = gain(0); this.padFilter = filt('lowpass', 520, 0.4);
      this.padFilter.connect(this.padGain); this.padGain.connect(this.dry);
      this.padOsc = [110, 164.81, 277.18, 329.63].map((f, i) => {
        const o = c.createOscillator(); o.type = i < 2 ? 'sine' : 'triangle'; o.frequency.value = f; o.connect(this.padFilter); o.start(); return o;
      });
      // what the pad becomes
      this.detGain = gain(0); this.detGain.connect(this.dry);
      this.detOsc = c.createOscillator(); this.detOsc.frequency.value = 116.54; this.detOsc.connect(this.detGain); this.detOsc.start();
      this.subGain = gain(0); this.subGain.connect(this.dry);
      this.subOsc = c.createOscillator(); this.subOsc.frequency.value = 36; this.subOsc.connect(this.subGain); this.subOsc.start();
      // breathing
      this.breathGain = gain(0); this.breathFilter = filt('bandpass', 520, 0.9);
      noiseSrc().connect(this.breathFilter); this.breathFilter.connect(this.breathGain); this.breathGain.connect(this.dry);
      // fluorescent tube
      this.buzzGain = gain(0); this.buzzFilter = filt('bandpass', 100, 14);
      this.buzzOsc = c.createOscillator(); this.buzzOsc.type = 'sawtooth'; this.buzzOsc.frequency.value = 100;
      this.buzzOsc.connect(this.buzzFilter); this.buzzFilter.connect(this.buzzGain); this.buzzGain.connect(this.dry); this.buzzOsc.start();
      // room tone / tape hiss
      this.hissGain = gain(0); const hp = filt('highpass', 6000, 0.5);
      noiseSrc().connect(hp); hp.connect(this.hissGain); this.hissGain.connect(this.dry);
      this.set = set;
    }

    // called every frame; o = { dread, hall, light, breath, tape, bpm }
    update(o) {
      if (!this.ctx || !this.on) return;
      const d = o.dread || 0, h = o.hall || 0, s = this.set, pad = 0.035 * (1 - 0.75 * h);
      s(this.padGain.gain, pad, 0.3);
      s(this.padFilter.frequency, 520 - 300 * d, 0.4);
      this.padOsc.forEach((osc, i) => s(osc.detune, (i - 1.5) * 55 * d - 35 * d, 0.4));
      s(this.detGain.gain, 0.022 * d * (1 - h * 0.5), 0.4);
      s(this.subGain.gain, (d > 0.25 ? (d - 0.25) * 0.11 : 0) + h * 0.1, 0.25);
      s(this.subOsc.frequency, 36 + 5 * h, 0.5);
      s(this.hissGain.gain, 0.0015 + 0.011 * d + 0.02 * (o.tape || 0), 0.3);
      s(this.buzzGain.gain, (o.light || 0) * h * 0.016, 0.02);
      const br = o.breath || 0;
      s(this.breathGain.gain, br * 0.5, 0.04);
      s(this.breathFilter.frequency, 300 + 700 * br, 0.08);
      if (o.bpm > 0 && performance.now() >= this.nextBeat) { this.heart(0.1 + 0.25 * Math.min(1, (o.bpm - 40) / 80)); this.nextBeat = performance.now() + 60000 / o.bpm; }
    }

    env(g, t, a, peak, dec) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    }
    tone(o) {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime + (o.delay || 0), a = o.a || 0.006;
      const osc = c.createOscillator(); osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f0, t);
      if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
      const g = c.createGain(); this.env(g, t, a, o.vol, o.dur);
      let out = g;
      if (o.filter) { const f = c.createBiquadFilter(); f.type = o.filter.type; f.frequency.value = o.filter.f; f.Q.value = o.filter.q || 1; g.connect(f); out = f; }
      osc.connect(g); out.connect(this.shots);
      osc.start(t); osc.stop(t + a + o.dur + 0.06);
    }
    noise(o) {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime + (o.delay || 0), a = o.a || 0.004;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.7;
      f.frequency.setValueAtTime(o.f0, t);
      if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
      const g = c.createGain(); this.env(g, t, a, o.vol, o.dur);
      let out = g;
      src.connect(f); f.connect(g);
      if (o.pan) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
      out.connect(this.shots);
      src.start(t, Math.random()); src.stop(t + a + o.dur + 0.06);
    }
    ok() { return this.ctx && this.on; }

    heart(v) { this.tone({ f0: 64, f1: 30, dur: 0.2, vol: v }); this.tone({ f0: 58, f1: 27, dur: 0.24, vol: v * 0.7, delay: 0.17 }); }
    thud(v = 0.5) { this.tone({ f0: 82, f1: 34, dur: 0.32, vol: v }); this.noise({ f0: 420, f1: 120, dur: 0.16, vol: v * 0.5 }); }
    knock(n = 2, v = 0.4) { for (let i = 0; i < n; i++) { const dl = i * 0.21 + Math.random() * 0.03; this.noise({ f0: 300, f1: 150, dur: 0.07, vol: v, delay: dl, q: 1.4 }); this.tone({ f0: 96, f1: 60, dur: 0.09, vol: v * 0.8, delay: dl }); } }
    creak(v = 0.1) { this.noise({ type: 'bandpass', f0: 1500, f1: 420, dur: 0.75, vol: v, q: 11, a: 0.12, pan: Math.random() * 1.4 - 0.7 }); }
    click(v = 0.06) { this.noise({ type: 'highpass', f0: 2400, dur: 0.025, vol: v }); }
    glitch(v = 0.12) { this.noise({ type: 'bandpass', f0: 1800, dur: 0.11, vol: v, q: 2.4 }); this.tone({ type: 'square', f0: rand(180, 900), dur: 0.05, vol: v * 0.35, filter: { type: 'lowpass', f: 1800 } }); }
    whisper(v = 0.07) { let t = 0; const pan = Math.random() * 1.6 - 0.8; for (let i = 0, n = 5 + (Math.random() * 4 | 0); i < n; i++) { this.noise({ type: 'bandpass', f0: rand(1300, 2700), dur: rand(0.05, 0.12), vol: v * rand(0.6, 1), q: 1.7, delay: t, pan, a: 0.02 }); t += rand(0.07, 0.17); } }
    chime() { this.tone({ f0: 1318.5, dur: 0.5, vol: 0.05 }); this.tone({ f0: 1046.5, dur: 0.7, vol: 0.05, delay: 0.18 }); }
    drip() { this.tone({ f0: 1100, f1: 340, dur: 0.07, vol: 0.09 }); }

    sting() {
      if (!this.ok()) return;
      const soft = this.reduced;
      this.tone({ f0: 120, f1: 24, dur: 1.1, vol: soft ? 0.3 : 0.9 });
      if (soft) { this.noise({ f0: 900, f1: 180, dur: 0.5, vol: 0.1 }); return; }
      const c = this.ctx, t = c.currentTime;
      this.noise({ type: 'bandpass', f0: 2600, f1: 650, dur: 0.9, vol: 0.5, q: 0.6 });
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * 3.5); }
      const shaper = c.createWaveShaper(); shaper.curve = curve;
      const trem = c.createGain(); trem.gain.value = 1;
      const lfo = c.createOscillator(); lfo.frequency.value = 31; const lg = c.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(trem.gain); lfo.start(t); lfo.stop(t + 1);
      const g = c.createGain(); this.env(g, t, 0.03, 0.42, 0.88);
      g.connect(shaper); shaper.connect(trem); trem.connect(this.shots);
      for (let i = 0; i < 6; i++) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        const k = 1 + (i - 2.5) * 0.037;
        o.frequency.setValueAtTime(420 * k, t);
        o.frequency.exponentialRampToValueAtTime(1500 * k, t + 0.18);
        o.frequency.exponentialRampToValueAtTime(1080 * k, t + 0.5);
        o.frequency.exponentialRampToValueAtTime(1750 * k, t + 0.9);
        o.connect(g); o.start(t); o.stop(t + 1);
      }
    }
    // cut everything dead
    silence() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [this.padGain, this.detGain, this.subGain, this.breathGain, this.buzzGain, this.hissGain, this.shots].forEach((g) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); });
    }
    revive() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [this.padGain, this.detGain, this.subGain, this.breathGain, this.buzzGain, this.hissGain, this.shots].forEach((g) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g === this.shots ? 1 : 0, t); });
    }
  };
  function rand(a, b) { return a + Math.random() * (b - a); }
})();
