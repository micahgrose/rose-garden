// ===== TinyChat — a mini word-level transformer, from scratch, no libraries =====
// Word tokens + single-head self-attention + LayerNorm + 2 ReLU feed-forward layers.
// Trained with Adam + gradient clipping. Float32 + reused scratch buffers for speed.
// Backprop (incl. attention + LayerNorm) verified by finite-difference gradient check.

const IN_BROWSER = typeof document !== 'undefined';
const ARR = IN_BROWSER ? Float32Array : Float64Array;   // node test uses f64 for clean grad-check

// ---------- dialogue generator with phase cues ----------
const U=">", END="\n", PAD_T="<pad>", UNK="<unk>";
const CUE={ open:"{", mid:"<", end:"}" };
const cueLabel={ "{":"opening", "<":"mid", "}":"ending" };

const userOpen=["hello","hi","hey","hey there","hi there","good morning","good afternoon","hello there","morning",
  "howdy","yo","hiya","good evening","hey friend","oh hi","well hello","good to see you","hey you",
  "fancy seeing you here","long time no see","oh , hello !","morning !"];
const botGreet=["hi there ! how are you ?","hello ! how is it going ?","hey ! good to see you . how are you ?",
  "hello ! nice to see you . how are you doing ?","hi ! how are you today ?","hey there ! how is your day going ?",
  "hi ! lovely to see you . how are you ?","hey ! great to see you . how have you been ?",
  "hello ! good to see a friendly face .","hi ! what a nice surprise ."];
const userMood=["i am good , you ?","doing well , thanks . you ?","pretty good , and you ?","not bad , how about you ?",
  "i am great , thanks !","a little tired , but okay . you ?","doing alright , you ?","can not complain , you ?",
  "pretty busy , honestly . you ?","i am doing okay , thanks ."];
const botMood=["i am doing well , thanks for asking !","glad to hear it ! i am good too .","i am great , thanks !",
  "doing well , thank you !","can not complain , thanks !","pretty good , thanks for asking !",
  "keeping busy , but happy !","all the better for seeing you !","good , thanks ! it is a lovely day ."];
// the diverse middle of the conversation: coherent (you -> ai) exchanges across many topics
const MID=[
  {u:"i had a great weekend .", b:"oh nice , glad to hear it !"},
  {u:"i went hiking on saturday .", b:"that sounds wonderful ! perfect weather for it ."},
  {u:"i just relaxed at home .", b:"sometimes that is exactly what you need ."},
  {u:"do you come here often ?", b:"most mornings , yeah . it is a nice routine ."},
  {u:"this coffee is really good .", b:"is it not ? best in town , i reckon ."},
  {u:"i am a bit nervous about today .", b:"you will do great , honestly . deep breath ."},
  {u:"the bus is late again .", b:"typical , right ? at least we get to chat ."},
  {u:"i like your jacket .", b:"thank you ! got it on sale , actually ."},
  {u:"what do you do for work ?", b:"i am a teacher — it keeps me busy ."},
  {u:"i work in software .", b:"oh interesting ! that must keep you busy ."},
  {u:"do you have any pets ?", b:"a cat , yes ! a total menace , but i love her ."},
  {u:"i have a dog named max .", b:"aw , i bet he is a handful ! dogs are the best ."},
  {u:"any plans for the weekend ?", b:"might see some friends , should be nice ."},
  {u:"i am meeting friends later .", b:"that sounds fun ! hope you have a great time ."},
  {u:"the weather has been lovely .", b:"it really has . makes everything easier ."},
  {u:"it is freezing today .", b:"tell me about it ! i should have worn a coat ."},
  {u:"i am so tired this morning .", b:"long night ? a coffee should help ."},
  {u:"i could not sleep last night .", b:"oh no . hope you can rest up later ."},
  {u:"seen any good shows lately ?", b:"a few ! i am hooked on one right now ."},
  {u:"i started a new book .", b:"nice ! there is nothing like a good read ."},
  {u:"i love this song .", b:"good taste ! it is a classic ."},
  {u:"do you play any instruments ?", b:"a little guitar . nothing fancy ."},
  {u:"i am heading to the gym .", b:"good for you ! enjoy the workout ."},
  {u:"i just got back from a trip .", b:"oh fun ! i bet that was a lovely break ."},
  {u:"i went to the coast .", b:"lovely ! the sea air does wonders ."},
  {u:"work has been hectic lately .", b:"i hear you . hope it settles down soon ."},
  {u:"i finally finished that project .", b:"congratulations ! that is a relief , i bet ."},
  {u:"how is your family ?", b:"all good , thanks for asking !"},
  {u:"my kids are growing so fast .", b:"they always do ! enjoy every bit of it ."},
  {u:"i am trying to eat healthier .", b:"good for you ! small steps go a long way ."},
  {u:"i could really use a holiday .", b:"could we not all ? somewhere warm , ideally ."},
  {u:"traffic was awful today .", b:"ugh , the worst . glad you made it ."},
  {u:"i love mornings like this .", b:"me too . quiet and calm , just right ."},
  {u:"do you have a busy day ?", b:"a few things on , but nothing wild ."},
  {u:"i am learning to cook .", b:"that is great ! such a handy skill ."},
  {u:"i made pasta last night .", b:"yum ! you can not go wrong with pasta ."},
  {u:"my garden is finally blooming .", b:"how lovely ! spring is the best for that ."},
  {u:"i am thinking of getting a bike .", b:"do it ! great way to get around ."},
  {u:"this place is always so cozy .", b:"is it not ? i could stay all day ."},
  {u:"i have not been here before .", b:"oh , welcome ! you will love it ."},
  {u:"how long have you lived here ?", b:"a few years now . it grows on you ."},
  {u:"i just moved to the area .", b:"welcome ! it is a friendly little spot ."},
  {u:"i am waiting on a friend .", b:"nice ! always good to catch up ."},
  {u:"i am so ready for the weekend .", b:"same here . almost there !"},
  {u:"did you watch the game ?", b:"caught the end ! what a finish ."},
  {u:"i am not much of a morning person .", b:"ha , you are not alone there ."},
  {u:"i need more coffee .", b:"always ! a good cup fixes everything ."},
  {u:"you seem cheerful today .", b:"i am ! just one of those good days ."},
  {u:"i hope it does not rain .", b:"fingers crossed ! the sky looks kind ."},
  {u:"it was nice chatting .", b:"likewise ! made my morning ."},
];
const userClose=["well , this is my stop . bye !","got to go , take care !","see you around !","nice talking to you , bye !",
  "catch you later !","anyway , take care !","gotta run , bye !","right , i am off . bye !","lovely chatting , see you !",
  "that is me , take care !"];
