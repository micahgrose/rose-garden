const goBtn = document.getElementById('stopGo');
const stepper = document.getElementById('step');
const randBtn = document.getElementById('randGen');
const randIn = document.getElementById('randGenIn');
const overlaySelect = document.getElementById('overlaySelect');
let overlay = true;
overlaySelect.addEventListener('change', () => {
	overlay = !overlay;
});

let cellIdCounter = 0;

class Cell{
	constructor(x, y, type, dir=1, clockwise=true){
		this.id = cellIdCounter++;
		this.x = x;
		this.y = y;
		this.type = type;
		this.dir = dir; // 4:up, 3:right, 2:down, 1:left
		this.clockwise = clockwise;

		grid[x][y] = this;

		this.element = document.createElement('div')
		this.element.classList.add(type);
		if(type === 'rotate' && !clockwise) this.element.classList.add('ccw');
		this.element.style.zIndex = '-1';
		this.transform();
		document.body.appendChild(this.element);

		if(type == 'static') return;
		this.element.onclick = (e) => {
			if(placingType) return; // let checkDrag handle placing/deleting
			e.stopPropagation();
			if(go || step) return;
			const t = this.type, d = this.dir, cw = this.clockwise;
			clearHistory();
			this.kill();
			placingType = t;
			ghostDir = d;
			ghostClockwise = cw;
			pickupFromGrid = true;
			ghostEl.className = t;
			ghostEl.classList.toggle('ccw', t === 'rotate' && !cw);
			ghostEl.style.display = 'block';
			ghostEl.style.opacity = '0.55';
			ghostEl.style.transform = `translate(${ghostX * tile}px, ${ghostY * tile}px) rotate(${rotateVec[d]}deg)${(t === 'rotate' && !cw) ? ' scaleX(-1)' : ''}`;
			ghostEl.style.outline = '2px solid #00cfff88';
			document.querySelectorAll('.inv-item').forEach(el => el.classList.remove('active'));
			document.querySelector(`.inv-item[data-type="${t}"]`)?.classList.add('active');
		};
	}

	rotate(){
		this.dir = (this.dir & 3) + 1;
		this.transform();
	}

	action(){
		switch(this.type){
			case 'rotate':
				for(let i = 1; i < 5; i++){
					let cell = grid[this.x + dirVec[i].x]?.[this.y + dirVec[i].y];
					if(cell && cell.type != 'static'){
						cell.dir = this.clockwise
							? (cell.dir % 4) + 1          // CW: 1→2→3→4→1
							: ((cell.dir + 2) % 4) + 1;   // CCW: 1→4→3→2→1
						cell.transform();
					}
				}
				break;

			case 'push': {
				let chain = [];
				let next = grid[this.x + dirVec[this.dir].x]?.[this.y + dirVec[this.dir].y];
				while(next){
					if(next.type == 'static') return;
					if(next.type === 'delete'){
						// cell at back of chain (or push cell itself) enters the deleter and dies
						if(chain.length > 0){
							chain[chain.length - 1].kill();
							for(let i = chain.length - 2; i >= 0; i--) chain[i].move(this.dir);
							chain.slice(0, -1).forEach(c => c.transform());
							this.move(); this.transform();
						} else {
							this.kill();
						}
						return;
					}
					chain.push(next);
					next = grid[next.x + dirVec[this.dir].x][next.y + dirVec[this.dir].y];
				}
				for(let i = chain.length - 1; i >= 0; i--) chain[i].move(this.dir);
				chain.forEach(c => c.transform());
				this.move(); this.transform();
				break;
			}

			case 'generator': {
				const backDir = ((this.dir + 1) % 4) + 1; // opposite of facing dir
				const behind = grid[this.x + dirVec[backDir].x]?.[this.y + dirVec[backDir].y];
				if(!behind || behind.type === 'static') return;

				// build push chain in front, abort if wall is hit
				const chain = [];
				let next = grid[this.x + dirVec[this.dir].x]?.[this.y + dirVec[this.dir].y];
				while(next){
					if(next.type === 'static' || next.type === 'delete') return;
					chain.push(next);
					next = grid[next.x + dirVec[this.dir].x]?.[next.y + dirVec[this.dir].y];
				}
				for(let i = chain.length - 1; i >= 0; i--) chain[i].move(this.dir);
				chain.forEach(c => c.transform());

				// place a copy of the cell behind into the now-empty front tile
				const newX = this.x + dirVec[this.dir].x;
				const newY = this.y + dirVec[this.dir].y;
				if(grid[newX]) cells.push(new Cell(newX, newY, behind.type, behind.dir, behind.clockwise));
				break;
			}

		}
	}

