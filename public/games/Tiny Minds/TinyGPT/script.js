// ===== TinyGPT — a REAL mini decoder-transformer, from scratch, no libraries =====
// Unlike TinyChat's simplified attention (one head, query only from the last token), this is the
// genuine article: multi-head self-attention computed at EVERY position, stacked transformer blocks,
// pre-LayerNorm + residuals, trained on whole sequences. Backprop verified by gradient check.

const IN_BROWSER = typeof document !== 'undefined';
const ARR = IN_BROWSER ? Float32Array : Float64Array;

// ---------- corpus (same small-talk world as TinyChat, but a bigger pool) ----------
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
function tokensOf(t){ return t.split(/\s+/).filter(Boolean); }
function makeDialogue(){ const T=[],M=[];
  const add=(marker,text,isBot)=>{ T.push(marker); M.push(false);
    for(const w of tokensOf(text)){ T.push(w); M.push(isBot); } T.push(END); M.push(isBot); };
  const open=pick(userOpen), greet=pick(botGreet);
  add(U,maybeTypo(open),false); add(CUE.open,greet,true);
  if(Math.random()<0.85){ add(U,maybeTypo(pick(userMood)),false); add(CUE.mid,pick(botMood),true); }
  const nMid=1+((Math.random()*3)|0), used={};                 // 1-3 diverse middle exchanges
  for(let i=0;i<nMid;i++){ let ex,tries=0; do{ ex=pick(MID); tries++; }while(used[ex.u]&&tries<6); used[ex.u]=1;
    add(U,maybeTypo(ex.u),false); add(CUE.mid,ex.b,true); }
  if(Math.random()<0.7){ add(U,maybeTypo(pick(userClose)),false); add(CUE.end,pick(botClose),true); }
  return { T, M, disp:'"'+open+'"  →  "'+greet.replace(/ ([,.!?])/g,"$1")+'"' }; }
function makePool(target){ const out=[], seen=new Set(); let guard=0;
  while(out.length<target && guard++<target*25){ const d=makeDialogue(), key=d.T.join("|");
    if(seen.has(key)) continue; seen.add(key); out.push(d); } return out; }
const POOL=makePool(3000);

// ---------- model config + state ----------
let TT=24, Dm=48, NH=2, NL=2, Dff=96, V;
let tok2id, id2tok, PADID, ENDID, UNKID;
let TRAIN_D, VAL_D, trainStream, trainBot, valStream, valBot, baseLoss=4;
let P={}, G={}, M={}, Vd={}, PKEYS=[];
let steps=0, lastLoss=0, running=false, lastV={acc:0,conf:0}, adamT=0, iterAcc=0;
let convoIds=[], botTurns=0; const recent=[];
const tid=t=> (t in tok2id) ? tok2id[t] : UNKID;
const dh=()=>Dm/NH;
function rnd(n,s){ const a=new ARR(n); for(let i=0;i<n;i++) a[i]=(Math.random()*2-1)*s; return a; }
function zz(n){ return new ARR(n); }
function on(n){ const a=new ARR(n); a.fill(1); return a; }

function buildKeys(){ const ks=['E','Pos','lnFg','lnFb','Wout','bout'];
  for(let l=0;l<NL;l++){ const p='L'+l+'_'; ks.push(p+'ln1g',p+'ln1b',p+'ln2g',p+'ln2b',p+'Wq',p+'Wk',p+'Wv',p+'Wo',p+'W1',p+'b1',p+'W2',p+'b2'); }
  return ks; }
