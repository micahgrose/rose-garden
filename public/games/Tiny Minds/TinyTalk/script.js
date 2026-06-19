// ===== greeting pairs: diverse human greetings (some typo'd) -> clean replies =====
const GREETINGS = [
  "hello","hi","hey","yo","sup","howdy","hiya","hola","greetings","morning","evening",
  "good morning","good afternoon","good evening","good day","what's up","whats up","heya",
  "hey there","hi there","hello there","hey you","welcome","hi friend","hello friend",
  "hey hey","hello again","nice to meet you","hey buddy","good to see you","oh hi","well hello",
];
const RESPONSES = [
  "hi there!","hello! nice to meet you.","hey, good to see you!","hi! how are you today?",
  "hello friend, welcome!","hey there!","hello! how are you?","welcome! glad you're here.",
  "good to see you!","hey! what's up?","hi! lovely to see you.","greetings, friend!",
  "hello, how have you been?","hey friend! great to see you.","hi! welcome aboard.",
  "well hello there!","hiya! how are you doing?","good day to you!","nice to see you, hello!",
  "hey! how can i help?","hello! so glad you came.","morning! hope you slept well.",
];
const SEP="|", END="\n", PAD=" ", K=16;

// fat-finger a string the way a human would: drop / double / swap a letter, lose a space
function typo(s){
  let a=s; const n=1+(Math.random()<0.3?1:0);
  for(let i=0;i<n;i++){
    if(a.length<2) break;
    const p=Math.floor(Math.random()*a.length), r=Math.random();
    if(r<0.30)      a=a.slice(0,p)+a.slice(p+1);
    else if(r<0.60) a=a.slice(0,p)+a[p]+a.slice(p);
    else if(r<0.85 && p<a.length-1) a=a.slice(0,p)+a[p+1]+a[p]+a.slice(p+2);
    else { const b=a.replace(" ",""); a = b!==a ? b : a+a[a.length-1]; }
  }
  return a;
}
const maybeTypo = s => Math.random()<0.4 ? typo(s) : s;   // ~40% of inputs are sloppy

function makePool(target){
  const out=[], seen=new Set(); let guard=0;
  while(out.length<target && guard++<target*40){
    const g=GREETINGS[(Math.random()*GREETINGS.length)|0];
    const prompt = maybeTypo(g);
    const resp = RESPONSES[(Math.random()*RESPONSES.length)|0];
    const key=prompt+"|"+resp;
    if(seen.has(key)) continue;
    seen.add(key); out.push([prompt,resp]);
  }
  return out;
}
const POOL = makePool(200);

// ===== mutable state rebuilt when neurons / data change =====
let H=64, V, chars, stoi, itos, PADIDX;
let TRAIN_P, VAL_P, examples, valExamples;
let W1,b1,W2,b2, gW1,gb1,gW2,gb2;
let steps=0, lastLoss=0, running=false, lastV={acc:0,conf:0};
const recent=[];

// only RESPONSE characters are training targets — the (typo'd) prompt is input it learns
// to READ but never to WRITE, so it can't learn to produce typos.
function buildExamples(pairs){
  let stream=PAD.repeat(K);
  const isResp=new Array(K).fill(false);
  for(const [p,r] of pairs){
    for(const ch of (p+SEP)){ stream+=ch; isResp.push(false); }
    for(const ch of (r+END)){ stream+=ch; isResp.push(true);  }
  }
  const out=[];
  for(let pos=K; pos<stream.length; pos++){
    if(!isResp[pos]) continue;
    const ctx=new Int32Array(K);
    for(let p=0;p<K;p++) ctx[p]=stoi[stream[pos-K+p]];
    out.push([ctx, stoi[stream[pos]]]);
  }
  return out;
}

