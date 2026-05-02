// ── Canvas ────────────────────────────────────────────
const c   = document.getElementById('c');
const ctx = c.getContext('2d');
c.width   = window.innerWidth;
c.height  = window.innerHeight;

// ── Constants ─────────────────────────────────────────
const GRAVITY    = 2.72;
const BALL_SIZE  = 4.5;
const LINE_W     = 3;
const FRIC_BASE  = 0.0012;
const FRIC_RANGE = 0.0058;
const NODE_R     = 8;
const HIT_DIST   = 8;
const SNAP_DIST  = NODE_R * 2;

// ── Camera ────────────────────────────────────────────
let camX = 0, camY = 0, camScale = 1;
let isPanning = false;
let panStartX = 0, panStartY = 0, panStartCamX = 0, panStartCamY = 0;
let rightMouseDown = false;

// ── Helpers ───────────────────────────────────────────
function dst(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

function ptSegDist(px, py, ax, ay, bx, by) {
	const lx = bx - ax, ly = by - ay, len2 = lx * lx + ly * ly;
	if (len2 === 0) return dst(px, py, ax, ay);
	const t = Math.max(0, Math.min(1, ((px - ax) * lx + (py - ay) * ly) / len2));
	return dst(px, py, ax + lx * t, ay + ly * t);
}

function snapPoint(wx, wy) {
	const sd = SNAP_DIST / camScale;
	for (const ln of lines) {
		if (dst(wx, wy, ln.x1, ln.y1) < sd) return { x: ln.x1, y: ln.y1 };
		if (dst(wx, wy, ln.x2, ln.y2) < sd) return { x: ln.x2, y: ln.y2 };
	}
	for (const cv of curves) {
		if (dst(wx, wy, cv.x1, cv.y1) < sd) return { x: cv.x1, y: cv.y1 };
		if (dst(wx, wy, cv.x2, cv.y2) < sd) return { x: cv.x2, y: cv.y2 };
	}
	for (const r of rects) {
		for (const corner of [{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x,y:r.y+r.h},{x:r.x+r.w,y:r.y+r.h}])
			if (dst(wx, wy, corner.x, corner.y) < sd) return { x: corner.x, y: corner.y };
	}
	return null;
}

// ── Classes ───────────────────────────────────────────
class Line {
	constructor(x1, y1, x2, y2, fricVal = 0) {
		this.x1 = x1; this.y1 = y1;
		this.x2 = x2; this.y2 = y2;
		this.fricVal = fricVal;
	}
}

class Curve {
	constructor(x1, y1, cx1, cy1, cx2, cy2, x2, y2, samples = 30, fricVal = 0) {
		this.x1 = x1; this.y1 = y1;
		this.cx1 = cx1; this.cy1 = cy1;
		this.cx2 = cx2; this.cy2 = cy2;
		this.x2 = x2; this.y2 = y2;
		this.samples = samples;
		this.fricVal = fricVal;
		this._pts = null;
	}
	getPoints() {
		if (this._pts) return this._pts;
		const pts = [];
		for (let i = 0; i <= this.samples; i++) {
			const t = i / this.samples, u = 1 - t;
			pts.push({
				x: u*u*u*this.x1 + 3*u*u*t*this.cx1 + 3*u*t*t*this.cx2 + t*t*t*this.x2,
				y: u*u*u*this.y1 + 3*u*u*t*this.cy1 + 3*u*t*t*this.cy2 + t*t*t*this.y2
			});
		}
		return (this._pts = pts);
	}
	invalidate() { this._pts = null; }
}

class Squiggle {
	constructor() { this.points = []; this.fricVal = 0; }
	addPoint(x, y) {
		const last = this.points[this.points.length - 1];
		if (!last || dst(x, y, last.x, last.y) > 4) this.points.push({ x, y });
	}
	getSegments() {
		const segs = [];
		for (let i = 0; i < this.points.length - 1; i++) {
			const a = this.points[i], b = this.points[i + 1];
			segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, fricVal: this.fricVal });
		}
		return segs;
	}
}

class Rect {
	constructor(x, y, w, h, fricVal = 0, top = true, right = true, bottom = true, left = true) {
		this.x = x; this.y = y; this.w = w; this.h = h;
		this.fricVal = fricVal;
		this.top = top; this.right = right; this.bottom = bottom; this.left = left;
	}
	getLines() {
		const f = this.fricVal, r = [];
		if (this.top)    r.push(new Line(this.x,        this.y,        this.x+this.w, this.y,        f));
		if (this.right)  r.push(new Line(this.x+this.w, this.y,        this.x+this.w, this.y+this.h, f));
		if (this.bottom) r.push(new Line(this.x,        this.y+this.h, this.x+this.w, this.y+this.h, f));
		if (this.left)   r.push(new Line(this.x,        this.y,        this.x,        this.y+this.h, f));
		return r;
	}
}

// ── Segment collision resolution ──────────────────────
function segPushOut(marble, x1, y1, x2, y2, marbleRadius) {
	const lx = x2 - x1, ly = y2 - y1, len2 = lx * lx + ly * ly;
	if (len2 === 0) return null;
	const vx = marble.x - x1, vy = marble.y - y1;
	const t  = Math.max(0, Math.min(1, (vx * lx + vy * ly) / len2));
	const cx = x1 + lx * t, cy = y1 + ly * t;
	const dx = marble.x - cx,  dy = marble.y - cy;
	const d2 = dx * dx + dy * dy;
	const md = marbleRadius + LINE_W / 2;
	if (d2 >= md * md) return null;
	const d = Math.sqrt(d2);
	let nx, ny;
	if (d === 0) {
		nx = -ly; ny = lx;
		const nl = Math.sqrt(nx * nx + ny * ny);
		if (nl === 0) return null;
		nx /= nl; ny /= nl;
	} else { nx = dx / d; ny = dy / d; }
	marble.x += nx * (md - d);
	marble.y += ny * (md - d);
	marble.constraintCount++;
	return { nx, ny };
}

