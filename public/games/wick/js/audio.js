'use strict';
/* wick — sound
   everything is synthesized with web audio. no files, no loading.
*/
const Sound = (function () {
  let ac = null, master = null, musicGain = null, dly = null, dlySend = null;
  let muted = false;
  let lastShot = 0, lastHit = 0, lastKill = 0;
  let musicTimer = null, nextT = 0, step = 0;

  // optional recorded roar (drop sfx/roar1.mp3 + sfx/roar2.mp3); roar2 follows roar1.
  // falls back to the synth roar if the files aren't there.
  let roar1El = null, roar2El = null, roarReady = false;

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

    // load the recorded roars (works on file:// too, unlike fetch); silent if absent
    if (!roar1El) {
      roar1El = new Audio('sfx/roar1.mp3');
      roar2El = new Audio('sfx/roar2.mp3');
      for (const el of [roar1El, roar2El]) { el.preload = 'auto'; el.volume = muted ? 0 : 0.95; }
      roar1El.addEventListener('canplaythrough', () => { roarReady = true; }, { once: true });
      roar1El.addEventListener('error', () => { roarReady = false; });
      // the second roar fires the moment the first finishes
      roar1El.addEventListener('ended', () => {
        if (roar2El) { try { roar2El.currentTime = 0; roar2El.play(); } catch (e) {} }
      });
    }
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
    },
    roar() {
      // prefer the recorded roars if they've been dropped in; otherwise synthesize
      if (roarReady && roar1El) { try { roar1El.currentTime = 0; roar1El.play(); return; } catch (e) {} }
      // a building growl with enough mid-range to actually be heard on any speaker
      noise({ f: 320, ftype: 'lowpass', dur: 1.1, vol: 0.5, fslide: 950 });
      tone({ f: 120, type: 'sawtooth', dur: 1.1, vol: 0.34, slide: 120 });
      tone({ f: 180, type: 'sawtooth', dur: 1.1, vol: 0.22, slide: 170 });
      tone({ f: 60, type: 'square', dur: 1.1, vol: 0.3, slide: 30 });
      tone({ f: 240, type: 'triangle', dur: 0.9, vol: 0.15, slide: 320, at: 0.12 });
    },
    ray() {
      // a bright ascending burst of light
      tone({ f: r(520, 720), type: 'triangle', dur: 0.3, vol: 0.16, slide: 1100 });
      noise({ f: 2600, ftype: 'highpass', dur: 0.22, vol: 0.07, fslide: 2400 });
    },
    dawnburst() {
      // the light released — a huge bright swell as the screen turns white
      noise({ f: 800, ftype: 'highpass', dur: 1.4, vol: 0.4, fslide: 4000 });
      [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) =>
        tone({ f, type: 'triangle', dur: 1.2, vol: 0.14, at: i * 0.04, echo: true }));
      tone({ f: 80, type: 'sine', dur: 1.0, vol: 0.3, slide: 120 });
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

  /* ---- gutter's theme: a loud, driving, menacing loop ---- */

  let bossTimer = null, bossNextT = 0, bossStep = 0;
  const B_BPM = 132, B_SPB = 60 / 132;
  // a long, dissonant phrase (32 steps) over a moving, heavy bass line (16 steps)
  const B_MOTIF = [110, 116.54, 110, 146.83, 138.59, 110, 130.81, 116.54,
                   110, 130.81, 146.83, 155.56, 146.83, 130.81, 116.54, 103.83];
  const B_BASS = [55, 55, 58.27, 55, 73.42, 69.30, 55, 65.41];

  function bossScheduleStep(s, t) {
    const at = t - ac.currentTime;
    const bass = B_BASS[Math.floor(s / 2) % B_BASS.length];
    // heavy, driving low end on every beat
    tone({ f: bass, type: 'sawtooth', dur: B_SPB * 0.55, vol: 0.3, at, dest: musicGain });
    tone({ f: bass * 0.5, type: 'square', dur: B_SPB * 0.6, vol: 0.24, at, dest: musicGain });   // sub-bass
    tone({ f: bass * 2, type: 'triangle', dur: B_SPB * 0.3, vol: 0.1, at, dest: musicGain });      // keeps it audible
    // the menacing motif
    if (s % 2 === 0) {
      const f = B_MOTIF[(s / 2) % B_MOTIF.length];
      tone({ f: f * 2, type: 'square', dur: B_SPB * 0.85, vol: 0.12, at, dest: musicGain, echo: true });
    }
    // a rising tension stab every four bars
    if (s % 16 === 8) tone({ f: 466, type: 'sawtooth', dur: B_SPB * 2, vol: 0.1, at, dest: musicGain, slide: -160 });
    if (s % 2 === 1) noise({ f: 5200, ftype: 'highpass', dur: 0.03, vol: 0.03, at });
  }

  function startBossTheme() {
    if (!ac || bossTimer) return;
    if (musicGain) musicGain.gain.value = 0.78; // LOUD
    bossNextT = ac.currentTime + 0.1;
    bossStep = 0;
    bossTimer = setInterval(() => {
      if (!ac) return;
      while (bossNextT < ac.currentTime + 0.4) {
        bossScheduleStep(bossStep, bossNextT);
        bossStep++;
        bossNextT += B_SPB / 2;
      }
    }, 110);
  }

  function stopBossTheme() {
    if (bossTimer) { clearInterval(bossTimer); bossTimer = null; }
    if (musicGain) musicGain.gain.value = 0.4; // back to the quiet lullaby level
  }

  /* ---- the dawn: a calm, warm, inviting major-key theme ---- */

  let dawnTimer = null, dawnNextT = 0, dawnStep = 0;
  const D_SPB = 1.0;
  const D_ARP = [261.63, 329.63, 392, 523.25, 392, 329.63]; // C E G C G E
  const D_PAD = [130.81, 164.81, 196];                       // warm C-major pad

  function dawnScheduleStep(s, t) {
    const at = t - ac.currentTime;
    if (s % 6 === 0) for (const f of D_PAD) tone({ f, type: 'sine', dur: D_SPB * 5.5, vol: 0.06, at, dest: musicGain });
    tone({ f: D_ARP[s % D_ARP.length], type: 'triangle', dur: D_SPB * 1.4, vol: 0.06, at, dest: musicGain, echo: true });
    if (s % 3 === 1) tone({ f: D_ARP[s % D_ARP.length] * 2, type: 'sine', dur: D_SPB * 0.8, vol: 0.03, at, dest: musicGain, echo: true });
  }

  function startDawnTheme() {
    if (!ac || dawnTimer) return;
    if (musicGain) musicGain.gain.value = 0.55;
    dawnNextT = ac.currentTime + 0.1;
    dawnStep = 0;
    dawnTimer = setInterval(() => {
      if (!ac) return;
      while (dawnNextT < ac.currentTime + 0.6) { dawnScheduleStep(dawnStep, dawnNextT); dawnStep++; dawnNextT += D_SPB; }
    }, 200);
  }

  function stopDawnTheme() {
    if (dawnTimer) { clearInterval(dawnTimer); dawnTimer = null; }
  }

  // how long the first roar runs (so the rays can start exactly as it ends); ~1s if no file
  function roarDuration() {
    return (roarReady && roar1El && isFinite(roar1El.duration) && roar1El.duration > 0) ? roar1El.duration : 1.0;
  }

  function setMute(b) {
    muted = b;
    if (master) master.gain.value = b ? 0 : 0.5;
    if (roar1El) roar1El.volume = b ? 0 : 0.95;
    if (roar2El) roar2El.volume = b ? 0 : 0.95;
  }

  return {
    init, play, startMusic, stopMusic, startBossTheme, stopBossTheme,
    startDawnTheme, stopDawnTheme, roarDuration, setMute,
    get muted() { return muted; }
  };
})();
