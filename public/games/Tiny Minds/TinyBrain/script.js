// ---------- tiny neural net: 2 -> H -> H -> 3, tanh hidden, sigmoid out, MSE ----------
const H = 16;
const rand = () => (Math.random() * 2 - 1);
function mat(r, c, s) { const m = []; for (let i=0;i<r;i++){ const row=[]; for(let j=0;j<c;j++) row.push(rand()*s); m.push(row);} return m; }
function vec(n){ return new Array(n).fill(0); }

let net;
function freshBrain() {
  net = {
    W1: mat(H,2,0.9), b1: vec(H),
    W2: mat(H,H,0.9), b2: vec(H),
    W3: mat(3,H,0.9), b3: vec(3),
  };
}
const tanh = Math.tanh;
const sig = z => 1/(1+Math.exp(-z));

// forward; returns activations for backprop
function forward(x) {
  const a0 = x; // length 2
  const z1 = vec(H), a1 = vec(H);
  for (let i=0;i<H;i++){ let s=net.b1[i]; for(let j=0;j<2;j++) s+=net.W1[i][j]*a0[j]; z1[i]=s; a1[i]=tanh(s); }
  const z2 = vec(H), a2 = vec(H);
  for (let i=0;i<H;i++){ let s=net.b2[i]; for(let j=0;j<H;j++) s+=net.W2[i][j]*a1[j]; z2[i]=s; a2[i]=tanh(s); }
  const a3 = vec(3);
  for (let i=0;i<3;i++){ let s=net.b3[i]; for(let j=0;j<H;j++) s+=net.W3[i][j]*a2[j]; a3[i]=sig(s); }
  return { a0,a1,a2,a3 };
}

// one SGD step over a minibatch; returns mean loss
function trainBatch(batch, lr) {
  // gradient accumulators
  const gW1=mat(H,2,0), gb1=vec(H), gW2=mat(H,H,0), gb2=vec(H), gW3=mat(3,H,0), gb3=vec(3);
  let loss=0;
  for (const [x,y] of batch) {
    const {a0,a1,a2,a3} = forward(x);
    // output delta (MSE * sigmoid')
    const d3=vec(3);
    for(let i=0;i<3;i++){ const e=a3[i]-y[i]; loss+=e*e*0.5; d3[i]=e*a3[i]*(1-a3[i]); }
    // hidden2 delta
    const d2=vec(H);
    for(let j=0;j<H;j++){ let s=0; for(let i=0;i<3;i++) s+=net.W3[i][j]*d3[i]; d2[j]=s*(1-a2[j]*a2[j]); }
    // hidden1 delta
    const d1=vec(H);
    for(let j=0;j<H;j++){ let s=0; for(let i=0;i<H;i++) s+=net.W2[i][j]*d2[i]; d1[j]=s*(1-a1[j]*a1[j]); }
    // accumulate grads
    for(let i=0;i<3;i++){ gb3[i]+=d3[i]; for(let j=0;j<H;j++) gW3[i][j]+=d3[i]*a2[j]; }
    for(let i=0;i<H;i++){ gb2[i]+=d2[i]; for(let j=0;j<H;j++) gW2[i][j]+=d2[i]*a1[j]; }
    for(let i=0;i<H;i++){ gb1[i]+=d1[i]; for(let j=0;j<2;j++) gW1[i][j]+=d1[i]*a0[j]; }
  }
  const n=batch.length, k=lr/n;
  for(let i=0;i<3;i++){ net.b3[i]-=k*gb3[i]; for(let j=0;j<H;j++) net.W3[i][j]-=k*gW3[i][j]; }
  for(let i=0;i<H;i++){ net.b2[i]-=k*gb2[i]; for(let j=0;j<H;j++) net.W2[i][j]-=k*gW2[i][j]; }
  for(let i=0;i<H;i++){ net.b1[i]-=k*gb1[i]; for(let j=0;j<2;j++) net.W1[i][j]-=k*gW1[i][j]; }
  return loss/n;
}

// ---------- target patterns: (x,y in [0,1]) -> [r,g,b] in [0,1] ----------
function hsl(h,s,l){ // h in [0,1]
  const a=s*Math.min(l,1-l);
  const f=n=>{const k=(n+h*12)%12; return l-a*Math.max(-1,Math.min(k-3,9-k,1));};
  return [f(0),f(8),f(4)];
}
const PATTERNS = {
  gradient: (x,y)=>[x, y, 0.5],
  quadrants:(x,y)=>{ const r=x<0.5?(y<0.5?[0.9,0.2,0.2]:[0.2,0.9,0.3]):(y<0.5?[0.3,0.4,0.95]:[0.95,0.85,0.2]); return r; },
  circle:   (x,y)=>{ const d=Math.hypot(x-0.5,y-0.5); return d<0.3?[0.95,0.3,0.35]:[0.15,0.3,0.6]; },
  rings:    (x,y)=>{ const d=Math.hypot(x-0.5,y-0.5); const v=(Math.sin(d*22)+1)/2; return hsl(0.55, 0.7, 0.25+0.5*v); },
  spiral:   (x,y)=>{ const dx=x-0.5,dy=y-0.5; const a=Math.atan2(dy,dx); const r=Math.hypot(dx,dy); const h=((a/(2*Math.PI))+r*3+1)%1; return hsl(h,0.75,0.5); },
};