function fresh(){
  P={ E:rnd(V*Dm,0.1), Pos:rnd(TT*Dm,0.1), lnFg:on(Dm), lnFb:zz(Dm), Wout:rnd(V*Dm,1/Math.sqrt(Dm)), bout:zz(V) };
  for(let l=0;l<NL;l++){ const p='L'+l+'_';
    P[p+'ln1g']=on(Dm); P[p+'ln1b']=zz(Dm); P[p+'ln2g']=on(Dm); P[p+'ln2b']=zz(Dm);
    P[p+'Wq']=rnd(Dm*Dm,1/Math.sqrt(Dm)); P[p+'Wk']=rnd(Dm*Dm,1/Math.sqrt(Dm));
    P[p+'Wv']=rnd(Dm*Dm,1/Math.sqrt(Dm)); P[p+'Wo']=rnd(Dm*Dm,1/Math.sqrt(Dm));
    P[p+'W1']=rnd(Dff*Dm,1/Math.sqrt(Dm)); P[p+'b1']=zz(Dff);
    P[p+'W2']=rnd(Dm*Dff,1/Math.sqrt(Dff)); P[p+'b2']=zz(Dm); }
  PKEYS=buildKeys(); G={}; M={}; Vd={};
  for(const k of PKEYS){ G[k]=zz(P[k].length); M[k]=zz(P[k].length); Vd[k]=zz(P[k].length); }
  adamT=0;
}

// ---------- math (ported from gradient-checked core) ----------
function linF(X,W,b,T,Din,Dout){ const Y=new ARR(T*Dout);
  for(let t=0;t<T;t++) for(let r=0;r<Dout;r++){ let s=b?b[r]:0, wb=r*Din, xb=t*Din;
    for(let c=0;c<Din;c++) s+=W[wb+c]*X[xb+c]; Y[t*Dout+r]=s; } return Y; }
function linB(dY,X,W,gW,gb,dX,T,Din,Dout){
  for(let t=0;t<T;t++) for(let r=0;r<Dout;r++){ const dy=dY[t*Dout+r], wb=r*Din, xb=t*Din;
    if(gb) gb[r]+=dy; for(let c=0;c<Din;c++){ gW[wb+c]+=dy*X[xb+c]; dX[xb+c]+=W[wb+c]*dy; } } }
function lnF(X,g,b,T){ const Y=new ARR(T*Dm), istd=new ARR(T), xhat=new ARR(T*Dm);
  for(let t=0;t<T;t++){ let m=0; for(let d=0;d<Dm;d++) m+=X[t*Dm+d]; m/=Dm;
    let v=0; for(let d=0;d<Dm;d++){ const dd=X[t*Dm+d]-m; v+=dd*dd; } v/=Dm;
    const is=1/Math.sqrt(v+1e-5); istd[t]=is;
    for(let d=0;d<Dm;d++){ const xh=(X[t*Dm+d]-m)*is; xhat[t*Dm+d]=xh; Y[t*Dm+d]=g[d]*xh+b[d]; } }
  return {Y,istd,xhat}; }
function lnB(dY,c,g,gg,gb,dX,T){
  for(let t=0;t<T;t++){ let sdh=0,sdhx=0; const dxh=new ARR(Dm);
    for(let d=0;d<Dm;d++){ const xh=c.xhat[t*Dm+d]; gg[d]+=dY[t*Dm+d]*xh; gb[d]+=dY[t*Dm+d];
      dxh[d]=dY[t*Dm+d]*g[d]; sdh+=dxh[d]; sdhx+=dxh[d]*xh; }
    for(let d=0;d<Dm;d++) dX[t*Dm+d]+=(dxh[d]-sdh/Dm-c.xhat[t*Dm+d]*sdhx/Dm)*c.istd[t]; } }