	move(dir = this.dir){
		grid[this.x][this.y] = null;

		this.x += dirVec[dir].x;
		this.y += dirVec[dir].y;

		if(!grid[this.x]){ this.kill(); return; }
		if(grid[this.x][this.y]?.type === 'delete'){ this.kill(); return; }
		grid[this.x][this.y] = this;
	}

	transform(){
		const flip = (this.type === 'rotate' && !this.clockwise) ? ' scaleX(-1)' : '';
		this.element.style.transform = `translate(${this.x*tile}px, ${this.y*tile}px) rotate(${rotateVec[this.dir]}deg)${flip}`;
	}

	kill(){
		this.element.remove();
		if(grid[this.x]?.[this.y] === this){
			grid[this.x][this.y] = null;
		}
		const i = cells.indexOf(this);
		if (i !== -1) cells.splice(i, 1);
	}
}






const typeVec = {
	1:'mobile',
	2:'push',
	3:'rotate',
	4:'static',
	5:'generator',
	6:'delete'
}

function randGenerate(num){
	const n = parseInt(num, 10);
	if(isNaN(n) || n <= 0) return;
	let attempts = 0;
	for(let i = 0; i < n; i++){
		let x, y;
		do {
			x = Math.floor(Math.random() * gridCols);
			y = Math.floor(Math.random() * gridRows);
			if(++attempts > gridCols * gridRows * 4){ msg('not enough space!'); return; }
		} while(grid[x][y]);

		let type = '';
		if(Math.floor(Math.random()*3) == 2){
			type = typeVec[Math.floor(Math.random()*6)+1];
		} else{
			type = typeVec[Math.floor(Math.random()*3)+1];
		}
		let rot = Math.floor(Math.random()*4)+1; 
		oldCells.push([x, y, type, rot]);
		cells.push(new Cell(x, y, type, rot));
	}
}

const tile = 50;

const gridCols = Math.floor(window.innerWidth / tile);
const gridRows = Math.floor(window.innerHeight / tile);
const grid = [];

for(let x = -1; x < gridCols; x++){
	grid[x] = [];
	for(let y = -1; y < gridRows; y++){
		grid[x][y] = null;
	}
}


const dirVec = {
	4:{x:0, y:-1},
	3:{x:1, y:0},
	2:{x:0, y:1},
	1:{x:-1, y:0}
}

const rotateVec = {
	1:270,
	2:180,
	3:90,
	4:0
}

document.addEventListener('click', checkDrag);
document.addEventListener('keydown', checkRotate);

let moveListeners = true;
let uiFocused = false;
document.addEventListener('focusin', (e) => {
	if(e.target.matches('button, input, select')) uiFocused = true;
});
document.addEventListener('focusout', (e) => {
	if(e.target.matches('button, input, select')) uiFocused = false;
});

let topBarOpen = false;

function checkDrag(){
	if(topBarOpen) return;
	if(uiFocused) return;
	if(placingType) placeOrDelete();
}

function checkRotate(event){
	if(topBarOpen) return;
	if(uiFocused) return;
	const key = event.key;
	if(key === 'Escape'){ cancelPlacing(); return; }
	if(key === '1'){ setPlacingType('mobile'); return; }
	if(key === '2'){ setPlacingType('push'); return; }
	if(key === '3'){ setPlacingType('rotate'); return; }
	if(key === '4'){ setPlacingType('static'); return; }
	if(key === '5'){ setPlacingType('generator'); return; }
	if(key === '6' || key === 'Delete'){ setPlacingType('delete'); return; }
	if(key === 'r' && placingType){
		if(placingType === 'rotate'){
			ghostClockwise = !ghostClockwise;
			ghostEl.classList.toggle('ccw', !ghostClockwise);
			ghostEl.style.transform = `translate(${ghostX * tile}px, ${ghostY * tile}px) rotate(${rotateVec[ghostDir]}deg)${ghostFlip()}`;
		} else {
			ghostDir = (ghostDir % 4) + 1;
			ghostEl.style.transform = `translate(${ghostX * tile}px, ${ghostY * tile}px) rotate(${rotateVec[ghostDir]}deg)`;
		}
	}
	if(key === 'Enter'){ prepGen(); }
}