function resolveSegCollision(marble, x1, y1, x2, y2, fricVal, marbleRadius) {
	const hit = segPushOut(marble, x1, y1, x2, y2, marbleRadius);
	if (!hit) return;
	const { nx, ny } = hit;
	const vdn = marble.mx * nx + marble.my * ny;
	if (vdn < 0) {
		const eff = Math.abs(vdn) > GRAVITY * 2 ? marble.restitution : 0;
		marble.mx -= (1 + eff) * vdn * nx;
		marble.my -= (1 + eff) * vdn * ny;
	}
	const tx = -ny, ty = nx;
	const friction = FRIC_BASE + FRIC_RANGE * Math.abs(tx) + (fricVal || 0);
	const vtd = marble.mx * tx + marble.my * ty;
	marble.mx -= friction * vtd * tx;
	marble.my -= friction * vtd * ty;
}

// ── Marble ────────────────────────────────────────────
class Marble {
	constructor(x, y, mx = 0, my = 0, restitution = 0.5, mass = 5) {
		this.x = x; this.y = y;
		this.mx = mx; this.my = my;
		this.restitution     = restitution;
		this.mass            = mass;
		this.isStatic        = false;
		this.constraintCount = 0;
		this.destroyed       = false;
	}
	getRadius() { return BALL_SIZE * Math.cbrt(this.mass); }

	move(allSegs) {
		// Delete only if going absurdly fast or very far from all track
		if (this.mx * this.mx + this.my * this.my > 1000 * 1000) {
			this.destroyed = true; return;
		}
		if (allSegs.length > 0) {
			let minDist = Infinity;
			for (const seg of allSegs) {
				const d = ptSegDist(this.x, this.y, seg.x1, seg.y1, seg.x2, seg.y2);
				if (d < minDist) { minDist = d; if (minDist < 15000) break; }
			}
			if (minDist > 15000) { this.destroyed = true; return; }
		}

		if (this.isStatic) return;
		if (draggingNode && draggingNode.obj === this) { this.mx = 0; this.my = 0; return; }
		if (isDraggingGroup && selected.has(this)) { this.mx = 0; this.my = 0; return; }

		this.my += GRAVITY;

		const r0    = this.getRadius();
		const steps = Math.max(1, Math.min(20, Math.ceil(Math.hypot(this.mx, this.my) / (r0 * 0.5))));

		for (let i = 0; i < steps; i++) {
			this.constraintCount = 0;
			const myRadius = this.getRadius();
			this.x += this.mx / steps;
			this.y += this.my / steps;

			for (const seg of allSegs)
				resolveSegCollision(this, seg.x1, seg.y1, seg.x2, seg.y2, seg.fricVal, myRadius);

			// Pass 1: position correction + velocity impulse
			for (const other of marbles) {
				if (other === this || other.destroyed) continue;
				const dx = other.x - this.x, dy = other.y - this.y;
				const d2 = dx * dx + dy * dy;
				const rA = this.getRadius(), rB = other.getRadius(), md = rA + rB;
				if (d2 >= md * md || d2 === 0) continue;

				if (this instanceof DestructorMarble && !(other instanceof DestructorMarble)) {
					this.mass += other.mass * 0.5; other.destroyed = true; this.destroyCount++; continue;
				} else if (other instanceof DestructorMarble && !(this instanceof DestructorMarble)) {
					other.mass += this.mass * 0.5; this.destroyed = true; other.destroyCount++; continue;
				}

				const db = Math.sqrt(d2), nxb = dx / db, nyb = dy / db, ov = md - db;
				const invA = 1 / this.mass, invB = 1 / other.mass, invSum = invA + invB;
				const corrA = invA / invSum * ov * 0.5, corrB = invB / invSum * ov * 0.5;
				if (!this.isStatic)  { this.x  -= nxb * corrA; this.y  -= nyb * corrA; }
				if (!other.isStatic) { other.x += nxb * corrB; other.y += nyb * corrB; }
				const relV = (this.mx - other.mx) * nxb + (this.my - other.my) * nyb;
				if (relV > 0 && !this.isStatic && !other.isStatic) {
					const e = (this.restitution + other.restitution) * 0.5;
					const imp = -(1 + e) * relV / invSum;
					this.mx  += imp * invA * nxb; this.my  += imp * invA * nyb;
					other.mx -= imp * invB * nxb; other.my -= imp * invB * nyb;
				}
			}

			// Passes 2–3: position correction only
			for (let ci = 0; ci < 2; ci++) {
				for (const other of marbles) {
					if (other === this || other.destroyed) continue;
					if ((this instanceof DestructorMarble) !== (other instanceof DestructorMarble)) continue;
					const dx = other.x - this.x, dy = other.y - this.y;
					const d2 = dx * dx + dy * dy;
					const rA = this.getRadius(), rB = other.getRadius(), md = rA + rB;
					if (d2 >= md * md || d2 === 0) continue;
					const db = Math.sqrt(d2), nxb = dx / db, nyb = dy / db, ov = md - db;
					const invA = 1 / this.mass, invB = 1 / other.mass, invSum = invA + invB;
					const corrA = invA / invSum * ov * 0.5, corrB = invB / invSum * ov * 0.5;
					if (!this.isStatic)  { this.x  -= nxb * corrA; this.y  -= nyb * corrA; }
					if (!other.isStatic) { other.x += nxb * corrB; other.y += nyb * corrB; }
				}
			}

			for (const seg of allSegs)
				segPushOut(this, seg.x1, seg.y1, seg.x2, seg.y2, myRadius);
		}
	}
}