const botClose=["take care , bye !","see you ! have a good one .","bye ! nice chatting with you .","later ! stay well .",
  "goodbye , take care !","bye ! it was nice talking .","see you next time !","take it easy , bye !",
  "cheers ! have a lovely day .","bye for now ! look after yourself ."];

function pick(a){ return a[(Math.random()*a.length)|0]; }
function typo(s){ if(s.length<4) return s;                         // one gentle, still-readable mutation
  const p=1+Math.floor(Math.random()*(s.length-2)), r=Math.random();  // never touch the first letter
  if(r<0.34) return s.slice(0,p)+s.slice(p+1);                       // drop a letter
  if(r<0.67) return s.slice(0,p)+s[p]+s.slice(p);                    // double a letter
  return s.slice(0,p)+s[p+1]+s[p]+s.slice(p+2); }                    // swap two adjacent
function maybeTypo(s){ if(Math.random()>=0.15) return s;            // only ~15% of lines, and just one word
  const w=s.split(" "), idx=[]; w.forEach((x,i)=>{ if(x.length>3) idx.push(i); });
  if(!idx.length) return s; const i=idx[(Math.random()*idx.length)|0]; w[i]=typo(w[i]); return w.join(" "); }
function tokensOf(text){ return text.split(/\s+/).filter(Boolean); }

function makeDialogue(){
  const T=[], M=[];
  const add=(marker,text,isBot)=>{ T.push(marker); M.push(false);
    for(const w of tokensOf(text)){ T.push(w); M.push(isBot); } T.push(END); M.push(isBot); };
  const open=pick(userOpen), greet=pick(botGreet);
  add(U,maybeTypo(open),false); add(CUE.open,greet,true);
  if(Math.random()<0.85){ add(U,maybeTypo(pick(userMood)),false); add(CUE.mid,pick(botMood),true); }
  const nMid=1+((Math.random()*3)|0), used={};                 // 1-3 diverse middle exchanges
  for(let i=0;i<nMid;i++){ let ex,tries=0; do{ ex=pick(MID); tries++; }while(used[ex.u]&&tries<6); used[ex.u]=1;
    add(U,maybeTypo(ex.u),false); add(CUE.mid,ex.b,true); }
  if(Math.random()<0.7){ add(U,maybeTypo(pick(userClose)),false); add(CUE.end,pick(botClose),true); }
  return { T, M, disp:'"'+open+'"  →  "'+greet.replace(/ ([,.!?])/g,"$1")+'"' };
}
function makePool(target){
  const out=[], seen=new Set(); let guard=0;
  while(out.length<target && guard++<target*30){
    const d=makeDialogue(), key=d.T.join("|");
    if(seen.has(key)) continue; seen.add(key); out.push(d);
  }
  return out;
}
const POOL=makePool(1500);

