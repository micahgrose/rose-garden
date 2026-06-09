const canvas = document.getElementById("gameCanvas");
const ctx    = canvas.getContext("2d");

canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    if(!editorOpen && !gameStarted) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
});

// ── Classes ────────────────────────────────────────────
class Player {
    constructor(x, y){
        this.x = x; this.y = y;
        this.width = 50; this.height = 50;
        this.velocity = {x:0, y:0};
        this.stretchTarget = {width:45, height:60};
        this.stretchSpeed  = 0.2;
        this.eyeSize       = {width:10, height:15};
        this.eyePaddingR   = {x:10, y:10};
        this.eyePaddingL   = {x:30, y:10};
        this.pupilSize     = {width:5, height:5};
        this.pupilPadding  = {x:2.5, y:5};
    }
}
class Platform { constructor(x,y,w,h){ this.x=x; this.y=y; this.width=w; this.height=h; } }
class JumpPad {
    constructor(x, y, strength=25){
        this.x=x; this.y=y; this.width=50; this.height=10; this.strength=strength;
        this.animate=false; this.stickHeight=20; this.stickTargetHeight=30;
        this.targetY=y-10; this.speed=0.9;
    }
}

class PlatformParticle {
    constructor(c){ this.x=player.x+(Math.random()*(player.height+15)-7.5); this.y=player.y+player.height; this.size=Math.random()*5+5; this.direction=(this.x>player.x+player.width/2)?1:-1; this.classifier=c; this.lifeSpan=Math.random()*300+200; this.dead=false; }
}
class BoostParticle {
    constructor(c){ this.x=player.x+player.width+(Math.random()*10)-5; this.y=player.y+player.height+(Math.random()*10)-5; this.size=Math.random()*5+5; this.speed=Math.random()*2+1; this.direction=Math.sign(player.velocity.x); this.classifier=c; this.lifeSpan=Math.random()*1500+500; this.dead=false; this.rising=true; }
}
class JumpParticle {
    constructor(c){ this.x=player.x+Math.random()*player.width; this.y=player.y+player.height; this.size=Math.random()*5+5; this.velocity={x:Math.random()*3,y:(Math.random()*-7.5)-12.5}; this.gravity=0.5; this.direction=(this.x>player.x+player.width/2)?1:-1; this.classifier=c; this.lifeSpan=Math.random()*900+500; this.dead=false; }
}
class FinishParticle {
    constructor(x,y){
        this.x=x; this.y=y;
        const a=Math.random()*Math.PI*2, spd=Math.random()*9+3;
        this.vx=Math.cos(a)*spd; this.vy=Math.sin(a)*spd-5;
        this.gravity=0.3; this.size=Math.random()*9+3;
        this.life=1; this.decay=Math.random()*0.018+0.012;
        this.rotation=Math.random()*Math.PI*2; this.rotSpeed=(Math.random()-0.5)*0.18;
        const cols=['#c0394b','#e05070','#ffffff','#f0a0b0','#ff6080','#ffd0d8','#ff3355'];
        this.color=cols[Math.floor(Math.random()*cols.length)];
    }
}
class DeathParticle {
    constructor(x,y){
        this.x=x; this.y=y;
        const a=Math.random()*Math.PI*2, spd=Math.random()*7+2;
        this.vx=Math.cos(a)*spd; this.vy=Math.sin(a)*spd-3;
        this.gravity=0.35; this.size=Math.random()*7+2;
        this.life=1; this.decay=Math.random()*0.025+0.015;
        this.rotation=Math.random()*Math.PI*2; this.rotSpeed=(Math.random()-0.5)*0.2;
        const cols=['#cc2222','#ee4444','#2244cc','#4466ee','#1133aa','#ffffff'];
        this.color=cols[Math.floor(Math.random()*cols.length)];
    }
}
class SwitchParticle {
    constructor(x,y){
        this.x=x; this.y=y;
        const a=Math.random()*Math.PI*2, spd=Math.random()*5+2;
        this.vx=Math.cos(a)*spd; this.vy=Math.sin(a)*spd-4;
        this.gravity=0.25; this.size=Math.random()*6+2;
        this.life=1; this.decay=Math.random()*0.025+0.015;
        this.rotation=Math.random()*Math.PI*2; this.rotSpeed=(Math.random()-0.5)*0.15;
        const cols=['#44ddff','#88eeff','#ffffff','#22aacc','#aaffff'];
        this.color=cols[Math.floor(Math.random()*cols.length)];
    }
}

// ── Game state ─────────────────────────────────────────
let startPos  = null, player = null, platforms = [], jumpPads = [];
let spikes = [], sawblades = [], movingPlatforms = [], onOffBlocks = [], onOffSwitches = [], orbitSaws = [];
let onOffState = false, deathCooldown = 0;
let finish = null, levelCompleted = false;
let currentLevelOrder = null;

let gravity = 0.5;
const gravityMult=1.065, gravityFloor=5;
let speed=5;
const jumpStrength=15, friction=0.8;
const maxVelocity={x:10,y:30};

let grounded=false, wasGrounded=[false,false,false,false];
let clampLeft=false, clampRight=false, ceiling=false, jumped=false;

const world   = {width:5000, height:5000};
const camera  = {x:0, y:0, width:canvas.width, height:canvas.height};
const cameraSpeed = 0.075;

let platformParticles=[], boostParticles=[], jumpParticles=[], finishParticles=[], deathParticles=[], switchParticles=[];
const platformParticleCount=50, boostParticleCount=50, jumpParticleCount=20;
let boosting=false, boostReady=true, doBoostParticle=false;
const boostResetTime=500;
let jumpHit=false;
let classifiersInUse={platform:[],boost:[],jump:[]};

// ── Auth / Progress ────────────────────────────────────
let authToken       = localStorage.getItem('rg_token') || null;
let isAdmin         = false;
let completedOrders = [];
let allLevels       = [];

