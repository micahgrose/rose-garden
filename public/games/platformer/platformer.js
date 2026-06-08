const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Classes
class Player {
    constructor(x, y){
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = 50;
        this.velocity = {x: 0, y: 0};

        this.stretchTarget = {width: 45, height: 60};
        this.stretchSpeed = 0.2;

        this.eyeSize = {width:10, height:15};
        this.eyePaddingR = {x: 10, y: 10};
        this.eyePaddingL = {x: 30, y: 10};

        this.pupilSize = {width:5, height:5};
        this.pupilPadding = {x: 2.5, y: 5};
    }
}

class Platform {
    constructor(x, y, width, height){
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
}

class JumpPad {
    constructor(x, y, strength = 25){
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = 10;
        this.strength = strength;

        this.animate = false;
        this.stickHeight = 20; // current height for animation
        this.stickTargetHeight = 30; // target height for animation
        this.targetY = y - 10; // Target position for animation
        this.speed = 0.9;
    }
}

class PlatformParticle{
    constructor(classifier){
        this.x = player.x + (Math.random()*(player.height + 15) - 7.5);
        this.y = player.y + player.height;
        this.size = Math.random()*5+5;
        this.direction = (this.x > player.x + player.width/2) ? 1 : -1;

        this.classifier = classifier;

        this.lifeSpan = Math.random()*300 + 200;
        this.dead = false;
    }
}

class BoostParticle {
    constructor(classifier){
        this.x = player.x + player.width + (Math.random()*10)-5;
        this.y = player.y + player.height + (Math.random()*10)-5;
        this.size = Math.random() * 5 + 5;
        this.speed = Math.random() *2 + 1;
        this.direction = Math.sign(player.velocity.x);

        this.classifier = classifier;

        this.lifeSpan = Math.random()*1500+500;
        this.dead = false;
        this.rising = true;
    }
}

class JumpParticle{
    constructor(classifier){
        this.x = player.x + Math.random()*player.width;
        this.y = player.y + player.height;
        this.size = Math.random()* 5 + 5;
        this.velocity = {x: Math.random()*3, y: (Math.random()*-7.5) - 12.5};
        this.gravity = 0.5;
        this.direction = (this.x > player.x + player.width/2) ? 1 : -1;

        this.classifier = classifier;

        this.lifeSpan = Math.random()*900 + 500;
        this.dead = false;
    }
}

// Game variables
let startPos         = null;
let player           = null;
let platforms        = null;
let jumpPads         = null;

let gravity          = 0.5;
const gravityMult    = 1.065;
const gravityFloor   = 5;

let speed            = 5;
const jumpStrength   = 15;
const maxVelocity    = {x: 10, y: 30};
const friction       = 0.85;

let grounded         = false;
let wasGrounded      = [false, false, false, false]; //track last few grounded states purely for updateStretch to fix jiggle
let clampLeft        = false;
let clampRight       = false;
let ceiling          = false;
let jumped           = false;

const world          = {width:5000, height:5000}; // Size of the game world
const camera         = {x:0, y:0, width:canvas.width, height:canvas.height}; // Camera view
const cameraSpeed    = 0.075; // How quickly the camera follows the player


//PARTICLE VARIABLES
let platformParticles       = [];
const platformParticleCount = 50;

let boostParticles          = [];
const boostParticleCount    = 50;
let boosting                = false;
const boostResetTime        = 500; // Time in milliseconds for boost to reset
let boostReady              = true; // Flag to check if boost is ready
let doBoostParticle         = false;

let jumpParticles           = [];
const jumpParticleCount     = 20;
let jumpHit                 = false;

let classifiersInUse        = {
    platform: [],
    boost: [],
    jump: []
};

//Levels:
const levels = {
    //jump pads are 20 pixels tall and 50 pizels wide (just a reminder to myself)
    0: {player: new Player(50, 50), platforms: new Platform(0, 500, 500, 20), jumpPads: new JumpPad(0, 480)},//testing level
    1: {
        startPos: {x:50, y:4400},
        player: new Player(1725, 2000),
        platforms: [
            new Platform(0, 4800, 500, 20), 
            new Platform(525, 4700, 500, 20),
            new Platform(1050, 4600, 500, 20),
            new Platform(1575, 4500, 500, 20),
            new Platform(2100, 4100, 200, 20),
            new Platform(2200, 3775, 255, 255),
            new Platform(2450, 4150, 200, 20),
            new Platform(2455, 4010, 50, 20),
            new Platform(1700, 3775, 100, 20)
        ],
        jumpPads:[
            new JumpPad(1950, 4480, 30),
            new JumpPad(2455, 3990, 20)
        ],
    }
}

// Game loop
function gameLoop(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    //Movement
    movePlayer();
    moveCamera();

    wasGrounded[3] = wasGrounded[2];
    wasGrounded[2] = wasGrounded[1];
    wasGrounded[1] = wasGrounded[0];
    wasGrounded[0] = grounded;

    //Collision && tracking
    checkJumpPad();
    checkCollision();
    updateStretch();
    updateEyePos();

    //Resetting forces on collisions
    if(grounded){resetGravity(); jumped = false;}
    if(ceiling){player.velocity.y = 0;}

    //Drawing
    drawBackground();
    handleParticles(); // also draws which I want to happen before platforms and jump pads so they are behind them
    drawPlayer();
    drawPlatforms();
    drawJumpPads();

    animFrameId = requestAnimationFrame(gameLoop);
}

// Input handling
let keys = [];
document.addEventListener("keydown", (e) => {
    if(!keys.includes(e.key)){
        keys.push(e.key);
    }
});

document.addEventListener("keyup", (e) => {
    keys = keys.filter(key => key !== e.key);
});

// Player movement
function movePlayer(){
    GORIGHT: if(keys.includes("ArrowRight") || keys.includes("d")){
        player.pupilPadding.x = 5;
        player.eyePaddingR.x = 15;
        player.eyePaddingL.x = 35;
        if(clampRight){break GORIGHT;}
        // Move player right
        player.velocity.x += speed;
    }

    GOLEFT: if(keys.includes("ArrowLeft") || keys.includes("a")){
        player.pupilPadding.x = 0;
        player.eyePaddingR.x = 5;
        player.eyePaddingL.x = 25;
        if(clampLeft){break GOLEFT;}
        // Move player left
        player.velocity.x -= speed;
    }
    
    if((keys.includes("ArrowUp") || keys.includes("w")) && (grounded || wasGrounded.includes(true))){ // gives jumping leniency
        // Make player jump
        player.velocity.y = -jumpStrength;
        jumped = true;
    } else if(!keys.includes("ArrowUp") && !keys.includes("w") && !grounded && player.velocity.y < 0 && jumped){
        // variable jump height
        player.velocity.y *= 0.9;
    }

    if(!grounded){
        player.velocity.y += gravity; // Apply gravity
        if(gravity < gravityFloor){gravity *= gravityMult;}else{gravity = gravityFloor;} // Increase gravity over time for a more natural fall
    }

    if(player.velocity.y > maxVelocity.y){player.velocity.y = maxVelocity.y;} // Limit fall speed
    if(player.velocity.x > maxVelocity.x){player.velocity.x = maxVelocity.x;} // Limit horizontal speed
    if(player.velocity.x < -maxVelocity.x){player.velocity.x = -maxVelocity.x;}

    //apply friction
    if(!boosting){player.velocity.x *= friction;}

    //speed boost
    if(keys.includes(" ") && (keys.includes("ArrowRight") || keys.includes("d") || keys.includes("ArrowLeft") || keys.includes("a")) && !boosting && boostReady){
        // give player a speed boost
        if(clampRight && (keys.includes("ArrowRight") || keys.includes("d"))){return;}
        if(clampLeft && (keys.includes("ArrowLeft") || keys.includes("a"))){return;}
        maxVelocity.x = 30;
        player.velocity.x *= 1.75;
        boosting = true;
        boostReady = false;
        doBoostParticle = true;

        setTimeout(() => {
            maxVelocity.x = 10;
            boosting = false;
            setTimeout(() => {boostReady = true;}, boostResetTime);
        }, 150);
    }

    // Update player position
    player.x += player.velocity.x;
    player.y += player.velocity.y;

    if(player.y > world.height + 500){
        // Reset player position if they fall out of the world
        player.x = startPos.x;
        player.y = startPos.y;
        player.velocity = {x: 0, y: 0};
        gravity = 0.5;
        speed = 5;
    }
}

// Camera movement
function moveCamera(){
    const centerPlayerX = player.x + player.width / 2;
    const centerPlayerY = player.y + player.height / 2;
    // clamp camera target to world bounds
    let targetX = centerPlayerX - camera.width / 2;
    let targetY = Math.max(0, Math.min(world.height - camera.height, centerPlayerY - camera.height / 2));

    //Camera lerp
    camera.x += (targetX - camera.x) * cameraSpeed;
    camera.y += (targetY - camera.y) * cameraSpeed;
}


// Collision detection
function checkCollision(){

    grounded = false;
    clampLeft = false;
    clampRight = false;
    ceiling = false;

    for(let platform of platforms){
        // Skip of no overlap
        if(player.x + player.width <= platform.x || player.x >= platform.x + platform.width) continue;
        if(player.y + player.height <= platform.y || player.y >= platform.y + platform.height) continue;

        //calculate overlap on each axis
        const overlapX = Math.min(player.x + player.width - platform.x, platform.x + platform.width - player.x);
        const overlapY = Math.min(player.y + player.height - platform.y, platform.y + platform.height - player.y);

        //fix greatest overlap
        if(overlapX > overlapY){
            //floor / ceiling
            if(player.y + player.height/2 < platform.y + platform.height/2){
                //ground hit
                player.y -= overlapY;
                grounded = true;
            } else if(player.y + player.height/2 > platform.y + platform.height/2){
                //ceiling hit
                player.y += overlapY;
                ceiling = true;
            }
        } else{// only "else" to prefer to wall on corner hits.
            //Wall
            if(player.x + player.width/2 < platform.x + platform.width/2){
                //left wall collide, keep from going right
                player.x -= overlapX;
                clampRight = true;
            } else if( player.x + player.width/2 > platform.x + platform.width/2){
                //right wall collide, keep from going left
                player.x += overlapX;
                clampLeft = true;
            }
        }
    }
}

function checkJumpPad(){
    for(let pad of jumpPads){
        if(player.y + player.height >= pad.y && player.y < pad.y + pad.height){
            if(player.x + player.width > pad.x && player.x < pad.x + pad.width){
                resetGravity();
                jumped = false;
                pad.animate = true;
                player.velocity.y = -pad.strength; // Set vertical velocity for jump
                player.y = pad.y - player.height; // Give player an extra nudge to make it look nicer
                jumpHit = true;
                return true;
            }
        }
    }
    return false;
}

// Drawing functions
const backgroundRects = [];
function createBackground(){
    for(let i = 0; i < 50; i++){
        let size = Math.random() * 300 + 200;
        backgroundRects.push({
            x: Math.random() * world.width,
            y: Math.random() * world.height,
            width: size,
            height: size,
        });
    }
}
function drawBackground(){
    ctx.fillStyle = "rgb(130, 230, 130)";
    ctx.globalAlpha = 0.4;
    for(let rect of backgroundRects){
        let screenX = rect.x - camera.x*0.5;
        let screenY = rect.y - camera.y*0.5;

        ctx.save();
        ctx.translate(screenX + rect.width/2, screenY + rect.height/2);
        ctx.rotate(Math.PI / 4); // Rotate 45 degrees
        ctx.fillRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height);
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

function drawPlayer(){
    ctx.fillStyle = "blue";
    ctx.strokeStyle = "rgb(50, 50, 200)";
    ctx.lineWidth = 1;
    ctx.fillRect(player.x-camera.x, player.y-camera.y, player.width, player.height);
    ctx.strokeRect(player.x-camera.x, player.y-camera.y, player.width, player.height);

    //Draw eyes
    ctx.fillStyle = "white";
    ctx.fillRect(player.x + player.eyePaddingR.x - camera.x, player.y + player.eyePaddingR.y - camera.y, player.eyeSize.width, player.eyeSize.height);
    ctx.fillRect(player.x + player.eyePaddingL.x - camera.x, player.y + player.eyePaddingL.y - camera.y, player.eyeSize.width, player.eyeSize.height);

    //Draw pupils
    ctx.fillStyle = "black";
    ctx.fillRect(player.x + player.eyePaddingR.x + player.pupilPadding.x - camera.x, player.y + player.eyePaddingR.y + player.pupilPadding.y - camera.y, player.pupilSize.width, player.pupilSize.height);
    ctx.fillRect(player.x + player.eyePaddingL.x + player.pupilPadding.x - camera.x, player.y + player.eyePaddingL.y + player.pupilPadding.y - camera.y, player.pupilSize.width, player.pupilSize.height);
}
function updateStretch(){
    if(!grounded && !wasGrounded[0] && !wasGrounded[1]){
        // lerp to stretch target
        player.width += (player.stretchTarget.width - player.width) * player.stretchSpeed;
        player.height += (player.stretchTarget.height - player.height) * player.stretchSpeed;
    } else{
        const bottom = player.y + player.height;//Save where the feet are
        // lerp back to original size
        player.width += (50 - player.width) * player.stretchSpeed;
        player.height += (50 - player.height) * player.stretchSpeed;
        player.y = bottom - player.height; // place feet on floor
        if(Math.abs(player.width - 50) < 1){player.width = 50;} // Snap to original size when close enough
        if(Math.abs(player.height - 50) < 1){player.height = 50;}
    }
}
function updateEyePos(){
    //Pupils move up if vertical velocity is negative (jumping) and down if positive (falling), mapped to a range of 0-10 pixels for padding
    let target = 0;
    if(player.velocity.y > 0){ // Falling
        target = 10;
    } else if(player.velocity.y < 0){ // Jumping
        target = 0;
    }else{ // Neutral
        target = 5;
    }
    //Lerp pupil padding to target for better animation
    player.pupilPadding.y += (target - player.pupilPadding.y) * 0.1;
}

function drawPlatforms(){
    ctx.fillStyle = "gray";
    ctx.strokeStyle = "gray";
    ctx.lineWidth = 2;
    for(let platform of platforms){
        //Stroke first to ensure no seams
        ctx.strokeRect(platform.x-camera.x, platform.y-camera.y, platform.width, platform.height);

        ctx.fillRect(platform.x-camera.x, platform.y-camera.y, platform.width, platform.height);
    }
}

function drawJumpPads(){
    ctx.fillStyle = "rgb(255, 246, 113)";
    ctx.strokeStyle = "rgb(57, 57, 57)";
    ctx.lineWidth = 2;
    for(let pad of jumpPads){
        if(pad.animate){
            pad.y += (pad.targetY - pad.y) * pad.speed; // Animate jump pad moving down
            pad.stickHeight += (pad.stickTargetHeight - pad.stickHeight) * pad.speed; // Animate stick height
            if(Math.abs(pad.y - pad.targetY) < 1){
                pad.animate = false; // Stop animation when close enough to target
                pad.y = pad.targetY;
                pad.stickHeight = pad.stickTargetHeight;
            }
        } else{
            pad.speed = 0.5;
            pad.y += ((pad.targetY + 10) - pad.y) * pad.speed; // Animate jump pad moving back up
            pad.stickHeight += (20 - pad.stickHeight) * pad.speed; // Animate stick height back to normal
            if(Math.abs(pad.y - pad.targetY) < 1){
                pad.y = pad.targetY + 10;
                pad.stickHeight = 20;
                pad.speed = 0.9;
            }
        }
        ctx.beginPath();
        ctx.roundRect(pad.x-camera.x, pad.y-camera.y, pad.width, pad.height, [10]);
        ctx.stroke();
        ctx.strokeRect(pad.x+20-camera.x, pad.y-camera.y, 10, pad.stickHeight);

        ctx.beginPath();
        ctx.roundRect(pad.x-camera.x, pad.y-camera.y, pad.width, pad.height, [10]);
        ctx.fill();
        ctx.fillRect(pad.x+20-camera.x, pad.y-camera.y, 10, pad.stickHeight);
    }
}

function handleParticles(){

    if(!wasGrounded.includes(true) && grounded){
        makeParticles(classifiersInUse.platform, platformParticles, PlatformParticle, platformParticleCount);
    }
    if(doBoostParticle){
        makeParticles(classifiersInUse.boost, boostParticles, BoostParticle, boostParticleCount);
        doBoostParticle = false;
    }
    if(jumpHit){
        makeParticles(classifiersInUse.jump, jumpParticles, JumpParticle, jumpParticleCount);
        jumpHit = false;
    }
    
    //Filter out dead particles
    platformParticles = platformParticles.filter(particle => !particle.dead);
    boostParticles = boostParticles.filter(particle => !particle.dead);
    jumpParticles = jumpParticles.filter(particle => !particle.dead);

    // Update Particle Position
        //Platform particles:
    for(let particle of platformParticles){
        particle.x += (Math.random()*1)*particle.direction;
        particle.y -= Math.random()*0.2 + 0.1;
    }

        //Boost particles:
    for(let particle of boostParticles){
        particle.x -= particle.speed * particle.direction
        if(particle.rising){
            particle.y -= Math.random()*0.8;
        } else{
            particle.y += Math.random()*0.25;
        }
    }

        //Jump particles:
    for(let particle of jumpParticles){
        particle.velocity.y += particle.gravity;
        particle.x += particle.velocity.x * particle.direction;
        particle.y += particle.velocity.y;
    }


    //Call draw functions
    drawPlatformParticles();
    drawBoostParticles();
    drawJumpParticles();



    //Actually drawing the particles

    function drawPlatformParticles(){
        ctx.fillStyle = 'gray';
        ctx.strokeStyle = 'darkgray';
        ctx.lineWidth = 1;

        for(let particle of platformParticles){
            ctx.strokeRect(particle.x - camera.x, particle.y - camera.y, particle.size, particle.size)
            ctx.fillRect(particle.x - camera.x, particle.y - camera.y, particle.size, particle.size);
        }
    }
    function drawBoostParticles(){
        ctx.strokeStyle = "rgb(210, 210, 210)";
        ctx.fillStyle = "rgb(245, 245, 245)";
        ctx.lineWidth = 2;

        for(let particle of boostParticles){
            ctx.strokeRect(particle.x - camera.x, particle.y - camera.y, particle.size, particle.size);
            ctx.fillRect(particle.x - camera.x, particle.y - camera.y, particle.size, particle.size);
        }
    }
    function drawJumpParticles(){
        ctx.fillStyle = 'rgb(230, 221, 88)';
        for(particle of jumpParticles){
            ctx.fillRect(particle.x - camera.x, particle.y - camera.y, particle.size, particle.size);
        }
    }
}

function makeParticles(classifierID, typeList, type, count){
    let classifier = 1;
    while(classifierID.includes(classifier)){
        classifier ++;
    }

    classifierID.push(classifier);

    for(let i = 0; i < count; i++){
        typeList.push(new type(classifier));
    }

    let newParticles = typeList.filter(particle => particle.classifier == classifier);
    for(let particle of newParticles){
        setTimeout(() => {
            if(type == BoostParticle){particle.rising = false;}
            setTimeout(() => {
                particle.dead = true;
            }, particle.lifeSpan/2);
        }, particle.lifeSpan/2)
    }

    setTimeout(() => {
        classifierID.splice(0, 1);
    }, 5000); // free up classifier after its unused
}

//Reset functions

function resetGravity(){
    gravity = 0.5;
    player.velocity.y = 0;
}

function resetSpeed(){
    speed = 5;
}

// Start the game
function startLevel(lvl){
    startPos  = levels[lvl].startPos;
    player    = levels[lvl].player;
    platforms = levels[lvl].platforms;
    jumpPads  = levels[lvl].jumpPads;

    createBackground();
    gameLoop();
}

let animFrameId  = null;
let gameStarted  = false;

const menu             = document.getElementById('menu');
const controlsOverlay  = document.getElementById('controlsOverlay');

document.getElementById('playBtn').addEventListener('click', () => {
    menu.classList.add('hidden');
    if(!gameStarted){
        gameStarted = true;
        startLevel(1);
    } else {
        gameLoop();
    }
});

document.getElementById('controlsBtn').addEventListener('click', () => {
    controlsOverlay.classList.remove('hidden');
});
document.getElementById('closeControlsBtn').addEventListener('click', () => {
    controlsOverlay.classList.add('hidden');
});

document.getElementById('quitBtn').addEventListener('click', () => {
    window.location.href = '/';
});

document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && gameStarted){
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
        menu.classList.remove('hidden');
    }
});