let cells = [];
let oldCells = [];
let history = [];
const MAX_HISTORY = 500;
let actionQueue = [];

function snapshotCells(){
	return cells
		.filter(c => c.type !== 'static')
		.map(c => [c.id, c.x, c.y, c.type, c.dir, c.clockwise]);
}

function clearHistory(){
	history = [];
	actionQueue = [];
	updateStepBackBtn();
	markDirtyForReset();
}

// ── Pre-go reset ──────────────────────────────────────
let preGoSnap = null;
let resetAllowed = false;

function updateResetBtn(){
	const btn = document.getElementById('resetBtn');
	if(btn) btn.disabled = !resetAllowed;
}

function markDirtyForReset(){
	resetAllowed = false;
	preGoSnap = null;
	updateResetBtn();
}

function resetToPreGo(){
	if(!preGoSnap || go || step) return;
	resetAllowed = false;
	const snap = preGoSnap;
	preGoSnap = null;
	updateResetBtn();
	for(let i = cells.length - 1; i >= 0; i--){
		if(cells[i].type !== 'static') cells[i].kill();
	}
	for(const x in grid) for(const y in grid[x]){
		if(grid[x][y] && grid[x][y].type !== 'static') grid[x][y] = null;
	}
	for(const s of snap){
		if(grid[s[0]] !== undefined) cells.push(new Cell(s[0], s[1], s[2], s[3], s[4]));
	}
	history = [];
	actionQueue = [];
	updateStepBackBtn();
}

function buildQueue(){
	actionQueue = [];
	if(cells.some(c => c.type === 'generator')) actionQueue.push('generator');
	if(cells.some(c => c.type === 'rotate'))    actionQueue.push('rotate');
	if(cells.some(c => c.type === 'push'))      actionQueue.push('push');
}

function updateStepBackBtn(){
	const btn = document.getElementById('stepBack');
	if(btn) btn.disabled = history.length === 0;
}

function stepBack(){
	if(go) return;
	if(history.length === 0) return;
	const snap = history.pop();

	const snapById = new Map(snap.map(s => [s[0], s]));
	const nonStatic = cells.filter(c => c.type !== 'static');
	const currentById = new Map(nonStatic.map(c => [c.id, c]));

	// Kill cells that weren't in snapshot (created this tick by generator)
	for(const [id, cell] of currentById){
		if(!snapById.has(id)) cell.kill();
	}

	// Phase 1: clear grid slots for all cells about to be moved
	for(const [id, s] of snapById){
		const cell = currentById.get(id);
		if(cell && grid[cell.x]?.[cell.y] === cell) grid[cell.x][cell.y] = null;
	}

	// Phase 2: move existing cells back (CSS transition animates smoothly)
	for(const [id, s] of snapById){
		const cell = currentById.get(id);
		if(cell){
			cell.x = s[1]; cell.y = s[2];
			cell.dir = s[4]; cell.clockwise = s[5];
			grid[cell.x][cell.y] = cell;
			cell.transform();
		} else {
			// Cell was consumed by deleter — recreate it at its prior position
			cells.push(new Cell(s[1], s[2], s[3], s[4], s[5]));
		}
	}

	updateStepBackBtn();
}

function oppositeDir(dir){ return dir <= 2 ? dir + 2 : dir - 2; }

function runPhase(phase){
	if(phase === 'generator'){
		for(const cell of [...cells]){ if(cell.type === 'generator') cell.action(); }
	} else if(phase === 'rotate'){
		for(const cell of cells){ if(cell.type === 'rotate') cell.action(); }
	} else if(phase === 'push'){
		runPushPhase();
	}
}

