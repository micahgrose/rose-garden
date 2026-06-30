'use strict';
/* wick — sound
   everything is synthesized with web audio. no files, no loading.
*/
const Sound = (function () {
  let ac = null, master = null, musicGain = null, dly = null, dlySend = null;
  let muted = false;
  let lastShot = 0, lastHit = 0, lastKill = 0;
  let musicTimer = null, nextT = 0, step = 0;

  const BPM = 78;
  const SPB = 60 / BPM;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);

    musicGain = ac.createGain();
    musicGain.gain.value = 0.4;
    musicGain.connect(master);

    // a soft dotted-eighth echo for the plucks
    dly = ac.createDelay(1.5);
    dly.delayTime.value = SPB * 0.75;
    const fb = ac.createGain();
    fb.gain.value = 0.36;
    dly.connect(fb);
    fb.connect(dly);
    dly.connect(musicGain);
    dlySend = ac.createGain();
    dlySend.gain.value = 0.5;
    dlySend.connect(dly);
  }

  function tone(opts) {
    if (!ac) return;
    const t = ac.currentTime + (opts.at || 0);
    const dur = opts.dur || 0.15;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(opts.f || 440, t);
    if (opts.slide) {
      o.frequency.exponentialRampToValueAtTime(Math.max(24, (opts.f || 440) + opts.slide), t + dur);
    }
    g.gain.setValueAtTime(opts.vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(opts.dest || master);
    if (opts.echo && dlySend) g.connect(dlySend);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(opts) {
    if (!ac) return;
    const t = ac.currentTime + (opts.at || 0);
    const dur = opts.dur || 0.2;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const flt = ac.createBiquadFilter();
    flt.type = opts.ftype || 'lowpass';
    flt.frequency.setValueAtTime(opts.f || 800, t);
    if (opts.fslide) flt.frequency.exponentialRampToValueAtTime(Math.max(40, opts.f + opts.fslide), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(opts.vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t);
  }

  const r = (a, b) => a + Math.random() * (b - a);

  const SFX = {
    shoot() {
      const now = performance.now();
      if (now - lastShot < 55) return;
      lastShot = now;
      tone({ f: r(640, 860), type: 'triangle', dur: 0.07, vol: 0.08, slide: -320 });
    },
    spark() {
      const now = performance.now();
      if (now - lastShot < 55) return;
      lastShot = now;
      tone({ f: r(900, 1200), type: 'square', dur: 0.04, vol: 0.04, slide: -200 });
    },
    hit() {
      const now = performance.now();
      if (now - lastHit < 45) return;
      lastHit = now;
      tone({ f: r(160, 220), type: 'square', dur: 0.06, vol: 0.07, slide: -70 });
    },
    kill() {
      const now = performance.now();
      if (now - lastKill < 70) return;
      lastKill = now;
      noise({ f: 600, dur: 0.12, vol: 0.1, fslide: -400 });
      tone({ f: r(280, 340), type: 'triangle', dur: 0.12, vol: 0.08, slide: -160 });
    },
    hurt() {
      noise({ f: 300, dur: 0.25, vol: 0.25, fslide: -200 });
      tone({ f: 130, type: 'sawtooth', dur: 0.22, vol: 0.18, slide: -60 });
    },
    pickup() {
      tone({ f: r(980, 1140), type: 'sine', dur: 0.09, vol: 0.09, slide: 240 });
    },
    heart() {
      tone({ f: 520, type: 'sine', dur: 0.14, vol: 0.16 });
      tone({ f: 780, type: 'sine', dur: 0.2, vol: 0.14, at: 0.09 });
    },
    level() {
      [523, 659, 784, 1047].forEach((f, i) =>
        tone({ f, type: 'triangle', dur: 0.3, vol: 0.14, at: i * 0.09, echo: true }));
    },
    chest() {
      [392, 494, 587, 784].forEach((f, i) =>
        tone({ f, type: 'sine', dur: 0.32, vol: 0.13, at: i * 0.11, echo: true }));
    },
    nova() {
      noise({ f: 380, dur: 0.4, vol: 0.2, fslide: -300 });
      tone({ f: 90, type: 'sine', dur: 0.35, vol: 0.2, slide: -40 });
    },
    foxfire() {
      tone({ f: r(420, 520), type: 'sawtooth', dur: 0.18, vol: 0.06, slide: 180 });
    },
    boss() {
      tone({ f: 62, type: 'sawtooth', dur: 1.4, vol: 0.3, slide: -20 });
      tone({ f: 93, type: 'sawtooth', dur: 1.4, vol: 0.2, slide: -30 });
      noise({ f: 200, dur: 1.2, vol: 0.2, fslide: 300 });
    },
    bossdie() {
      noise({ f: 900, dur: 1.4, vol: 0.3, fslide: -800 });
      [880, 660, 440, 220, 110].forEach((f, i) =>
        tone({ f, type: 'triangle', dur: 0.5, vol: 0.16, at: i * 0.14, echo: true }));
    },
    death() {
      [330, 262, 196, 131].forEach((f, i) =>
        tone({ f, type: 'sine', dur: 0.5, vol: 0.2, at: i * 0.22, slide: -30 }));
      noise({ f: 240, dur: 1.6, vol: 0.12, fslide: -180, at: 0.3 });
    },
    win() {
      [262, 330, 392, 523, 659, 784].forEach((f, i) =>
        tone({ f, type: 'triangle', dur: 0.7, vol: 0.13, at: i * 0.13, echo: true }));
    },
    click() {
      tone({ f: 340, type: 'sine', dur: 0.05, vol: 0.1 });
    }
  };

  function play(name) {
    if (!ac || muted) return;
    if (SFX[name]) SFX[name]();
  }

  /* ---- music: a slow, sparse lullaby in a minor ---- */

  const BASS = [110, 87.31, 98, 82.41];          // a, f, g, e
  const SCALE = [220, 261.63, 329.63, 392, 440, 523.25];

  function scheduleStep(s, t) {
    const at = t - ac.currentTime;
    const bar = Math.floor(s / 8) % 4;
    if (s % 8 === 0) {
      tone({ f: BASS[bar], type: 'sine', dur: SPB * 3.4, vol: 0.13, at, dest: musicGain });
      tone({ f: BASS[bar] / 2, type: 'triangle', dur: SPB * 3.4, vol: 0.05, at, dest: musicGain });
    }
    if (s % 2 === 0 && Math.random() < 0.34) {
      let f = SCALE[(Math.random() * SCALE.length) | 0];
      if (Math.random() < 0.3) f *= 2;
      tone({ f, type: 'triangle', dur: SPB * 1.2, vol: 0.055, at, dest: musicGain, echo: true });
    }
    if (s % 4 === 2 && Math.random() < 0.4) {
      noise({ f: 2400, ftype: 'highpass', dur: 0.05, vol: 0.012, at });
    }
  }

  function startMusic() {
    if (!ac || musicTimer) return;
    nextT = ac.currentTime + 0.15;
    step = 0;
    musicTimer = setInterval(() => {
      if (!ac) return;
      while (nextT < ac.currentTime + 0.45) {
        scheduleStep(step, nextT);
        step++;
        nextT += SPB / 2;
      }
    }, 150);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function setMute(b) {
    muted = b;
    if (master) master.gain.value = b ? 0 : 0.5;
  }

  return {
    init, play, startMusic, stopMusic, setMute,
    get muted() { return muted; }
  };
})();