class DestructorMarble extends Marble {
	constructor(x, y, mx = 0, my = 0, restitution = 0.5, mass = 5) {
		super(x, y, mx, my, restitution, mass);
		this.destroyCount = 0;
	}
	getRadius() { return super.getRadius() + this.destroyCount * 0.25; }
}

// ── World data ────────────────────────────────────────
let lines     = [];
let curves    = [];
let squiggles = [];
let rects     = [];
let marbles   = [];

// ── Undo ──────────────────────────────────────────────
const undoStack = [];
function pushUndo(entry) {
	undoStack.push(entry);
	if (undoStack.length > 100) undoStack.shift();
}
function undo() {
	const entry = undoStack.pop();
	if (!entry) return;
	if (entry.type === 'add') {
		const idx = entry.arr.indexOf(entry.obj);
		if (idx !== -1) entry.arr.splice(idx, 1);
	} else if (entry.type === 'delete') {
		for (const item of entry.items) item.arr.splice(item.idx, 0, item.obj);
	}
}

// ── Mode & state ──────────────────────────────────────
let mode   = 'select';
let paused = false;

let lineStart   = null;
let curveClicks = [];
let rectStart   = null;

let isPainting = false;
let currentSq  = null;

let marbleRestitution  = 0.5;
let marbleMass         = 5.0;
let marbleIsDestructor = false;

let rectSides = { top: true, right: true, bottom: true, left: true };

let selected     = new Set();
let draggingNode = null;
let selectBox    = null;
let mouseDown    = false;
let mouseX = 0, mouseY = 0;
let worldX = 0, worldY = 0;
let isDraggingGroup = false;
let groupDragStartX = 0, groupDragStartY = 0;
let groupDragSnapshot = [];

// ── UI refs ───────────────────────────────────────────
const modeEl         = document.getElementById('modeDisplay');
const pauseEl        = document.getElementById('pauseDisplay');
const hintEl         = document.getElementById('hintText');
const fricPanel      = document.getElementById('frictionPanel');
const fricSlider     = document.getElementById('fricSlider');
const fricNum        = document.getElementById('fricNum');
const marblePanel      = document.getElementById('marblePanel');
const restSlider     = document.getElementById('restSlider');
const restValEl      = document.getElementById('restVal');
const massSlider     = document.getElementById('massSlider');
const massValEl      = document.getElementById('massVal');
const marbleEditPanel  = document.getElementById('marbleEditPanel');
const editRestSlider = document.getElementById('editRestSlider');
const editRestValEl  = document.getElementById('editRestVal');
const editMassSlider = document.getElementById('editMassSlider');
const editMassValEl  = document.getElementById('editMassVal');
const rectPanelEl    = document.getElementById('rectPanel');
const playBtn        = document.getElementById('playBtn');
const uiEl           = document.getElementById('ui');

const HINTS = {
	marble: '1 Marble · 2 Line · 3 Curve · 4 Paint · 5 Rect\nClick to place  ·  Configure in panel →',
	select: '1 Marble · 2 Line · 3 Curve · 4 Paint · 5 Rect\nDrag to pan  ·  Right-drag to box-select  ·  Del to delete',
	line:   '1 Marble · 2 Line · 3 Curve · 4 Paint · 5 Rect\nClick & drag to draw  ·  Nodes snap  ·  Esc to select',
	curve:  '1 Marble · 2 Line · 3 Curve · 4 Paint · 5 Rect\nClick: start → mid → end  ·  Nodes snap  ·  Esc to select',
	paint:  '1 Marble · 2 Line · 3 Curve · 4 Paint · 5 Rect\nHold & drag to paint  ·  Esc to select',
	rect:   '1 Marble · 2 Line · 3 Curve · 4 Paint · 5 Rect\nDrag to draw  ·  Corners snap  ·  Toggle sides →'
};

// ── Mode switching ────────────────────────────────────
function setMode(m) {
	lineStart = null; curveClicks = []; rectStart = null;
	if (isPainting && currentSq && currentSq.points.length > 1) {
		squiggles.push(currentSq);
		pushUndo({ type: 'add', arr: squiggles, obj: currentSq });
	}
	currentSq = null; isPainting = false;
	isPanning = false; isDraggingGroup = false;
	draggingNode = null; selectBox = null;
	if (m !== 'select') selected.clear();
	mode = m;
	uiEl.style.display  = m === 'select' ? 'none' : 'block';
	modeEl.textContent  = m.toUpperCase();
	hintEl.textContent  = HINTS[m] || '';
	updatePanels();
}

function updatePanels() {
	fricPanel.style.display     = 'none';
	marblePanel.style.display     = 'none';
	marbleEditPanel.style.display = 'none';
	rectPanelEl.style.display   = 'none';

	if (mode === 'marble') { marblePanel.style.display = 'block'; return; }
	if (mode === 'rect') { rectPanelEl.style.display = 'block'; return; }
	if (mode !== 'select' || selected.size === 0) return;

	const items      = [...selected];
	const hasMarble  = items.some(o => o instanceof Marble);
	const hasSurface = items.some(o => !(o instanceof Marble));

	if (hasSurface && !hasMarble) {
		fricPanel.style.display = 'block';
		const first = items.find(o => !(o instanceof Marble));
		fricSlider.value = first.fricVal || 0;
		fricNum.value    = (first.fricVal || 0).toFixed(4);
	}
	if (hasMarble && !hasSurface) {
		marbleEditPanel.style.display = 'block';
		const b = items.find(o => o instanceof Marble);
		editRestSlider.value      = b.restitution;
		editRestValEl.textContent = b.restitution.toFixed(2);
		editMassSlider.value      = b.mass;
		editMassValEl.textContent = b.mass.toFixed(1);
	}
}