function runPushPhase(){
	const allPushers = cells.filter(c => c.type === 'push');
	const processed  = new Set();

	// cells stacked directly behind p going in dir
	function expandBehind(p, dir){
		const bd = oppositeDir(dir), res = [];
		let bx = p.x + dirVec[bd].x, by = p.y + dirVec[bd].y, c = grid[bx]?.[by];
		while(c && c.type === 'push' && c.dir === dir){
			res.push(c); bx += dirVec[bd].x; by += dirVec[bd].y; c = grid[bx]?.[by];
		}
		return res;
	}

	// deduplicate by id, preserving order
	function dedup(arr){ return [...new Map(arr.map(c => [c.id, c])).values()]; }

	// winning direction for a group (0 = deadlock)
	function groupWinDir(g){
		const r = g.filter(c => c.dir === 3).length, l = g.filter(c => c.dir === 1).length;
		const d = g.filter(c => c.dir === 2).length, u = g.filter(c => c.dir === 4).length;
		if(r + l >= d + u){ if(r > l) return 3; if(l > r) return 1; }
		else               { if(d > u) return 2; if(u > d) return 4; }
		return 0;
	}

	// cell in group furthest in dir
	function frontOf(g, dir){
		return g.reduce((b, c) => {
			if(!b) return c;
			if(dir === 3 && c.x > b.x) return c; if(dir === 1 && c.x < b.x) return c;
			if(dir === 2 && c.y > b.y) return c; if(dir === 4 && c.y < b.y) return c;
			return b;
		}, null);
	}

	// ── 1. Build initial conflict groups from direct head-to-head adjacent pairs ──
	const groups = [];
	const seenPairs = new Set();
	for(const p of allPushers){
		const opp = grid[p.x + dirVec[p.dir].x]?.[p.y + dirVec[p.dir].y];
		if(!opp || opp.type !== 'push' || opp.dir !== oppositeDir(p.dir)) continue;
		const key = [p.id, opp.id].sort().join(',');
		if(seenPairs.has(key)) continue;
		seenPairs.add(key);
		groups.push(dedup([...expandBehind(p, p.dir), p, opp, ...expandBehind(opp, opp.dir)]));
	}

	// ── 2. Merge groups that already share cells ──
	let chg = true;
	while(chg){
		chg = false;
		for(let i = 0; i < groups.length && !chg; i++){
			const ids = new Set(groups[i].map(c => c.id));
			for(let j = i + 1; j < groups.length && !chg; j++){
				if(groups[j].some(c => ids.has(c.id))){
					groups[i] = dedup([...groups[i], ...groups[j]]);
					groups.splice(j, 1);
					chg = true;
				}
			}
		}
	}

	// ── 3. Cascade merge: if the winning front would hit another pusher, absorb it ──
	chg = true;
	while(chg){
		chg = false;
		for(let i = 0; i < groups.length && !chg; i++){
			const wd = groupWinDir(groups[i]); if(!wd) continue;
			const f  = frontOf(groups[i], wd);
			const nb = grid[f.x + dirVec[wd].x]?.[f.y + dirVec[wd].y];
			if(!nb || nb.type !== 'push') continue;
			const j = groups.findIndex((g, idx) => idx !== i && g.some(c => c === nb));
			if(j >= 0){
				groups[i] = dedup([...groups[i], ...groups[j]]);
				groups.splice(j, 1);
			} else {
				groups[i] = dedup([...groups[i], nb, ...expandBehind(nb, nb.dir)]);
			}
			chg = true;
		}
	}

	// mark all conflict-group cells as processed
	for(const g of groups) for(const c of g) processed.add(c.id);

	// ── 4. Execute group movements ──
	for(const g of groups){
		const wd = groupWinDir(g); if(!wd) continue;
		const f  = frontOf(g, wd);

		// trace any non-conflict cells in front that need to be pushed first
		const extra = [];
		let cx = f.x + dirVec[wd].x, cy = f.y + dirVec[wd].y, nxt = grid[cx]?.[cy];
		let extraBlocked = false;
		while(nxt){
			if(nxt.type === 'static'){ extraBlocked = true; break; }
			if(nxt.type === 'delete') break; // handled by move()
			extra.push(nxt); cx += dirVec[wd].x; cy += dirVec[wd].y; nxt = grid[cx]?.[cy];
		}
		if(extraBlocked) continue;

		// sort group: frontmost in winning direction moves first
		const sorted = [...g].sort((a, b) => {
			if(wd === 3) return b.x - a.x; if(wd === 1) return a.x - b.x;
			if(wd === 2) return b.y - a.y; if(wd === 4) return a.y - b.y; return 0;
		});

		for(let i = extra.length - 1; i >= 0; i--){ if(cells.indexOf(extra[i]) !== -1){ extra[i].move(wd); extra[i].transform(); } }
		for(const c of sorted){                      if(cells.indexOf(c)       !== -1){ c.move(wd);       c.transform();       } }
	}

	// ── 5. Standalone pushers (not in any conflict) ──
	for(const p of allPushers){
		if(processed.has(p.id) || cells.indexOf(p) === -1) continue;
		let chain = [], blocked = false;
		let cx = p.x + dirVec[p.dir].x, cy = p.y + dirVec[p.dir].y, nxt = grid[cx]?.[cy];
		while(nxt){
			if(nxt.type === 'static'){ blocked = true; break; }
			if(nxt.type === 'delete'){
				if(chain.length > 0){ chain[chain.length-1].kill(); for(let i=chain.length-2;i>=0;i--)chain[i].move(p.dir); chain.slice(0,-1).forEach(c=>c.transform()); p.move(); p.transform(); }
				else p.kill();
				blocked = true; break;
			}
			chain.push(nxt); cx += dirVec[p.dir].x; cy += dirVec[p.dir].y; nxt = grid[cx]?.[cy];
		}
		if(!blocked){
			processed.add(p.id);
			for(let i = chain.length-1; i >= 0; i--) chain[i].move(p.dir);
			chain.forEach(c => c.transform());
			p.move(); p.transform();
		}
	}
}