// ---------- model state ----------
const PKEYS=["E","Pos","Wq","Wk","Wv","W1","b1","W2","b2","W3","b3","gln","bln"];
let TT=16, D=48, Hff=48, V;
let tok2id, id2tok, PADID, ENDID, UNKID;
let TRAIN_D, VAL_D, examples, exStarts, valExamples, baseLoss=4;
let P={}, G={}, M={}, Vad={};                 // params, grads, Adam moment/variance
let sX,sK,sVv,sq,sScore,sAlpha,sC,sH0,sHhat,sHn,sZ1,sA1,sZ2,sA2,sLogits;  // reused scratch
let cur_last, cur_istd;
let steps=0, lastLoss=0, running=false, lastV={acc:0,conf:0}, adamT=0;
let convoIds=[], botTurns=0;
const recent=[];
const tid=t=> (t in tok2id) ? tok2id[t] : UNKID;

function buildExamples(dialogues){
  const ids=[], tgt=[];
  for(let i=0;i<TT;i++){ ids.push(PADID); tgt.push(false); }
  for(const {T,M:m} of dialogues) for(let i=0;i<T.length;i++){ ids.push(tid(T[i])); tgt.push(m[i]); }
  const cueSet=new Set([tok2id[CUE.open],tok2id[CUE.mid],tok2id[CUE.end]]);
  const all=[], starts=[];
  for(let pos=TT; pos<ids.length; pos++){
    if(!tgt[pos]) continue;
    const ctx=new Int32Array(TT);
    for(let p=0;p<TT;p++) ctx[p]=ids[pos-TT+p];
    const ex=[ctx, ids[pos]];
    all.push(ex);
    if(cueSet.has(ids[pos-1])) starts.push(ex);
  }
  return {all, starts};
}
function rebuildData(nDialogues, keepVocab){
  const active=POOL.slice(0,nDialogues);
  const nVal=Math.max(3, Math.round(active.length*0.2));
  VAL_D=active.slice(0,nVal); TRAIN_D=active.slice(nVal);
  if(!keepVocab){
    const freq=new Map();
    for(const {T} of TRAIN_D) for(const w of T){
      if(w===U||w===END||w===CUE.open||w===CUE.mid||w===CUE.end) continue;
      freq.set(w,(freq.get(w)||0)+1);
    }
    const words=[...freq.entries()].filter(([,c])=>c>=2).map(([w])=>w).sort();
    const vocab=[PAD_T,UNK,U,CUE.open,CUE.mid,CUE.end,END,...words];
    V=vocab.length; tok2id={}; id2tok=[];
    vocab.forEach((t,i)=>{tok2id[t]=i; id2tok[i]=t;});
    PADID=tok2id[PAD_T]; ENDID=tok2id[END]; UNKID=tok2id[UNK];
  }
  const tr=buildExamples(TRAIN_D); examples=tr.all; exStarts=tr.starts;
  valExamples=buildExamples(VAL_D).all;
  baseLoss=Math.log(V);
}
function fresh(){
  const rnd=(n,s)=>{const a=new ARR(n);for(let i=0;i<n;i++)a[i]=(Math.random()*2-1)*s;return a;};
  const z=n=>new ARR(n), ones=n=>{const a=new ARR(n);a.fill(1);return a;};
  P={ E:rnd(V*D,0.1), Pos:rnd(TT*D,0.1),
      Wq:rnd(D*D,1/Math.sqrt(D)), Wk:rnd(D*D,1/Math.sqrt(D)), Wv:rnd(D*D,1/Math.sqrt(D)),
      W1:rnd(Hff*D,1/Math.sqrt(D)), b1:z(Hff),
      W2:rnd(Hff*Hff,1/Math.sqrt(Hff)), b2:z(Hff),
      W3:rnd(V*Hff,1/Math.sqrt(Hff)), b3:z(V),
      gln:ones(D), bln:z(D) };
  G={}; M={}; Vad={};
  for(const k of PKEYS){ G[k]=z(P[k].length); M[k]=z(P[k].length); Vad[k]=z(P[k].length); }
  sX=z(TT*D); sK=z(TT*D); sVv=z(TT*D); sq=z(D); sScore=z(TT); sAlpha=z(TT);
  sC=z(D); sH0=z(D); sHhat=z(D); sHn=z(D); sZ1=z(Hff); sA1=z(Hff); sZ2=z(Hff); sA2=z(Hff); sLogits=z(V);
  adamT=0;
}