async function loadLevels(){ try{ const r=await fetch('/api/ollie/levels'); allLevels=await r.json(); }catch{ allLevels=[]; } }
async function loadProgress(){ if(!authToken){completedOrders=[];return;} try{ const r=await fetch('/api/ollie/progress',{headers:{Authorization:`Bearer ${authToken}`}}); completedOrders=(await r.json()).completedOrders||[]; }catch{ completedOrders=[]; } }
async function markLevelComplete(order){ if(!authToken||completedOrders.includes(order))return; completedOrders.push(order); try{ await fetch(`/api/ollie/progress/${order}`,{method:'POST',headers:{Authorization:`Bearer ${authToken}`}}); }catch{} }
function checkAdmin(){
    if(!authToken) return;
    try {
        const payload = JSON.parse(atob(authToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        if(payload.admin === true){
            isAdmin = true;
            document.getElementById('editorBtn').classList.remove('hidden');
        }
    } catch {}
}

// ── Game loop ──────────────────────────────────────────
let animFrameId=null, gameStarted=false;

function gameLoop(){
    camera.width=canvas.width; camera.height=canvas.height;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    movePlayer(); moveCamera();
    if(deathCooldown>0) deathCooldown--;
    updateMovingPlatforms(); updateSaws(); updateOrbitSaws();
    wasGrounded[3]=wasGrounded[2]; wasGrounded[2]=wasGrounded[1]; wasGrounded[1]=wasGrounded[0]; wasGrounded[0]=grounded;
    checkJumpPad(); checkCollision(); updateStretch(); updateEyePos();
    if(grounded){resetGravity(); jumped=false;}
    if(ceiling){player.velocity.y=0;}
    checkSpikes(); checkSaws(); checkSwitches(); checkOrbitSaws();
    drawBackground(); handleParticles();
    drawMovingPlatforms(); drawOnOffBlocks(); drawPlatforms(); drawJumpPads(); drawSpikes(); drawSaws(); drawOrbitSaws(); drawSwitches();
    drawPlayer();
    drawFinish(); checkFinish(); drawFinishParticles();
    drawDeathParticles(); drawSwitchParticles();
    animFrameId=requestAnimationFrame(gameLoop);
}

// ── Input ──────────────────────────────────────────────
let keys=[];
document.addEventListener("keydown", e => {
    if(!keys.includes(e.key)) keys.push(e.key);

    const inInput = e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT';

    // Editor space pan
    if(e.code==='Space' && editorOpen && edMode==='edit' && !inInput){ e.preventDefault(); edSpaceHeld=true; canvas.style.cursor='grab'; }

    // Delete selected in editor
    if(e.key==='Delete' && editorOpen && edMode==='edit' && !inInput){
        if(edSelected){ edDeleteSelected(); }
    }

    // Escape
    if(e.key==='Escape'){
        if(editorOpen && edMode==='playtest'){ exitPlayTest(); return; }
        if(gameStarted && !editorOpen){ cancelAnimationFrame(animFrameId); animFrameId=null; document.getElementById('gameHUD').classList.add('hidden'); menu.classList.remove('hidden'); }
    }

    // Editor tool hotkeys
    if(editorOpen && edMode==='edit' && !inInput){
        if(e.key==='s'||e.key==='S') setTool('select');
        if(e.key==='p'||e.key==='P') setTool('platform');
        if(e.key==='j'||e.key==='J') setTool('jumppad');
        if(e.key==='r'||e.key==='R'){ if(edTool==='select'&&edSelected) rotateSelected(); else setTool('spawn'); }
        if(e.key==='x'||e.key==='X') setTool('delete');
        if(e.key==='f'||e.key==='F') setTool('finish');
        if(e.key==='k'||e.key==='K') setTool('spike');
        if(e.key==='w'||e.key==='W') setTool('saw');
        if(e.key==='m'||e.key==='M') setTool('mplatform');
        if(e.key==='t'||e.key==='T') setTool('onoff');
        if(e.key==='h'||e.key==='H') setTool('switch');
        if(e.key==='b'||e.key==='B') setTool('orbitsaw');
    }
});
document.addEventListener("keyup", e => {
    keys=keys.filter(k=>k!==e.key);
    if(e.code==='Space'){ edSpaceHeld=false; if(editorOpen&&edMode==='edit') canvas.style.cursor='crosshair'; }
});

// ── Movement ───────────────────────────────────────────
function movePlayer(){
    if(deathCooldown>0){ player.velocity={x:0,y:0}; gravity=0.5; return; }
    if(!levelCompleted){
        GORIGHT: if(keys.includes("ArrowRight")||keys.includes("d")){ player.pupilPadding.x=5; player.eyePaddingR.x=15; player.eyePaddingL.x=35; if(clampRight)break GORIGHT; player.velocity.x+=speed; }
        GOLEFT:  if(keys.includes("ArrowLeft") ||keys.includes("a")){ player.pupilPadding.x=0; player.eyePaddingR.x=5;  player.eyePaddingL.x=25; if(clampLeft) break GOLEFT;  player.velocity.x-=speed; }
        if((keys.includes("ArrowUp")||keys.includes("w"))&&(grounded||wasGrounded.includes(true))){ player.velocity.y=-jumpStrength; jumped=true; }
        else if(!keys.includes("ArrowUp")&&!keys.includes("w")&&!grounded&&player.velocity.y<0&&jumped){ player.velocity.y*=0.72; }
        if(keys.includes(" ")&&(keys.includes("ArrowRight")||keys.includes("d")||keys.includes("ArrowLeft")||keys.includes("a"))&&!boosting&&boostReady){
            if(clampRight&&(keys.includes("ArrowRight")||keys.includes("d")))return;
            if(clampLeft &&(keys.includes("ArrowLeft") ||keys.includes("a")))return;
            maxVelocity.x=30; player.velocity.x*=1.75; boosting=true; boostReady=false; doBoostParticle=true;
            setTimeout(()=>{ maxVelocity.x=10; boosting=false; setTimeout(()=>{boostReady=true;},boostResetTime); },150);
        }
    }
    if(!grounded){ player.velocity.y+=gravity; if(gravity<gravityFloor){gravity*=gravityMult;}else{gravity=gravityFloor;} }
    if(player.velocity.y>maxVelocity.y)  player.velocity.y=maxVelocity.y;
    if(player.velocity.x>maxVelocity.x)  player.velocity.x=maxVelocity.x;
    if(player.velocity.x<-maxVelocity.x) player.velocity.x=-maxVelocity.x;
    if(!boosting) player.velocity.x*=friction;
    player.x+=player.velocity.x; player.y+=player.velocity.y;
    if(player.y>world.height+500){ player.x=startPos.x; player.y=startPos.y; player.velocity={x:0,y:0}; gravity=0.5; speed=5;}
}

// ── Camera ─────────────────────────────────────────────
function snapCamera(){
    const cx=player.x+player.width/2, cy=player.y+player.height/2;
    const w=canvas.width, h=canvas.height;
    camera.x=cx-w/2; camera.y=Math.max(0,Math.min(world.height-h,cy-h/2));
}
function moveCamera(){
    if(deathCooldown>0) return;
    const cx=player.x+player.width/2, cy=player.y+player.height/2;
    const tx=cx-camera.width/2, ty=Math.max(0,Math.min(world.height-camera.height,cy-camera.height/2));
    camera.x+=(tx-camera.x)*cameraSpeed; camera.y+=(ty-camera.y)*cameraSpeed;
}

// ── Collision ──────────────────────────────────────────
function resolveAABB(p){
    if(player.x+player.width<=p.x||player.x>=p.x+p.width)return;
    if(player.y+player.height<=p.y||player.y>=p.y+p.height)return;
    const ox=Math.min(player.x+player.width-p.x, p.x+p.width-player.x);
    const oy=Math.min(player.y+player.height-p.y, p.y+p.height-player.y);
    if(ox>oy){
        if(player.y+player.height/2<p.y+p.height/2){player.y-=oy; grounded=true;}
        else{player.y+=oy; ceiling=true;}
    }else{
        if(player.x+player.width/2<p.x+p.width/2){player.x-=ox; clampRight=true;}
        else{player.x+=ox; clampLeft=true;}
    }
}
function checkCollision(){
    if(deathCooldown>0)return;
    grounded=false; clampLeft=false; clampRight=false; ceiling=false;
    for(const p of platforms) resolveAABB(p);
    for(const mp of movingPlatforms) resolveAABB({x:mp._cx,y:mp._cy,width:mp.width,height:mp.height});
    for(const b of onOffBlocks) if(blockIsOn(b)) resolveAABB(b);
}
function blockIsOn(b){ return (b.startsOn!==false) ? !onOffState : onOffState; }

function checkJumpPad(){
    for(let pad of jumpPads){
        if(player.y+player.height>=pad.y&&player.y<pad.y+pad.height&&player.x+player.width>pad.x&&player.x<pad.x+pad.width){
            resetGravity(); jumped=false; pad.animate=true; player.velocity.y=-pad.strength; player.y=pad.y-player.height; jumpHit=true; return true;
        }
    }
    return false;
}

// ── Drawing ────────────────────────────────────────────
const backgroundRects=[];
function createBackground(){ backgroundRects.length=0; for(let i=0;i<50;i++){const s=Math.random()*300+200; backgroundRects.push({x:Math.random()*world.width,y:Math.random()*world.height,width:s,height:s});} }

function drawBackground(){
    ctx.fillStyle="rgb(195,245,195)"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="rgb(130,230,130)"; ctx.globalAlpha=0.4;
    for(let r of backgroundRects){ const sx=r.x-camera.x*0.5,sy=r.y-camera.y*0.5; ctx.save(); ctx.translate(sx+r.width/2,sy+r.height/2); ctx.rotate(Math.PI/4); ctx.fillRect(-r.width/2,-r.height/2,r.width,r.height); ctx.restore(); }
    ctx.globalAlpha=1;
}

function drawPlayer(){
    if(deathCooldown>0) return;
    ctx.fillStyle="blue"; ctx.strokeStyle="rgb(50,50,200)"; ctx.lineWidth=1;
    ctx.fillRect(player.x-camera.x,player.y-camera.y,player.width,player.height);
    ctx.strokeRect(player.x-camera.x,player.y-camera.y,player.width,player.height);
    ctx.fillStyle="white";
    ctx.fillRect(player.x+player.eyePaddingR.x-camera.x,player.y+player.eyePaddingR.y-camera.y,player.eyeSize.width,player.eyeSize.height);
    ctx.fillRect(player.x+player.eyePaddingL.x-camera.x,player.y+player.eyePaddingL.y-camera.y,player.eyeSize.width,player.eyeSize.height);
    ctx.fillStyle="black";
    ctx.fillRect(player.x+player.eyePaddingR.x+player.pupilPadding.x-camera.x,player.y+player.eyePaddingR.y+player.pupilPadding.y-camera.y,player.pupilSize.width,player.pupilSize.height);
    ctx.fillRect(player.x+player.eyePaddingL.x+player.pupilPadding.x-camera.x,player.y+player.eyePaddingL.y+player.pupilPadding.y-camera.y,player.pupilSize.width,player.pupilSize.height);
    ctx.globalAlpha=1;
}

function updateStretch(){
    if(!grounded&&!wasGrounded[0]&&!wasGrounded[1]){ player.width+=(player.stretchTarget.width-player.width)*player.stretchSpeed; player.height+=(player.stretchTarget.height-player.height)*player.stretchSpeed; }
    else{ const b=player.y+player.height; player.width+=(50-player.width)*player.stretchSpeed; player.height+=(50-player.height)*player.stretchSpeed; player.y=b-player.height; if(Math.abs(player.width-50)<1)player.width=50; if(Math.abs(player.height-50)<1)player.height=50; }
}
function updateEyePos(){ const t=player.velocity.y>0?10:player.velocity.y<0?0:5; player.pupilPadding.y+=(t-player.pupilPadding.y)*0.1; }

function drawPlatforms(){
    ctx.fillStyle="gray"; ctx.strokeStyle="gray"; ctx.lineWidth=2;
    for(let p of platforms){ ctx.strokeRect(p.x-camera.x,p.y-camera.y,p.width,p.height); ctx.fillRect(p.x-camera.x,p.y-camera.y,p.width,p.height); }
}

function drawJumpPads(){
    ctx.fillStyle="rgb(255,246,113)"; ctx.strokeStyle="rgb(57,57,57)"; ctx.lineWidth=2;
    for(let pad of jumpPads){
        if(pad.animate){ pad.y+=(pad.targetY-pad.y)*pad.speed; pad.stickHeight+=(pad.stickTargetHeight-pad.stickHeight)*pad.speed; if(Math.abs(pad.y-pad.targetY)<1){pad.animate=false;pad.y=pad.targetY;pad.stickHeight=pad.stickTargetHeight;} }
        else{ pad.speed=0.5; pad.y+=((pad.targetY+10)-pad.y)*pad.speed; pad.stickHeight+=(20-pad.stickHeight)*pad.speed; if(Math.abs(pad.y-pad.targetY)<1){pad.y=pad.targetY+10;pad.stickHeight=20;pad.speed=0.9;} }
        ctx.beginPath(); ctx.roundRect(pad.x-camera.x,pad.y-camera.y,pad.width,pad.height,[10]); ctx.stroke();
        ctx.strokeRect(pad.x+20-camera.x,pad.y-camera.y,10,pad.stickHeight);
        ctx.beginPath(); ctx.roundRect(pad.x-camera.x,pad.y-camera.y,pad.width,pad.height,[10]); ctx.fill();
        ctx.fillRect(pad.x+20-camera.x,pad.y-camera.y,10,pad.stickHeight);
    }
}

// ── Moving platforms ───────────────────────────────────
function updateMovingPlatforms(){
    for(const mp of movingPlatforms){
        mp._t+=(mp._dir||1)*(mp.speed||1)*0.005;
        if(mp._t>=1){mp._t=1;mp._dir=-1;} if(mp._t<=0){mp._t=0;mp._dir=1;}
        mp._cx=mp.x+(mp.tx-mp.x)*mp._t; mp._cy=mp.y+(mp.ty-mp.y)*mp._t;
    }
}
function drawMovingPlatforms(){
    ctx.lineWidth=2;
    for(const mp of movingPlatforms){
        ctx.fillStyle='#5588cc'; ctx.strokeStyle='#3366aa';
        ctx.fillRect(mp._cx-camera.x,mp._cy-camera.y,mp.width,mp.height);
        ctx.strokeRect(mp._cx-camera.x,mp._cy-camera.y,mp.width,mp.height);
    }
}

// ── On/off blocks & switches ───────────────────────────
function drawOnOffBlocks(){
    for(const b of onOffBlocks){
        if(blockIsOn(b)){
            ctx.fillStyle='#e09030'; ctx.strokeStyle='#b87020'; ctx.lineWidth=2;
            ctx.fillRect(b.x-camera.x,b.y-camera.y,b.width,b.height);
            ctx.strokeRect(b.x-camera.x,b.y-camera.y,b.width,b.height);
        } else {
            ctx.strokeStyle='rgba(224,144,48,0.4)'; ctx.lineWidth=2;
            ctx.setLineDash([6,4]);
            ctx.strokeRect(b.x-camera.x,b.y-camera.y,b.width,b.height);
            ctx.setLineDash([]);
        }
    }
}
function drawSwitches(){
    for(const sw of onOffSwitches){
        ctx.fillStyle=onOffState?'#226688':'#44ddff';
        ctx.strokeStyle='#1a4455'; ctx.lineWidth=2;
        ctx.fillRect(sw.x-camera.x,sw.y-camera.y,25,25);
        ctx.strokeRect(sw.x-camera.x,sw.y-camera.y,25,25);
        ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.font='bold 14px sans-serif';
        ctx.textAlign='center'; ctx.fillText('!',sw.x+12-camera.x,sw.y+18-camera.y); ctx.textAlign='left';
    }
}
function checkSwitches(){
    for(const sw of onOffSwitches){
        const touching=player.x+player.width>sw.x&&player.x<sw.x+25&&player.y+player.height>sw.y&&player.y<sw.y+25;
        if(touching&&!sw._triggered){
            sw._triggered=true; onOffState=!onOffState;
            spawnSwitchParticles(sw.x+12,sw.y+12);
        }
        if(!touching) sw._triggered=false;
    }
}
function spawnSwitchParticles(x,y){ for(let i=0;i<30;i++) switchParticles.push(new SwitchParticle(x,y)); }
function drawSwitchParticles(){
    switchParticles=switchParticles.filter(p=>p.life>0);
    for(const p of switchParticles){
        p.vy+=p.gravity; p.x+=p.vx; p.y+=p.vy; p.life-=p.decay; p.rotation+=p.rotSpeed;
        ctx.save(); ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle=p.color;
        ctx.translate(p.x-camera.x,p.y-camera.y); ctx.rotate(p.rotation);
        ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size); ctx.restore();
    }
    ctx.globalAlpha=1;
}

// ── Spikes ─────────────────────────────────────────────
function drawSpikes(){
    ctx.fillStyle='#777'; ctx.strokeStyle='#444'; ctx.lineWidth=1;
    for(const sp of spikes){
        const tw=sp.width, th=sp.height||25;
        const bx=sp.x-camera.x, by=sp.y-camera.y;
        ctx.beginPath();
        if(sp.dir==='up'||!sp.dir){    ctx.moveTo(bx,by);ctx.lineTo(bx+tw/2,by-th);ctx.lineTo(bx+tw,by); }
        else if(sp.dir==='down'){       ctx.moveTo(bx,by);ctx.lineTo(bx+tw/2,by+th);ctx.lineTo(bx+tw,by); }
        else if(sp.dir==='right'){      ctx.moveTo(bx,by);ctx.lineTo(bx+th,by+tw/2);ctx.lineTo(bx,by+tw); }
        else if(sp.dir==='left'){       ctx.moveTo(bx+th,by);ctx.lineTo(bx,by+tw/2);ctx.lineTo(bx+th,by+tw); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
    }
}
function checkSpikes(){
    if(deathCooldown>0)return;
    for(const sp of spikes){
        const tw=sp.width, th=sp.height||25, dir=sp.dir||'up';
        let hx=sp.x, hy, hw, hh;
        if(dir==='up')        { hy=sp.y-th; hw=tw; hh=th; }
        else if(dir==='down') { hy=sp.y;    hw=tw; hh=th; }
        else                  { hy=sp.y;    hw=th; hh=tw; }
        if(player.x+player.width>hx&&player.x<hx+hw&&player.y+player.height>hy&&player.y<hy+hh) killPlayer();
    }
}

// ── Sawblades ──────────────────────────────────────────
function updateSaws(){ for(const s of sawblades) s._rot=(s._rot||0)+0.05; }
function drawSaws(){
    for(const s of sawblades){
        const sx=s.x-camera.x, sy=s.y-camera.y, r=s.radius||25, teeth=10;
        ctx.save(); ctx.translate(sx,sy); ctx.rotate(s._rot||0);
        ctx.fillStyle='#888'; ctx.strokeStyle='#444'; ctx.lineWidth=1.5;
        ctx.beginPath();
        for(let i=0;i<teeth*2;i++){
            const a=(i/(teeth*2))*Math.PI*2, rr=i%2===0?r:r*0.65;
            i===0?ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr):ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle='#555'; ctx.beginPath(); ctx.arc(0,0,r*0.22,0,Math.PI*2); ctx.fill();
        ctx.restore();
    }
}
function checkSaws(){
    if(deathCooldown>0)return;
    for(const s of sawblades){
        const dx=player.x+player.width/2-s.x, dy=player.y+player.height/2-s.y;
        if(Math.sqrt(dx*dx+dy*dy)<(s.radius||25)+18) killPlayer();
    }
}

// ── Orbit saws ─────────────────────────────────────────
function updateOrbitSaws(){ for(const s of orbitSaws) s._angle=(s._angle||0)+(s.speed||1)*0.03; }
function drawOrbitSaws(){
    for(const s of orbitSaws){
        const r=s.rodLen||100, sawR=s.sawRadius||20;
        const sawX=s.x+Math.cos(s._angle)*r, sawY=s.y+Math.sin(s._angle)*r;
        // Rod
        ctx.strokeStyle='#888'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(s.x-camera.x,s.y-camera.y); ctx.lineTo(sawX-camera.x,sawY-camera.y); ctx.stroke();
        // Pivot
        ctx.fillStyle='#555'; ctx.beginPath(); ctx.arc(s.x-camera.x,s.y-camera.y,5,0,Math.PI*2); ctx.fill();
        // Sawblade
        const teeth=8;
        ctx.save(); ctx.translate(sawX-camera.x,sawY-camera.y); ctx.rotate(s._angle*3);
        ctx.fillStyle='#888'; ctx.strokeStyle='#444'; ctx.lineWidth=1.5;
        ctx.beginPath();
        for(let i=0;i<teeth*2;i++){const a=(i/(teeth*2))*Math.PI*2,rr=i%2===0?sawR:sawR*0.65; i===0?ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr):ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle='#555'; ctx.beginPath(); ctx.arc(0,0,sawR*0.22,0,Math.PI*2); ctx.fill();
        ctx.restore();
    }
}
function checkOrbitSaws(){
    if(deathCooldown>0)return;
    for(const s of orbitSaws){
        const sawX=s.x+Math.cos(s._angle)*s.rodLen, sawY=s.y+Math.sin(s._angle)*s.rodLen;
        const dx=player.x+player.width/2-sawX, dy=player.y+player.height/2-sawY;
        if(Math.sqrt(dx*dx+dy*dy)<(s.sawRadius||20)+12) killPlayer();
    }
}

// ── Death ──────────────────────────────────────────────
function killPlayer(){
    if(deathCooldown>0)return;
    spawnDeathParticles();
    player.x=startPos.x; player.y=startPos.y;
    player.velocity={x:0,y:0}; gravity=0.5;
    deathCooldown=27;
}
function spawnDeathParticles(){
    const cx=player.x+player.width/2, cy=player.y+player.height/2;
    for(let i=0;i<45;i++) deathParticles.push(new DeathParticle(cx,cy));
}
function drawDeathParticles(){
    deathParticles=deathParticles.filter(p=>p.life>0);
    for(const p of deathParticles){
        p.vy+=p.gravity; p.x+=p.vx; p.y+=p.vy; p.life-=p.decay; p.rotation+=p.rotSpeed;
        ctx.save(); ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle=p.color;
        ctx.translate(p.x-camera.x,p.y-camera.y); ctx.rotate(p.rotation);
        ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size); ctx.restore();
    }
    ctx.globalAlpha=1;
}

function drawFinish(){
    if(!finish)return;
    const px=finish.x-camera.x, py=finish.y-camera.y;
    const poleH=65, flagW=45, flagH=28;
    // Pole
    ctx.strokeStyle='#c8c8c8'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px,py+poleH); ctx.stroke();
    // Flag
    ctx.fillStyle='#c0394b';
    ctx.fillRect(px,py,flagW,flagH);
    // Base circle
    ctx.fillStyle='rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(px,py+poleH,5,0,Math.PI*2); ctx.fill();
}

