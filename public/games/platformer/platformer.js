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

// ── Game state ─────────────────────────────────────────
let startPos  = null, player = null, platforms = [], jumpPads = [];
let currentLevelOrder = null;

let gravity = 0.5;
const gravityMult=1.065, gravityFloor=5;
let speed=5;
const jumpStrength=15, friction=0.85;
const maxVelocity={x:10,y:30};

let grounded=false, wasGrounded=[false,false,false,false];
let clampLeft=false, clampRight=false, ceiling=false, jumped=false;

const world   = {width:5000, height:5000};
const camera  = {x:0, y:0, width:canvas.width, height:canvas.height};
const cameraSpeed = 0.075;

let platformParticles=[], boostParticles=[], jumpParticles=[];
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
        if(payload.username === 'Mr.Rose'){
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
    wasGrounded[3]=wasGrounded[2]; wasGrounded[2]=wasGrounded[1]; wasGrounded[1]=wasGrounded[0]; wasGrounded[0]=grounded;
    checkJumpPad(); checkCollision(); updateStretch(); updateEyePos();
    if(grounded){resetGravity(); jumped=false;}
    if(ceiling){player.velocity.y=0;}
    drawBackground(); handleParticles(); drawPlayer(); drawPlatforms(); drawJumpPads();
    animFrameId=requestAnimationFrame(gameLoop);
}

// ── Input ──────────────────────────────────────────────
let keys=[];
document.addEventListener("keydown", e => {
    if(!keys.includes(e.key)) keys.push(e.key);

    // Editor space pan
    if(e.code==='Space' && editorOpen && edMode==='edit'){ e.preventDefault(); edSpaceHeld=true; canvas.style.cursor='grab'; }

    // Delete selected in editor
    if(e.key==='Delete' && editorOpen && edMode==='edit'){
        if(edSelected){ edDeleteSelected(); }
    }

    // Escape
    if(e.key==='Escape'){
        if(editorOpen && edMode==='playtest'){ exitPlayTest(); return; }
        if(gameStarted && !editorOpen){ cancelAnimationFrame(animFrameId); animFrameId=null; menu.classList.remove('hidden'); }
    }

    // Editor tool hotkeys
    if(editorOpen && edMode==='edit'){
        if(e.key==='s'||e.key==='S') setTool('select');
        if(e.key==='p'||e.key==='P') setTool('platform');
        if(e.key==='j'||e.key==='J') setTool('jumppad');
        if(e.key==='r'||e.key==='R') setTool('spawn');
        if(e.key==='x'||e.key==='X') setTool('delete');
    }
});
document.addEventListener("keyup", e => {
    keys=keys.filter(k=>k!==e.key);
    if(e.code==='Space'){ edSpaceHeld=false; if(editorOpen&&edMode==='edit') canvas.style.cursor='crosshair'; }
});

// ── Movement ───────────────────────────────────────────
function movePlayer(){
    GORIGHT: if(keys.includes("ArrowRight")||keys.includes("d")){ player.pupilPadding.x=5; player.eyePaddingR.x=15; player.eyePaddingL.x=35; if(clampRight)break GORIGHT; player.velocity.x+=speed; }
    GOLEFT:  if(keys.includes("ArrowLeft") ||keys.includes("a")){ player.pupilPadding.x=0; player.eyePaddingR.x=5;  player.eyePaddingL.x=25; if(clampLeft) break GOLEFT;  player.velocity.x-=speed; }
    if((keys.includes("ArrowUp")||keys.includes("w"))&&(grounded||wasGrounded.includes(true))){ player.velocity.y=-jumpStrength; jumped=true; }
    else if(!keys.includes("ArrowUp")&&!keys.includes("w")&&!grounded&&player.velocity.y<0&&jumped){ player.velocity.y*=0.9; }
    if(!grounded){ player.velocity.y+=gravity; if(gravity<gravityFloor){gravity*=gravityMult;}else{gravity=gravityFloor;} }
    if(player.velocity.y>maxVelocity.y)  player.velocity.y=maxVelocity.y;
    if(player.velocity.x>maxVelocity.x)  player.velocity.x=maxVelocity.x;
    if(player.velocity.x<-maxVelocity.x) player.velocity.x=-maxVelocity.x;
    if(!boosting) player.velocity.x*=friction;
    if(keys.includes(" ")&&(keys.includes("ArrowRight")||keys.includes("d")||keys.includes("ArrowLeft")||keys.includes("a"))&&!boosting&&boostReady){
        if(clampRight&&(keys.includes("ArrowRight")||keys.includes("d")))return;
        if(clampLeft &&(keys.includes("ArrowLeft") ||keys.includes("a")))return;
        maxVelocity.x=30; player.velocity.x*=1.75; boosting=true; boostReady=false; doBoostParticle=true;
        setTimeout(()=>{ maxVelocity.x=10; boosting=false; setTimeout(()=>{boostReady=true;},boostResetTime); },150);
    }
    player.x+=player.velocity.x; player.y+=player.velocity.y;
    if(player.y>world.height+500){ player.x=startPos.x; player.y=startPos.y; player.velocity={x:0,y:0}; gravity=0.5; speed=5; }
}