function mhaF(X,l,T){ const p='L'+l+'_', H=NH, hd=dh(), scale=1/Math.sqrt(hd);
  const Q=linF(X,P[p+'Wq'],null,T,Dm,Dm), K=linF(X,P[p+'Wk'],null,T,Dm,Dm), Vv=linF(X,P[p+'Wv'],null,T,Dm,Dm);
  const ctx=new ARR(T*Dm), A=new ARR(H*T*T);
  for(let h=0;h<H;h++){ const off=h*hd;
    for(let i=0;i<T;i++){ let mx=-1e30;
      for(let j=0;j<=i;j++){ let s=0; for(let d=0;d<hd;d++) s+=Q[i*Dm+off+d]*K[j*Dm+off+d]; s*=scale; A[h*T*T+i*T+j]=s; if(s>mx)mx=s; }
      let den=0; for(let j=0;j<=i;j++){ const e=Math.exp(A[h*T*T+i*T+j]-mx); A[h*T*T+i*T+j]=e; den+=e; }
      for(let j=0;j<=i;j++) A[h*T*T+i*T+j]/=den;
      for(let d=0;d<hd;d++){ let cc=0; for(let j=0;j<=i;j++) cc+=A[h*T*T+i*T+j]*Vv[j*Dm+off+d]; ctx[i*Dm+off+d]=cc; } } }
  const Y=linF(ctx,P[p+'Wo'],null,T,Dm,Dm);
  return {Y,Q,K,Vv,ctx,A,X}; }
function mhaB(dY,c,l,T){ const p='L'+l+'_', H=NH, hd=dh(), scale=1/Math.sqrt(hd);
  const dctx=new ARR(T*Dm); linB(dY,c.ctx,P[p+'Wo'],G[p+'Wo'],null,dctx,T,Dm,Dm);
  const dQ=new ARR(T*Dm), dK=new ARR(T*Dm), dVv=new ARR(T*Dm);
  for(let h=0;h<H;h++){ const off=h*hd;
    for(let i=0;i<T;i++){ const dA=new ARR(T);
      for(let j=0;j<=i;j++){ let s=0; for(let d=0;d<hd;d++){ s+=dctx[i*Dm+off+d]*c.Vv[j*Dm+off+d];
        dVv[j*Dm+off+d]+=c.A[h*T*T+i*T+j]*dctx[i*Dm+off+d]; } dA[j]=s; }
      let sdot=0; for(let j=0;j<=i;j++) sdot+=c.A[h*T*T+i*T+j]*dA[j];
      for(let j=0;j<=i;j++){ const ds=c.A[h*T*T+i*T+j]*(dA[j]-sdot)*scale;
        for(let d=0;d<hd;d++){ dQ[i*Dm+off+d]+=ds*c.K[j*Dm+off+d]; dK[j*Dm+off+d]+=ds*c.Q[i*Dm+off+d]; } } } }
  const dX=new ARR(T*Dm);
  linB(dQ,c.X,P[p+'Wq'],G[p+'Wq'],null,dX,T,Dm,Dm);
  linB(dK,c.X,P[p+'Wk'],G[p+'Wk'],null,dX,T,Dm,Dm);
  linB(dVv,c.X,P[p+'Wv'],G[p+'Wv'],null,dX,T,Dm,Dm);
  return dX; }
function ffnF(X,l,T){ const p='L'+l+'_';
  const z1=linF(X,P[p+'W1'],P[p+'b1'],T,Dm,Dff); const a1=new ARR(T*Dff);
  for(let i=0;i<a1.length;i++) a1[i]=z1[i]>0?z1[i]:0;
  const Y=linF(a1,P[p+'W2'],P[p+'b2'],T,Dff,Dm); return {Y,a1}; }
function ffnB(dY,c,l,T){ const p='L'+l+'_';
  const da1=new ARR(T*Dff); linB(dY,c.a1,P[p+'W2'],G[p+'W2'],G[p+'b2'],da1,T,Dff,Dm);
  const dz1=new ARR(T*Dff); for(let i=0;i<dz1.length;i++) dz1[i]=c.a1[i]>0?da1[i]:0;
  const dX=new ARR(T*Dm); linB(dz1,c.Xin,P[p+'W1'],G[p+'W1'],G[p+'b1'],dX,T,Dm,Dff); return dX; }