function forward(ctx){
  const last=TT-1; cur_last=last;
  for(let j=0;j<TT;j++){ const eo=ctx[j]*D, po=j*D, xo=j*D;
    for(let d=0;d<D;d++) sX[xo+d]=P.E[eo+d]+P.Pos[po+d]; }
  for(let r=0;r<D;r++){ let zz=0,b=r*D, xo=last*D; for(let cc=0;cc<D;cc++) zz+=P.Wq[b+cc]*sX[xo+cc]; sq[r]=zz; }
  for(let j=0;j<TT;j++){ const xo=j*D;
    for(let r=0;r<D;r++){ let zk=0,zv=0,b=r*D;
      for(let cc=0;cc<D;cc++){ const xv=sX[xo+cc]; zk+=P.Wk[b+cc]*xv; zv+=P.Wv[b+cc]*xv; }
      sK[j*D+r]=zk; sVv[j*D+r]=zv; } }
  const scale=1/Math.sqrt(D);
  for(let j=0;j<TT;j++){ let dot=0, ko=j*D; for(let d=0;d<D;d++) dot+=sq[d]*sK[ko+d]; sScore[j]=dot*scale; }
  let mx=-1e30; for(let j=0;j<TT;j++) if(sScore[j]>mx)mx=sScore[j];
  let ss=0; for(let j=0;j<TT;j++){ sAlpha[j]=Math.exp(sScore[j]-mx); ss+=sAlpha[j]; }
  for(let j=0;j<TT;j++) sAlpha[j]/=ss;
  for(let d=0;d<D;d++) sC[d]=0;
  for(let j=0;j<TT;j++){ const aj=sAlpha[j], vo=j*D; for(let d=0;d<D;d++) sC[d]+=aj*sVv[vo+d]; }
  for(let d=0;d<D;d++) sH0[d]=sC[d]+sX[last*D+d];
  let mu=0; for(let d=0;d<D;d++) mu+=sH0[d]; mu/=D;
  let varr=0; for(let d=0;d<D;d++){ const dd=sH0[d]-mu; varr+=dd*dd; } varr/=D;
  const istd=1/Math.sqrt(varr+1e-5); cur_istd=istd;
  for(let d=0;d<D;d++){ sHhat[d]=(sH0[d]-mu)*istd; sHn[d]=P.gln[d]*sHhat[d]+P.bln[d]; }
  for(let r=0;r<Hff;r++){ let zz=P.b1[r],b=r*D; for(let cc=0;cc<D;cc++) zz+=P.W1[b+cc]*sHn[cc]; sZ1[r]=zz; sA1[r]=zz>0?zz:0; }
  for(let r=0;r<Hff;r++){ let zz=P.b2[r],b=r*Hff; for(let cc=0;cc<Hff;cc++) zz+=P.W2[b+cc]*sA1[cc]; sZ2[r]=zz; sA2[r]=zz>0?zz:0; }
  for(let r=0;r<V;r++){ let zz=P.b3[r],b=r*Hff; for(let cc=0;cc<Hff;cc++) zz+=P.W3[b+cc]*sA2[cc]; sLogits[r]=zz; }
  return {logits:sLogits,last,istd};
}
function lossFrom(logits,t){ let mx=-1e30; for(let r=0;r<V;r++) if(logits[r]>mx)mx=logits[r];
  let s=0; for(let r=0;r<V;r++) s+=Math.exp(logits[r]-mx); return -(logits[t]-mx-Math.log(s)); }