createReferenceCoordinates();

let frames = 0;
function loop(){
	requestAnimationFrame(loop);
	frames ++;

	if(frames >= 25 && (go||step)){
		step = false;
		frames = 0;
		if(!go && preGoSnap){ resetAllowed = true; updateResetBtn(); }

		if(actionQueue.length === 0) buildQueue();

		if(actionQueue.length > 0){
			if(history.length >= MAX_HISTORY) history.shift();
			history.push(snapshotCells());
			updateStepBackBtn();

			runPhase(actionQueue.shift());

			for(let i = cells.length - 1; i >= 0; i--){
				const c = cells[i];
				if(c.x < 0 || c.y < 0 || c.x >= gridCols || c.y >= gridRows) c.kill();
			}
		}
		document.removeEventListener('click', checkDrag);
		document.removeEventListener('keydown', checkRotate);
		moveListeners = false;

		cancelPlacing();
		document.getElementById('inventory').classList.add('disabled');

		randBtn.style.backgroundColor = 'darkgrey';
		randBtn.style.visibility = 'hidden';
	} else if(!go && !step){
		randBtn.style.backgroundColor = 'lightGrey';
		randBtn.style.visibility = 'visible';

		document.getElementById('inventory').classList.remove('disabled');

		if(!moveListeners){
			moveListeners = true;
			document.addEventListener('click', checkDrag);
			document.addEventListener('keydown', checkRotate);
		}
	}

}
requestAnimationFrame(loop);

let go = false;
let step = false;


function start(){
	preGoSnap = cells.filter(c => c.type !== 'static').map(c => [c.x, c.y, c.type, c.dir, c.clockwise]);
	resetAllowed = false;
	updateResetBtn();
	go = true;
	goBtn.onclick = stop;
	goBtn.innerHTML = 'S T O P';
}
function stop(){
	go = false;
	goBtn.onclick = start;
	goBtn.innerHTML = 'G O';
	if(preGoSnap){ resetAllowed = true; updateResetBtn(); }
}
function stepGo(){
	if(!preGoSnap){
		preGoSnap = cells.filter(c => c.type !== 'static').map(c => [c.x, c.y, c.type, c.dir, c.clockwise]);
	}
	step = true;
}
function clearAll(){
	if(go || step) return;
	gameConfirm('Clear all cells?', (confirmed) => {
		if(!confirmed) return;
		clear(false);
	});
}