function forward(tokens){ const T=tokens.length;
  let X=new ARR(T*Dm);
  for(let t=0;t<T;t++) for(let d=0;d<Dm;d++) X[t*Dm+d]=P.E[tokens[t]*Dm+d]+P.Pos[t*Dm+d];
  const caches=[];
  for(let l=0;l<NL;l++){ const p='L'+l+'_';
    const ln1=lnF(X,P[p+'ln1g'],P[p+'ln1b'],T); const mha=mhaF(ln1.Y,l,T);
    const X1=new ARR(T*Dm); for(let i=0;i<X1.length;i++) X1[i]=X[i]+mha.Y[i];
    const ln2=lnF(X1,P[p+'ln2g'],P[p+'ln2b'],T); const ff=ffnF(ln2.Y,l,T); ff.Xin=ln2.Y;
    const X2=new ARR(T*Dm); for(let i=0;i<X2.length;i++) X2[i]=X1[i]+ff.Y[i];
    caches.push({X,ln1,mha,X1,ln2,ff}); X=X2; }
  const lnf=lnF(X,P.lnFg,P.lnFb,T);
  const logits=linF(lnf.Y,P.Wout,P.bout,T,Dm,V);
  return {T,tokens,caches,lnf,logits}; }
function lossGrad(tokens,targets,mask){ const f=forward(tokens), T=f.T; let loss=0,cnt=0;
  const dlogits=new ARR(T*V);
  for(let t=0;t<T;t++){ if(!mask[t]) continue; cnt++;
    let mx=-1e30; for(let r=0;r<V;r++) if(f.logits[t*V+r]>mx)mx=f.logits[t*V+r];
    let s=0; for(let r=0;r<V;r++) s+=Math.exp(f.logits[t*V+r]-mx);
    loss+=-(f.logits[t*V+targets[t]]-mx-Math.log(s));
    for(let r=0;r<V;r++) dlogits[t*V+r]=Math.exp(f.logits[t*V+r]-mx)/s;
    dlogits[t*V+targets[t]]-=1; }
  const inv=1/Math.max(1,cnt); for(let i=0;i<dlogits.length;i++) dlogits[i]*=inv;
  const dlnfY=new ARR(T*Dm); linB(dlogits,f.lnf.Y,P.Wout,G.Wout,G.bout,dlnfY,T,Dm,V);
  let dX=new ARR(T*Dm); lnB(dlnfY,f.lnf,P.lnFg,G.lnFg,G.lnFb,dX,T);
  for(let l=NL-1;l>=0;l--){ const p='L'+l+'_', c=f.caches[l];
    const dX1=new ARR(T*Dm); for(let i=0;i<dX1.length;i++) dX1[i]=dX[i];
    const dffY=new ARR(T*Dm); for(let i=0;i<dffY.length;i++) dffY[i]=dX[i];
    const dln2Y=ffnB(dffY,c.ff,l,T); lnB(dln2Y,c.ln2,P[p+'ln2g'],G[p+'ln2g'],G[p+'ln2b'],dX1,T);
    const dX0=new ARR(T*Dm); for(let i=0;i<dX0.length;i++) dX0[i]=dX1[i];
    const dmhaY=new ARR(T*Dm); for(let i=0;i<dmhaY.length;i++) dmhaY[i]=dX1[i];
    const dln1Y=mhaB(dmhaY,c.mha,l,T); lnB(dln1Y,c.ln1,P[p+'ln1g'],G[p+'ln1g'],G[p+'ln1b'],dX0,T);
    dX=dX0; }
  for(let t=0;t<T;t++) for(let d=0;d<Dm;d++){ G.E[tokens[t]*Dm+d]+=dX[t*Dm+d]; G.Pos[t*Dm+d]+=dX[t*Dm+d]; }
  return loss/Math.max(1,cnt); }