function rebuildData(nPairs, keepVocab){
  const active=POOL.slice(0, nPairs);
  if(!keepVocab){
    const allText=active.map(([p,r])=>p+SEP+r+END).join("");
    chars=[...new Set((PAD+allText).split(""))].sort();
    V=chars.length; stoi={}; itos={};
    chars.forEach((c,i)=>{stoi[c]=i; itos[i]=c;});
    PADIDX=stoi[PAD];
  }
  const nVal=Math.max(3, Math.round(active.length*0.2));
  VAL_P  = active.slice(0, nVal);
  TRAIN_P= active.slice(nVal);
  examples    = buildExamples(TRAIN_P);   // model learns ONLY from these
  valExamples = buildExamples(VAL_P);     // never trained on — the honest exam
}

function fresh(){
  const rnd=s=>(Math.random()*2-1)*s;
  const m=(r,c,s)=>{const a=new Float64Array(r*c);for(let i=0;i<a.length;i++)a[i]=rnd(s);return a;};
  W1=m(H,K*V,0.08); b1=new Float64Array(H); W2=m(V,H,0.08); b2=new Float64Array(V);
  gW1=new Float64Array(W1.length); gb1=new Float64Array(H);
  gW2=new Float64Array(W2.length); gb2=new Float64Array(V);
}

function forward(ctx){
  const a1=new Float64Array(H);
  for(let i=0;i<H;i++){ let z=b1[i]; const base=i*K*V;
    for(let p=0;p<K;p++) z+=W1[base+p*V+ctx[p]];
    a1[i]=Math.tanh(z);
  }
  const logits=new Float64Array(V);
  for(let k=0;k<V;k++){ let z=b2[k]; const base=k*H;
    for(let i=0;i<H;i++) z+=W2[base+i]*a1[i];
    logits[k]=z;
  }
  return {a1,logits};
}
function softmax(logits,temp){
  const t=temp||1; let mx=-1e9;
  const p=new Float64Array(V);
  for(let k=0;k<V;k++){ p[k]=logits[k]/t; if(p[k]>mx)mx=p[k]; }
  let s=0; for(let k=0;k<V;k++){ p[k]=Math.exp(p[k]-mx); s+=p[k]; }
  for(let k=0;k<V;k++) p[k]/=s;
  return p;
}

const LR=0.25;
function trainStep(){
  const B=32; let loss=0;
  gW1.fill(0); gb1.fill(0); gW2.fill(0); gb2.fill(0);
  for(let b=0;b<B;b++){
    const [ctx,target]=examples[(Math.random()*examples.length)|0];
    const {a1,logits}=forward(ctx);
    const p=softmax(logits,1);
    loss += -Math.log(Math.max(p[target],1e-9));
    const d2=new Float64Array(V);
    for(let k=0;k<V;k++) d2[k]=p[k]-(k===target?1:0);
    for(let k=0;k<V;k++){ gb2[k]+=d2[k]; const base=k*H; for(let i=0;i<H;i++) gW2[base+i]+=d2[k]*a1[i]; }
    for(let i=0;i<H;i++){
      let s=0; for(let k=0;k<V;k++) s+=W2[k*H+i]*d2[k];
      const d1=s*(1-a1[i]*a1[i]);
      gb1[i]+=d1; const base=i*K*V;
      for(let p2=0;p2<K;p2++) gW1[base+p2*V+ctx[p2]]+=d1;
    }
  }
  const k=LR/B;
  for(let i=0;i<W1.length;i++) W1[i]-=k*gW1[i];
  for(let i=0;i<H;i++) b1[i]-=k*gb1[i];
  for(let i=0;i<W2.length;i++) W2[i]-=k*gW2[i];
  for(let i=0;i<V;i++) b2[i]-=k*gb2[i];
  steps++; lastLoss=loss/B;
}

function evalVal(){
  const data=valExamples;
  if(!data.length) return {acc:0,conf:0};
  const N=Math.min(data.length,300);
  let correct=0, conf=0;
  for(let s=0;s<N;s++){
    const [ctx,target]=data[(Math.random()*data.length)|0];
    const {logits}=forward(ctx);
    const p=softmax(logits,1);
    let arg=0; for(let k=1;k<V;k++) if(p[k]>p[arg]) arg=k;
    if(arg===target) correct++;
    conf += p[arg];
  }
  return { acc:correct/N, conf:conf/N };
}