function prepGen(){
	clear(overlay);
	if(go || step) return;
	markDirtyForReset();
	randGenerate(randIn.value);
}


function clear(overlay=true, wipeOld=true){
	if(overlay) return;
	if(go || step) return;
	while(cells.length){
		cells[0].kill();
	}
	for(let x in grid){
		for(let y in grid[x]){
			grid[x][y] = null;
		}
	}
	if(wipeOld) oldCells = [];
	clearHistory();
}


function createReferenceCoordinates(){
	for(let i = 0; i < gridCols; i++){
		let p = document.createElement('p');
		p.classList.add('referenceCoords');
		p.style.left = i*tile + 'px';
		p.style.top = '95vh';
		p.innerHTML = i;
		document.body.appendChild(p);
	}
	for(let i = 0; i < gridRows; i++){
		let p = document.createElement('p');
		p.classList.add('referenceCoords');
		p.style.top = i*tile + 'px';
		p.style.left = '98vw';
		p.innerHTML = i;
		document.body.appendChild(p);
	}
}





// ── Save / Load ───────────────────────────────────────
const SAVES_KEY = 'cells_saves';

function refreshSaveSelect(){
	const sel = document.getElementById('saveSelect');
	const saves = JSON.parse(localStorage.getItem(SAVES_KEY) || '[]');
	sel.innerHTML = '<option value="">-- saves --</option>';
	saves.forEach((s, i) => {
		const opt = document.createElement('option');
		opt.value = i;
		opt.textContent = s.name;
		sel.appendChild(opt);
	});
}

function saveGrid(){
	if(go || step) return;
	if(!oldCells.length){ msg('Nothing to save!'); return; }
	gamePrompt('Save name:', (name) => {
		if(!name) return;
		const saves = JSON.parse(localStorage.getItem(SAVES_KEY) || '[]');
		saves.push({ name, cells: oldCells.map(c => [...c]) });
		localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
		refreshSaveSelect();
	});
}

function loadGrid(){
	if(go || step) return;
	const sel = document.getElementById('saveSelect');
	const idx = parseInt(sel.value, 10);
	if(isNaN(idx)) return;
	const saves = JSON.parse(localStorage.getItem(SAVES_KEY) || '[]');
	const save = saves[idx];
	if(!save) return;
	clear(false, true);
	oldCells = save.cells.map(c => [...c]);
	for(let list of oldCells){
		cells.push(new Cell(list[0], list[1], list[2], list[3], list[4]));
	}
}

function deleteSave(){
	const sel = document.getElementById('saveSelect');
	const idx = parseInt(sel.value, 10);
	if(isNaN(idx)) return;
	const saves = JSON.parse(localStorage.getItem(SAVES_KEY) || '[]');
	saves.splice(idx, 1);
	localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
	refreshSaveSelect();
}

refreshSaveSelect();

function msg(text){
	const el = document.createElement('p');
	el.className = 'message';
	el.textContent = text;
	document.body.appendChild(el);
	setTimeout(() => el.remove(), 2000);
}

const _overlay = document.getElementById('dialogOverlay');
function _showOverlay(){ _overlay.classList.remove('hidden'); }
function _hideOverlay(){ _overlay.classList.add('hidden'); }

function gameConfirm(message, callback){
	document.getElementById('confirmMsg').textContent = message;
	const box = document.getElementById('gameConfirm');
	box.classList.remove('hidden');
	_showOverlay();
	const done = (result) => { box.classList.add('hidden'); _hideOverlay(); callback(result); };
	document.getElementById('confirmYes').onclick = () => done(true);
	document.getElementById('confirmNo').onclick  = () => done(false);
}