// ---------- data ----------
function rebuildData(nDialogues, keepVocab){
  const active=POOL.slice(0,nDialogues);
  const nVal=Math.max(3,Math.round(active.length*0.15));
  VAL_D=active.slice(0,nVal); TRAIN_D=active.slice(nVal);
  if(!keepVocab){
    const freq=new Map();
    for(const {T} of TRAIN_D) for(const w of T){ if(w===U||w===END||w===CUE.open||w===CUE.mid||w===CUE.end) continue;
      freq.set(w,(freq.get(w)||0)+1); }
    const words=[...freq.entries()].filter(([,c])=>c>=2).map(([w])=>w).sort();
    const vocab=[PAD_T,UNK,U,CUE.open,CUE.mid,CUE.end,END,...words];
    V=vocab.length; tok2id={}; id2tok=[]; vocab.forEach((t,i)=>{tok2id[t]=i; id2tok[i]=t;});
    PADID=tok2id[PAD_T]; ENDID=tok2id[END]; UNKID=tok2id[UNK];
  }
  const flat=(D)=>{ const ids=[],bot=[]; for(const {T,M} of D) for(let i=0;i<T.length;i++){ ids.push(tid(T[i])); bot.push(M[i]?1:0); }
    return {ids:Int32Array.from(ids), bot:Uint8Array.from(bot)}; };
  const tr=flat(TRAIN_D); trainStream=tr.ids; trainBot=tr.bot;
  const va=flat(VAL_D); valStream=va.ids; valBot=va.bot;
  baseLoss=Math.log(V);
}
function sampleWindow(stream,bot){
  const len=stream.length;
  for(let tries=0;tries<8;tries++){ const s=(Math.random()*(len-TT-1))|0;
    const tok=new Int32Array(TT), tgt=new Int32Array(TT), mask=new Uint8Array(TT); let any=false;
    for(let i=0;i<TT;i++){ tok[i]=stream[s+i]; tgt[i]=stream[s+i+1]; mask[i]=bot[s+i+1]; if(mask[i]) any=true; }
    if(any) return {tok,tgt,mask}; }
  const tok=new Int32Array(TT), tgt=new Int32Array(TT), mask=new Uint8Array(TT);
  for(let i=0;i<TT;i++){ tok[i]=stream[i]; tgt[i]=stream[i+1]; mask[i]=bot[i+1]; } return {tok,tgt,mask};
}
const LRATE=0.01, B1=0.9, B2=0.999, EPS=1e-8, CLIP=5;
function trainStep(){
  const B=4; let loss=0;
  for(const k of PKEYS) G[k].fill(0);
  for(let b=0;b<B;b++){ const ex=sampleWindow(trainStream,trainBot); loss+=lossGrad(ex.tok,ex.tgt,ex.mask); }
  const invB=1/B; let nsq=0;
  for(const k of PKEYS){ const g=G[k]; for(let i=0;i<g.length;i++){ g[i]*=invB; nsq+=g[i]*g[i]; } }
  const scale = nsq>CLIP*CLIP ? CLIP/Math.sqrt(nsq) : 1;
  adamT++; const bc1=1-Math.pow(B1,adamT), bc2=1-Math.pow(B2,adamT);
  for(const k of PKEYS){ const p=P[k],g=G[k],m=M[k],v=Vd[k];
    for(let i=0;i<p.length;i++){ const gi=g[i]*scale; m[i]=B1*m[i]+(1-B1)*gi; v[i]=B2*v[i]+(1-B2)*gi*gi;
      p[i]-=LRATE*(m[i]/bc1)/(Math.sqrt(v[i]/bc2)+EPS); } }
  steps++; lastLoss=loss/B;
}
function evalVal(){
  if(!valStream||valStream.length<TT+2) return {acc:0,conf:0};
  let correct=0, conf=0, cnt=0;
  for(let n=0;n<24;n++){ const ex=sampleWindow(valStream,valBot); const f=forward(ex.tok);
    for(let t=0;t<TT;t++){ if(!ex.mask[t]) continue; cnt++;
      let mx=-1e30,arg=0; for(let r=0;r<V;r++){ const lg=f.logits[t*V+r]; if(lg>mx){mx=lg;arg=r;} }
      let s=0; for(let r=0;r<V;r++) s+=Math.exp(f.logits[t*V+r]-mx);
      if(arg===ex.tgt[t]) correct++; conf+=1/s /*=exp(0)/s = top prob*/; } }
  return cnt? {acc:correct/cnt, conf:conf/cnt} : {acc:0,conf:0};
}