function backward(ctx,target){
  const last=cur_last, istd=cur_istd, scale=1/Math.sqrt(D);
  let mx=-1e30; for(let r=0;r<V;r++) if(sLogits[r]>mx)mx=sLogits[r];
  let s=0; const dlogits=new ARR(V);
  for(let r=0;r<V;r++){ dlogits[r]=Math.exp(sLogits[r]-mx); s+=dlogits[r]; }
  for(let r=0;r<V;r++){ dlogits[r]/=s; if(r===target) dlogits[r]-=1; }
  const da2=new ARR(Hff);
  for(let r=0;r<V;r++){ const dl=dlogits[r]; G.b3[r]+=dl; const b=r*Hff;
    for(let cc=0;cc<Hff;cc++){ G.W3[b+cc]+=dl*sA2[cc]; da2[cc]+=P.W3[b+cc]*dl; } }
  const dz2=new ARR(Hff); for(let r=0;r<Hff;r++) dz2[r]= sA2[r]>0? da2[r]:0;
  const da1=new ARR(Hff);
  for(let r=0;r<Hff;r++){ G.b2[r]+=dz2[r]; const b=r*Hff;
    for(let cc=0;cc<Hff;cc++){ G.W2[b+cc]+=dz2[r]*sA1[cc]; da1[cc]+=P.W2[b+cc]*dz2[r]; } }
  const dz1=new ARR(Hff); for(let r=0;r<Hff;r++) dz1[r]= sA1[r]>0? da1[r]:0;
  const dhn=new ARR(D);
  for(let r=0;r<Hff;r++){ G.b1[r]+=dz1[r]; const b=r*D;
    for(let cc=0;cc<D;cc++){ G.W1[b+cc]+=dz1[r]*sHn[cc]; dhn[cc]+=P.W1[b+cc]*dz1[r]; } }
  const dhhat=new ARR(D);
  for(let d=0;d<D;d++){ G.gln[d]+=dhn[d]*sHhat[d]; G.bln[d]+=dhn[d]; dhhat[d]=dhn[d]*P.gln[d]; }
  let sumdhhat=0, sumdh=0;
  for(let d=0;d<D;d++){ sumdhhat+=dhhat[d]; sumdh+=dhhat[d]*sHhat[d]; }
  const dh0=new ARR(D);
  for(let d=0;d<D;d++) dh0[d]=(dhhat[d] - sumdhhat/D - sHhat[d]*sumdh/D)*istd;
  const dx=new ARR(TT*D);
  for(let d=0;d<D;d++) dx[last*D+d]+=dh0[d];            // residual h0 = c + x[last]
  const dalpha=new ARR(TT), dv=new ARR(TT*D);
  for(let j=0;j<TT;j++){ const aj=sAlpha[j], vo=j*D;
    for(let d=0;d<D;d++){ dv[vo+d]=aj*dh0[d]; dalpha[j]+=dh0[d]*sVv[vo+d]; } }
  let sdot=0; for(let j=0;j<TT;j++) sdot+=sAlpha[j]*dalpha[j];
  const ds=new ARR(TT); for(let j=0;j<TT;j++) ds[j]=sAlpha[j]*(dalpha[j]-sdot);
  const dq=new ARR(D), dk=new ARR(TT*D);
  for(let j=0;j<TT;j++){ const ko=j*D; for(let d=0;d<D;d++){ dq[d]+=ds[j]*scale*sK[ko+d]; dk[ko+d]=ds[j]*scale*sq[d]; } }
  for(let r=0;r<D;r++){ const b=r*D, xo=last*D;
    for(let cc=0;cc<D;cc++){ G.Wq[b+cc]+=dq[r]*sX[xo+cc]; dx[xo+cc]+=P.Wq[b+cc]*dq[r]; } }
  for(let j=0;j<TT;j++){ const xo=j*D, ko=j*D;
    for(let r=0;r<D;r++){ const b=r*D, dkr=dk[ko+r], dvr=dv[ko+r];
      for(let cc=0;cc<D;cc++){ G.Wk[b+cc]+=dkr*sX[xo+cc]; dx[xo+cc]+=P.Wk[b+cc]*dkr;
                               G.Wv[b+cc]+=dvr*sX[xo+cc]; dx[xo+cc]+=P.Wv[b+cc]*dvr; } } }
  for(let j=0;j<TT;j++){ const eo=ctx[j]*D, xo=j*D;
    for(let d=0;d<D;d++){ G.E[eo+d]+=dx[xo+d]; G.Pos[j*D+d]+=dx[xo+d]; } }
}