// ── Panel events ──────────────────────────────────────
fricSlider.addEventListener('input', () => {
	const v = parseFloat(fricSlider.value);
	fricNum.value = v.toFixed(4);
	for (const o of selected) if (!(o instanceof Marble)) o.fricVal = v;
});
fricNum.addEventListener('input', () => {
	const v = parseFloat(fricNum.value);
	if (!isNaN(v)) { fricSlider.value = v; for (const o of selected) if (!(o instanceof Marble)) o.fricVal = v; }
});

restSlider.addEventListener('input', () => {
	marbleRestitution = parseFloat(restSlider.value);
	restValEl.textContent = marbleRestitution.toFixed(2);
});
massSlider.addEventListener('input', () => {
	marbleMass = parseFloat(massSlider.value);
	massValEl.textContent = marbleMass.toFixed(1);
});
document.querySelectorAll('input[name=marbleType]').forEach(r =>
	r.addEventListener('change', () => { marbleIsDestructor = r.value === 'destructor'; })
);

editRestSlider.addEventListener('input', () => {
	const v = parseFloat(editRestSlider.value);
	editRestValEl.textContent = v.toFixed(2);
	for (const o of selected) if (o instanceof Marble) o.restitution = v;
});
editMassSlider.addEventListener('input', () => {
	const v = parseFloat(editMassSlider.value);
	editMassValEl.textContent = v.toFixed(1);
	for (const o of selected) if (o instanceof Marble) o.mass = v;
});

['sideTop', 'sideRight', 'sideBottom', 'sideLeft'].forEach(id => {
	document.getElementById(id).addEventListener('change', e => {
		const side = id.replace('side', '').toLowerCase();
		rectSides[side] = e.target.checked;
		for (const o of selected) if (o instanceof Rect) o[side] = e.target.checked;
	});
});

playBtn.addEventListener('click', togglePause);
function togglePause() {
	paused = !paused;
	pauseEl.textContent = paused ? '⏸ PAUSED'      : '▶ PLAYING';
	playBtn.textContent = paused ? '▶ PLAY (Space)' : '⏸ PAUSE (Space)';
}

document.getElementById('controlsBtn').addEventListener('click', () => {
	document.getElementById('controlsOverlay').style.display = 'flex';
});
document.getElementById('controlsClose').addEventListener('click', () => {
	document.getElementById('controlsOverlay').style.display = 'none';
});

// ── Segment builder ───────────────────────────────────
function buildAllSegs() {
	const segs = [];
	for (const ln of lines)
		segs.push({ x1: ln.x1, y1: ln.y1, x2: ln.x2, y2: ln.y2, fricVal: ln.fricVal });
	for (const r of rects)
		for (const ln of r.getLines())
			segs.push({ x1: ln.x1, y1: ln.y1, x2: ln.x2, y2: ln.y2, fricVal: ln.fricVal });
	for (const cv of curves) {
		const pts = cv.getPoints();
		for (let i = 0; i < pts.length - 1; i++)
			segs.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i+1].x, y2: pts[i+1].y, fricVal: cv.fricVal });
	}
	for (const sq of squiggles)
		for (const s of sq.getSegments()) segs.push(s);
	return segs;
}

// ── Curve from 3 clicked points ───────────────────────
function curveFrom3(p0, pm, p2) {
	const qx = 2 * pm.x - 0.5 * (p0.x + p2.x);
	const qy = 2 * pm.y - 0.5 * (p0.y + p2.y);
	return new Curve(
		p0.x, p0.y,
		p0.x + 2/3 * (qx - p0.x), p0.y + 2/3 * (qy - p0.y),
		p2.x + 2/3 * (qx - p2.x), p2.y + 2/3 * (qy - p2.y),
		p2.x, p2.y, 30, 0
	);
}

// ── Select helpers ────────────────────────────────────
function hitNode(wx, wy) {
	const thr = NODE_R / camScale;
	for (const ln of lines) {
		if (dst(wx, wy, ln.x1, ln.y1) < thr) return { obj: ln, px: 'x1', py: 'y1', inv: false };
		if (dst(wx, wy, ln.x2, ln.y2) < thr) return { obj: ln, px: 'x2', py: 'y2', inv: false };
	}
	for (const cv of curves) {
		if (dst(wx, wy, cv.x1,  cv.y1)  < thr) return { obj: cv, px: 'x1',  py: 'y1',  inv: true };
		if (dst(wx, wy, cv.cx1, cv.cy1) < thr) return { obj: cv, px: 'cx1', py: 'cy1', inv: true };
		if (dst(wx, wy, cv.cx2, cv.cy2) < thr) return { obj: cv, px: 'cx2', py: 'cy2', inv: true };
		if (dst(wx, wy, cv.x2,  cv.y2)  < thr) return { obj: cv, px: 'x2',  py: 'y2',  inv: true };
	}
	for (const b of marbles)
		if (dst(wx, wy, b.x, b.y) < b.getRadius() + thr) return { obj: b, px: 'x', py: 'y', inv: false };
	return null;
}

function hitObject(wx, wy) {
	const thr = HIT_DIST / camScale;
	for (const ln of lines)
		if (ptSegDist(wx, wy, ln.x1, ln.y1, ln.x2, ln.y2) < thr) return ln;
	for (const cv of curves) {
		const pts = cv.getPoints();
		for (let i = 0; i < pts.length - 1; i++)
			if (ptSegDist(wx, wy, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y) < thr) return cv;
	}
	for (const sq of squiggles)
		for (const s of sq.getSegments())
			if (ptSegDist(wx, wy, s.x1, s.y1, s.x2, s.y2) < thr) return sq;
	for (const r of rects)
		for (const ln of r.getLines())
			if (ptSegDist(wx, wy, ln.x1, ln.y1, ln.x2, ln.y2) < thr) return r;
	for (const b of marbles)
		if (dst(wx, wy, b.x, b.y) < b.getRadius() + 2 / camScale) return b;
	return null;
}