// ---------- generation (autoregressive) ----------
function softrow(logits,off,temp){ const o=new Float64Array(V); let mx=-1e30,t=temp||1;
  for(let r=0;r<V;r++){ o[r]=logits[off+r]/t; if(o[r]>mx)mx=o[r]; }
  let s=0; for(let r=0;r<V;r++){ o[r]=Math.exp(o[r]-mx); s+=o[r]; }
  for(let r=0;r<V;r++) o[r]/=s; return o; }
function sampleId(p){ let r=Math.random(),k=0; while(r>0&&k<V){ r-=p[k]; if(r>0)k++; } return Math.min(k,V-1); }
const TOPK=40, TOPP=0.92;
// top-k + top-p (nucleus) filtering: keep only the smallest set of most-likely tokens covering
// TOPP of the probability (capped at TOPK), drop the long tail of junk, then renormalize. Crisper text.
function nucleus(p){
  const idx=Array.from(p.keys()).sort((a,b)=>p[b]-p[a]);
  const out=new Float64Array(p.length); let cum=0, n=0;
  for(const i of idx){ out[i]=p[i]; cum+=p[i]; n++; if(n>=TOPK || cum>=TOPP) break; }
  let s=0; for(let i=0;i<out.length;i++) s+=out[i];
  if(s>0) for(let i=0;i<out.length;i++) out[i]/=s;
  return out;
}
function generate(seedIds,temp,repPen){
  const ids=seedIds.slice(); const newIds=[], outToks=[]; const counts=new Float64Array(V); let ps=0,n=0;
  for(let step=0; step<20; step++){
    const L=Math.min(ids.length,TT); const inp=ids.slice(ids.length-L);
    const f=forward(inp); const off=(L-1)*V;
    const baseP=softrow(f.logits,off,1);
    let logr=new Float64Array(V); for(let r=0;r<V;r++) logr[r]=f.logits[off+r]-(repPen>0?repPen*counts[r]:0);
    const p=softrow(logr,0,temp);
    if(step===0 && p[ENDID]>0){ const keep=1-p[ENDID]; p[ENDID]=0; if(keep>0) for(let r=0;r<V;r++) p[r]/=keep; }
    const k=sampleId(nucleus(p)); if(k===ENDID) break;   // top-k/top-p trims the junk tail before sampling
    ids.push(k); newIds.push(k); counts[k]++; ps+=baseP[k]; n++;
    const t=id2tok[k]; if(t!==UNK&&t!==U&&t!==CUE.open&&t!==CUE.mid&&t!==CUE.end) outToks.push(t);
  }
  return { text: outToks.join(" ").replace(/ ([,.!?])/g,"$1").trim(), conf:n?ps/n:0, newIds };
}
function tooSimilar(a,list){ const na=a.toLowerCase().trim(); if(!na) return false;
  for(const b of list){ const nb=b.toLowerCase().trim(); if(na===nb) return true;
    const A=new Set(na.split(/\s+/)), B=new Set(nb.split(/\s+/)); let inter=0; A.forEach(w=>{if(B.has(w))inter++;});
    if(inter/((A.size+B.size-inter)||1)>0.7) return true; } return false; }
function respond(seedIds,temp,anti,avoid){ const repPen=anti*1.5, tries=anti>0.1?5:1; let best=null;
  for(let t=0;t<tries;t++){ const res=generate(seedIds,temp*(1+0.3*t),repPen);
    if(!tooSimilar(res.text,avoid||[])) return res; best=res; } return best; }
function farewell(t){ return /\b(bye|goodbye|see ya|see you|later|take care|got to go|gotta go|catch you|cya|my stop|this is me)\b/i.test(t); }
function pickCue(text){ return botTurns===0 ? CUE.open : (farewell(text)?CUE.end:CUE.mid); }