const LRATE=0.01, B1=0.9, B2=0.999, EPS=1e-8, CLIP=5;
function trainStep(){
  const B = D>=128 ? 8 : 16; let loss=0;
  for(const k of PKEYS) G[k].fill(0);
  for(let b=0;b<B;b++){
    const src = (exStarts.length && Math.random()<0.4) ? exStarts : examples;
    const [ctx,t]=src[(Math.random()*src.length)|0];
    forward(ctx); loss+=lossFrom(sLogits,t); backward(ctx,t);
  }
  const invB=1/B;
  let nsq=0;
  for(const k of PKEYS){ const g=G[k]; for(let i=0;i<g.length;i++){ g[i]*=invB; nsq+=g[i]*g[i]; } }
  const scale = nsq>CLIP*CLIP ? CLIP/Math.sqrt(nsq) : 1;   // gradient clipping
  adamT++;
  const bc1=1-Math.pow(B1,adamT), bc2=1-Math.pow(B2,adamT);
  for(const k of PKEYS){ const p=P[k],g=G[k],m=M[k],v=Vad[k];
    for(let i=0;i<p.length;i++){ const gi=g[i]*scale;
      m[i]=B1*m[i]+(1-B1)*gi; v[i]=B2*v[i]+(1-B2)*gi*gi;
      p[i]-= LRATE*(m[i]/bc1)/(Math.sqrt(v[i]/bc2)+EPS); } }
  steps++; lastLoss=loss/B;
}
function evalVal(){
  const data=valExamples; if(!data.length) return {acc:0,conf:0};
  const N=Math.min(data.length,250); let correct=0, conf=0;
  for(let s=0;s<N;s++){ const [ctx,t]=data[(Math.random()*data.length)|0];
    const f=forward(ctx); const p=softmaxArr(f.logits,1);
    let arg=0; for(let k=1;k<V;k++) if(p[k]>p[arg]) arg=k;
    if(arg===t) correct++; conf+=p[arg]; }
  return { acc:correct/N, conf:conf/N };
}

// ---------- generation ----------
function softmaxArr(a,temp){ const t=temp||1; let mx=-1e30;
  const o=new Float64Array(a.length);
  for(let i=0;i<a.length;i++){ o[i]=a[i]/t; if(o[i]>mx)mx=o[i]; }
  let s=0; for(let i=0;i<a.length;i++){ o[i]=Math.exp(o[i]-mx); s+=o[i]; }
  for(let i=0;i<a.length;i++) o[i]/=s; return o; }
function sampleId(p){ let r=Math.random(),k=0; while(r>0&&k<V){ r-=p[k]; if(r>0)k++; } return Math.min(k,V-1); }
function generateTurn(seedIds, temp, repPen){
  const ids=seedIds.slice(); const newIds=[], outToks=[];
  const counts=new Float64Array(V); let probSum=0,n=0;
  for(let i=0;i<16;i++){
    const ctx=new Int32Array(TT);
    for(let p=0;p<TT;p++){ const idx=ids.length-TT+p; ctx[p]= idx>=0 ? ids[idx] : PADID; }
    const f=forward(ctx);
    const baseP=softmaxArr(f.logits,1);
    const pl=new Float64Array(V); for(let k=0;k<V;k++) pl[k]=f.logits[k]-(repPen>0?repPen*counts[k]:0);
    const p=softmaxArr(pl,temp);
    if(i===0 && p[ENDID]>0){ const keep=1-p[ENDID]; p[ENDID]=0; if(keep>0) for(let k=0;k<V;k++) p[k]/=keep; }
    const k=sampleId(p);
    if(k===ENDID) break;
    ids.push(k); newIds.push(k); counts[k]++; probSum+=baseP[k]; n++;
    const t=id2tok[k]; if(t!==UNK && t!==U && t!==CUE.open && t!==CUE.mid && t!==CUE.end) outToks.push(t);
  }
  return { text: outToks.join(" ").replace(/ ([,.!?])/g,"$1").trim(), conf:n?probSum/n:0, newIds };
}
function tooSimilar(a,list){
  const na=a.toLowerCase().trim(); if(!na) return false;
  for(const b of list){ const nb=b.toLowerCase().trim(); if(na===nb) return true;
    const A=new Set(na.split(/\s+/)), B=new Set(nb.split(/\s+/));
    let inter=0; A.forEach(w=>{ if(B.has(w)) inter++; });
    if(inter/((A.size+B.size-inter)||1) > 0.7) return true; }
  return false;
}
function respond(seedIds, temp, antiRepeat, avoid){
  const repPen=antiRepeat*1.5, tries=antiRepeat>0.1?5:1;
  let best=null;
  for(let t=0;t<tries;t++){ const res=generateTurn(seedIds, temp*(1+0.3*t), repPen);
    if(!tooSimilar(res.text, avoid||[])) return res; best=res; }
  return best;
}
function farewell(t){ return /\b(bye|goodbye|see ya|see you|later|take care|got to go|gotta go|catch you|cya|my stop|this is me)\b/i.test(t); }
function pickCue(text){ return botTurns===0 ? CUE.open : (farewell(text) ? CUE.end : CUE.mid); }

// ---------- UI ----------
const $=id=>document.getElementById(id);
let iterAcc=0;
let lastSnap=0, autoStopped=false;
function decodeText(ids){ const out=[];
  for(const id of ids){ const t=id2tok[id];
    if(t===UNK) out.push('?'); else if(t===U||t===END||t===CUE.open||t===CUE.mid||t===CUE.end) continue; else out.push(t); }
  return out.join(' ').replace(/ ([,.!?])/g,'$1').trim(); }