// ── Camera ─────────────────────────────────────────────
function moveCamera(){
    const cx=player.x+player.width/2, cy=player.y+player.height/2;
    const tx=cx-camera.width/2, ty=Math.max(0,Math.min(world.height-camera.height,cy-camera.height/2));
    camera.x+=(tx-camera.x)*cameraSpeed; camera.y+=(ty-camera.y)*cameraSpeed;
}

// ── Collision ──────────────────────────────────────────
function checkCollision(){
    grounded=false; clampLeft=false; clampRight=false; ceiling=false;
    for(let p of platforms){
        if(player.x+player.width<=p.x||player.x>=p.x+p.width)continue;
        if(player.y+player.height<=p.y||player.y>=p.y+p.height)continue;
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
}

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
    ctx.fillStyle="rgb(130,230,130)"; ctx.globalAlpha=0.4;
    for(let r of backgroundRects){ const sx=r.x-camera.x*0.5,sy=r.y-camera.y*0.5; ctx.save(); ctx.translate(sx+r.width/2,sy+r.height/2); ctx.rotate(Math.PI/4); ctx.fillRect(-r.width/2,-r.height/2,r.width,r.height); ctx.restore(); }
    ctx.globalAlpha=1;
}

function drawPlayer(){
    ctx.fillStyle="blue"; ctx.strokeStyle="rgb(50,50,200)"; ctx.lineWidth=1;
    ctx.fillRect(player.x-camera.x,player.y-camera.y,player.width,player.height);
    ctx.strokeRect(player.x-camera.x,player.y-camera.y,player.width,player.height);
    ctx.fillStyle="white";
    ctx.fillRect(player.x+player.eyePaddingR.x-camera.x,player.y+player.eyePaddingR.y-camera.y,player.eyeSize.width,player.eyeSize.height);
    ctx.fillRect(player.x+player.eyePaddingL.x-camera.x,player.y+player.eyePaddingL.y-camera.y,player.eyeSize.width,player.eyeSize.height);
    ctx.fillStyle="black";
    ctx.fillRect(player.x+player.eyePaddingR.x+player.pupilPadding.x-camera.x,player.y+player.eyePaddingR.y+player.pupilPadding.y-camera.y,player.pupilSize.width,player.pupilSize.height);
    ctx.fillRect(player.x+player.eyePaddingL.x+player.pupilPadding.x-camera.x,player.y+player.eyePaddingL.y+player.pupilPadding.y-camera.y,player.pupilSize.width,player.pupilSize.height);
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
    platforms=(levelData.platforms||[]).map(p=>new Platform(p.x,p.y,p.width,p.height));
    jumpPads =(levelData.jumpPads ||[]).map(j=>new JumpPad(j.x,j.y,j.strength));
    platformParticles=[]; boostParticles=[]; jumpParticles=[];
    classifiersInUse={platform:[],boost:[],jump:[]};
    grounded=false; wasGrounded=[false,false,false,false];
    if(backgroundRects.length===0) createBackground();
    gameStarted=true;
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
let edPlatforms = [];
let edJumpPads  = [];
let edSpawn     = {x:250, y:4500};

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

    // Resize handles
    if(edSelected){
        const obj=edGetSel();
        if(obj){
            const ww=edSelected.type==='jumppad'?50:obj.width, wh=edSelected.type==='jumppad'?10:obj.height;
            edDrawHandles(obj.x,obj.y,ww,wh);
        }
    }

    ctx.restore();
}

let edCursorWorld=null;

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
    for(let i=edPlatforms.length-1;i>=0;i--){const p=edPlatforms[i]; if(wx>=p.x&&wx<=p.x+p.width&&wy>=p.y&&wy<=p.y+p.height)return{type:'platform',index:i};}
    for(let i=edJumpPads.length-1; i>=0;i--){const j=edJumpPads[i];  if(wx>=j.x&&wx<=j.x+50&&wy>=j.y&&wy<=j.y+10)return{type:'jumppad',index:i};}
    return null;
}

function edGetSel(){ if(!edSelected)return null; return edSelected.type==='platform'?edPlatforms[edSelected.index]:edJumpPads[edSelected.index]; }

function edDeleteSelected(){
    if(!edSelected)return;
    if(edSelected.type==='platform')edPlatforms.splice(edSelected.index,1);
    if(edSelected.type==='jumppad') edJumpPads.splice(edSelected.index,1);
    edSelected=null;
}