function objectsInBox(sx, sy, ex, ey) {
	const minX = Math.min(sx, ex), maxX = Math.max(sx, ex);
	const minY = Math.min(sy, ey), maxY = Math.max(sy, ey);
	const inBox = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
	const found = new Set();
	for (const ln of lines)
		if (inBox(ln.x1, ln.y1) || inBox(ln.x2, ln.y2)) found.add(ln);
	for (const cv of curves)
		if (cv.getPoints().some(p => inBox(p.x, p.y))) found.add(cv);
	for (const sq of squiggles)
		if (sq.points.some(p => inBox(p.x, p.y))) found.add(sq);
	for (const r of rects) {
		const corners = [{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x,y:r.y+r.h},{x:r.x+r.w,y:r.y+r.h}];
		if (corners.some(p => inBox(p.x, p.y))) found.add(r);
	}
	for (const b of marbles)
		if (inBox(b.x, b.y)) found.add(b);
	return found;
}

function getSelectionBounds() {
	if (selected.size === 0) return null;
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	const expand = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
	for (const obj of selected) {
		if (obj instanceof Marble)    { const r = obj.getRadius(); expand(obj.x - r, obj.y - r); expand(obj.x + r, obj.y + r); }
		else if (obj instanceof Line)     { expand(obj.x1, obj.y1); expand(obj.x2, obj.y2); }
		else if (obj instanceof Curve)    { for (const p of obj.getPoints()) expand(p.x, p.y); }
		else if (obj instanceof Squiggle) { for (const p of obj.points) expand(p.x, p.y); }
		else if (obj instanceof Rect)     { expand(obj.x, obj.y); expand(obj.x + obj.w, obj.y + obj.h); }
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function inSelectionBounds(wx, wy) {
	if (selected.size < 1) return false;
	const b = getSelectionBounds();
	if (!b) return false;
	const pad = 10 / camScale;
	return wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad;
}

function snapshotSelected() {
	const snap = [];
	for (const obj of selected) {
		if (obj instanceof Marble)    snap.push({ obj, x: obj.x, y: obj.y });
		else if (obj instanceof Line) snap.push({ obj, x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 });
		else if (obj instanceof Curve) snap.push({ obj, x1: obj.x1, y1: obj.y1, cx1: obj.cx1, cy1: obj.cy1, cx2: obj.cx2, cy2: obj.cy2, x2: obj.x2, y2: obj.y2 });
		else if (obj instanceof Squiggle) snap.push({ obj, points: obj.points.map(p => ({ x: p.x, y: p.y })) });
		else if (obj instanceof Rect) snap.push({ obj, x: obj.x, y: obj.y });
	}
	return snap;
}

function applyGroupDrag(dx, dy) {
	for (const s of groupDragSnapshot) {
		const o = s.obj;
		if (o instanceof Marble)    { o.x = s.x + dx; o.y = s.y + dy; }
		else if (o instanceof Line) { o.x1 = s.x1 + dx; o.y1 = s.y1 + dy; o.x2 = s.x2 + dx; o.y2 = s.y2 + dy; }
		else if (o instanceof Curve) { o.x1 = s.x1 + dx; o.y1 = s.y1 + dy; o.cx1 = s.cx1 + dx; o.cy1 = s.cy1 + dy; o.cx2 = s.cx2 + dx; o.cy2 = s.cy2 + dy; o.x2 = s.x2 + dx; o.y2 = s.y2 + dy; o.invalidate(); }
		else if (o instanceof Squiggle) { o.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy })); }
		else if (o instanceof Rect) { o.x = s.x + dx; o.y = s.y + dy; }
	}
}

function isOverPanel(e) {
	return e.target.closest('.panel, #controlsOverlay, #playBtn, #controlsBtn, #backBtn') !== null;
}

// ── Input events ──────────────────────────────────────
document.addEventListener('mousemove', e => {
	mouseX = e.clientX; mouseY = e.clientY;
	worldX = (mouseX - camX) / camScale;
	worldY = (mouseY - camY) / camScale;

	if (isPanning) {
		camX = panStartCamX + (mouseX - panStartX);
		camY = panStartCamY + (mouseY - panStartY);
		worldX = (mouseX - camX) / camScale;
		worldY = (mouseY - camY) / camScale;
		return;
	}

	if (isDraggingGroup) {
		applyGroupDrag(worldX - groupDragStartX, worldY - groupDragStartY);
		return;
	}

	if (mode === 'select' && draggingNode) {
		draggingNode.obj[draggingNode.px] = worldX;
		draggingNode.obj[draggingNode.py] = worldY;
		if (draggingNode.inv) draggingNode.obj.invalidate();
	} else if (selectBox && rightMouseDown) {
		selectBox.ex = worldX; selectBox.ey = worldY;
	}
	if (mode === 'paint' && isPainting && currentSq) currentSq.addPoint(worldX, worldY);
});

