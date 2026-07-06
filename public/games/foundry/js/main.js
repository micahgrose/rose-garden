/* ============ Foundry — boot + fixed-timestep loop ============ */
(function(root){
'use strict';
const F = root.F;

const SIM_DT = 1 / 60;
let last = 0, acc = 0;

function frame(now){
  requestAnimationFrame(frame);
  if (!last) last = now;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > .25) dt = .25;           // tab-back: don't spiral

  const S = F.ui.S;
  if (S){
    if (!S.won || S.freeplay){
      acc += dt;
      let steps = 0;
      while (acc >= SIM_DT && steps < 30){
        F.tick(S, SIM_DT);
        acc -= SIM_DT;
        steps++;
      }
      if (steps >= 30) acc = 0;
    } else {
      // cinematic: keep the world breathing slowly, no progress
      F.tick(S, SIM_DT);
    }
    F.ui.update(dt);
    F.render.draw(S, dt, F.ui.viewState());
  }
}

function boot(){
  F.ui.init();
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* headless / debug hook */
root.__FOUNDRY = F;

})(typeof window !== 'undefined' ? window : globalThis);