function decodeConvo(ids){ let s='',cur='';
  for(const id of ids){ const t=id2tok[id];
    if(t===U){ if(cur)s+=cur.trim()+'\n'; cur='you: '; }
    else if(t===CUE.open||t===CUE.mid||t===CUE.end){ if(cur)s+=cur.trim()+'\n'; cur='ai: '; }
    else if(t===END){ if(cur)s+=cur.trim()+'\n'; cur=''; }
    else if(t===UNK){ cur+='? '; } else cur+=t+' '; }
  if(cur)s+=cur.trim(); return s.replace(/ ([,.!?])/g,'$1'); }
function botTurnOf(d){                                  // pick a random bot turn in a dialogue
  const isCue=t=> t===CUE.open||t===CUE.mid||t===CUE.end;
  const cues=[]; for(let i=0;i<d.T.length;i++) if(isCue(d.T[i])) cues.push(i);
  if(!cues.length) return null;
  const c=cues[(Math.random()*cues.length)|0]; let e=c+1; while(e<d.T.length && d.T[e]!==END) e++;
  if(e<=c+1) return null;
  const ids=[]; for(let i=0;i<=e;i++) ids.push(tid(d.T[i]));
  return { ids, c, endIdx:e }; }
// every 10 steps: freeze one real bot turn — input / expected / reply — and base stats on it
function snapshot(){
  if(!TRAIN_D.length) return;
  let s=null; for(let t=0;t<14 && !s;t++) s=botTurnOf(TRAIN_D[(Math.random()*TRAIN_D.length)|0]);
  if(!s) return;
  const {ids,c,endIdx}=s; let loss=0,conf=0,n=0;
  for(let j=c+1;j<=endIdx;j++){
    const ctx=new Int32Array(TT); for(let p=0;p<TT;p++){ const idx=j-TT+p; ctx[p]= idx>=0?ids[idx]:PADID; }
    const f=forward(ctx); const tgt=ids[j];
    let mx=-1e30; for(let r=0;r<V;r++) if(f.logits[r]>mx)mx=f.logits[r];
    let sm=0; for(let r=0;r<V;r++) sm+=Math.exp(f.logits[r]-mx);
    loss+=-(f.logits[tgt]-mx-Math.log(sm)); conf+=1/sm; n++; }
  loss/=Math.max(1,n); conf/=Math.max(1,n);
  let gacc=0; if(VAL_D&&VAL_D.length){ let vs=null; for(let t=0;t<14&&!vs;t++) vs=botTurnOf(VAL_D[(Math.random()*VAL_D.length)|0]);
    if(vs){ let cc=0,nn=0; for(let j=vs.c+1;j<=vs.endIdx;j++){ const ctx=new Int32Array(TT);
      for(let p=0;p<TT;p++){ const idx=j-TT+p; ctx[p]=idx>=0?vs.ids[idx]:PADID; }
      const f=forward(ctx); let mx=-1e30,arg=0; for(let r=0;r<V;r++){ const lg=f.logits[r]; if(lg>mx){mx=lg;arg=r;} }
      if(arg===vs.ids[j]) cc++; nn++; } gacc=nn?cc/nn:0; } }
  $('snapIn').textContent=decodeConvo(ids.slice(0,c+1));
  $('snapExp').textContent=decodeText(ids.slice(c+1,endIdx))||'(end of turn)';
  $('snapAi').textContent=generateTurn(ids.slice(0,c+1),0.25,0).text||'(…)';
  $('loss').textContent=loss.toFixed(3);
  const mem=Math.max(0,Math.min(1,(baseLoss-loss)/baseLoss));
  $('barfill').style.width=(mem*100)+'%'; $('skill').textContent=(mem*100).toFixed(0)+'%';
  $('vbarfill').style.width=(gacc*100)+'%'; $('vskill').textContent=(gacc*100).toFixed(0)+'%';
  $('cbarfill').style.width=(conf*100)+'%'; $('cskill').textContent=(conf*100).toFixed(0)+'%';
}
function loop(){
  if(running){
    iterAcc += +$('speed').value; const t0=performance.now();
    while(iterAcc>=1){ trainStep(); iterAcc-=1; if(performance.now()-t0>14){ iterAcc=0; break; } }
    $('steps').textContent=steps;
    if(window.STOP_AT && !autoStopped && steps>=window.STOP_AT){ running=false; autoStopped=true;
      $('train').textContent='▶ Train'; const e=$('autostop');
      if(e) e.textContent='✓ Paused at '+steps+' steps. Now compare — change the unlocked setting, then press Train again.'; }
    if(steps-lastSnap>=10){ lastSnap=steps; snapshot(); }
  }
  requestAnimationFrame(loop);
}
function reinit(){
  TT=parseInt($('ksize').value,10);
  D=Hff=parseInt($('hsize').value,10);
  const sp=$('speed');                              // big nets: allow slower-than-1-step/frame speeds
  if(D>=128||TT>=96){ sp.min='0.25'; sp.step='0.25'; if(+sp.value>4) sp.value='2'; }
  else { sp.min='1'; sp.step='1'; if(+sp.value<1) sp.value='6'; }
  rebuildData(parseInt($('dsize').value,10));
  fresh();
  iterAcc=0;
  steps=0; lastLoss=0; running=false; recent.length=0; convoIds=[]; botTurns=0; lastV={acc:0,conf:0};
  $('train').textContent='▶ Train'; $('steps').textContent=0; $('loss').textContent='—';
  $('barfill').style.width=0; $('vbarfill').style.width=0; $('cbarfill').style.width=0;
  $('skill').textContent='0%'; $('vskill').textContent='0%'; $('cskill').textContent='0%';
  lastSnap=0; autoStopped=false; { const e=$('autostop'); if(e) e.textContent=''; }
  for(const id of ['snapIn','snapExp','snapAi']){ const e=$(id); if(e) e.textContent='…'; }
  if($('chat')) $('chat').innerHTML='';
  $('split').innerHTML='vocab <b>'+V+'</b> words · train <b>'+TRAIN_D.length+'</b> · '
    +D+'d · '+TT+' ctx · attention + adam';
}
function send(){
  const text=$('say').value.trim(); if(!text) return;
  const temp=(+$('temp').value)/100, anti=(+$('rep').value)/100;
  const cue=pickCue(text);
  convoIds.push(tid(U)); for(const w of tokensOf(text.toLowerCase())) convoIds.push(tid(w));
  convoIds.push(ENDID); convoIds.push(tid(cue));
  const res=respond(convoIds, temp, anti, recent);
  const reply=(res&&res.text)||"(still learning…)";
  if(res){ for(const k of res.newIds) convoIds.push(k); convoIds.push(ENDID); botTurns++; }
  if(convoIds.length>400) convoIds=convoIds.slice(-400);
  if(res&&res.text){ recent.push(res.text); if(recent.length>5) recent.shift(); }
  const c=res?Math.round(res.conf*100):0;
  const chat=$('chat');
  chat.innerHTML+=`<div class="msg"><span class="you">you ▸</span> ${text}</div>`+
                  `<div class="msg"><span class="bot">ai  ▸</span> ${reply} <span class="tag">· ${cueLabel[cue]}, confidence ${c}%</span></div>`;
  chat.scrollTop=chat.scrollHeight; $('say').value='';
}