document.addEventListener('mousedown', e => {
	if (e.button === 2) {
		if (isOverPanel(e)) return;
		if (mode === 'select' && inSelectionBounds(worldX, worldY)) return;
		rightMouseDown = true;
		if (mode === 'select') { selected.clear(); updatePanels(); }
		selectBox = { sx: worldX, sy: worldY, ex: worldX, ey: worldY };
		return;
	}
	if (e.button !== 0) return;
	mouseDown = true;
	if (isOverPanel(e)) return;

	if (mode === 'select') {
		if (selected.size >= 2 && !e.shiftKey) {
			if (inSelectionBounds(worldX, worldY)) {
				isDraggingGroup = true;
				groupDragStartX = worldX; groupDragStartY = worldY;
				groupDragSnapshot = snapshotSelected();
				return;
			}
			selected.clear(); updatePanels();
		}
		const node = hitNode(worldX, worldY);
		if (node) {
			draggingNode = node;
			if (node.obj instanceof Marble) {
				if (!e.shiftKey) selected.clear();
				selected.add(node.obj);
				updatePanels();
			}
			return;
		}
		if (selected.size === 1 && !e.shiftKey) {
			if (inSelectionBounds(worldX, worldY)) {
				isDraggingGroup = true;
				groupDragStartX = worldX; groupDragStartY = worldY;
				groupDragSnapshot = snapshotSelected();
				return;
			}
			selected.clear(); updatePanels();
		}
		const obj = hitObject(worldX, worldY);
		if (obj) {
			if (!e.shiftKey) selected.clear();
			selected.has(obj) ? selected.delete(obj) : selected.add(obj);
			updatePanels(); return;
		}
		if (!e.shiftKey) { selected.clear(); updatePanels(); }
		isPanning = true;
		panStartX = mouseX; panStartY = mouseY;
		panStartCamX = camX; panStartCamY = camY;
		return;
	}
	if (mode === 'line') {
		const s = snapPoint(worldX, worldY);
		lineStart = s ? { x: s.x, y: s.y } : { x: worldX, y: worldY };
		return;
	}
	if (mode === 'curve') {
		const s = snapPoint(worldX, worldY);
		curveClicks.push(s ? { x: s.x, y: s.y } : { x: worldX, y: worldY });
		if (curveClicks.length === 3) {
			const cv = curveFrom3(curveClicks[0], curveClicks[1], curveClicks[2]);
			curves.push(cv);
			pushUndo({ type: 'add', arr: curves, obj: cv });
			curveClicks = [];
		}
		return;
	}
	if (mode === 'paint') {
		currentSq = new Squiggle();
		currentSq.addPoint(worldX, worldY);
		isPainting = true;
		return;
	}
	if (mode === 'marble') {
		const b = marbleIsDestructor
			? new DestructorMarble(worldX, worldY, 0, 0, marbleRestitution, marbleMass)
			: new Marble(worldX, worldY, 0, 0, marbleRestitution, marbleMass);
		marbles.push(b);
		pushUndo({ type: 'add', arr: marbles, obj: b });
		return;
	}
	if (mode === 'rect') {
		const s = snapPoint(worldX, worldY);
		rectStart = s ? { x: s.x, y: s.y } : { x: worldX, y: worldY };
	}
});

document.addEventListener('mouseup', e => {
	if (e.button === 2) {
		rightMouseDown = false;
		if (selectBox) {
			for (const o of objectsInBox(selectBox.sx, selectBox.sy, selectBox.ex, selectBox.ey))
				selected.add(o);
			selectBox = null;
			updatePanels();
		}
		return;
	}
	if (e.button !== 0) return;
	mouseDown = false;

	if (isDraggingGroup) { isDraggingGroup = false; return; }
	if (isPanning) { isPanning = false; return; }

	if (mode === 'select') {
		if (draggingNode) { draggingNode = null; return; }
		return;
	}
	if (mode === 'line' && lineStart) {
		const s = snapPoint(worldX, worldY);
		const ex = s ? s.x : worldX, ey = s ? s.y : worldY;
		if (dst(lineStart.x, lineStart.y, ex, ey) > 4) {
			const ln = new Line(lineStart.x, lineStart.y, ex, ey, 0);
			lines.push(ln);
			pushUndo({ type: 'add', arr: lines, obj: ln });
		}
		lineStart = null;
		return;
	}
	if (mode === 'paint' && isPainting) {
		if (currentSq && currentSq.points.length > 1) {
			squiggles.push(currentSq);
			pushUndo({ type: 'add', arr: squiggles, obj: currentSq });
		}
		currentSq = null; isPainting = false;
		return;
	}
	if (mode === 'rect' && rectStart) {
		const s = snapPoint(worldX, worldY);
		const ex = s ? s.x : worldX, ey = s ? s.y : worldY;
		const rx = Math.min(rectStart.x, ex), ry = Math.min(rectStart.y, ey);
		const rw = Math.abs(ex - rectStart.x),  rh = Math.abs(ey - rectStart.y);
		if (rw > 4 && rh > 4) {
			const r = new Rect(rx, ry, rw, rh, 0,
				rectSides.top, rectSides.right, rectSides.bottom, rectSides.left);
			rects.push(r);
			pushUndo({ type: 'add', arr: rects, obj: r });
		}
		rectStart = null;
	}
});

document.addEventListener('wheel', e => {
	e.preventDefault();
	const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
	const wx = (mouseX - camX) / camScale;
	const wy = (mouseY - camY) / camScale;
	camScale = Math.max(0.05, Math.min(20, camScale * factor));
	camX = mouseX - wx * camScale;
	camY = mouseY - wy * camScale;
	worldX = (mouseX - camX) / camScale;
	worldY = (mouseY - camY) / camScale;
}, { passive: false });

document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', e => {
	if (e.target.matches('input, textarea')) return;
	if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return; }
	if (e.key === '1') { setMode('marble');  return; }
	if (e.key === '2') { setMode('line');  return; }
	if (e.key === '3') { setMode('curve'); return; }
	if (e.key === '4') { setMode('paint'); return; }
	if (e.key === '5') { setMode('rect');  return; }
	if (e.key === ' ') { e.preventDefault(); togglePause(); return; }
	if (e.key === 'Escape') {
		if (mode !== 'select') { setMode('select'); }
		else { selected.clear(); updatePanels(); }
		return;
	}
	if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'select') {
		e.preventDefault();
		const items = [];
		for (const o of selected) {
			if      (lines.includes(o))     items.push({ arr: lines,     obj: o, idx: lines.indexOf(o) });
			else if (curves.includes(o))    items.push({ arr: curves,    obj: o, idx: curves.indexOf(o) });
			else if (squiggles.includes(o)) items.push({ arr: squiggles, obj: o, idx: squiggles.indexOf(o) });
			else if (rects.includes(o))     items.push({ arr: rects,     obj: o, idx: rects.indexOf(o) });
			else if (marbles.includes(o))   items.push({ arr: marbles,   obj: o, idx: marbles.indexOf(o) });
		}
		if (items.length) {
			pushUndo({ type: 'delete', items });
			for (const { arr, obj } of items) arr.splice(arr.indexOf(obj), 1);
		}
		selected.clear(); updatePanels();
	}
});