// ===== generation =====
function sample(p){ let r=Math.random(),k=0; while(r>0 && k<V){ r-=p[k]; if(r>0)k++; } return Math.min(k,V-1); }
function generateOnce(prompt, temp, repPen){
  let seq=prompt.toLowerCase()+SEP, out="";
  const counts=new Float64Array(V);
  let probSum=0, n=0;
  for(let i=0;i<48;i++){
    const ctx=new Int32Array(K);
    const padded=PAD.repeat(K)+seq;
    for(let p=0;p<K;p++){ const ch=padded[padded.length-K+p]; ctx[p]=stoi[ch]!==undefined?stoi[ch]:PADIDX; }
    const {logits}=forward(ctx);
    const base=softmax(logits,1);
    const pl=Float64Array.from(logits);
    if(repPen>0) for(let k=0;k<V;k++) pl[k]-=repPen*counts[k];
    const p=softmax(pl,temp);
    if(i===0){ const e=stoi[END]; if(e!==undefined && p[e]>0){ const keep=1-p[e]; p[e]=0;
      if(keep>0) for(let k2=0;k2<V;k2++) p[k2]/=keep; } }   // never end before saying anything
    const k=sample(p), ch=itos[k];
    if(ch===END) break;
    out+=ch; seq+=ch; counts[k]+=1; probSum+=base[k]; n++;
  }
  return { text: out.trim(), conf: n? probSum/n : 0 };
}
function tooSimilar(a, list){
  const na=a.toLowerCase().trim(); if(!na) return false;
  for(const b of list){
    const nb=b.toLowerCase().trim();
    if(na===nb) return true;
    const A=new Set(na.split(/\s+/)), B=new Set(nb.split(/\s+/));
    let inter=0; A.forEach(w=>{ if(B.has(w)) inter++; });
    if(inter/((A.size+B.size-inter)||1) > 0.7) return true;
  }
  return false;
}
function respond(prompt, temp, antiRepeat, avoid){
  const repPen=antiRepeat*2, tries=antiRepeat>0.1?5:1;
  let best=null;
  for(let t=0;t<tries;t++){
    const res=generateOnce(prompt, temp*(1+0.3*t), repPen);
    if(!tooSimilar(res.text, avoid||[])) return res;
    best=res;
  }
  return best;
}

// ===== UI =====
const $=id=>document.getElementById(id);
let lastSnap=0, autoStopped=false;
// teacher-forced loss/confidence (and argmax accuracy) over a pair's response characters
function pairStats(prompt,resp,wantAcc){
  const stream=PAD.repeat(K)+prompt+SEP+resp+END;
  const startResp=K+prompt.length+1, endIdx=startResp+resp.length;
  let loss=0,conf=0,correct=0,n=0;
  for(let j=startResp;j<=endIdx;j++){
    const ctx=new Int32Array(K); for(let p=0;p<K;p++){ const ch=stream[j-K+p]; ctx[p]= stoi[ch]!==undefined?stoi[ch]:PADIDX; }
    const tgt=stoi[stream[j]]; if(tgt===undefined) continue;
    const {logits}=forward(ctx);
    let mx=-1e30,arg=0; for(let r=0;r<V;r++){ if(logits[r]>mx){mx=logits[r];arg=r;} }
    let s=0; for(let r=0;r<V;r++) s+=Math.exp(logits[r]-mx);
    loss+=-(logits[tgt]-mx-Math.log(s)); conf+=1/s; if(arg===tgt) correct++; n++;
  }
  n=Math.max(1,n); return { loss:loss/n, conf:conf/n, acc:correct/n };
}
// every 10 steps: freeze one real greeting pair — input / expected / reply — and base stats on it
function snapshot(){
  if(!TRAIN_P.length) return;
  const [prompt,resp]=TRAIN_P[(Math.random()*TRAIN_P.length)|0];
  const st=pairStats(prompt,resp);
  let gacc=0; if(VAL_P&&VAL_P.length){ const [vp,vr]=VAL_P[(Math.random()*VAL_P.length)|0]; gacc=pairStats(vp,vr,true).acc; }
  $('snapIn').textContent='you: '+prompt;
  $('snapExp').textContent=resp;
  $('snapAi').textContent=generateOnce(prompt,0.4,0).text||'(…)';
  $('loss').textContent=st.loss.toFixed(3);
  const mem=Math.max(0,Math.min(1,(3.4-st.loss)/2.9));
  $('barfill').style.width=(mem*100)+'%'; $('skill').textContent=(mem*100).toFixed(0)+'%';
  $('vbarfill').style.width=(gacc*100)+'%'; $('vskill').textContent=(gacc*100).toFixed(0)+'%';
  $('cbarfill').style.width=(st.conf*100)+'%'; $('cskill').textContent=(st.conf*100).toFixed(0)+'%';
}
function loop(){
  if(running){
    const iters=+$('speed').value;
    for(let i=0;i<iters;i++) trainStep();
    $('steps').textContent=steps;
    if(window.STOP_AT && !autoStopped && steps>=window.STOP_AT){ running=false; autoStopped=true;
      $('train').textContent='▶ Train'; const e=$('autostop');
      if(e) e.textContent='✓ Paused at '+steps+' steps. Now compare — change the unlocked setting, then press Train again.'; }
    if(steps-lastSnap>=10){ lastSnap=steps; snapshot(); }
  }
  requestAnimationFrame(loop);
}