function checkFinish(){
    if(!finish||levelCompleted)return;
    if(player.x+player.width>finish.x-10&&player.x<finish.x+55&&player.y+player.height>finish.y&&player.y<finish.y+75){
        levelCompleted=true; markLevelComplete(currentLevelOrder);
        spawnFinishParticles();
        setTimeout(()=>{
            cancelAnimationFrame(animFrameId); animFrameId=null; gameStarted=false;
            document.getElementById('gameHUD').classList.add('hidden');
            const nextLvl=allLevels.find(l=>l.order===currentLevelOrder+1);
            if(nextLvl){ startLevel(nextLvl); }
            else{ menu.classList.remove('hidden'); }
        }, 600);
    }
}

function spawnFinishParticles(){
    const cx=finish.x, cy=finish.y+65;
    for(let i=0;i<70;i++) finishParticles.push(new FinishParticle(cx,cy));
}

function drawFinishParticles(){
    finishParticles=finishParticles.filter(p=>p.life>0);
    for(const p of finishParticles){
        p.vy+=p.gravity; p.x+=p.vx; p.y+=p.vy;
        p.life-=p.decay; p.rotation+=p.rotSpeed;
        ctx.save();
        ctx.globalAlpha=Math.max(0,p.life);
        ctx.fillStyle=p.color;
        ctx.translate(p.x-camera.x, p.y-camera.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
        ctx.restore();
    }
    ctx.globalAlpha=1;
}

// ── Particles ──────────────────────────────────────────
function handleParticles(){
    if(!wasGrounded.includes(true)&&grounded) makeParticles(classifiersInUse.platform,platformParticles,PlatformParticle,platformParticleCount);
    if(doBoostParticle){makeParticles(classifiersInUse.boost,boostParticles,BoostParticle,boostParticleCount);doBoostParticle=false;}
    if(jumpHit){makeParticles(classifiersInUse.jump,jumpParticles,JumpParticle,jumpParticleCount);jumpHit=false;}
    platformParticles=platformParticles.filter(p=>!p.dead);
    boostParticles   =boostParticles.filter(p=>!p.dead);
    jumpParticles    =jumpParticles.filter(p=>!p.dead);
    for(let p of platformParticles){p.x+=(Math.random()*1)*p.direction; p.y-=Math.random()*0.2+0.1;}
    for(let p of boostParticles){p.x-=p.speed*p.direction; p.y+=p.rising?-Math.random()*0.8:Math.random()*0.25;}
    for(let p of jumpParticles){p.velocity.y+=p.gravity; p.x+=p.velocity.x*p.direction; p.y+=p.velocity.y;}
    ctx.fillStyle='gray'; ctx.strokeStyle='darkgray'; ctx.lineWidth=1;
    for(let p of platformParticles){ctx.strokeRect(p.x-camera.x,p.y-camera.y,p.size,p.size);ctx.fillRect(p.x-camera.x,p.y-camera.y,p.size,p.size);}
    ctx.strokeStyle="rgb(210,210,210)"; ctx.fillStyle="rgb(245,245,245)"; ctx.lineWidth=2;
    for(let p of boostParticles){ctx.strokeRect(p.x-camera.x,p.y-camera.y,p.size,p.size);ctx.fillRect(p.x-camera.x,p.y-camera.y,p.size,p.size);}
    ctx.fillStyle='rgb(230,221,88)';
    for(let p of jumpParticles){ctx.fillRect(p.x-camera.x,p.y-camera.y,p.size,p.size);}
}

function makeParticles(cids,list,Type,count){
    let c=1; while(cids.includes(c))c++; cids.push(c);
    for(let i=0;i<count;i++)list.push(new Type(c));
    const batch=list.filter(p=>p.classifier===c);
    for(let p of batch){ setTimeout(()=>{if(Type===BoostParticle)p.rising=false; setTimeout(()=>{p.dead=true;},p.lifeSpan/2);},p.lifeSpan/2); }
    setTimeout(()=>{const i=cids.indexOf(c);if(i>-1)cids.splice(i,1);},5000);
}

// ── Helpers ────────────────────────────────────────────
function resetGravity(){ gravity=0.5; player.velocity.y=0; }

function startLevel(levelData){
    currentLevelOrder=levelData.order;
    startPos =levelData.startPos;
    player   =new Player(levelData.startPos.x, levelData.startPos.y);
    platforms      =(levelData.platforms      ||[]).map(p=>new Platform(p.x,p.y,p.width,p.height));
    jumpPads       =(levelData.jumpPads       ||[]).map(j=>new JumpPad(j.x,j.y,j.strength));
    spikes         =(levelData.spikes         ||[]).map(s=>({...s}));
    sawblades      =(levelData.sawblades      ||[]).map(s=>({...s,_rot:0}));
    movingPlatforms=(levelData.movingPlatforms||[]).map(p=>({...p,_t:0,_dir:1,_cx:p.x,_cy:p.y}));
    onOffBlocks    =(levelData.onOffBlocks    ||[]).map(b=>({...b}));
    onOffSwitches  =(levelData.onOffSwitches  ||[]).map(s=>({...s,_triggered:false}));
    orbitSaws      =(levelData.orbitSaws      ||[]).map(s=>({...s,_angle:Math.random()*Math.PI*2}));
    onOffState=false; deathCooldown=0;
    platformParticles=[]; boostParticles=[]; jumpParticles=[]; finishParticles=[]; deathParticles=[]; switchParticles=[];
    classifiersInUse={platform:[],boost:[],jump:[]};
    grounded=false; wasGrounded=[false,false,false,false];
    finish=levelData.finish?{...levelData.finish}:null; levelCompleted=false;
    if(backgroundRects.length===0) createBackground();
    document.getElementById('gameHUD').classList.remove('hidden');
    gameStarted=true;
    snapCamera();
    gameLoop();
}

function onLevelComplete(){ markLevelComplete(currentLevelOrder); }

// ── Level select ───────────────────────────────────────
function buildLevelGrid(){
    const grid=document.getElementById('levelGrid');
    grid.innerHTML='';
    if(allLevels.length===0){ grid.innerHTML='<span style="color:#555;font-size:0.9rem;">No levels yet.</span>'; return; }
    const maxUnlocked=completedOrders.length===0?1:Math.max(...completedOrders)+1;
    for(const lvl of allLevels){
        const btn=document.createElement('button'); btn.className='level-btn';
        const done=completedOrders.includes(lvl.order), unlocked=lvl.order<=maxUnlocked;
        if(done)      btn.classList.add('completed');
        if(!unlocked) btn.classList.add('locked');
        btn.innerHTML=`<span class="level-num">${lvl.order}</span>${lvl.name||''}${done?'<span class="level-check">✓</span>':''}`;
        if(unlocked){ btn.addEventListener('click',()=>{ levelSelect.classList.add('hidden'); cancelAnimationFrame(animFrameId); animFrameId=null; gameStarted=false; startLevel(lvl); }); }
        grid.appendChild(btn);
    }
}

// ── Menu wiring ────────────────────────────────────────
const menu            = document.getElementById('menu');
const levelSelect     = document.getElementById('levelSelect');
const controlsOverlay = document.getElementById('controlsOverlay');

document.getElementById('playBtn').addEventListener('click', async()=>{ menu.classList.add('hidden'); await loadLevels(); await loadProgress(); buildLevelGrid(); levelSelect.classList.remove('hidden'); });
document.getElementById('backFromSelect').addEventListener('click',()=>{ levelSelect.classList.add('hidden'); menu.classList.remove('hidden'); });
document.getElementById('controlsBtn').addEventListener('click',()=>controlsOverlay.classList.remove('hidden'));
document.getElementById('closeControlsBtn').addEventListener('click',()=>controlsOverlay.classList.add('hidden'));
document.getElementById('quitBtn').addEventListener('click',()=>{ window.location.href='/'; });
document.getElementById('pauseBtn').addEventListener('click',()=>{
    if(!gameStarted||editorOpen)return;
    cancelAnimationFrame(animFrameId); animFrameId=null; gameStarted=false;
    document.getElementById('gameHUD').classList.add('hidden');
    menu.classList.remove('hidden');
});
document.getElementById('restartBtn').addEventListener('click',()=>{
    if(!gameStarted||editorOpen)return;
    const lvl=allLevels.find(l=>l.order===currentLevelOrder); if(!lvl)return;
    cancelAnimationFrame(animFrameId); animFrameId=null; gameStarted=false;
    startLevel(lvl);
});
document.getElementById('editorBtn').addEventListener('click',()=>openEditor());

// ══════════════════════════════════════════════════════
// ── LEVEL EDITOR ──────────────────────────────────────
// ══════════════════════════════════════════════════════

let editorOpen  = false;
let edMode      = 'edit'; // 'edit' | 'playtest'
let edRaf       = null;

// Editor camera
let edZoom = 0.22;
let edCamX = 0;
let edCamY = 0;

// Tool state
let edTool      = 'select';
let edSpaceHeld = false;
let edPanning   = false;
let edPanStart  = {x:0,y:0};
let edPanOrigin = {x:0,y:0};

// Level data being edited
let edPlatforms      = [];
let edJumpPads       = [];
let edSpawn          = {x:250, y:4500};
let edFinish         = null;
let edSpikes         = [];
let edSawblades      = [];
let edMovingPlatforms= [];
let edOnOffBlocks    = [];
let edOnOffSwitches  = [];
let edOrbitSaws      = [];

// Selection + drag
let edSelected     = null;
let edDragging     = false;
let edDragHandle   = null;
let edDragStart    = {wx:0,wy:0};
let edDragOriginal = null;

// Drawing new platform
let edDrawing   = false;
let edDrawStart = {wx:0,wy:0};
let edGhostRect = null;

// Saved level identity
let edCurrentId = null;

const SNAP = 25;
const HS   = 8; // handle size in screen pixels
let edSawRadius = 25;

function snapV(v){ return Math.round(v/SNAP)*SNAP; }
function edSW(sx,sy){ return {x:(sx-edCamX)/edZoom, y:(sy-edCamY)/edZoom}; }
function edWS(wx,wy){ return {x:wx*edZoom+edCamX,   y:wy*edZoom+edCamY  }; }

// ── Editor draw ────────────────────────────────────────
function editorDrawFrame(){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // Dark outside-world border
    ctx.fillStyle='#071207';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.save();
    ctx.setTransform(edZoom,0,0,edZoom,edCamX,edCamY);

    // World fill — same green tint as body bg
    ctx.fillStyle='rgb(195,245,195)';
    ctx.fillRect(0,0,world.width,world.height);

    // Background decorative rects (no parallax)
    ctx.fillStyle='rgb(130,230,130)'; ctx.globalAlpha=0.35;
    for(let r of backgroundRects){ ctx.save(); ctx.translate(r.x+r.width/2,r.y+r.height/2); ctx.rotate(Math.PI/4); ctx.fillRect(-r.width/2,-r.height/2,r.width,r.height); ctx.restore(); }
    ctx.globalAlpha=1;

    // Grid
    if(edZoom>0.06){
        const a=Math.min(0.12,(edZoom-0.06)*1.5);
        ctx.strokeStyle=`rgba(0,0,0,${a})`; ctx.lineWidth=1/edZoom;
        for(let x=0;x<=world.width;x+=SNAP){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,world.height); ctx.stroke(); }
        for(let y=0;y<=world.height;y+=SNAP){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(world.width,y); ctx.stroke(); }
    }

    // World border
    ctx.strokeStyle='rgba(0,120,0,0.5)'; ctx.lineWidth=4/edZoom;
    ctx.strokeRect(0,0,world.width,world.height);

    // Platforms
    for(let i=0;i<edPlatforms.length;i++){
        const p=edPlatforms[i], sel=edSelected?.type==='platform'&&edSelected.index===i;
        ctx.fillStyle  =sel?'#7a7aaa':'#888';
        ctx.strokeStyle=sel?'#aaaaff':'#666';
        ctx.lineWidth=(sel?3:2)/edZoom;
        ctx.fillRect(p.x,p.y,p.width,p.height);
        ctx.strokeRect(p.x,p.y,p.width,p.height);
    }

    // Jump pads
    for(let i=0;i<edJumpPads.length;i++){
        const j=edJumpPads[i], sel=edSelected?.type==='jumppad'&&edSelected.index===i;
        ctx.fillStyle  ='rgb(255,246,113)';
        ctx.strokeStyle=sel?'#fff':'rgb(57,57,57)';
        ctx.lineWidth=(sel?3:2)/edZoom;
        ctx.beginPath(); ctx.roundRect(j.x,j.y,50,10,[10/edZoom]); ctx.fill(); ctx.stroke();
        ctx.fillRect(j.x+20,j.y,10,20); ctx.strokeRect(j.x+20,j.y,10,20);
    }

    // Spawn — draw as a ghost Ollie
    ctx.fillStyle  ='rgba(50,50,200,0.25)';
    ctx.strokeStyle='#4caf50'; ctx.lineWidth=3/edZoom;
    ctx.fillRect(edSpawn.x,edSpawn.y,50,50);
    ctx.strokeRect(edSpawn.x,edSpawn.y,50,50);
    ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.fillRect(edSpawn.x+10,edSpawn.y+10,10,15);
    ctx.fillRect(edSpawn.x+30,edSpawn.y+10,10,15);
    ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.fillRect(edSpawn.x+13,edSpawn.y+15,5,5);
    ctx.fillRect(edSpawn.x+33,edSpawn.y+15,5,5);

    // Moving platforms (editor)
    for(let i=0;i<edMovingPlatforms.length;i++){
        const mp=edMovingPlatforms[i], sel=edSelected?.type==='mplatform'&&edSelected.index===i;
        ctx.fillStyle=sel?'#6699dd':'#5588cc'; ctx.strokeStyle=sel?'#aaccff':'#3366aa'; ctx.lineWidth=(sel?3:2)/edZoom;
        ctx.fillRect(mp.x,mp.y,mp.width,mp.height); ctx.strokeRect(mp.x,mp.y,mp.width,mp.height);
        // Path line to target
        ctx.strokeStyle='rgba(100,160,255,0.5)'; ctx.lineWidth=1.5/edZoom; ctx.setLineDash([8/edZoom,4/edZoom]);
        ctx.beginPath(); ctx.moveTo(mp.x+mp.width/2,mp.y+mp.height/2); ctx.lineTo(mp.tx+mp.width/2,mp.ty+mp.height/2); ctx.stroke();
        ctx.setLineDash([]);
        // Ghost at target
        ctx.fillStyle='rgba(85,136,204,0.2)'; ctx.strokeStyle='rgba(100,160,255,0.6)'; ctx.lineWidth=1.5/edZoom;
        ctx.fillRect(mp.tx,mp.ty,mp.width,mp.height); ctx.strokeRect(mp.tx,mp.ty,mp.width,mp.height);
        // Endpoint handle
        const hs2=HS*1.5/edZoom;
        ctx.fillStyle=(edSelected?.type==='mplatform_end'&&edSelected.index===i)?'#aaccff':'#5599ff';
        ctx.strokeStyle='#223'; ctx.lineWidth=1/edZoom;
        ctx.beginPath(); ctx.arc(mp.tx+mp.width/2,mp.ty+mp.height/2,hs2,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }

    // On/off blocks (editor) — solid if startsOn, dashed outline if starts off
    for(let i=0;i<edOnOffBlocks.length;i++){
        const b=edOnOffBlocks[i], sel=edSelected?.type==='onoff'&&edSelected.index===i;
        ctx.lineWidth=(sel?3:2)/edZoom;
        if(b.startsOn!==false){
            ctx.fillStyle=sel?'#f0a840':'#e09030'; ctx.strokeStyle=sel?'#ffd070':'#b87020';
            ctx.fillRect(b.x,b.y,b.width,b.height); ctx.strokeRect(b.x,b.y,b.width,b.height);
        } else {
            ctx.strokeStyle=sel?'rgba(255,210,100,0.6)':'rgba(224,144,48,0.5)';
            ctx.setLineDash([8/edZoom,4/edZoom]);
            ctx.strokeRect(b.x,b.y,b.width,b.height);
            ctx.setLineDash([]);
        }
    }

    // Switches (editor)
    for(let i=0;i<edOnOffSwitches.length;i++){
        const sw=edOnOffSwitches[i], sel=edSelected?.type==='switch'&&edSelected.index===i;
        ctx.fillStyle=sel?'#88eeff':'#44ddff'; ctx.strokeStyle=sel?'#aaffff':'#1a4455'; ctx.lineWidth=(sel?2.5:1.5)/edZoom;
        ctx.fillRect(sw.x,sw.y,25,25); ctx.strokeRect(sw.x,sw.y,25,25);
        ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.font=`bold ${14/edZoom}px sans-serif`;
        ctx.textAlign='center'; ctx.fillText('!',sw.x+12.5,sw.y+18); ctx.textAlign='left';
    }

    // Spikes (editor)
    ctx.fillStyle='#777'; ctx.strokeStyle='#444'; ctx.lineWidth=1/edZoom;
    for(let i=0;i<edSpikes.length;i++){
        const sp=edSpikes[i], sel=edSelected?.type==='spike'&&edSelected.index===i;
        ctx.fillStyle=sel?'#aaa':'#777'; ctx.strokeStyle=sel?'#fff':'#444';
        const tw=sp.width, th=sp.height||25, bx=sp.x, by=sp.y;
        ctx.beginPath();
        if(sp.dir==='up'||!sp.dir){    ctx.moveTo(bx,by);ctx.lineTo(bx+tw/2,by-th);ctx.lineTo(bx+tw,by); }
        else if(sp.dir==='down'){       ctx.moveTo(bx,by);ctx.lineTo(bx+tw/2,by+th);ctx.lineTo(bx+tw,by); }
        else if(sp.dir==='right'){      ctx.moveTo(bx,by);ctx.lineTo(bx+th,by+tw/2);ctx.lineTo(bx,by+tw); }
        else if(sp.dir==='left'){       ctx.moveTo(bx+th,by);ctx.lineTo(bx,by+tw/2);ctx.lineTo(bx+th,by+tw); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    // Sawblades (editor — animated)
    for(let i=0;i<edSawblades.length;i++){
        const s=edSawblades[i], sel=edSelected?.type==='saw'&&edSelected.index===i;
        const r=s.radius||25, teeth=10, rot=Date.now()*0.003;
        ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(rot);
        ctx.fillStyle=sel?'#aaa':'#888'; ctx.strokeStyle=sel?'#fff':'#444'; ctx.lineWidth=(sel?2:1.5)/edZoom;
        ctx.beginPath();
        for(let j=0;j<teeth*2;j++){
            const a=(j/(teeth*2))*Math.PI*2, rr=j%2===0?r:r*0.65;
            j===0?ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr):ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle='#555'; ctx.beginPath(); ctx.arc(0,0,r*0.22,0,Math.PI*2); ctx.fill();
        ctx.restore();
    }

    // Ghost spike preview
    if(edTool==='spike'&&edGhostRect){
        const tw=edGhostRect.width, th=25, bx=edGhostRect.x, by=edGhostRect.y;
        ctx.fillStyle='rgba(120,120,180,0.4)'; ctx.strokeStyle='rgba(150,150,220,0.8)'; ctx.lineWidth=1.5/edZoom;
        ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx+tw/2,by-th); ctx.lineTo(bx+tw,by); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // Ghost mplatform preview
    if(edTool==='mplatform'&&edGhostRect){
        ctx.fillStyle='rgba(85,136,204,0.35)'; ctx.strokeStyle='rgba(100,160,255,0.85)'; ctx.lineWidth=2/edZoom;
        ctx.fillRect(edGhostRect.x,edGhostRect.y,edGhostRect.width,edGhostRect.height);
        ctx.strokeRect(edGhostRect.x,edGhostRect.y,edGhostRect.width,edGhostRect.height);
        ctx.fillStyle='rgba(150,200,255,0.9)'; ctx.font=`${14/edZoom}px monospace`;
        ctx.fillText(`${edGhostRect.width}×${edGhostRect.height}`,edGhostRect.x+4/edZoom,edGhostRect.y-6/edZoom);
    }
    // Ghost onoff preview
    if(edTool==='onoff'&&edGhostRect){
        ctx.fillStyle='rgba(224,144,48,0.35)'; ctx.strokeStyle='rgba(255,180,80,0.85)'; ctx.lineWidth=2/edZoom;
        ctx.fillRect(edGhostRect.x,edGhostRect.y,edGhostRect.width,edGhostRect.height);
        ctx.strokeRect(edGhostRect.x,edGhostRect.y,edGhostRect.width,edGhostRect.height);
    }
    // Ghost saw preview
    if(edTool==='saw'&&edCursorWorld){
        const r=(edSawRadius||25);
        ctx.globalAlpha=0.4; ctx.fillStyle='#888';
        ctx.beginPath(); ctx.arc(snapV(edCursorWorld.x),snapV(edCursorWorld.y),r,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    }
    // Ghost switch preview
    if(edTool==='switch'&&edCursorWorld){
        ctx.globalAlpha=0.4; ctx.fillStyle='#44ddff';
        ctx.fillRect(snapV(edCursorWorld.x),snapV(edCursorWorld.y),25,25); ctx.globalAlpha=1;
    }
    // Ghost orbit saw preview
    if(edTool==='orbitsaw'&&edCursorWorld){
        const cx=snapV(edCursorWorld.x), cy=snapV(edCursorWorld.y);
        ctx.globalAlpha=0.35; ctx.strokeStyle='#888'; ctx.lineWidth=1.5/edZoom;
        ctx.beginPath(); ctx.arc(cx,cy,100,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle='#555'; ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha=1;
    }

    // Orbit saws (editor — animated)
    for(let i=0;i<edOrbitSaws.length;i++){
        const s=edOrbitSaws[i], sel=edSelected?.type==='orbitsaw'&&edSelected.index===i;
        const angle=Date.now()*0.003*(s.speed||1);
        const r=s.rodLen||100, sawR=s.sawRadius||20;
        const sawX=s.x+Math.cos(angle)*r, sawY=s.y+Math.sin(angle)*r;
        // Rod
        ctx.strokeStyle=sel?'#aaa':'#888'; ctx.lineWidth=(sel?2.5:1.5)/edZoom;
        ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(sawX,sawY); ctx.stroke();
        // Pivot
        ctx.fillStyle=sel?'#ccc':'#666'; ctx.beginPath(); ctx.arc(s.x,s.y,7,0,Math.PI*2); ctx.fill();
        // Sawblade
        const teeth=8;
        ctx.save(); ctx.translate(sawX,sawY); ctx.rotate(angle*3);
        ctx.fillStyle=sel?'#aaa':'#888'; ctx.strokeStyle=sel?'#fff':'#444'; ctx.lineWidth=(sel?2:1.5)/edZoom;
        ctx.beginPath();
        for(let j=0;j<teeth*2;j++){const a=(j/(teeth*2))*Math.PI*2,rr=j%2===0?sawR:sawR*0.65; j===0?ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr):ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle='#555'; ctx.beginPath(); ctx.arc(0,0,sawR*0.22,0,Math.PI*2); ctx.fill();
        ctx.restore();
    }

    // Finish flag
    if(edFinish){
        const fx=edFinish.x, fy=edFinish.y, poleH=65, flagW=45, flagH=28;
        ctx.strokeStyle='#c8c8c8'; ctx.lineWidth=4/edZoom;
        ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx,fy+poleH); ctx.stroke();
        ctx.fillStyle='#c0394b'; ctx.fillRect(fx,fy,flagW,flagH);
        ctx.fillStyle='rgba(192,57,75,0.8)'; ctx.font=`${12/edZoom}px monospace`;
        ctx.fillText('FINISH',fx-15/edZoom,fy-8/edZoom);
    }

    // Ghost finish preview
    if(edTool==='finish'&&edCursorWorld){
        const gfx=snapV(edCursorWorld.x), gfy=snapV(edCursorWorld.y);
        ctx.globalAlpha=0.4;
        ctx.strokeStyle='#c0394b'; ctx.lineWidth=3/edZoom;
        ctx.beginPath(); ctx.moveTo(gfx,gfy); ctx.lineTo(gfx,gfy+65); ctx.stroke();
        ctx.fillStyle='#c0394b'; ctx.fillRect(gfx,gfy,45,28);
        ctx.globalAlpha=1;
    }

    // Ghost platform preview
    if(edGhostRect){
        ctx.fillStyle='rgba(80,80,200,0.22)'; ctx.strokeStyle='rgba(120,120,255,0.85)'; ctx.lineWidth=2/edZoom;
        ctx.fillRect(edGhostRect.x,edGhostRect.y,edGhostRect.width,edGhostRect.height);
        ctx.strokeRect(edGhostRect.x,edGhostRect.y,edGhostRect.width,edGhostRect.height);
        // Dimensions label
        ctx.fillStyle='rgba(150,150,255,0.9)'; ctx.font=`${14/edZoom}px monospace`;
        ctx.fillText(`${edGhostRect.width}×${edGhostRect.height}`, edGhostRect.x+4/edZoom, edGhostRect.y-6/edZoom);
    }

    // Ghost jumppad (while tool is selected, show one under cursor)
    if(edTool==='jumppad'&&edCursorWorld){
        ctx.fillStyle='rgba(255,246,113,0.35)'; ctx.strokeStyle='rgba(255,246,113,0.6)'; ctx.lineWidth=1.5/edZoom;
        ctx.beginPath(); ctx.roundRect(edCursorWorld.x-25,edCursorWorld.y-5,50,10,[10/edZoom]); ctx.fill(); ctx.stroke();
    }

    // Resize handles / selection highlight
    if(edSelected){
        const obj=edGetSel();
        if(obj){
            if(edSelected.type==='finish'){
                ctx.strokeStyle='rgba(192,57,75,0.85)'; ctx.lineWidth=2/edZoom;
                ctx.strokeRect(obj.x-8,obj.y-8,63,90);
            } else if(edSelected.type==='spike'){
                const b=spikeBBoxEd(obj);
                edDrawHandles(b.x, b.y, b.w, b.h);
            } else {
                const ww=edSelected.type==='jumppad'?50:obj.width, wh=edSelected.type==='jumppad'?10:obj.height;
                edDrawHandles(obj.x,obj.y,ww,wh);
            }
        }
    }

    ctx.restore();
}

let edCursorWorld=null;

function spikeBBoxEd(sp){
    const tw=sp.width, th=sp.height||25, dir=sp.dir||'up';
    if(dir==='up')   return {x:sp.x, y:sp.y-th, w:tw, h:th};
    if(dir==='down') return {x:sp.x, y:sp.y,    w:tw, h:th};
    return                  {x:sp.x, y:sp.y,    w:th, h:tw};
}

function edDrawHandles(wx,wy,ww,wh){
    const hs=HS/edZoom, mx=wx+ww/2, my=wy+wh/2;
    const pts=[[wx-hs/2,wy-hs/2],[mx-hs/2,wy-hs/2],[wx+ww-hs/2,wy-hs/2],[wx-hs/2,my-hs/2],[wx+ww-hs/2,my-hs/2],[wx-hs/2,wy+wh-hs/2],[mx-hs/2,wy+wh-hs/2],[wx+ww-hs/2,wy+wh-hs/2]];
    ctx.fillStyle='#fff'; ctx.strokeStyle='#333'; ctx.lineWidth=1/edZoom;
    for(const[hx,hy]of pts){ctx.fillRect(hx,hy,hs,hs);ctx.strokeRect(hx,hy,hs,hs);}
}

function edGetHandleName(sx,sy,wx,wy,ww,wh){
    const t=(x,y)=>edWS(x,y), mx=wx+ww/2, my=wy+wh/2, h=HS/2;
    const handles={nw:t(wx,wy),n:t(mx,wy),ne:t(wx+ww,wy),w:t(wx,my),e:t(wx+ww,my),sw:t(wx,wy+wh),s:t(mx,wy+wh),se:t(wx+ww,wy+wh)};
    for(const[name,p]of Object.entries(handles)){ if(sx>=p.x-h&&sx<=p.x+h&&sy>=p.y-h&&sy<=p.y+h)return name; }
    return null;
}

function edHitTest(sx,sy){
    const{x:wx,y:wy}=edSW(sx,sy);
    if(edFinish&&wx>=edFinish.x-8&&wx<=edFinish.x+55&&wy>=edFinish.y&&wy<=edFinish.y+78)return{type:'finish'};
    for(let i=edMovingPlatforms.length-1;i>=0;i--){
        const mp=edMovingPlatforms[i];
        const dx=wx-(mp.tx+mp.width/2), dy=wy-(mp.ty+mp.height/2);
        if(Math.abs(dx)<14/edZoom&&Math.abs(dy)<14/edZoom)return{type:'mplatform_end',index:i};
    }
    for(let i=edSpikes.length-1;i>=0;i--){const sp=edSpikes[i];const b=spikeBBoxEd(sp);if(wx>=b.x&&wx<=b.x+b.w&&wy>=b.y&&wy<=b.y+b.h)return{type:'spike',index:i};}
    for(let i=edSawblades.length-1;i>=0;i--){const s=edSawblades[i];const dx=wx-s.x,dy=wy-s.y;if(Math.sqrt(dx*dx+dy*dy)<=(s.radius||25))return{type:'saw',index:i};}
    for(let i=edOrbitSaws.length-1;i>=0;i--){const s=edOrbitSaws[i];const dx=wx-s.x,dy=wy-s.y;if(Math.sqrt(dx*dx+dy*dy)<=14/edZoom)return{type:'orbitsaw',index:i};}
    for(let i=edMovingPlatforms.length-1;i>=0;i--){const mp=edMovingPlatforms[i];if(wx>=mp.x&&wx<=mp.x+mp.width&&wy>=mp.y&&wy<=mp.y+mp.height)return{type:'mplatform',index:i};}
    for(let i=edOnOffBlocks.length-1;i>=0;i--){const b=edOnOffBlocks[i];if(wx>=b.x&&wx<=b.x+b.width&&wy>=b.y&&wy<=b.y+b.height)return{type:'onoff',index:i};}
    for(let i=edOnOffSwitches.length-1;i>=0;i--){const sw=edOnOffSwitches[i];if(wx>=sw.x&&wx<=sw.x+25&&wy>=sw.y&&wy<=sw.y+25)return{type:'switch',index:i};}
    for(let i=edPlatforms.length-1;i>=0;i--){const p=edPlatforms[i]; if(wx>=p.x&&wx<=p.x+p.width&&wy>=p.y&&wy<=p.y+p.height)return{type:'platform',index:i};}
    for(let i=edJumpPads.length-1; i>=0;i--){const j=edJumpPads[i];  if(wx>=j.x&&wx<=j.x+50&&wy>=j.y&&wy<=j.y+10)return{type:'jumppad',index:i};}
    return null;
}

function edGetSel(){
    if(!edSelected)return null;
    if(edSelected.type==='finish')    return edFinish;
    if(edSelected.type==='platform')  return edPlatforms[edSelected.index];
    if(edSelected.type==='jumppad')   return edJumpPads[edSelected.index];
    if(edSelected.type==='spike')     return edSpikes[edSelected.index];
    if(edSelected.type==='saw')       return edSawblades[edSelected.index];
    if(edSelected.type==='mplatform'||edSelected.type==='mplatform_end') return edMovingPlatforms[edSelected.index];
    if(edSelected.type==='onoff')     return edOnOffBlocks[edSelected.index];
    if(edSelected.type==='switch')    return edOnOffSwitches[edSelected.index];
    if(edSelected.type==='orbitsaw')  return edOrbitSaws[edSelected.index];
    return null;
}

function edDeleteSelected(){
    if(!edSelected)return;
    if(edSelected.type==='platform')  edPlatforms.splice(edSelected.index,1);
    if(edSelected.type==='jumppad')   edJumpPads.splice(edSelected.index,1);
    if(edSelected.type==='finish')    edFinish=null;
    if(edSelected.type==='spike')     edSpikes.splice(edSelected.index,1);
    if(edSelected.type==='saw')       edSawblades.splice(edSelected.index,1);
    if(edSelected.type==='mplatform'||edSelected.type==='mplatform_end') edMovingPlatforms.splice(edSelected.index,1);
    if(edSelected.type==='onoff')     edOnOffBlocks.splice(edSelected.index,1);
    if(edSelected.type==='switch')    edOnOffSwitches.splice(edSelected.index,1);
    if(edSelected.type==='orbitsaw')  edOrbitSaws.splice(edSelected.index,1);
    edSelected=null;
}

// ── Canvas mouse events (editor mode only) ─────────────
canvas.addEventListener('mousedown', e=>{
    if(!editorOpen||edMode!=='edit')return;
    const sx=e.offsetX,sy=e.offsetY;

    if(edSpaceHeld||e.button===1||e.button===2){ edPanning=true; edPanStart={x:e.clientX,y:e.clientY}; edPanOrigin={x:edCamX,y:edCamY}; canvas.style.cursor='grabbing'; return; }
    if(e.button!==0)return;

    if(edTool==='select'){
        const noHandleTypes=new Set(['finish','saw','switch','mplatform_end']);
        if(edSelected&&!noHandleTypes.has(edSelected.type)){ const obj=edGetSel(); if(obj){
            let ww,wh,wy;
            if(edSelected.type==='jumppad'){ww=50;wh=10;wy=obj.y;}
            else if(edSelected.type==='spike'){const b=spikeBBoxEd(obj);ww=b.w;wh=b.h;wy=b.y;}
            else{ww=obj.width;wh=obj.height;wy=obj.y;}
            const h=edGetHandleName(sx,sy,obj.x,wy,ww,wh);
            if(h){edDragging=true;edDragHandle=h;const{x,y}=edSW(sx,sy);edDragStart={x,y};edDragOriginal={x:obj.x,y:wy,width:ww,height:wh};return;}
        } }
        const hit=edHitTest(sx,sy); edSelected=hit;
        if(hit){
            edDragging=true; edDragHandle=hit.type==='mplatform_end'?'endpoint':'move';
            const{x,y}=edSW(sx,sy); edDragStart={x,y};
            const o=edGetSel();
            if(hit.type==='mplatform_end') edDragOriginal={tx:o.tx,ty:o.ty};
            else if(hit.type==='mplatform') edDragOriginal={x:o.x,y:o.y,tx:o.tx,ty:o.ty};
            else edDragOriginal={x:o.x,y:o.y};
        }
    }

    if(edTool==='platform'){
        const{x,y}=edSW(sx,sy); edDrawing=true; edDrawStart={wx:snapV(x),wy:snapV(y)};
        edGhostRect={x:edDrawStart.wx,y:edDrawStart.wy,width:SNAP,height:SNAP};
    }

    if(edTool==='jumppad'){const{x,y}=edSW(sx,sy); edJumpPads.push({x:snapV(x-25),y:snapV(y-5),strength:25}); edSelected={type:'jumppad',index:edJumpPads.length-1};}

    if(edTool==='spawn'){const{x,y}=edSW(sx,sy); edSpawn={x:snapV(x-25),y:snapV(y-25)};}

    if(edTool==='finish'){const{x,y}=edSW(sx,sy); edFinish={x:snapV(x),y:snapV(y)-SNAP/2}; edSelected=null;}

    if(edTool==='spike'){
        const{x,y}=edSW(sx,sy); edDrawing=true; edDrawStart={wx:snapV(x),wy:snapV(y)};
        edGhostRect={x:edDrawStart.wx,y:edDrawStart.wy,width:SNAP,height:18};
    }
    if(edTool==='saw'){const{x,y}=edSW(sx,sy); edSawblades.push({x:snapV(x),y:snapV(y),radius:edSawRadius}); edSelected={type:'saw',index:edSawblades.length-1};}
    if(edTool==='mplatform'){
        const{x,y}=edSW(sx,sy); edDrawing=true; edDrawStart={wx:snapV(x),wy:snapV(y)};
        edGhostRect={x:edDrawStart.wx,y:edDrawStart.wy,width:SNAP,height:SNAP};
    }
    if(edTool==='onoff'){
        const{x,y}=edSW(sx,sy); edDrawing=true; edDrawStart={wx:snapV(x),wy:snapV(y)};
        edGhostRect={x:edDrawStart.wx,y:edDrawStart.wy,width:SNAP,height:SNAP};
    }
    if(edTool==='switch'){const{x,y}=edSW(sx,sy); edOnOffSwitches.push({x:snapV(x-12),y:snapV(y-12)}); edSelected={type:'switch',index:edOnOffSwitches.length-1};}
    if(edTool==='orbitsaw'){const{x,y}=edSW(sx,sy); edOrbitSaws.push({x:snapV(x),y:snapV(y),rodLen:100,sawRadius:20,speed:1}); edSelected={type:'orbitsaw',index:edOrbitSaws.length-1};}

    if(edTool==='delete'){
        const hit=edHitTest(sx,sy);
        if(hit){
            if(hit.type==='platform')  edPlatforms.splice(hit.index,1);
            if(hit.type==='jumppad')   edJumpPads.splice(hit.index,1);
            if(hit.type==='finish')    edFinish=null;
            if(hit.type==='spike')     edSpikes.splice(hit.index,1);
            if(hit.type==='saw')       edSawblades.splice(hit.index,1);
            if(hit.type==='mplatform'||hit.type==='mplatform_end') edMovingPlatforms.splice(hit.index,1);
            if(hit.type==='onoff')     edOnOffBlocks.splice(hit.index,1);
            if(hit.type==='switch')    edOnOffSwitches.splice(hit.index,1);
            if(hit.type==='orbitsaw')  edOrbitSaws.splice(hit.index,1);
            edSelected=null;
        }
    }
});

canvas.addEventListener('mousemove', e=>{
    if(!editorOpen||edMode!=='edit')return;
    const sx=e.offsetX,sy=e.offsetY;
    edCursorWorld=edSW(sx,sy);
    document.getElementById('edCoordsInfo').textContent=`x:${Math.round(edCursorWorld.x)}  y:${Math.round(edCursorWorld.y)}`;

    if(edPanning){edCamX=edPanOrigin.x+(e.clientX-edPanStart.x); edCamY=edPanOrigin.y+(e.clientY-edPanStart.y);return;}

    if(edDrawing&&(edTool==='platform'||edTool==='mplatform'||edTool==='onoff')){
        const snx=snapV(edCursorWorld.x),sny=snapV(edCursorWorld.y);
        edGhostRect={x:Math.min(snx,edDrawStart.wx),y:Math.min(sny,edDrawStart.wy),width:Math.max(SNAP,Math.abs(snx-edDrawStart.wx)),height:Math.max(SNAP,Math.abs(sny-edDrawStart.wy))};
    }
    if(edDrawing&&edTool==='spike'){
        const snx=snapV(edCursorWorld.x);
        edGhostRect={x:Math.min(snx,edDrawStart.wx),y:edDrawStart.wy,width:Math.max(SNAP,Math.abs(snx-edDrawStart.wx)),height:18};
    }

    if(edDragging&&edSelected){
        const obj=edGetSel(); if(!obj)return;
        const{x:cwx,y:cwy}=edSW(sx,sy);
        const dx=cwx-edDragStart.x, dy=cwy-edDragStart.y;
        if(edDragHandle==='endpoint'){obj.tx=snapV(edDragOriginal.tx+dx);obj.ty=snapV(edDragOriginal.ty+dy);}
        else if(edDragHandle==='move'){obj.x=snapV(edDragOriginal.x+dx);obj.y=snapV(edDragOriginal.y+dy);if(edSelected.type==='mplatform'){obj.tx=snapV((edDragOriginal.tx!==undefined?edDragOriginal.tx:obj.tx)+dx);obj.ty=snapV((edDragOriginal.ty!==undefined?edDragOriginal.ty:obj.ty)+dy);}}
        else if(edSelected.type==='spike'){
            const o=edDragOriginal;let nx=o.x,ny=o.y,nw=o.width,nh=o.height;
            if(edDragHandle.includes('e')){nw=Math.max(SNAP,snapV(o.width+dx));}
            if(edDragHandle.includes('s')){nh=Math.max(SNAP,snapV(o.height+dy));}
            if(edDragHandle.includes('w')){const d=snapV(dx);nx=o.x+d;nw=Math.max(SNAP,o.width-d);}
            if(edDragHandle.includes('n')){const d=snapV(dy);ny=o.y+d;nh=Math.max(SNAP,o.height-d);}
            const dir=obj.dir||'up';
            obj.x=nx;
            if(dir==='up')        { obj.y=snapV(ny+nh); obj.width=nw; obj.height=nh; }
            else if(dir==='down') { obj.y=snapV(ny);    obj.width=nw; obj.height=nh; }
            else                  { obj.y=snapV(ny);    obj.width=nh; obj.height=nw; }
        }
        else if(edSelected.type==='platform'||edSelected.type==='mplatform'||edSelected.type==='onoff'){
            const o=edDragOriginal;let nx=o.x,ny=o.y,nw=o.width,nh=o.height;
            if(edDragHandle.includes('e')){nw=Math.max(SNAP,snapV(o.width+dx));}
            if(edDragHandle.includes('s')){nh=Math.max(SNAP,snapV(o.height+dy));}
            if(edDragHandle.includes('w')){const d=snapV(dx);nx=o.x+d;nw=Math.max(SNAP,o.width-d);}
            if(edDragHandle.includes('n')){const d=snapV(dy);ny=o.y+d;nh=Math.max(SNAP,o.height-d);}
            obj.x=nx;obj.y=ny;obj.width=nw;obj.height=nh;
        }
    }
});

canvas.addEventListener('mouseup', e=>{
    if(!editorOpen||edMode!=='edit')return;
    if(edPanning){ edPanning=false; canvas.style.cursor=edSpaceHeld?'grab':'default'; return; }
    edPanning=false;
    if(edDrawing&&edGhostRect){
        if(edTool==='platform'&&edGhostRect.width>=SNAP&&edGhostRect.height>=SNAP){
            edPlatforms.push({...edGhostRect}); edSelected={type:'platform',index:edPlatforms.length-1};
        }
        if(edTool==='spike'&&edGhostRect.width>=SNAP){
            edSpikes.push({x:edGhostRect.x,y:edGhostRect.y,width:edGhostRect.width,dir:'up',height:25}); edSelected={type:'spike',index:edSpikes.length-1};
        }
        if(edTool==='mplatform'&&edGhostRect.width>=SNAP&&edGhostRect.height>=SNAP){
            const mp={x:edGhostRect.x,y:edGhostRect.y,width:edGhostRect.width,height:edGhostRect.height,tx:edGhostRect.x+200,ty:edGhostRect.y,speed:1};
            edMovingPlatforms.push(mp); edSelected={type:'mplatform',index:edMovingPlatforms.length-1};
        }
        if(edTool==='onoff'&&edGhostRect.width>=SNAP&&edGhostRect.height>=SNAP){
            edOnOffBlocks.push({...edGhostRect,startsOn:true}); edSelected={type:'onoff',index:edOnOffBlocks.length-1};
        }
        edGhostRect=null; edDrawing=false;
    }
    if(edDragging){edDragging=false;edDragHandle=null;edDragOriginal=null;}
});

canvas.addEventListener('contextmenu',e=>{if(editorOpen&&edMode==='edit')e.preventDefault();});

canvas.addEventListener('wheel',e=>{
    if(!editorOpen||edMode!=='edit')return;
    e.preventDefault();
    const f=e.deltaY<0?1.12:1/1.12, sx=e.offsetX, sy=e.offsetY;
    edCamX=sx-(sx-edCamX)*f; edCamY=sy-(sy-edCamY)*f;
    edZoom=Math.max(0.04,Math.min(3,edZoom*f));
},{passive:false});

canvas.addEventListener('dblclick',e=>{
    if(!editorOpen||edMode!=='edit'||edTool!=='select'||!edSelected)return;
    if(edSelected.type==='jumppad'){
        const j=edJumpPads[edSelected.index];
        const v=prompt('Jump strength (default 25):',j.strength);
        if(v!==null&&!isNaN(+v))j.strength=+v;
    }
    if(edSelected.type==='saw'){
        const s=edSawblades[edSelected.index];
        const v=prompt('Saw radius (default 25):',s.radius||25);
        if(v!==null&&!isNaN(+v))s.radius=Math.max(10,+v);
    }
    if(edSelected.type==='mplatform'){
        const mp=edMovingPlatforms[edSelected.index];
        const v=prompt('Move speed (default 1):',mp.speed||1);
        if(v!==null&&!isNaN(+v))mp.speed=Math.max(0.1,+v);
    }
    if(edSelected.type==='onoff'){
        const b=edOnOffBlocks[edSelected.index];
        b.startsOn = (b.startsOn===false) ? true : false;
    }
    if(edSelected.type==='orbitsaw'){
        const s=edOrbitSaws[edSelected.index];
        const sp=prompt('Spin speed (default 1, negative=reverse):',s.speed??1);
        if(sp!==null&&!isNaN(+sp)) s.speed=+sp;
        const rl=prompt('Rod length (default 100):',s.rodLen??100);
        if(rl!==null&&!isNaN(+rl)) s.rodLen=Math.max(20,+rl);
        const sr=prompt('Saw radius (default 20):',s.sawRadius??20);
        if(sr!==null&&!isNaN(+sr)) s.sawRadius=Math.max(8,+sr);
    }
});

// ── Rotate selected ────────────────────────────────────
function rotateSelected(){
    if(!edSelected)return;
    if(edSelected.type==='spike'){
        const sp=edSpikes[edSelected.index];
        const dirs=['up','right','down','left'];
        const oldDir=sp.dir||'up', newDir=dirs[(dirs.indexOf(oldDir)+1)%4];
        const th=sp.height||25, tw=sp.width;
        // Center of bounding box before rotation
        let cx, cy;
        if(oldDir==='up')        { cx=sp.x+tw/2; cy=sp.y-th/2; }
        else if(oldDir==='down') { cx=sp.x+tw/2; cy=sp.y+th/2; }
        else                     { cx=sp.x+th/2; cy=sp.y+tw/2; }
        // Swap dimensions when crossing up/down ↔ right/left
        const wasUpDown=oldDir==='up'||oldDir==='down', isUpDown=newDir==='up'||newDir==='down';
        if(wasUpDown!==isUpDown){ sp.width=th; sp.height=tw; }
        const nth=sp.height||25, ntw=sp.width;
        // Reposition anchor so center stays the same
        sp.dir=newDir;
        if(newDir==='up')        { sp.x=cx-ntw/2; sp.y=cy+nth/2; }
        else if(newDir==='down') { sp.x=cx-ntw/2; sp.y=cy-nth/2; }
        else                     { sp.x=cx-nth/2; sp.y=cy-ntw/2; }
        return;
    }
    const obj=edGetSel(); if(!obj||!obj.width||!obj.height)return;
    const cx=obj.x+obj.width/2, cy=obj.y+obj.height/2;
    const nw=obj.height, nh=obj.width;
    if(edSelected.type==='mplatform'){
        const ex=obj.tx+obj.width/2, ey=obj.ty+obj.height/2;
        obj.x=cx-nw/2; obj.y=cy-nh/2; obj.width=nw; obj.height=nh;
        obj.tx=(cx+(ey-cy))-nw/2; obj.ty=(cy-(ex-cx))-nh/2;
    } else {
        obj.x=cx-nw/2; obj.y=cy-nh/2; obj.width=nw; obj.height=nh;
    }
}

// ── Tool buttons ───────────────────────────────────────
function setTool(name){
    edTool=name; edSelected=null; edGhostRect=null;
    document.querySelectorAll('.tool-btn').forEach(b=>b.classList.toggle('active',b.dataset.tool===name));
    canvas.style.cursor=name==='select'?'default':name==='delete'?'not-allowed':'crosshair';
}
document.querySelectorAll('.tool-btn').forEach(btn=>btn.addEventListener('click',()=>setTool(btn.dataset.tool)));

// ── Open / close editor ────────────────────────────────
function openEditor(levelData=null){
    editorOpen=true; edMode='edit';
    if(backgroundRects.length===0)createBackground();

    if(levelData){
        edCurrentId=String(levelData._id);
        edPlatforms      =(levelData.platforms      ||[]).map(p=>({...p}));
        edJumpPads       =(levelData.jumpPads       ||[]).map(j=>({...j}));
        edSpawn          =levelData.startPos?{...levelData.startPos}:{x:250,y:4500};
        edFinish         =levelData.finish?{...levelData.finish}:null;
        edSpikes         =(levelData.spikes         ||[]).map(s=>({...s}));
        edSawblades      =(levelData.sawblades      ||[]).map(s=>({...s}));
        edMovingPlatforms=(levelData.movingPlatforms||[]).map(p=>({...p}));
        edOnOffBlocks    =(levelData.onOffBlocks    ||[]).map(b=>({...b}));
        edOnOffSwitches  =(levelData.onOffSwitches  ||[]).map(s=>({...s}));
        edOrbitSaws      =(levelData.orbitSaws      ||[]).map(s=>({...s}));
        document.getElementById('edLevelName').value =levelData.name||'';
        document.getElementById('edLevelOrder').value=levelData.order||1;
        document.getElementById('edDeleteBtn').style.display='inline-block';
    } else { edClearState(); }

    const cx=edSpawn.x+25, cy=edSpawn.y+25;
    edZoom=0.22;
    edCamX=canvas.width/2  - cx*edZoom;
    edCamY=canvas.height/2 - cy*edZoom;

    menu.classList.add('hidden');
    document.getElementById('editorHUD').classList.remove('hidden');
    canvas.style.cursor='default';
    populateEdDropdown();
    edRaf=requestAnimationFrame(edLoop);
}

function edLoop(){ editorDrawFrame(); edRaf=requestAnimationFrame(edLoop); }

function closeEditor(){
    cancelAnimationFrame(edRaf); edRaf=null;
    editorOpen=false;
    document.getElementById('editorHUD').classList.add('hidden');
    canvas.style.cursor='';
    menu.classList.remove('hidden');
}

// ── Play test ──────────────────────────────────────────
function enterPlayTest(){
    platforms      =edPlatforms.map(p=>new Platform(p.x,p.y,p.width,p.height));
    jumpPads       =edJumpPads.map(j=>new JumpPad(j.x,j.y,j.strength));
    spikes         =edSpikes.map(s=>({...s}));
    sawblades      =edSawblades.map(s=>({...s,_rot:0}));
    movingPlatforms=edMovingPlatforms.map(p=>({...p,_t:0,_dir:1,_cx:p.x,_cy:p.y}));
    onOffBlocks    =edOnOffBlocks.map(b=>({...b}));
    onOffSwitches  =edOnOffSwitches.map(s=>({...s,_triggered:false}));
    orbitSaws      =edOrbitSaws.map(s=>({...s,_angle:Math.random()*Math.PI*2}));
    onOffState=false; deathCooldown=0;
    startPos ={...edSpawn};
    player   =new Player(edSpawn.x,edSpawn.y);
    finish   =edFinish?{...edFinish}:null; levelCompleted=false;
    platformParticles=[]; boostParticles=[]; jumpParticles=[]; finishParticles=[]; deathParticles=[]; switchParticles=[];
    classifiersInUse={platform:[],boost:[],jump:[]};
    grounded=false; wasGrounded=[false,false,false,false]; gravity=0.5; speed=5;

    cancelAnimationFrame(edRaf); edRaf=null;
    edMode='playtest';
    document.getElementById('editorHUD').classList.add('hidden');
    document.getElementById('playTestHUD').classList.remove('hidden');
    canvas.style.cursor='';
    gameStarted=true;
    snapCamera();
    animFrameId=requestAnimationFrame(gameLoop);
}

function exitPlayTest(){
    cancelAnimationFrame(animFrameId); animFrameId=null;
    gameStarted=false; edMode='edit';
    document.getElementById('playTestHUD').classList.add('hidden');
    document.getElementById('editorHUD').classList.remove('hidden');
    canvas.style.cursor='default';
    edRaf=requestAnimationFrame(edLoop);
}

document.getElementById('edPlayTestBtn').addEventListener('click',enterPlayTest);
document.getElementById('backToEditorBtn').addEventListener('click',exitPlayTest);
document.getElementById('edQuitBtn').addEventListener('click',closeEditor);

// ── Level management ───────────────────────────────────
function edClearState(){
    edPlatforms=[]; edJumpPads=[]; edSpawn={x:250,y:4500}; edFinish=null;
    edSpikes=[]; edSawblades=[]; edMovingPlatforms=[]; edOnOffBlocks=[]; edOnOffSwitches=[]; edOrbitSaws=[];
    edSelected=null; edCurrentId=null; edGhostRect=null;
    document.getElementById('edLevelName').value='';
    document.getElementById('edLevelOrder').value=(allLevels.length+1)||1;
    document.getElementById('edDeleteBtn').style.display='none';
}

document.getElementById('edClearBtn').addEventListener('click',()=>{ if(!confirm('Clear canvas?'))return; edClearState(); document.getElementById('edLevelSelect').value=''; });

async function populateEdDropdown(){
    await loadLevels();
    const sel=document.getElementById('edLevelSelect');
    sel.innerHTML='<option value="">— New Level —</option>';
    for(const lvl of allLevels){
        const o=document.createElement('option'); o.value=String(lvl._id); o.textContent=`${lvl.order}. ${lvl.name||'Untitled'}`;
        if(String(lvl._id)===edCurrentId)o.selected=true;
        sel.appendChild(o);
    }
}

document.getElementById('edLevelSelect').addEventListener('change',async e=>{
    const id=e.target.value;
    if(!id){edClearState();return;}
    const lvl=allLevels.find(l=>String(l._id)===id); if(!lvl)return;
    edCurrentId=id;
    edPlatforms      =(lvl.platforms      ||[]).map(p=>({...p}));
    edJumpPads       =(lvl.jumpPads       ||[]).map(j=>({...j}));
    edSpawn          =lvl.startPos?{...lvl.startPos}:{x:250,y:4500};
    edFinish         =lvl.finish?{...lvl.finish}:null;
    edSpikes         =(lvl.spikes         ||[]).map(s=>({...s}));
    edSawblades      =(lvl.sawblades      ||[]).map(s=>({...s}));
    edMovingPlatforms=(lvl.movingPlatforms||[]).map(p=>({...p}));
    edOnOffBlocks    =(lvl.onOffBlocks    ||[]).map(b=>({...b}));
    edOnOffSwitches  =(lvl.onOffSwitches  ||[]).map(s=>({...s}));
    edOrbitSaws      =(lvl.orbitSaws      ||[]).map(s=>({...s}));
    document.getElementById('edLevelName').value =lvl.name||'';
    document.getElementById('edLevelOrder').value=lvl.order||1;
    document.getElementById('edDeleteBtn').style.display='inline-block';
    edSelected=null;
    edCamX=canvas.width/2 -(edSpawn.x+25)*edZoom;
    edCamY=canvas.height/2-(edSpawn.y+25)*edZoom;
    setEdStatus('Loaded.');
});

document.getElementById('edSaveBtn').addEventListener('click',async()=>{
    const name =document.getElementById('edLevelName').value.trim()||'Untitled';
    const order=parseInt(document.getElementById('edLevelOrder').value)||1;
    if(edPlatforms.length===0)return setEdStatus('Add at least one platform.');
    const body={name,order,startPos:edSpawn,platforms:edPlatforms,jumpPads:edJumpPads,finish:edFinish,spikes:edSpikes,sawblades:edSawblades,movingPlatforms:edMovingPlatforms,onOffBlocks:edOnOffBlocks,onOffSwitches:edOnOffSwitches,orbitSaws:edOrbitSaws};
    const isNew=!edCurrentId;
    try{
        const r=await fetch(isNew?'/api/ollie/levels':`/api/ollie/levels/${edCurrentId}`,{method:isNew?'POST':'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${authToken}`},body:JSON.stringify(body)});
        if(!r.ok)throw new Error(await r.text());
        if(isNew){const d=await r.json();edCurrentId=String(d._id);document.getElementById('edDeleteBtn').style.display='inline-block';}
        await populateEdDropdown(); setEdStatus('Saved!');
    }catch(err){setEdStatus('Error: '+err.message);}
});

document.getElementById('edDeleteBtn').addEventListener('click',async()=>{
    if(!edCurrentId||!confirm('Delete this level permanently?'))return;
    try{
        await fetch(`/api/ollie/levels/${edCurrentId}`,{method:'DELETE',headers:{Authorization:`Bearer ${authToken}`}});
        edClearState(); document.getElementById('edLevelSelect').value='';
        await populateEdDropdown(); setEdStatus('Deleted.');
    }catch(err){setEdStatus('Error: '+err.message);}
});

function setEdStatus(msg){ const el=document.getElementById('edStatus'); el.textContent=msg; setTimeout(()=>{if(el.textContent===msg)el.textContent='';},3000); }

// ── Init ───────────────────────────────────────────────
checkAdmin();