// ---------- UI ----------
const $=id=>document.getElementById(id);
let lastSnap=0, autoStopped=false;
const cueSetIds=()=> new Set([tok2id[CUE.open],tok2id[CUE.mid],tok2id[CUE.end]]);
// decode a token slice to plain reply text (drop markers/cues)
function decodeText(ids){ const out=[];
  for(const id of ids){ const t=id2tok[id];
    if(t===UNK) out.push('?'); else if(t===U||t===END||t===CUE.open||t===CUE.mid||t===CUE.end) continue; else out.push(t); }
  return out.join(' ').replace(/ ([,.!?])/g,'$1').trim(); }
// decode a token slice to a readable conversation (you: / ai: lines)
function decodeConvo(ids){ let s='', cur='';
  for(const id of ids){ const t=id2tok[id];
    if(t===U){ if(cur) s+=cur.trim()+'\n'; cur='you: '; }
    else if(t===CUE.open||t===CUE.mid||t===CUE.end){ if(cur) s+=cur.trim()+'\n'; cur='ai: '; }
    else if(t===END){ if(cur) s+=cur.trim()+'\n'; cur=''; }
    else if(t===UNK){ cur+='? '; } else cur+=t+' '; }
  if(cur) s+=cur.trim();
  return s.replace(/ ([,.!?])/g,'$1'); }

// every 10 steps: freeze one real training example, show input/expected/reply, base the stats on it
function snapshot(){
  const cues=cueSetIds(); let ex=null, cueAt=-1;
  for(let tries=0; tries<14; tries++){ const w=sampleWindow(trainStream,trainBot); let c=-1;
    for(let i=0;i<TT-1;i++) if(cues.has(w.tok[i]) && w.mask[i]) c=i;   // last cue that begins a bot reply
    if(c>=0){ ex=w; cueAt=c; break; } }
  if(!ex) return;
  // stats on THIS example (over its masked bot positions)
  const f=forward(ex.tok); let loss=0, conf=0, cnt=0;
  for(let t=0;t<TT;t++){ if(!ex.mask[t]) continue; cnt++;
    let mx=-1e30; for(let r=0;r<V;r++) if(f.logits[t*V+r]>mx)mx=f.logits[t*V+r];
    let s=0; for(let r=0;r<V;r++) s+=Math.exp(f.logits[t*V+r]-mx);
    loss+=-(f.logits[t*V+ex.tgt[t]]-mx-Math.log(s)); conf+=1/s; }
  loss/=Math.max(1,cnt); conf/=Math.max(1,cnt);
  // a held-out example for the "generalized" meter (same cadence)
  let gacc=0; if(valStream && valStream.length>=TT+2){ const v=sampleWindow(valStream,valBot); const vf=forward(v.tok);
    let c=0,n=0; for(let t=0;t<TT;t++){ if(!v.mask[t]) continue; n++; let mx=-1e30,arg=0;
      for(let r=0;r<V;r++){ const lg=vf.logits[t*V+r]; if(lg>mx){mx=lg;arg=r;} } if(arg===v.tgt[t]) c++; } gacc=n?c/n:0; }
  // the three windows
  const prefix=Array.from(ex.tok.slice(0,cueAt+1));
  const exp=[]; for(let i=cueAt+1;i<TT;i++){ if(ex.tok[i]===ENDID) break; exp.push(ex.tok[i]); }
  $('snapIn').textContent  = decodeConvo(prefix);
  $('snapExp').textContent = decodeText(exp) || '(end of turn)';
  $('snapAi').textContent  = generate(prefix,0.25,0).text || '(…)';
  // meters from this example
  $('loss').textContent=loss.toFixed(3);
  const mem=Math.max(0,Math.min(1,(baseLoss-loss)/baseLoss));
  $('barfill').style.width=(mem*100)+'%';  $('skill').textContent=(mem*100).toFixed(0)+'%';
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
  TT=parseInt($('ksize').value,10); Dm=parseInt($('hsize').value,10);
  NH=parseInt($('heads').value,10); NL=parseInt($('layers').value,10); Dff=Dm*2;
  if(Dm%NH!==0) NH=1;                                  // heads must divide width
  const sp=$('speed'); if(Dm>=64||NL>=3||TT>=64){ sp.min='0.25'; sp.step='0.25'; if(+sp.value>4) sp.value='2'; }
  else { sp.min='1'; sp.step='1'; if(+sp.value<1) sp.value='4'; }
  rebuildData(parseInt($('dsize').value,10)); fresh(); iterAcc=0;
  steps=0; lastLoss=0; running=false; recent.length=0; convoIds=[]; botTurns=0; lastV={acc:0,conf:0}; autoStopped=false;
  { const e=$('autostop'); if(e) e.textContent=''; }
  $('train').textContent='▶ Train'; $('steps').textContent=0; $('loss').textContent='—';
  $('barfill').style.width=0; $('vbarfill').style.width=0; $('cbarfill').style.width=0;
  $('skill').textContent='0%'; $('vskill').textContent='0%'; $('cskill').textContent='0%';
  lastSnap=0; for(const id of ['snapIn','snapExp','snapAi']){ const e=$(id); if(e) e.textContent='…'; }
  if($('chat')) $('chat').innerHTML='';
  $('split').innerHTML='vocab <b>'+V+'</b> · '+Dm+'d · <b>'+NH+'</b> heads · <b>'+NL+'</b> layers · '+TT+' ctx';
}
function send(){ const text=$('say').value.trim(); if(!text) return;
  const temp=(+$('temp').value)/100, anti=(+$('rep').value)/100; const cue=pickCue(text);
  convoIds.push(tid(U)); for(const w of tokensOf(text.toLowerCase())) convoIds.push(tid(w));
  convoIds.push(ENDID); convoIds.push(tid(cue));
  const res=respond(convoIds,temp,anti,recent); const reply=(res&&res.text)||"(still learning…)";
  if(res){ for(const k of res.newIds) convoIds.push(k); convoIds.push(ENDID); botTurns++; }
  if(convoIds.length>TT*3) convoIds=convoIds.slice(-TT*3);
  if(res&&res.text){ recent.push(res.text); if(recent.length>5) recent.shift(); }
  const c=res?Math.round(res.conf*100):0; const chat=$('chat');
  chat.innerHTML+=`<div class="msg"><span class="you">you ▸</span> ${text}</div>`+
    `<div class="msg"><span class="bot">ai  ▸</span> ${reply} <span class="tag">· ${cueLabel[cue]}, confidence ${c}%</span></div>`;
  chat.scrollTop=chat.scrollHeight; $('say').value=''; }