function reinit(){
  H=parseInt($('hsize').value,10);
  rebuildData(parseInt($('dsize').value,10));
  fresh();
  steps=0; lastLoss=0; running=false; recent.length=0; lastV={acc:0,conf:0};
  $('train').textContent='▶ Train'; $('steps').textContent=0; $('loss').textContent='—';
  $('barfill').style.width=0; $('vbarfill').style.width=0; $('cbarfill').style.width=0;
  $('skill').textContent='0%'; $('vskill').textContent='0%'; $('cskill').textContent='0%';
  lastSnap=0; autoStopped=false; { const e=$('autostop'); if(e) e.textContent=''; }
  for(const id of ['snapIn','snapExp','snapAi']){ const e=$(id); if(e) e.textContent='…'; }
  if($('chat')) $('chat').innerHTML='';
  $('split').innerHTML='trained on <b>'+TRAIN_P.length+'</b> · hidden <b>'+VAL_P.length+'</b> · '+H+' neurons';
}

function clearChat(){ recent.length=0; if($('chat')) $('chat').innerHTML=''; }

$('train').onclick=()=>{ running=!running; $('train').textContent=running?'⏸ Pause':'▶ Train'; };
$('reset').onclick=reinit;
$('hsize').onchange=reinit;
$('dsize').onchange=reinit;
$('newchat').onclick=clearChat;

function send(){
  const text=$('say').value.trim(); if(!text) return;
  const temp=(+$('temp').value)/100, anti=(+$('rep').value)/100;
  const res=respond(text, temp, anti, recent);
  const reply=(res&&res.text)||"(still learning…)";
  if(res&&res.text){ recent.push(res.text); if(recent.length>5) recent.shift(); }
  const c=res?Math.round(res.conf*100):0;
  const chat=$('chat');
  chat.innerHTML+=`<div class="msg"><span class="you">you ▸</span> ${text}</div>`+
                  `<div class="msg"><span class="bot">ai  ▸</span> ${reply} <span class="tag">· confidence ${c}%</span></div>`;
  chat.scrollTop=chat.scrollHeight;
  $('say').value='';
}
$('send').onclick=send;
$('say').addEventListener('keydown',e=>{ if(e.key==='Enter') send(); });

const _q=new URLSearchParams(location.search);                 // apply settings passed in the link
_q.forEach((v,k)=>{ const el=document.getElementById(k); if(el && 'value' in el) el.value=v; });
reinit();
if(_q.get('run')){ running=true; $('train').textContent='⏸ Pause'; }   // auto-start if asked
loop();