function gamePrompt(message, callback){
	document.getElementById('promptMsg').textContent = message;
	const input = document.getElementById('promptInput');
	input.value = '';
	const box = document.getElementById('gamePrompt');
	box.classList.remove('hidden');
	_showOverlay();
	const done = (val) => { box.classList.add('hidden'); _hideOverlay(); callback(val); };
	document.getElementById('promptOk').onclick     = () => done(input.value.trim() || null);
	document.getElementById('promptCancel').onclick = () => done(null);
	input.onkeydown = (e) => {
		if(e.key === 'Enter') done(input.value.trim() || null);
		if(e.key === 'Escape') done(null);
	};
	setTimeout(() => input.focus(), 0);
}

// ── Inventory / Placement ─────────────────────────────
let placingType = null;
let ghostDir = 4;
let ghostClockwise = true;
let ghostX = 0, ghostY = 0;
let isAnimating = false;
let isMouseDown = false;
let isErasing = false;
let pickupFromGrid = false;
const dragVisited = new Set();
const ghostEl = document.getElementById('ghostCell');

function ghostFlip(){ return (placingType === 'rotate' && !ghostClockwise) ? ' scaleX(-1)' : ''; }

function placeOrDelete(){
	if(go || step) return;
	if(ghostX < 0 || ghostY < 0 || ghostX >= gridCols || ghostY >= gridRows) return;
	if(grid[ghostX]?.[ghostY]) return;
	clearHistory();
	cells.push(new Cell(ghostX, ghostY, placingType, ghostDir, ghostClockwise));
	oldCells.push([ghostX, ghostY, placingType, ghostDir, ghostClockwise]);
	if(pickupFromGrid) cancelPlacing();
}

document.addEventListener('mousedown', (e) => {
	if(e.button === 0){
		if(topBarOpen || uiFocused || !placingType || isAnimating || go || step) return;
		isMouseDown = true;
		dragVisited.clear();
	}
	if(e.button === 2){
		if(topBarOpen || go || step) return;
		e.preventDefault();
		isErasing = true;
		isAnimating = false;
		ghostEl.className = 'eraser';
		ghostEl.style.display = 'block';
		ghostEl.style.opacity = '0.55';
		ghostEl.style.outline = 'none';
		ghostEl.style.transform = `translate(${ghostX * tile}px, ${ghostY * tile}px)`;
		const cell = grid[ghostX]?.[ghostY];
		if(cell){ clearHistory(); cell.kill(); }
	}
});

document.addEventListener('mouseup', (e) => {
	if(e.button === 0){
		isMouseDown = false;
		dragVisited.clear();
	}
	if(e.button === 2){
		isErasing = false;
		if(placingType){
			ghostEl.className = placingType;
			ghostEl.classList.toggle('ccw', placingType === 'rotate' && !ghostClockwise);
			ghostEl.style.transform = `translate(${ghostX * tile}px, ${ghostY * tile}px) rotate(${rotateVec[ghostDir]}deg)${ghostFlip()}`;
			ghostEl.style.outline = grid[ghostX]?.[ghostY] ? '2px solid #ff4444' : '2px solid #00cfff88';
		} else {
			ghostEl.style.display = 'none';
			ghostEl.className = '';
		}
	}
});

document.addEventListener('mousemove', (e) => {
	ghostX = Math.floor(e.clientX / tile);
	ghostY = Math.floor(e.clientY / tile);

	if(isErasing){
		rightDragged = true;
		ghostEl.style.transform = `translate(${ghostX * tile}px, ${ghostY * tile}px)`;
		const cell = grid[ghostX]?.[ghostY];
		if(cell){ clearHistory(); cell.kill(); }
		return;
	}

	if(isMouseDown && placingType && !isAnimating){
		const key = `${ghostX},${ghostY}`;
		if(!dragVisited.has(key)){
			dragVisited.add(key);
			placeOrDelete();
		}
	}

	if(!placingType || isAnimating) return;
	ghostEl.style.transform = `translate(${ghostX * tile}px, ${ghostY * tile}px) rotate(${rotateVec[ghostDir]}deg)${ghostFlip()}`;
	ghostEl.style.outline = grid[ghostX]?.[ghostY] ? '2px solid #ff4444' : '2px solid #00cfff88';
});

