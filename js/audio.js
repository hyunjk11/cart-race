// Synthesized sounds via Web Audio API (no external files)
let ctx = null, master, sfx, musicGain, eng, noiseBuf, muted = localStorage.getItem('cartMuted') === '1';
const listeners = [];
export function isMuted() { return muted; }
export function onMuteChange(f) { listeners.push(f); }
export function setMuted(m) { muted = m; localStorage.setItem('cartMuted', m ? '1' : '0'); if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05); listeners.forEach(f => f(m)); }
export function suspendAudio() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function initAudio() {
  if (ctx) { if (ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
  sfx = ctx.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.13; musicGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // engine / rolling hum
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 50;
  const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 100;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
  const g = ctx.createGain(); g.gain.value = 0;
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
  const ng = ctx.createGain(); ng.gain.value = 0;
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfx); n.connect(bp); bp.connect(ng); ng.connect(sfx);
  o1.start(); o2.start(); n.start();
  eng = { o1, o2, lp, g, ng, bp };
  // drift squeal
  const sq = ctx.createOscillator(); sq.type = 'sawtooth'; sq.frequency.value = 900;
  const sqf = ctx.createBiquadFilter(); sqf.type = 'bandpass'; sqf.frequency.value = 1800; sqf.Q.value = 6;
  const sn = ctx.createBufferSource(); sn.buffer = noiseBuf; sn.loop = true;
  const sqg = ctx.createGain(); sqg.gain.value = 0; sq.connect(sqf); sn.connect(sqf); sqf.connect(sqg); sqg.connect(sfx); sq.start(); sn.start();
  eng.sq = sq; eng.sqg = sqg;
  startMusic();
}
export function setDrift(a) { if (!ctx) return; const t = ctx.currentTime; eng.sqg.gain.setTargetAtTime(Math.min(1, a) * 0.07, t, 0.05); eng.sq.frequency.setTargetAtTime(800 + a * 500 + Math.random() * 80, t, 0.05); }
export function setEngine(speed, boosting) {
  if (!ctx) return; const t = ctx.currentTime, s = Math.min(1, Math.abs(speed) / 28);
  eng.o1.frequency.setTargetAtTime(45 + s * 90 + (boosting ? 30 : 0), t, 0.1);
  eng.o2.frequency.setTargetAtTime(90 + s * 180 + (boosting ? 60 : 0), t, 0.1);
  eng.lp.frequency.setTargetAtTime(250 + s * 900, t, 0.1);
  eng.g.gain.setTargetAtTime(s > 0.02 ? 0.05 + s * 0.12 : 0, t, 0.1);
  eng.ng.gain.setTargetAtTime(s * 0.08, t, 0.1); eng.bp.frequency.setTargetAtTime(500 + s * 1500, t, 0.1);
}
function tone(freq, dur, type = 'square', vol = 0.2, when = 0, out = sfx, slideTo) {
  if (!ctx) return; const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, freq, vol, when = 0, q = 1, type = 'bandpass', freqTo) {
  if (!ctx) return; const t = ctx.currentTime + when;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
export const sound = {
  beep() { tone(660, 0.18, 'square', 0.18); },
  go() { tone(1320, 0.5, 'square', 0.2); tone(990, 0.5, 'triangle', 0.15); },
  whoosh() { noise(0.6, 400, 0.5, 0, 1.5, 'bandpass', 3000); },
  bump(k = 1) { tone(110, 0.15, 'sine', 0.35 * k, 0, sfx, 50); noise(0.1, 600, 0.25 * k); },
  oof() { tone(700, 0.25, 'square', 0.15, 0, sfx, 250); tone(520, 0.2, 'triangle', 0.2, 0.05, sfx, 900); this.bump(1); },
  clatter(n = 5) { for (let i = 0; i < Math.min(n, 10); i++) { const w = i * 0.05 + Math.random() * 0.06; tone(1200 + Math.random() * 1500, 0.12, 'triangle', 0.08, w); noise(0.06, 3000, 0.15, w, 3); } },
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => { tone(f, i === 5 ? 0.8 : 0.18, 'square', 0.15, i * 0.16); tone(f / 2, i === 5 ? 0.8 : 0.18, 'triangle', 0.15, i * 0.16); }); },
  empty() { tone(220, 0.12, 'square', 0.15); tone(165, 0.18, 'square', 0.15, 0.1); },
  chime() { [784, 659, 523].forEach((f, i) => { tone(f, 0.7, 'sine', 0.25, i * 0.35); tone(f * 2, 0.5, 'sine', 0.05, i * 0.35); }); },
  charge() { tone(988, 0.1, 'square', 0.12); tone(1319, 0.18, 'square', 0.12, 0.08); },
  honk() { tone(392, 0.28, 'square', 0.16); tone(330, 0.28, 'square', 0.14); tone(392, 0.3, 'square', 0.16, 0.34); tone(330, 0.3, 'square', 0.14, 0.34); },
  door() { noise(0.18, 1800, 0.18); tone(240, 0.12, 'triangle', 0.1); },
  lap() { tone(880, 0.12, 'square', 0.15); tone(1175, 0.2, 'square', 0.15, 0.12); },
};
// light looping supermarket-style tune (bouncy major key)
function startMusic() {
  const bpm = 120, beat = 60 / bpm;
  const mel = [72, 76, 79, 76, 77, 74, 71, 74, 72, 76, 79, 84, 83, 79, 77, 74, 76, 72, 74, 76, 77, 79, 81, 79, 77, 76, 74, 71, 72, 0, 72, 0];
  const bass = [48, 55, 53, 55, 48, 52, 53, 55];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  let step = 0, next = ctx.currentTime + 0.1;
  setInterval(() => {
    while (next < ctx.currentTime + 0.3) {
      const when = next - ctx.currentTime, m = mel[step % mel.length];
      if (m) tone(mtof(m), beat * 0.45, 'triangle', 0.5, when, musicGain);
      if (step % 4 === 0) tone(mtof(bass[(step / 4) % bass.length]), beat * 1.6, 'sine', 0.7, when, musicGain);
      if (step % 2 === 1) tone(mtof(m ? m - 12 : 60), beat * 0.2, 'square', 0.12, when, musicGain);
      next += beat / 2; step++;
    }
  }, 100);
}