// ── Canvas mouse events (editor mode only) ─────────────
canvas.addEventListener('mousedown', e=>{
    if(!editorOpen||edMode!=='edit')return;
    const sx=e.offsetX,sy=e.offsetY;

    if(edSpaceHeld||e.button===1){ edPanning=true; edPanStart={x:e.clientX,y:e.clientY}; edPanOrigin={x:edCamX,y:edCamY}; return; }
    if(e.button!==0)return;

    if(edTool==='select'){
        if(edSelected){ const obj=edGetSel(); if(obj){ const ww=edSelected.type==='jumppad'?50:obj.width, wh=edSelected.type==='jumppad'?10:obj.height; const h=edGetHandleName(sx,sy,obj.x,obj.y,ww,wh); if(h){edDragging=true;edDragHandle=h;edDragStart=edSW(sx,sy);edDragOriginal={x:obj.x,y:obj.y,width:ww,height:wh};return;} } }
        const hit=edHitTest(sx,sy); edSelected=hit;
        if(hit){edDragging=true;edDragHandle='move';edDragStart=edSW(sx,sy);const o=edGetSel();edDragOriginal={x:o.x,y:o.y};}
    }

    if(edTool==='platform'){
        const{x,y}=edSW(sx,sy); edDrawing=true; edDrawStart={wx:snapV(x),wy:snapV(y)};
        edGhostRect={x:edDrawStart.wx,y:edDrawStart.wy,width:SNAP,height:SNAP};
    }

    if(edTool==='jumppad'){const{x,y}=edSW(sx,sy); edJumpPads.push({x:snapV(x-25),y:snapV(y-5),strength:25}); edSelected={type:'jumppad',index:edJumpPads.length-1};}

    if(edTool==='spawn'){const{x,y}=edSW(sx,sy); edSpawn={x:snapV(x-25),y:snapV(y-25)};}

    if(edTool==='delete'){const hit=edHitTest(sx,sy);if(hit){if(hit.type==='platform')edPlatforms.splice(hit.index,1);if(hit.type==='jumppad')edJumpPads.splice(hit.index,1);edSelected=null;}}
});

canvas.addEventListener('mousemove', e=>{
    if(!editorOpen||edMode!=='edit')return;
    const sx=e.offsetX,sy=e.offsetY;
    edCursorWorld=edSW(sx,sy);
    document.getElementById('edCoordsInfo').textContent=`x:${Math.round(edCursorWorld.x)}  y:${Math.round(edCursorWorld.y)}`;

    if(edPanning){edCamX=edPanOrigin.x+(e.clientX-edPanStart.x); edCamY=edPanOrigin.y+(e.clientY-edPanStart.y);return;}

    if(edDrawing&&edTool==='platform'){
        const snx=snapV(edCursorWorld.x),sny=snapV(edCursorWorld.y);
        edGhostRect={x:Math.min(snx,edDrawStart.wx),y:Math.min(sny,edDrawStart.wy),width:Math.max(SNAP,Math.abs(snx-edDrawStart.wx)),height:Math.max(SNAP,Math.abs(sny-edDrawStart.wy))};
    }

    if(edDragging&&edSelected){
        const obj=edGetSel(); if(!obj)return;
        const{x:cwx,y:cwy}=edSW(sx,sy);
        const dx=cwx-edDragStart.wx, dy=cwy-edDragStart.wy;
        if(edDragHandle==='move'){obj.x=snapV(edDragOriginal.x+dx);obj.y=snapV(edDragOriginal.y+dy);}
        else if(edSelected.type==='platform'){
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
    edPanning=false;
    if(edDrawing&&edGhostRect&&edTool==='platform'){
        if(edGhostRect.width>=SNAP&&edGhostRect.height>=SNAP){edPlatforms.push({...edGhostRect});edSelected={type:'platform',index:edPlatforms.length-1};}
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
    if(!editorOpen||edMode!=='edit'||edTool!=='select'||!edSelected||edSelected.type!=='jumppad')return;
    const j=edJumpPads[edSelected.index];
    const v=prompt('Jump strength (default 25):',j.strength);
    if(v!==null&&!isNaN(+v))j.strength=+v;
});

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
        edPlatforms=(levelData.platforms||[]).map(p=>({...p}));
        edJumpPads =(levelData.jumpPads ||[]).map(j=>({...j}));
        edSpawn    =levelData.startPos?{...levelData.startPos}:{x:250,y:4500};
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
    platforms=(edPlatforms).map(p=>new Platform(p.x,p.y,p.width,p.height));
    jumpPads =(edJumpPads ).map(j=>new JumpPad(j.x,j.y,j.strength));
    startPos ={...edSpawn};
    player   =new Player(edSpawn.x,edSpawn.y);
    platformParticles=[]; boostParticles=[]; jumpParticles=[];
    classifiersInUse={platform:[],boost:[],jump:[]};
    grounded=false; wasGrounded=[false,false,false,false]; gravity=0.5; speed=5;

    cancelAnimationFrame(edRaf); edRaf=null;
    edMode='playtest';
    document.getElementById('editorHUD').classList.add('hidden');
    document.getElementById('playTestHUD').classList.remove('hidden');
    canvas.style.cursor='';
    gameStarted=true;
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
    edPlatforms=[]; edJumpPads=[]; edSpawn={x:250,y:4500};
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
    edPlatforms=(lvl.platforms||[]).map(p=>({...p}));
    edJumpPads =(lvl.jumpPads ||[]).map(j=>({...j}));
    edSpawn    =lvl.startPos?{...lvl.startPos}:{x:250,y:4500};
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
    const body={name,order,startPos:edSpawn,platforms:edPlatforms,jumpPads:edJumpPads};
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