function flyGhostToMouse(){
	// start position: center of the inventory slot for the selected type
	const slotEl = document.querySelector(`.inv-item[data-type="${placingType}"]`);
	const rect = slotEl.getBoundingClientRect();
	const startX = rect.left + rect.width / 2 - tile / 2;
	const startY = rect.top + rect.height / 2 - tile / 2;

	const DURATION = 380;
	const endRot = rotateVec[ghostDir];
	let startTime = null;
	isAnimating = true;

	// snap ghost to slot position immediately so CSS transition can't interfere
	ghostEl.style.transform = `translate(${startX}px, ${startY}px)`;

	function animate(ts){
		if(!isAnimating) return;
		if(!startTime) startTime = ts;
		const raw = Math.min((ts - startTime) / DURATION, 1);
		const t = 1 - Math.pow(1 - raw, 2); // ease out quad for position

		// recalculate end and arc each frame so mouse movement steers the destination
		const endX = ghostX * tile;
		const endY = ghostY * tile;
		const dist = Math.hypot(endX - startX, endY - startY);
		const lift = Math.min(260, Math.max(90, dist * 0.55));
		const cpX = (startX + endX) / 2;
		const cpY = (startY + endY) / 2 - lift;

		const bx = (1-t)*(1-t)*startX + 2*(1-t)*t*cpX + t*t*endX;
		const by = (1-t)*(1-t)*startY + 2*(1-t)*t*cpY + t*t*endY;
		const rot = endRot - 360 * (1 - raw); // 1 full spins, settles to ghostDir
		const scale = 1 + 0.35 * Math.sin(raw * Math.PI);

		ghostEl.style.transform = `translate(${bx}px, ${by}px) rotate(${rot}deg) scale(${scale})`;
		ghostEl.style.opacity = String(0.35 + 0.2 * raw);
		ghostEl.style.outline = 'none';

		if(raw < 1){
			requestAnimationFrame(animate);
		} else {
			isAnimating = false;
			ghostEl.style.transform = `translate(${endX}px, ${endY}px) rotate(${endRot}deg)${ghostFlip()}`;
			ghostEl.style.opacity = '0.55';
			const occupied = grid[ghostX]?.[ghostY];
			ghostEl.style.outline = occupied ? '2px solid #ff4444' : '2px solid #00cfff88';
		}
	}

	requestAnimationFrame(animate);
}

function setPlacingType(type){
	if(go || step) return;
	placingType = type;
	ghostDir = 4;
	ghostClockwise = true;
	ghostEl.className = type;
	ghostEl.classList.remove('ccw');
	ghostEl.style.display = 'block';
	document.querySelectorAll('.inv-item').forEach(el => el.classList.remove('active'));
	document.querySelector(`.inv-item[data-type="${type}"]`).classList.add('active');
	flyGhostToMouse();
}

function cancelPlacing(){
	placingType = null;
	isAnimating = false;
	pickupFromGrid = false;
	ghostClockwise = true;
	if(ghostEl){ ghostEl.style.display = 'none'; ghostEl.classList.remove('ccw'); }
	document.querySelectorAll('.inv-item').forEach(el => el.classList.remove('active'));
}

let rightDragged = false;
document.addEventListener('contextmenu', (e) => {
	if(rightDragged) e.preventDefault();
	rightDragged = false;
});

document.querySelectorAll('.inv-item').forEach(item => {
	item.addEventListener('click', (e) => {
		e.stopPropagation();
		if(topBarOpen) return;
		const type = item.dataset.type;
		if(placingType === type) cancelPlacing();
		else setPlacingType(type);
	});
});

(function(){
	const zone = document.getElementById('topBarZone');
	const bar  = document.getElementById('topBar');
	zone.addEventListener('mouseenter', () => topBarOpen = true);
	zone.addEventListener('mouseleave', (e) => { if(!bar.contains(e.relatedTarget))  topBarOpen = false; });
	bar.addEventListener('mouseenter',  () => topBarOpen = true);
	bar.addEventListener('mouseleave',  (e) => { if(!zone.contains(e.relatedTarget)) topBarOpen = false; });
})();