// ── Draw helpers ──────────────────────────────────────
function surfaceColor(obj, isSelected) {
	if (isSelected) return '#e8a030';
	return (typeof obj.fricVal === 'number' && obj.fricVal < 0) ? '#cc4422' : '#a08848';
}

function drawNode(x, y, isSelected) {
	ctx.beginPath();
	ctx.arc(x, y, NODE_R * 0.65 / camScale, 0, Math.PI * 2);
	ctx.fillStyle   = isSelected ? '#e8a030' : '#c8a858';
	ctx.strokeStyle = isSelected ? '#9a6510' : '#5a4018';
	ctx.lineWidth   = 1 / camScale;
	ctx.fill(); ctx.stroke();
}

function drawCtrlNode(x, y) {
	ctx.beginPath();
	ctx.arc(x, y, NODE_R * 0.45 / camScale, 0, Math.PI * 2);
	ctx.fillStyle   = 'rgba(200,150,50,0.75)';
	ctx.strokeStyle = '#9a7030';
	ctx.lineWidth   = 1 / camScale;
	ctx.fill(); ctx.stroke();
}

// ── Main draw loop ────────────────────────────────────
function draw() {
	ctx.clearRect(0, 0, c.width, c.height);

	ctx.save();
	ctx.translate(camX, camY);
	ctx.scale(camScale, camScale);

	// Surfaces
	for (const ln of lines) {
		ctx.strokeStyle = surfaceColor(ln, selected.has(ln));
		ctx.lineWidth   = (selected.has(ln) ? LINE_W + 1.5 : LINE_W);
		ctx.beginPath(); ctx.moveTo(ln.x1, ln.y1); ctx.lineTo(ln.x2, ln.y2); ctx.stroke();
	}
	for (const cv of curves) {
		ctx.strokeStyle = surfaceColor(cv, selected.has(cv));
		ctx.lineWidth   = (selected.has(cv) ? LINE_W + 1.5 : LINE_W);
		ctx.beginPath(); ctx.moveTo(cv.x1, cv.y1);
		ctx.bezierCurveTo(cv.cx1, cv.cy1, cv.cx2, cv.cy2, cv.x2, cv.y2); ctx.stroke();
	}
	for (const rect of rects) {
		const sel = selected.has(rect);
		ctx.strokeStyle = sel ? '#e8a030' : (rect.fricVal < 0 ? '#cc4422' : '#a08848');
		ctx.lineWidth   = (sel ? LINE_W + 1.5 : LINE_W);
		ctx.beginPath();
		if (rect.top)    { ctx.moveTo(rect.x,        rect.y);        ctx.lineTo(rect.x+rect.w, rect.y); }
		if (rect.right)  { ctx.moveTo(rect.x+rect.w, rect.y);        ctx.lineTo(rect.x+rect.w, rect.y+rect.h); }
		if (rect.bottom) { ctx.moveTo(rect.x,        rect.y+rect.h); ctx.lineTo(rect.x+rect.w, rect.y+rect.h); }
		if (rect.left)   { ctx.moveTo(rect.x,        rect.y);        ctx.lineTo(rect.x,        rect.y+rect.h); }
		ctx.stroke();
	}
	for (const sq of squiggles) {
		const pts = sq.points;
		if (pts.length < 2) continue;
		ctx.strokeStyle = surfaceColor(sq, selected.has(sq));
		ctx.lineWidth   = (selected.has(sq) ? LINE_W + 1.5 : LINE_W);
		ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
		for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
		ctx.stroke();
	}

	// Live paint preview
	if (isPainting && currentSq && currentSq.points.length > 1) {
		const pts = currentSq.points;
		ctx.strokeStyle = '#d4a040'; ctx.lineWidth = LINE_W;
		ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
		for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
		ctx.stroke();
	}

	// Select mode overlays
	if (mode === 'select') {
		for (const ln of lines) {
			drawNode(ln.x1, ln.y1, selected.has(ln));
			drawNode(ln.x2, ln.y2, selected.has(ln));
		}
		for (const cv of curves) {
			ctx.strokeStyle = 'rgba(180,130,40,0.25)';
			ctx.lineWidth = 1 / camScale;
			ctx.setLineDash([3 / camScale, 4 / camScale]);
			ctx.beginPath(); ctx.moveTo(cv.x1, cv.y1); ctx.lineTo(cv.cx1, cv.cy1); ctx.stroke();
			ctx.beginPath(); ctx.moveTo(cv.x2, cv.y2); ctx.lineTo(cv.cx2, cv.cy2); ctx.stroke();
			ctx.setLineDash([]);
			const sel = selected.has(cv);
			drawNode(cv.x1, cv.y1, sel); drawNode(cv.x2, cv.y2, sel);
			drawCtrlNode(cv.cx1, cv.cy1); drawCtrlNode(cv.cx2, cv.cy2);
		}
		for (const b of marbles) {
			if (!selected.has(b)) continue;
			ctx.strokeStyle = '#e8a030'; ctx.lineWidth = 2 / camScale;
			ctx.setLineDash([3 / camScale, 3 / camScale]);
			ctx.beginPath(); ctx.arc(b.x, b.y, b.getRadius() + 3 / camScale, 0, Math.PI * 2); ctx.stroke();
			ctx.setLineDash([]);
		}
		if (selected.size >= 1) {
			const b = getSelectionBounds();
			if (b) {
				const pad = 10 / camScale;
				ctx.strokeStyle = '#e8a030';
				ctx.lineWidth = 1.5 / camScale;
				ctx.setLineDash([6 / camScale, 4 / camScale]);
				ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
				ctx.setLineDash([]);
			}
		}
	}

	// Line mode preview
	if (mode === 'line') {
		const snap = snapPoint(worldX, worldY);
		const hx = snap ? snap.x : worldX, hy = snap ? snap.y : worldY;
		if (snap) drawNode(snap.x, snap.y, true);
		if (lineStart) {
			ctx.strokeStyle = 'rgba(200,160,80,0.55)';
			ctx.lineWidth = LINE_W;
			ctx.setLineDash([6 / camScale, 4 / camScale]);
			ctx.beginPath(); ctx.moveTo(lineStart.x, lineStart.y); ctx.lineTo(hx, hy); ctx.stroke();
			ctx.setLineDash([]);
			drawNode(lineStart.x, lineStart.y, false);
		}
	}

	// Curve mode preview
	if (mode === 'curve') {
		for (const pt of curveClicks) {
			ctx.fillStyle = '#e8a030'; ctx.strokeStyle = '#9a6510'; ctx.lineWidth = 1 / camScale;
			ctx.beginPath(); ctx.arc(pt.x, pt.y, 6 / camScale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
		}
		const snap = snapPoint(worldX, worldY);
		const hx = snap ? snap.x : worldX, hy = snap ? snap.y : worldY;
		if (snap) drawNode(snap.x, snap.y, true);
		if (curveClicks.length >= 1) {
			ctx.strokeStyle = 'rgba(200,160,80,0.3)';
			ctx.lineWidth = 1 / camScale;
			ctx.setLineDash([5 / camScale, 4 / camScale]);
			ctx.beginPath(); ctx.moveTo(curveClicks[0].x, curveClicks[0].y);
			if (curveClicks.length === 2) ctx.lineTo(curveClicks[1].x, curveClicks[1].y);
			ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash([]);
		}
		if (curveClicks.length === 2) {
			const prev = curveFrom3(curveClicks[0], curveClicks[1], { x: hx, y: hy });
			ctx.strokeStyle = 'rgba(200,150,50,0.5)'; ctx.lineWidth = LINE_W;
			ctx.beginPath(); ctx.moveTo(prev.x1, prev.y1);
			ctx.bezierCurveTo(prev.cx1, prev.cy1, prev.cx2, prev.cy2, prev.x2, prev.y2); ctx.stroke();
		}
	}

	// Rect mode preview
	if (mode === 'rect') {
		const snap = snapPoint(worldX, worldY);
		const hx = snap ? snap.x : worldX, hy = snap ? snap.y : worldY;
		if (snap) drawNode(snap.x, snap.y, true);
		if (rectStart) {
			const rx = Math.min(rectStart.x, hx), ry = Math.min(rectStart.y, hy);
			const rw = Math.abs(hx - rectStart.x),  rh = Math.abs(hy - rectStart.y);
			ctx.strokeStyle = 'rgba(200,160,80,0.55)';
			ctx.lineWidth = LINE_W;
			ctx.setLineDash([6 / camScale, 4 / camScale]);
			ctx.beginPath();
			if (rectSides.top)    { ctx.moveTo(rx,    ry);    ctx.lineTo(rx+rw, ry); }
			if (rectSides.right)  { ctx.moveTo(rx+rw, ry);    ctx.lineTo(rx+rw, ry+rh); }
			if (rectSides.bottom) { ctx.moveTo(rx,    ry+rh); ctx.lineTo(rx+rw, ry+rh); }
			if (rectSides.left)   { ctx.moveTo(rx,    ry);    ctx.lineTo(rx,    ry+rh); }
			ctx.stroke(); ctx.setLineDash([]);
			drawNode(rectStart.x, rectStart.y, false);
		}
	}

	// Marble mode cursor
	if (mode === 'marble') {
		const r = BALL_SIZE * Math.cbrt(marbleMass);
		ctx.strokeStyle = marbleIsDestructor ? '#cc4422' : 'rgba(200,160,80,0.5)';
		ctx.lineWidth = 1.5;
		ctx.setLineDash([3 / camScale, 3 / camScale]);
		ctx.beginPath(); ctx.arc(worldX, worldY, r, 0, Math.PI * 2); ctx.stroke();
		ctx.setLineDash([]);
	}

	// Right-click select box (all modes)
	if (selectBox) {
		const bx = Math.min(selectBox.sx, selectBox.ex), by = Math.min(selectBox.sy, selectBox.ey);
		const bw = Math.abs(selectBox.ex - selectBox.sx), bh = Math.abs(selectBox.ey - selectBox.sy);
		ctx.setLineDash([4 / camScale, 4 / camScale]);
		ctx.strokeStyle = '#e8a030'; ctx.lineWidth = 1 / camScale;
		ctx.fillStyle = 'rgba(232,160,48,0.07)';
		ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh);
		ctx.setLineDash([]);
	}

	// Draw marbles
	for (const marble of marbles) {
		const r = marble.getRadius();
		ctx.fillStyle   = marble instanceof DestructorMarble ? '#883010' : '#c4a050';
		ctx.strokeStyle = marble instanceof DestructorMarble ? '#cc4422' : '#7a5a28';
		ctx.lineWidth   = 1;
		ctx.beginPath(); ctx.arc(marble.x, marble.y, r, 0, Math.PI * 2);
		ctx.fill(); ctx.stroke();
	}

	ctx.restore();

	// Physics update
	if (!paused) {
		const segs = buildAllSegs();
		for (const b of marbles) b.move(segs);
		marbles = marbles.filter(b => !b.destroyed);
	}

	requestAnimationFrame(draw);
}

setMode('select');
draw();