// ---------- rendering ----------
const GRID = 40;                 // boxes per side
const tCanvas=document.getElementById('target'), tctx=tCanvas.getContext('2d');
const bCanvas=document.getElementById('brain'),  bctx=bCanvas.getContext('2d');
const PX = tCanvas.width / GRID;
let patternFn = PATTERNS.rings;

function drawTarget(){
  for(let gy=0;gy<GRID;gy++) for(let gx=0;gx<GRID;gx++){
    const x=(gx+0.5)/GRID, y=(gy+0.5)/GRID;
    const [r,g,b]=patternFn(x,y);
    tctx.fillStyle=`rgb(${r*255|0},${g*255|0},${b*255|0})`;
    tctx.fillRect(gx*PX,gy*PX,PX,PX);
  }
}
function drawBrain(){
  let correct=0, total=0;
  for(let gy=0;gy<GRID;gy++) for(let gx=0;gx<GRID;gx++){
    const x=(gx+0.5)/GRID, y=(gy+0.5)/GRID;
    const {a3}=forward([x*2-1, y*2-1]);
    bctx.fillStyle=`rgb(${a3[0]*255|0},${a3[1]*255|0},${a3[2]*255|0})`;
    bctx.fillRect(gx*PX,gy*PX,PX,PX);
    const t=patternFn(x,y);
    const err=Math.hypot(a3[0]-t[0],a3[1]-t[1],a3[2]-t[2]);
    if(err<0.18) correct++; total++;
  }
  return correct/total;
}

// ---------- training loop ----------
let epoch=0, running=false, frozen=false, lastLoss=0, autoStopped=false;
function makeBatch(n){
  const b=[];
  for(let i=0;i<n;i++){ const x=Math.random(), y=Math.random(); b.push([[x*2-1,y*2-1], patternFn(x,y)]); }
  return b;
}
const $=id=>document.getElementById(id);
function setState(s){ $('state').innerHTML='state: <b>'+s+'</b>'; }

function loop(){
  if(running){
    const iters=+$('speed').value;
    if(!frozen){
      for(let i=0;i<iters;i++){ lastLoss=trainBatch(makeBatch(64), 0.5); epoch++; }
    }
    const acc=drawBrain();
    $('epoch').textContent=epoch;
    $('acc').textContent=(acc*100).toFixed(0)+'%';
    $('loss').textContent=lastLoss.toFixed(4);
    if(window.STOP_AT && !autoStopped && epoch>=window.STOP_AT){ running=false; autoStopped=true;
      $('run').textContent='▶ Train'; setState('paused — compare now');
      const e=$('autostop'); if(e) e.textContent='✓ Paused at '+epoch+' epochs. Now compare — change the Pattern, then press Train again.'; }
  }
  requestAnimationFrame(loop);
}

// ---------- controls ----------
$('run').onclick=()=>{ running=!running; $('run').textContent=running?'⏸ Pause':'▶ Train'; if(running) setState('learning'); };
$('reset').onclick=()=>{ freshBrain(); epoch=0; autoStopped=false; { const e=$('autostop'); if(e) e.textContent=''; }
  $('epoch').textContent=0; $('acc').textContent='0%'; $('loss').textContent='—'; setState('fresh'); drawBrain(); };
$('pattern').onchange=e=>{ patternFn=PATTERNS[e.target.value]; freshBrain(); epoch=0;   // new task → fresh start
  $('epoch').textContent=0; $('acc').textContent='0%'; $('loss').textContent='—'; setState('fresh'); drawTarget(); drawBrain(); };

// hover the brain canvas -> live inference at that exact point
bCanvas.addEventListener('mousemove', e=>{
  const r=bCanvas.getBoundingClientRect();
  const x=(e.clientX-r.left)/bCanvas.width, y=(e.clientY-r.top)/bCanvas.height;
  const {a3}=forward([x*2-1,y*2-1]);
  $('sw').style.background=`rgb(${a3[0]*255|0},${a3[1]*255|0},${a3[2]*255|0})`;
});

// boot
const _q=new URLSearchParams(location.search);                 // apply settings (URL param OR the page's dropdown)
if(_q.get('speed')) $('speed').value=_q.get('speed');
const _pat=_q.get('pattern') || $('pattern').value;
if(_pat && PATTERNS[_pat]){ $('pattern').value=_pat; patternFn=PATTERNS[_pat]; }
freshBrain();
drawTarget();
drawBrain();
if(_q.get('run')){ running=true; $('run').textContent='⏸ Pause'; setState('learning'); }   // auto-start if asked
loop();
