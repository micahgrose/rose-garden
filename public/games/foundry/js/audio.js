/* ============ Foundry — procedural WebAudio: sfx + ambient bed ============ */
(function(root){
'use strict';
const F = root.F;

const A = F.audio = {
  ctx: null, master: null, on: true, ready: false,
  humGain: null, humOsc: null, humFilter: null,
  padTimer: 0,
};

A.init = function(){
  if (A.ready || typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;
  try {
    const Ctx = root.AudioContext || root.webkitAudioContext;
    A.ctx = new Ctx();
    A.master = A.ctx.createGain();
    A.master.gain.value = .5;
    A.master.connect(A.ctx.destination);

    /* factory hum — a filtered saw whose level tracks machine activity */
    A.humOsc = A.ctx.createOscillator();
    A.humOsc.type = 'sawtooth';
    A.humOsc.frequency.value = 42;
    const sub = A.ctx.createOscillator();
    sub.type = 'sine'; sub.frequency.value = 84.2;
    A.humFilter = A.ctx.createBiquadFilter();
    A.humFilter.type = 'lowpass'; A.humFilter.frequency.value = 130; A.humFilter.Q.value = 2;
    A.humGain = A.ctx.createGain(); A.humGain.gain.value = 0;
    A.humOsc.connect(A.humFilter); sub.connect(A.humFilter);
    A.humFilter.connect(A.humGain); A.humGain.connect(A.master);
    A.humOsc.start(); sub.start();

    /* soft wind bed */
    const buf = A.ctx.createBuffer(1, A.ctx.sampleRate * 2, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * .4;
    const noise = A.ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const nf = A.ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 420; nf.Q.value = .45;
    const ng = A.ctx.createGain(); ng.gain.value = .028;
    noise.connect(nf); nf.connect(ng); ng.connect(A.master);
    noise.start();
    A.windGain = ng;

    const lfo = A.ctx.createOscillator();
    lfo.frequency.value = .07;
    const lg = A.ctx.createGain(); lg.gain.value = .014;
    lfo.connect(lg); lg.connect(ng.gain);
    lfo.start();

    /* rain layer — high hiss, silent until the weather turns */
    const rsrc = A.ctx.createBufferSource();
    rsrc.buffer = buf; rsrc.loop = true; rsrc.playbackRate.value = 1.7;
    const rf = A.ctx.createBiquadFilter();
    rf.type = 'highpass'; rf.frequency.value = 2600;
    A.rainGain = A.ctx.createGain(); A.rainGain.gain.value = 0;
    rsrc.connect(rf); rf.connect(A.rainGain); A.rainGain.connect(A.master);
    rsrc.start();

    A.ready = true;
  } catch (e) { A.ready = false; }
};

A.resume = function(){
  if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
};

/* activity: 0..1 — drives the hum */
A.setActivity = function(act){
  if (!A.ready || !A.on) return;
  const t = A.ctx.currentTime;
  A.humGain.gain.setTargetAtTime(.05 * Math.min(1, act), t, .6);
  A.humFilter.frequency.setTargetAtTime(130 + 160 * Math.min(1, act), t, .8);
};

A.setOn = function(on){
  A.on = on;
  if (A.ready) A.master.gain.setTargetAtTime(on ? .5 : 0, A.ctx.currentTime, .05);
};

/* weather → rain bed (wind stays a constant ambient) */
A.setWeather = function(state){
  if (!A.ready) return;
  const t = A.ctx.currentTime;
  A.rainGain.gain.setTargetAtTime(state === 'rain' ? .038 : 0, t, 2.5);
};

/* generative pads — sparse notes that thicken as the campaign advances
   and turn minor after dark. Called every frame with dt. */
A.tickMusic = function(dt, prog, night){
  if (!A.ready || !A.on) return;
  A.musT = (A.musT == null ? 4 : A.musT) - dt;
  if (A.musT > 0) return;
  A.musT = 9 + Math.random() * 9 - prog * 4;
  const scale = night ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const root = night ? 110 : 130.81;               // A2 / C3
  const pick = () => root * Math.pow(2, scale[(Math.random() * scale.length) | 0] / 12) *
    (Math.random() < .3 ? 2 : 1);
  const pad = (f, mul) => tone(f, 'sine', 1.8, .05 * mul, 5.5, null, 1000);
  pad(pick(), 1);                                   // always: a lone low voice
  if (prog > .25 && Math.random() < .8)
    setTimeout(() => pad(pick(), .85), 800 + Math.random() * 1600);
  if (prog > .55 && Math.random() < .7)
    setTimeout(() => pad(pick() * 2, .6), 2200 + Math.random() * 2200);
  if (prog >= .95 && Math.random() < .5)
    setTimeout(() => pad(pick() * 2, .5), 4200);    // the woken Engine sings quietly
};

function env(g, t, a, peak, dec){
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(.0001, t + a + dec);
}

function tone(freq, type, a, peak, dec, slideTo, filterF){
  if (!A.ready || !A.on) return;
  const t = A.ctx.currentTime;
  const o = A.ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + a + dec);
  const g = A.ctx.createGain();
  env(g, t, a, peak, dec);
  let node = o;
  if (filterF){
    const f = A.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterF;
    o.connect(f); node = f;
  }
  node.connect(g); g.connect(A.master);
  o.start(t); o.stop(t + a + dec + .05);
}

function noiseBurst(a, peak, dec, filterF, q){
  if (!A.ready || !A.on) return;
  const t = A.ctx.currentTime;
  const len = Math.ceil(A.ctx.sampleRate * (a + dec + .05));
  const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = A.ctx.createBufferSource(); src.buffer = buf;
  const f = A.ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = filterF || 800; f.Q.value = q || 1;
  const g = A.ctx.createGain();
  env(g, t, a, peak, dec);
  src.connect(f); f.connect(g); g.connect(A.master);
  src.start(t);
}

/* ---------- public sfx ---------- */
const S = A.sfx = {};
let lastAt = {};
function throttle(id, ms){
  const now = Date.now();
  if (lastAt[id] && now - lastAt[id] < ms) return true;
  lastAt[id] = now; return false;
}

S.click   = () => tone(1600, 'triangle', .002, .06, .04);
S.hover   = () => tone(2200, 'sine', .002, .02, .025);
S.place   = () => { tone(180, 'triangle', .004, .22, .12, 90); noiseBurst(.003, .1, .07, 1400, 1.4); };
S.remove  = () => { tone(300, 'triangle', .003, .12, .1, 600); };
S.rotate  = () => tone(900, 'square', .002, .04, .05, 1150);
S.error   = () => { if (!throttle('err', 150)) { tone(140, 'square', .004, .1, .12); tone(110, 'square', .004, .1, .16); } };
S.mine    = () => { if (!throttle('mine', 60)) noiseBurst(.004, .16, .08, 900 + Math.random() * 600, 2.5); };
S.mineDone= () => { tone(520, 'triangle', .003, .12, .1, 720); noiseBurst(.003, .08, .06, 2200, 2); };
S.deliver = () => { if (!throttle('del', 200)) tone(880, 'sine', .004, .07, .16, 1320); };
S.craft   = () => { if (!throttle('craft', 400)) tone(440, 'triangle', .003, .03, .07, 470); };
S.open    = () => tone(700, 'sine', .003, .06, .09, 940);
S.close   = () => tone(940, 'sine', .003, .05, .08, 700);
S.buy     = () => { tone(660, 'triangle', .004, .12, .14, 990); tone(1320, 'sine', .01, .07, .2); };
S.tip     = () => { if (!throttle('tip', 500)) tone(1180, 'sine', .005, .07, .22, 1560); };

S.milestone = () => {
  if (!A.ready || !A.on) return;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((f, i) => {
    setTimeout(() => { tone(f, 'triangle', .01, .16, .5); tone(f / 2, 'sine', .01, .1, .6); }, i * 95);
  });
  noiseBurst(.02, .05, .5, 3000, .8);
};

/* the Engine's voice: a deep resonant chord that swells from below */
S.engine = () => {
  if (!A.ready || !A.on) return;
  [55, 82.4, 110].forEach((f, i) =>
    setTimeout(() => tone(f, 'sine', .35, .13, 3, f * 1.05, 320), i * 150));
  noiseBurst(.5, .03, 2.4, 170, .6);
};

S.win = function(){
  if (!A.ready || !A.on) return;
  const seq = [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5];
  seq.forEach((f, i) => {
    setTimeout(() => {
      tone(f, 'triangle', .02, .18, 1.6);
      tone(f * .5, 'sine', .02, .13, 2);
      tone(f * 2, 'sine', .04, .05, 1.5);
    }, i * 240);
  });
  setTimeout(() => noiseBurst(.6, .06, 3.5, 500, .4), 1400);
};

})(typeof window !== 'undefined' ? window : globalThis);