function clearChat(){ convoIds=[]; botTurns=0; recent.length=0; if($('chat')) $('chat').innerHTML=''; }  // new conversation, same model

if (IN_BROWSER) {
  $('train').onclick=()=>{ running=!running; $('train').textContent=running?'⏸ Pause':'▶ Train'; };
  $('reset').onclick=reinit;
  for(const id of ['hsize','ksize','dsize','heads','layers']) $(id).onchange=reinit;
  $('send').onclick=send; $('say').addEventListener('keydown',e=>{ if(e.key==='Enter') send(); });
  $('newchat').onclick=clearChat;
  const q=new URLSearchParams(location.search);                 // apply settings passed in the link
  q.forEach((v,k)=>{ const el=document.getElementById(k); if(el && 'value' in el) el.value=v; });
  reinit();
  if(q.get('run')){ running=true; $('train').textContent='⏸ Pause'; }   // auto-start if asked
  loop();
}
if (typeof module !== 'undefined') {
  module.exports = { setCfg:(tt,dm,nh,nl)=>{TT=tt;Dm=dm;NH=nh;NL=nl;Dff=dm*2;}, rebuildData, fresh, trainStep,
    generate, seedHello:()=>[tid(U),tid("hello"),ENDID,tid(CUE.open)], info:()=>({V,TT,Dm,NH,NL,steps,lastLoss}) };
}