function clearChat(){ convoIds=[]; botTurns=0; recent.length=0; if($('chat')) $('chat').innerHTML=''; }

if (IN_BROWSER) {
  $('train').onclick=()=>{ running=!running; $('train').textContent=running?'⏸ Pause':'▶ Train'; };
  $('reset').onclick=reinit;
  $('hsize').onchange=reinit; $('ksize').onchange=reinit; $('dsize').onchange=reinit;
  $('send').onclick=send;
  $('say').addEventListener('keydown',e=>{ if(e.key==='Enter') send(); });
  $('newchat').onclick=clearChat;
  const q=new URLSearchParams(location.search);                 // apply settings passed in the link
  q.forEach((v,k)=>{ const el=document.getElementById(k); if(el && 'value' in el) el.value=v; });
  reinit();
  if(q.get('run')){ running=true; $('train').textContent='⏸ Pause'; }   // auto-start if asked
  loop();
}
if (typeof module !== 'undefined') {
  module.exports = {
    setHP:(tt,d,h)=>{ TT=tt; D=d; Hff=h; },
    rebuildData, fresh, trainStep, generateTurn,
    seedHello:()=>[tid(U),tid("hello"),ENDID,tid(CUE.open)],
    lossOnly:(ctx,t)=>{ forward(ctx); return lossFrom(sLogits,t); },
    gradOne:(ctx,t)=>{ for(const k of PKEYS) G[k].fill(0); forward(ctx); backward(ctx,t); },
    getP:()=>P, getG:()=>G, PKEYS, info:()=>({V,TT,D,Hff,steps,lastLoss}),
  };
}
