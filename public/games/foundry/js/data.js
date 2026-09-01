/* ============ Foundry — data: items, recipes, buildings, milestones, upgrades ============ */
(function(root){
'use strict';
const F = root.F;

/* ================= ORES (world deposits) ================= */
F.ORES = {
  1: { id:'ironOre',   name:'Iron',     c1:'#a8b4c4', c2:'#6e7d92' },
  2: { id:'copperOre', name:'Copper',   c1:'#e8965a', c2:'#a05c32' },
  3: { id:'coal',      name:'Coal',     c1:'#3d434e', c2:'#22262e' },
  4: { id:'stone',     name:'Stone',    c1:'#9a948a', c2:'#6b665e' },
  5: { id:'quartz',    name:'Quartz',   c1:'#cfe6f2', c2:'#8fb4c9' },
  6: { id:'titanOre',  name:'Titanium', c1:'#b9a7e8', c2:'#7a68b0', minTier:3 },
  7: { id:'crude',     name:'Oil seep', c1:'#2a2f2a', c2:'#141712' },
  8: { id:'chromite',  name:'Chromite', c1:'#9be8e0', c2:'#4a8d86' },
};
F.OIL_TYPE = 7;
F.oreTypeByItem = { ironOre:1, copperOre:2, coal:3, stone:4, quartz:5, titanOre:6, chromite:8 };

/* ================= ITEMS =================
   icon: kind drives the procedural icon painter in render.js */
F.ITEMS = {
  /* raw */
  ironOre:    { name:'Iron ore',       tier:0, icon:{kind:'ore',   c1:'#a8b4c4', c2:'#5f6e84'} },
  copperOre:  { name:'Copper ore',     tier:0, icon:{kind:'ore',   c1:'#e8965a', c2:'#8f5028'} },
  coal:       { name:'Coal',           tier:0, icon:{kind:'ore',   c1:'#4a515e', c2:'#1e222a'} },
  stone:      { name:'Stone',          tier:0, icon:{kind:'ore',   c1:'#a39d92', c2:'#635e55'} },
  quartz:     { name:'Quartz',         tier:0, icon:{kind:'shard', c1:'#e6f4fc', c2:'#8fb4c9'} },
  titanOre:   { name:'Titanium ore',   tier:0, icon:{kind:'ore',   c1:'#b9a7e8', c2:'#655397'} },
  chromite:   { name:'Chromite',       tier:0, icon:{kind:'shard', c1:'#b8f2ea', c2:'#4a8d86'} },
  /* smelted */
  ironIngot:  { name:'Iron ingot',     tier:1, icon:{kind:'ingot', c1:'#c9d4e2', c2:'#7c8ba0'} },
  copperIngot:{ name:'Copper ingot',   tier:1, icon:{kind:'ingot', c1:'#f0a26a', c2:'#a86038'} },
  brick:      { name:'Stone brick',    tier:1, icon:{kind:'brick', c1:'#b5a894', c2:'#78705f'} },
  glass:      { name:'Glass',          tier:1, icon:{kind:'glass', c1:'#d8f2ff', c2:'#7fb8d8'} },
  titanIngot: { name:'Titanium ingot', tier:3, icon:{kind:'ingot', c1:'#cdbdf5', c2:'#8672c4'} },
  steel:      { name:'Steel bar',      tier:2, icon:{kind:'ingot', c1:'#8f9dad', c2:'#4d5866'} },
  silicon:    { name:'Silicon',        tier:2, icon:{kind:'chip0', c1:'#3f4c5c', c2:'#93aac2'} },
  chrome:     { name:'Chrome',         tier:3, icon:{kind:'ingot', c1:'#c4f0ea', c2:'#5da8a0'} },
  chromsteel: { name:'Chromsteel',     tier:4, icon:{kind:'ingot', c1:'#8fe0d4', c2:'#2f5f58'} },
  /* crushed grit (1 ore → 2 grit → 2 ingots) */
  ironDust:   { name:'Iron grit',      tier:1, icon:{kind:'dust',  c1:'#a8b4c4', c2:'#5f6e84'} },
  copperDust: { name:'Copper grit',    tier:1, icon:{kind:'dust',  c1:'#e8965a', c2:'#8f5028'} },
  titanDust:  { name:'Titanium grit',  tier:3, icon:{kind:'dust',  c1:'#b9a7e8', c2:'#655397'} },
  /* parts */
  gear:       { name:'Gear',           tier:1, icon:{kind:'gear',  c1:'#c8cfda', c2:'#8892a2'} },
  wire:       { name:'Copper wire',    tier:1, icon:{kind:'coil',  c1:'#f2a86c', c2:'#b06a3a'} },
  plate:      { name:'Iron plate',     tier:1, icon:{kind:'plate', c1:'#bfcbdb', c2:'#75849b'} },
  circuit:    { name:'Circuit',        tier:2, icon:{kind:'chip',  c1:'#3f7f5f', c2:'#8fe0b0'} },
  motor:      { name:'Motor',          tier:2, icon:{kind:'motor', c1:'#96a3b5', c2:'#5b6674'} },
  plastic:    { name:'Plastic',        tier:2, icon:{kind:'plate', c1:'#f5f0e6', c2:'#b5ae9d'} },
  tar:        { name:'Tar',            tier:2, icon:{kind:'dust',  c1:'#3a3f35', c2:'#12140c'} },
  fuelCell:   { name:'Fuel cell',      tier:2, icon:{kind:'cell',  c1:'#ffcf6e', c2:'#c78430'} },
  advCircuit: { name:'Adv. circuit',   tier:3, icon:{kind:'chip',  c1:'#7f3f4f', c2:'#f09ab4'} },
  frame:      { name:'Titan frame',    tier:3, icon:{kind:'frame', c1:'#cdbdf5', c2:'#7a68b0'} },
  processor:  { name:'Processor',      tier:3, icon:{kind:'chip2', c1:'#2f4560', c2:'#6ec6ff'} },
  /* machine modules (slotted into drills, machines and beacons) */
  speedModule:{ name:'Speed module',      tier:2, icon:{kind:'module', c1:'#ffd76e', c2:'#b06a20', g:'speed'} },
  effModule:  { name:'Efficiency module', tier:2, icon:{kind:'module', c1:'#8fe0b0', c2:'#3f7f5f', g:'eff'} },
  prodModule: { name:'Productivity module',tier:3, icon:{kind:'module', c1:'#cdbdf5', c2:'#7a68b0', g:'prod'} },
  durModule:  { name:'Hardened module',   tier:2, icon:{kind:'module', c1:'#9fb8c8', c2:'#54707f', g:'dur'} },
  /* science packs (consumed by laboratories) */
  pack1:      { name:'Cog science',     tier:1, icon:{kind:'flask', c1:'#f0a26a', c2:'#a86038'} },
  pack2:      { name:'Volt science',    tier:2, icon:{kind:'flask', c1:'#6ec6ff', c2:'#2f6a94'} },
  pack3:      { name:'Polymer science', tier:3, icon:{kind:'flask', c1:'#8fe0b0', c2:'#3f7f5f'} },
  pack4:      { name:'Quantum science', tier:3, icon:{kind:'flask', c1:'#cdbdf5', c2:'#7a68b0'} },
  /* world-engine components */
  logicMatrix:{ name:'Logic matrix',   tier:4, icon:{kind:'matrix',c1:'#63d4ff', c2:'#1c5f80'} },
  powerCore:  { name:'Power core',     tier:4, icon:{kind:'corep', c1:'#ffd76e', c2:'#b06a20'} },
  hullPlate:  { name:'Hull segment',   tier:4, icon:{kind:'hull',  c1:'#d6c9f7', c2:'#6b5a9e'} },
};
F.ITEM_ORDER = Object.keys(F.ITEMS);

/* ================= RECIPES =================
   machine: 'smelter' | 'alloy' | 'asm' | 'refinery'
   smelter/alloy auto-select by inputs; asm/refinery are player-selected. */
F.RECIPES = {
  /* smelter (auto) */
  ironIngot:  { out:'ironIngot',  outN:1, in:{ironOre:1},   time:2.0, machine:'smelter', unlock:1 },
  copperIngot:{ out:'copperIngot',outN:1, in:{copperOre:1}, time:2.0, machine:'smelter', unlock:1 },
  brick:      { out:'brick',      outN:1, in:{stone:1},     time:1.6, machine:'smelter', unlock:1 },
  glass:      { out:'glass',      outN:1, in:{quartz:1},    time:2.6, machine:'smelter', unlock:1 },
  titanIngot: { out:'titanIngot', outN:1, in:{titanOre:1},  time:3.6, machine:'smelter', minTier:3, unlock:7 },
  /* grit smelting (tech: ore crushing — 1 grit → 1 ingot, so ore counts double) */
  ironIngotD: { out:'ironIngot',  outN:1, in:{ironDust:1},   time:2.0, machine:'smelter', tech:'crushing' },
  copperIngotD:{out:'copperIngot',outN:1, in:{copperDust:1}, time:2.0, machine:'smelter', tech:'crushing' },
  titanIngotD:{ out:'titanIngot', outN:1, in:{titanDust:1},  time:3.6, machine:'smelter', minTier:3, tech:'crushing2' },
  /* crusher (auto) — 1 ore → 2 grit */
  ironDust:   { out:'ironDust',   outN:2, in:{ironOre:1},   time:1.8, machine:'crusher', tech:'crushing' },
  copperDust: { out:'copperDust', outN:2, in:{copperOre:1}, time:1.8, machine:'crusher', tech:'crushing' },
  titanDust:  { out:'titanDust',  outN:2, in:{titanOre:1},  time:2.8, machine:'crusher', minTier:2, tech:'crushing2' },
  /* alloy furnace (auto) */
  steel:      { out:'steel',      outN:1, in:{ironIngot:2, coal:1},  time:3.2, machine:'alloy', unlock:4 },
  silicon:    { out:'silicon',    outN:1, in:{quartz:1, coal:1},     time:2.6, machine:'alloy', unlock:4 },
  chrome:     { out:'chrome',     outN:1, in:{chromite:1, coal:1},   time:3.4, machine:'alloy', minTier:2, tech:'chromeworks' },
  chromsteel: { out:'chromsteel', outN:1, in:{chrome:1, steel:1},    time:4.2, machine:'alloy', minTier:2, tech:'chromeworks' },
  /* assembler */
  gear:       { out:'gear',   outN:1, in:{ironIngot:2},              time:1.6, machine:'asm', unlock:2 },
  wire:       { out:'wire',   outN:2, in:{copperIngot:1},            time:1.4, machine:'asm', unlock:2 },
  plate:      { out:'plate',  outN:2, in:{ironIngot:3},              time:2.2, machine:'asm', unlock:2 },
  circuit:    { out:'circuit',outN:1, in:{wire:2, silicon:1},        time:2.4, machine:'asm', unlock:4 },
  motor:      { out:'motor',  outN:1, in:{gear:2, steel:1, wire:2},  time:3.2, machine:'asm', unlock:5 },
  advCircuit: { out:'advCircuit', outN:1, in:{circuit:1, plastic:1, wire:2}, time:3.4, machine:'asm', unlock:6 },
  frame:      { out:'frame',  outN:1, in:{steel:2, titanIngot:1},    time:3.6, machine:'asm', minTier:3, unlock:7 },
  processor:  { out:'processor', outN:1, in:{advCircuit:2, silicon:1, glass:1}, time:4.2, machine:'asm', unlock:8 },
  logicMatrix:{ out:'logicMatrix', outN:1, in:{processor:2, circuit:2, glass:1}, time:6.0, machine:'asm', unlock:8 },
  powerCore:  { out:'powerCore',   outN:1, in:{fuelCell:2, frame:1, motor:1},    time:6.0, machine:'asm', unlock:8 },
  hullPlate:  { out:'hullPlate',   outN:1, in:{titanIngot:2, steel:2, glass:1},  time:6.0, machine:'asm', unlock:8 },
  /* modules */
  speedModule:{ out:'speedModule', outN:1, in:{circuit:18, wire:36},   time:36.0, machine:'asm', tech:'speedModuleTech' },
  effModule:  { out:'effModule',   outN:1, in:{circuit:18, glass:18},  time:36.0, machine:'asm', tech:'effModuleTech' },
  durModule:  { out:'durModule',   outN:1, in:{steel:12, gear:18},     time:18.0, machine:'asm', tech:'durModuleTech' },
  prodModule: { out:'prodModule',  outN:1, in:{advCircuit:2, plastic:2},time:6.0, machine:'asm', tech:'prodModules' },
  /* science packs */
  pack1:      { out:'pack1', outN:1, in:{gear:1, copperIngot:1},    time:4.0, machine:'asm', unlock:2 },
  pack2:      { out:'pack2', outN:1, in:{circuit:1, glass:1},       time:5.0, machine:'asm', unlock:4 },
  pack3:      { out:'pack3', outN:1, in:{plastic:1, motor:1},       time:6.0, machine:'asm', unlock:6 },
  pack4:      { out:'pack4', outN:1, in:{processor:1, titanIngot:1},time:7.0, machine:'asm', unlock:8 },
  /* refinery (fluid) — cracking crude always leaves tar behind */
  plastic:    { out:'plastic',  outN:2, in:{coal:1}, fluid:8,  by:{tar:1}, time:3.2, machine:'refinery', unlock:6 },
  fuelCell:   { out:'fuelCell', outN:1, in:{steel:1}, fluid:10, by:{tar:1}, time:3.0, machine:'refinery', unlock:6 },
  /* tar handling */
  tarCoal:    { out:'coal',     outN:1, in:{tar:1},   time:1.6, machine:'smelter', unlock:6 },
  plasticTar: { out:'plastic',  outN:1, in:{tar:2, coal:1}, time:3.0, machine:'asm', tech:'tarSynthesis' },
};

/* what a smelter/alloy/crusher can make, for auto-select */
F.AUTO_RECIPES = { smelter:[], alloy:[], crusher:[] };
for (const k in F.RECIPES){
  const r = F.RECIPES[k];
  if (F.AUTO_RECIPES[r.machine]) F.AUTO_RECIPES[r.machine].push(k);
}

/* science pack items, in tier order */
F.PACKS = ['pack1', 'pack2', 'pack3', 'pack4'];
F.LAB_BUF = 6;   // max of each pack a lab buffers

/* ================= BUILDINGS =================
   Only the spine lives on milestones (unlock: tier index); everything else
   is bought in the tech tree (tech: id). Costs compound steeply the later a
   building unlocks — optimising the factory is the only way to afford it. */
const B = F.BUILDINGS = {
  /* --- logistics --- */
  belt1:   { name:'Conveyor',        cat:'log', kind:'belt', w:1, h:1, speed:1.25, cost:{ironOre:1},          unlock:0,
             desc:'Moves items. Drag to lay a line; R rotates.' },
  belt2:   { name:'Fast conveyor',   cat:'log', kind:'belt', w:1, h:1, speed:2.5,  cost:{plate:2, gear:1},    tech:'fastBelts',
             desc:'Twice the throughput of a basic conveyor.' },
  belt3:   { name:'Mag-rail',        cat:'log', kind:'belt', w:1, h:1, speed:4.2,  cost:{steel:3, gear:3},    tech:'magRails',
             desc:'Frictionless magnetic rail. Very fast.' },
  belt4:   { name:'Grav-belt',       cat:'log', kind:'belt', w:1, h:1, speed:6.5,  cost:{titanIngot:4, advCircuit:4}, tech:'gravBelts',
             desc:'Items float above the track on gravity pins. Blinding speed.' },
  ubelt1:  { name:'Tunnel',          cat:'log', kind:'ubelt', w:1, h:1, span:5, speed:1.25, cost:{ironIngot:6, gear:2}, tech:'tunnels',
             desc:'Sends items under 4 tiles. Place entrance, then exit. Lets lines cross.' },
  ubelt2:  { name:'Deep tunnel',     cat:'log', kind:'ubelt', w:1, h:1, span:9, speed:4.2, cost:{steel:10, plastic:5}, tech:'deepTunnels',
             desc:'A longer, faster tunnel.' },
  splitter:{ name:'Splitter',        cat:'log', kind:'splitter', w:1, h:1, speed:2.5, cost:{ironIngot:6},     unlock:2,
             desc:'Takes items in from behind and deals them evenly to every open exit.' },
  chest:   { name:'Depot',           cat:'log', kind:'chest', w:1, h:1, cap:60, cost:{plate:6},               tech:'depots',
             desc:'Buffers up to 60 items, releases them out the front. Smooths surges.' },
  chestTar:{ name:'Tar pit',         cat:'log', kind:'chest', w:1, h:1, cap:210, tarOnly:true, cost:{brick:10, plate:4}, unlock:12,
             desc:'A brick-lined pit that holds 210 tar — and nothing else. Every other depot refuses the stuff.' },
  chest2:  { name:'Vault',           cat:'log', kind:'chest', w:1, h:1, cap:240, cost:{steel:12, plate:16},   tech:'massStorage',
             desc:'A reinforced depot holding 240 items. Feeds out the front like a depot.' },
  pipe:    { name:'Pipe',            cat:'log', kind:'pipe', w:1, h:1, cap:40, cost:{plate:2},                tech:'pumpjacks',
             desc:'Carries crude oil between pumpjacks and refineries.' },
  tank:    { name:'Reservoir',       cat:'log', kind:'tank', w:2, h:2, cap:240, cost:{steel:20, plate:16, glass:10}, tech:'reservoirs',
             desc:'Buffers 240 crude between connected pipes — fills when the line runs rich, feeds it when pumps fall behind.' },
  platform:{ name:'Platform',        cat:'log', kind:'platform', w:1, h:1, cost:{stone:4, plate:1}, tech:'platforms',
             desc:'A steel-pinned deck over open water. Anything builds on it — belts, machines, even power poles. Drag to deck a crossing; remove it only once it\'s clear.' },
  port:    { name:'Drone depot',     cat:'log', kind:'port', w:2, h:2, power:8, cap:100, cost:{steel:40, processor:5, motor:20, glass:20}, tech:'drones',
             desc:'Long-haul air freight. Set one depot to PROVIDE an item (feed it by belt), another to REQUEST it — two drones ferry the cargo across any distance, no belts needed. A REQUEST depot splits its goods evenly across every side that has a conveyor leading directly out — run one, two, or up to eight belts off it.' },
  /* --- extraction --- */
  miner1:  { name:'Burner drill',    cat:'ext', kind:'miner', w:1, h:1, speed:1, mineTime:2.4, fuel:true, cost:{ironOre:6, stone:4}, unlock:0,
             desc:'Chews ore out of a deposit. Burns coal — feed it by belt or by hand.' },
  miner2:  { name:'Electric drill',  cat:'ext', kind:'miner', w:1, h:1, speed:2.2, mineTime:2.4, power:2.5, cost:{plate:10, gear:8, wire:8}, tech:'electricDrills',
             desc:'No fuel needed — draws from the power grid.' },
  miner3:  { name:'Plasma bore',     cat:'ext', kind:'miner', w:1, h:1, speed:4.4, mineTime:2.4, power:6, cost:{steel:26, motor:10, advCircuit:7}, tech:'plasmaBores',
             desc:'Cuts ore with a plasma lance. Extremely fast.' },
  miner4:  { name:'Quantum drill',   cat:'ext', kind:'miner', w:1, h:1, speed:7, mineTime:2.4, power:12, cost:{frame:9, processor:5, motor:18}, tech:'quantumDrills',
             desc:'Folds the deposit through itself. Absurd yield, serious power draw.' },
  pump:    { name:'Pumpjack',        cat:'ext', kind:'pump', w:2, h:2, rate:3, power:6, cost:{steel:20, gear:16, motor:5}, tech:'pumpjacks',
             desc:'Draws crude oil from a seep. Electric — needs the grid. Connect pipes to carry the crude away.' },
  /* --- production --- */
  smelter1:{ name:'Stone kiln',      cat:'pro', kind:'machine', fam:'smelter', w:2, h:2, speed:1,   fuel:true, cost:{stone:12}, unlock:1,
             desc:'Smelts ore into ingots. Burns coal.' },
  smelter2:{ name:'Arc furnace',     cat:'pro', kind:'machine', fam:'smelter', w:2, h:2, speed:2.2, power:4,  cost:{brick:12, plate:14, wire:10}, tech:'arcFurnaces',
             desc:'Electric smelting, over twice as fast.' },
  smelter3:{ name:'Plasma forge',    cat:'pro', kind:'machine', fam:'smelter', w:2, h:2, speed:4,   power:10, cost:{steel:40, advCircuit:10, plastic:20}, tech:'plasmaForges',
             desc:'Star-hot. Smelts anything almost instantly — and the only furnace, short of the Sunforge, that can melt titanium ore.' },
  smelter4:{ name:'Sunforge',        cat:'pro', kind:'machine', fam:'smelter', w:2, h:2, speed:7,   power:20, cost:{chromsteel:40, advCircuit:20, brick:50}, tech:'sunforge',
             desc:'A caged fragment of dawn. The final word in smelting.' },
  alloy:   { name:'Alloy furnace',   cat:'pro', kind:'machine', fam:'alloy', w:2, h:2, speed:1.6, power:5, cost:{brick:20, plate:18, wire:14}, unlock:4,
             desc:'Fuses two inputs: iron + coal → steel, quartz + coal → silicon. Electric — needs a powered grid. Too cool for chromite, though — that needs a Chrome furnace.' },
  alloy2:  { name:'Chrome furnace',  cat:'pro', kind:'machine', fam:'alloy', w:2, h:2, speed:3, power:12, cost:{steel:30, circuit:12, glass:8}, tech:'chromeworks',
             desc:'A far hotter alloy furnace — the only thing that can fuse chromite into chrome, and chrome into chromsteel. Smelts steel and silicon too, nearly twice as fast as the basic furnace.' },
  asm1:    { name:'Fabricator',      cat:'pro', kind:'machine', fam:'asm', w:2, h:2, speed:1,   fuel:true, cost:{brick:8, ironIngot:8}, unlock:2,
             desc:'Crafts parts from a chosen recipe. Burns coal.' },
  asm2:    { name:'Assembler',       cat:'pro', kind:'machine', fam:'asm', w:2, h:2, speed:2.2, power:10, cost:{steel:12, gear:16, circuit:8}, tech:'poweredAssembly',
             desc:'Powered assembly line, over twice as fast.' },
  asm3:    { name:'Nano-forge',      cat:'pro', kind:'machine', fam:'asm', w:2, h:2, speed:4,   power:24, cost:{steel:34, motor:14, advCircuit:14}, tech:'nanoForges',
             desc:'Assembles at the molecular scale.' },
  asm4:    { name:'Chrome fabricator', cat:'pro', kind:'machine', fam:'asm', w:2, h:2, speed:7, power:45, cost:{chromsteel:40, processor:10, motor:30}, tech:'sunforge',
             desc:'Chromsteel arms moving faster than sight. The final word in assembly.' },
  refinery:{ name:'Refinery',        cat:'pro', kind:'machine', fam:'refinery', w:3, h:3, speed:1.6, power:16, tank:60, cost:{steel:35, brick:25, circuit:15}, unlock:7,
             desc:'Cracks crude oil into plastic and fuel cells. Needs pipe input.' },
  crusher1:{ name:'Jaw crusher',     cat:'pro', kind:'machine', fam:'crusher', w:2, h:2, speed:1, fuel:true, cost:{brick:14, gear:10, plate:8}, tech:'crushing',
             desc:'Grinds 1 ore into 2 grit; grit smelts into full ingots — double your yield. Burns coal.' },
  crusher2:{ name:'Ball mill',       cat:'pro', kind:'machine', fam:'crusher', w:2, h:2, speed:2.4, power:12, cost:{steel:26, motor:10, circuit:14}, tech:'crushing2',
             desc:'An electric mill — much faster, and hard enough to crack titanium.' },
  lab:     { name:'Laboratory',      cat:'pro', kind:'lab', w:2, h:2, packTime:2.5, cost:{brick:8, wire:6, gear:4}, unlock:2,
             desc:'Consumes science packs to research technologies — pick a project in the Tech tree (T). Runs on curiosity alone; no fuel, no power.' },
  beacon:  { name:'Beacon',          cat:'pro', kind:'beacon', w:2, h:2, power:20, range:4, slots:2, cost:{steel:40, advCircuit:16, glass:24}, tech:'beacons',
             desc:'Broadcasts its slotted modules at half strength to every machine in its area. Productivity does not transmit.' },
  /* --- power --- */
  lamp:    { name:'Lamp',            cat:'pow', kind:'lamp', w:1, h:1, power:1, glow:15, cost:{glass:3, wire:3, ironIngot:2}, tech:'electrification',
             desc:'Pushes back the night in a warm circle. Needs a power pole in range; draws almost nothing.' },
  acc:     { name:'Accumulator',     cat:'pow', kind:'acc', w:1, h:1, cost:{steel:10, wire:20, glass:6}, tech:'accumulators',
             desc:'Banks 900 P·s of surplus grid energy and feeds it back when demand outruns supply. Charges at a trickle — plan a long day for a short night.' },
  pole1:   { name:'Power pole',      cat:'pow', kind:'pole', w:1, h:1, reach:7, cover:2, cost:{ironIngot:3, wire:3}, tech:'electrification',
             desc:'Carries power. Links to poles within 7 tiles and powers machines in the 5×5 area around it. Generators must be in a pole\'s area too.' },
  pole2:   { name:'Pylon',           cat:'pow', kind:'pole', w:1, h:1, reach:14, cover:3, cost:{steel:10, wire:16}, tech:'pylons',
             desc:'A steel giant. Links across 14 tiles and powers a 7×7 area.' },
  pole3:   { name:'Substation',      cat:'pow', kind:'pole', w:1, h:1, reach:9, cover:5, cost:{steel:18, wire:24, circuit:6}, tech:'substations',
             desc:'A humming grid hub. Powers a huge 11×11 area and links across 9 tiles.' },
  gen1:    { name:'Burner generator',cat:'pow', kind:'gen', w:2, h:2, out:30, burn:6, cost:{brick:14, plate:10}, tech:'electrification',
             desc:'Burns coal to feed the grid. 30 P at full load. Needs a power pole in range to deliver it.' },
  solar:   { name:'Solar array',     cat:'pow', kind:'solar', w:2, h:2, out:12, cost:{glass:6, circuit:2, plate:4}, unlock:6,
             desc:'Silent, fuel-free power. 12 P, always on.' },
  solar2:  { name:'Solar tower',     cat:'pow', kind:'solar', w:2, h:2, out:45, cost:{glass:40, circuit:20, steel:20}, tech:'solarTowers',
             desc:'Concentrated mirrors around a molten-salt core. 45 P of silent, fuel-free power.' },
  solar3:  { name:'Helios array',    cat:'pow', kind:'solar', w:3, h:3, out:1000, cost:{glass:80, advCircuit:24, frame:16}, tech:'helios',
             desc:'A field of sun-tracking mirrors. 1000 P without a whisper of smoke.' },
  turbine: { name:'Fuel turbine',    cat:'pow', kind:'turbine', w:2, h:2, out:400, burn:20, cost:{steel:10, motor:4, plate:8}, unlock:6,
             desc:'Burns fuel cells for serious power. 400 P at full load.' },
  turbine2:{ name:'Chrome turbine',  cat:'pow', kind:'turbine', w:2, h:2, out:1250, burn:15, cost:{chromsteel:50, motor:25, advCircuit:16}, tech:'chromeTurbines',
             desc:'Chromsteel blades spinning near the speed of sound. 1250 P at full load.' },
};
F.BUILD_ORDER = Object.keys(B);

/* Machine tiers: within a family, each mark is a harder machine than the last.
   Some recipes demand a minimum tier (titanium needs a Plasma Forge; chrome
   needs a Chrome furnace) — a machine below that tier simply won't touch the
   material. Miners carry a tier too, for hard ores. */
{
  const TIERS = {
    miner:   ['miner1', 'miner2', 'miner3', 'miner4'],
    smelter: ['smelter1', 'smelter2', 'smelter3', 'smelter4'],
    asm:     ['asm1', 'asm2', 'asm3', 'asm4'],
    alloy:   ['alloy', 'alloy2'],
    crusher: ['crusher1', 'crusher2'],
  };
  for (const fam in TIERS) TIERS[fam].forEach((k, i) => { if (B[k]) B[k].tier = i + 1; });
}

/* Power is precious: every electric consumer draws five times the draw
   written above (lamps stay cheap) — the grid is a thing you earn, not a
   thing you sprinkle. */
for (const k in B){ if (B[k].power && B[k].kind !== 'lamp') B[k].power *= 5; }

/* Everything past the milestone basics — anything the tech tree sells —
   costs a THIRD of its sticker price. Research is the real gate; the
   wallet needn't gate it twice. */
for (const k in B){
  const d = B[k];
  if (d.tech) for (const c in d.cost) d.cost[c] = Math.max(1, Math.round(d.cost[c] / 3));
}

/* …but electricity is an investment: every grid-DRAWING building then
   costs double whatever the rules above left it at */
for (const k in B){
  const d = B[k];
  if (d.power) for (const c in d.cost) d.cost[c] *= 2;
}

/* Hidden service STRETCH, in completed operations (ores dug, crafts finished,
   crude drawn). At the end of each stretch the machine rolls F.BREAK_CHANCE to
   die for good; survive and the counter resets. Higher marks stretch longer.
   NEVER shown to the player — machines simply break down one day. */
{
  const LIFE = { miner1:500, miner2:800, miner3:1300, miner4:2000, pump:800,
    smelter1:500, smelter2:800, smelter3:1300, smelter4:2000, alloy:800, alloy2:1300,
    asm1:500, asm2:800, asm3:1300, asm4:2000, refinery:1000,
    crusher1:500, crusher2:800 };
  for (const k in LIFE) B[k].life = LIFE[k];
}

/* What a building costs to place RIGHT NOW: sticker price — except that
   once you own one of an electric building, every further copy of it costs
   ×1.9. The price actually paid rides the entity (e.paid) so removal
   refunds exactly what it cost — broken machines refund nothing. */
F.buildCost = function(S, key){
  const def = B[key];
  if (!def || def.kind === 'platform') return def && def.cost;
  if (!(def.power && S.ents.some(e => e.key === key))) return def.cost;
  const out = {};
  for (const k in def.cost) out[k] = Math.ceil(def.cost[k] * 1.9);
  return out;
};

F.CATS = [
  { id:'ext', name:'Extraction' },
  { id:'log', name:'Logistics' },
  { id:'pro', name:'Production' },
  { id:'pow', name:'Power' },
];

/* ================= MILESTONES =================
   The spine — twenty-two tiers, one new idea at a time, each followed by
   room to practise it. Tiers unlock only the most basic buildings + the
   spine recipes; everything else is researched in the tech tree.
   IDs are stable keys — saves store the id of the tier in progress, so
   inserting tiers is safe. reqResearch: also requires N completed techs.
   recap: the one-line lesson shown when the tier completes.
   Material grants stop after the fifth tier — the training wheels come off —
   and from Vitreous Earth on every requirement is five times what the early
   game would suggest. The factory must scale or die. */
F.MILESTONES = [
  { id:'m0', name:'Strike the Earth',
    flavor:'The Core is dark. Everything begins with your own two hands: tear iron and stone from the ground.',
    handMine:{ ironOre:10, stone:6 },
    unlocks:['miner1','belt1'],
    grant:{ ironOre:20, stone:16, coal:10 },
    hint:'Hold left-click on an ore deposit to hand-mine it.',
    recap:'You can tear what you need from the ground — but hands are slow.' },
  { id:'mFire', name:'First Fire',
    flavor:'One machine, one flame, one line of rollers. This is the whole game — everything after is more of it.',
    req:{ ironOre:15 },
    unlocks:[],
    grant:{ coal:15, ironOre:10 },
    hint:'Drills do the digging. Place one on iron ore, click it and give it coal, then belt its ore into the Core.',
    recap:'A drill, its fuel, and a belt to the Core — the loop that builds everything.' },
  { id:'mVeins', name:'Parallel Veins',
    flavor:'One line is a start. A factory is many lines that feed each other.',
    req:{ ironOre:40, coal:25 },
    unlocks:['smelter1','r:ironIngot','r:copperIngot','r:brick'],
    grant:{ stone:24, coal:12 },
    hint:'Put a drill on coal and belt it INTO your iron drill\'s side — machines eat fuel straight off belts. Then send both ores to the Core.',
    recap:'Machines can feed machines. You never have to shovel coal again.' },
  { id:'m1', name:'The First Melt',
    flavor:'Raw ore is a promise, not a material. Smelt it.',
    req:{ ironIngot:25 },
    unlocks:['splitter'],
    grant:{ ironIngot:8, stone:12 },
    hint:'The stone kiln takes ore in any side and pours ingots out its marked front. Belt ore in, coal for its fire, ingots to the Core.',
    recap:'Ore in the side, ingots out the front. Every machine works this way.' },
  { id:'m2', name:'The Ingot Age',
    flavor:'Iron, copper, brick — the three bones of every machine to come.',
    req:{ ironIngot:40, copperIngot:20, brick:15 },
    unlocks:['asm1','r:gear'],
    grant:{ ironIngot:12, copperIngot:8 },
    hint:'Three smelting lines at once. The new splitter divides one belt between two kilns — place it where a line must fork.',
    recap:'Parallel smelting, split fairly. Your first real production floor.' },
  { id:'mCog', name:'Cogwork',
    flavor:'The first shaped part. From here, the factory makes pieces of itself.',
    req:{ gear:25 },
    unlocks:['r:wire','r:plate'],
    grant:{},
    hint:'The fabricator crafts one chosen recipe — click it, pick Gear, and feed it iron ingots.',
    recap:'Machines craft what you choose. Choosing well is the game.' },
  { id:'m3', name:'Cogs & Current',
    flavor:'Gears to turn, wire to carry the spark — when you learn how to make one.',
    req:{ gear:40, wire:40 },
    unlocks:['lab','r:pack1'],
    grant:{},
    hint:'Wire needs a copper chain. One fabricator keeps up with about two kilns — watch where lines starve and add machines there.',
    recap:'Ratios rule the floor: roughly two kilns feed one fabricator.' },
  { id:'mLab', name:'The Laboratory',
    flavor:'Curiosity, bottled. The lab reads what you brew, and the tree of knowing grows.',
    req:{ pack1:10 }, reqResearch: 1,
    unlocks:['r:glass'],
    grant:{},
    hint:'Cog science is crafted like any part (gear + copper ingot). Belt it into the lab, open the Tech tree (T), pick a project — and finish your first research.',
    recap:'Science is just another product. Brew it, and the tree grows with you.' },
  { id:'m4', name:'Vitreous Earth',
    flavor:'Quartz sleeps in the middle distance. Melt it to glass — the factory must reach outward.',
    req:{ glass:225, plate:450 },
    unlocks:['alloy','r:steel','r:silicon','r:circuit','r:pack2'],
    grant:{},
    hint:'Quartz lies beyond your starting field — a real expedition. Kilns smelt it into glass; 450 plates means the iron line needs widening too.',
    recap:'The factory reaches outward now. Distance is a resource.' },
  { id:'mAlloy', name:'Alloys',
    flavor:'Two things, made one, stronger than either.',
    req:{ steel:150 },
    unlocks:[],
    grant:{},
    hint:'The alloy furnace fuses two belts of input: iron ingots + coal → steel. It\'s electric — research Electrification, then generators and a power pole wake it. It drinks deep; build several.',
    recap:'Two inputs, one output. Steel will be in everything now.' },
  { id:'m5', name:'The First Circuit',
    flavor:'Wire and silicon, etched into thought.',
    req:{ circuit:300, steel:225 },
    unlocks:['r:motor'],
    grant:{},
    hint:'Silicon comes off the alloy furnace too: quartz + coal. Circuits want wire and silicon — two chains meeting in one fabricator.',
    recap:'Chains of chains: quartz to silicon, silicon to thought.' },
  { id:'mA', name:'Deep Prospects',
    flavor:'Your instruments taste something old beneath the waste. Follow the scent of tar.',
    req:{ pack2:125, motor:125 },
    unlocks:[],
    grant:{},
    hint:'The Core drinks science itself now — belt volt packs straight in. Research <b>Oil prospecting</b>: pumpjacks and pipes for the seeps at the world\'s edge. Nothing can crack crude yet, so stockpile.',
    recap:'The Core drinks science. And something waits under the tar.' },
  { id:'mB', name:'Black Blood',
    flavor:'Deep in the waste, the ground weeps oil. Drink it.',
    req:{ steel:500, motor:200 },
    unlocks:['refinery','r:plastic','r:fuelCell','r:tarCoal','chestTar'],
    grant:{},
    hint:'Oil seeps wait at the world\'s far edge. Pumpjacks draw the crude, pipes carry it — build the long road out.',
    recap:'Oil flows in pipes, not on belts — a second bloodstream for the factory.' },
  { id:'mCrack', name:'First Crack',
    flavor:'The refinery does not give cleanly. Everything it makes, it makes with a cost.',
    req:{ plastic:100 },
    unlocks:[],
    grant:{},
    hint:'Set the refinery to Plastic (crude + coal). Tar shares its chute — filter it aside with a splitter and smelt it back into coal, or it jams everything.',
    recap:'Byproducts jam whatever ignores them. Tar tamed is coal regained.' },
  { id:'m6', name:'The Refined Age',
    flavor:'What burns can be tamed; what is tamed can think faster.',
    req:{ plastic:300, fuelCell:125 },
    unlocks:['r:advCircuit','r:pack3'],
    grant:{},
    hint:'Fuel cells also feed turbines — research Fuel turbines for serious power. Polymer science opens the deep branches of the tree.',
    recap:'What burns is tamed. Fuel cells hold the fire for later.' },
  { id:'mChrome', name:'Chromework',
    flavor:'A teal ore glitters in the deep rings — chromite, harder than steel and twice as proud. It will not melt in any furnace you own.',
    req:{ chromsteel:200 },
    unlocks:[],
    grant:{},
    hint:'Research <b>Chromeworks</b> in the tree: it builds the Chrome furnace, the only furnace hot enough for chromite. Chromite + coal → chrome, then chrome + steel → chromsteel — the metal every last machine is built from.',
    recap:'Chromsteel — the metal of the final machines. Only the Chrome furnace can forge it.' },
  { id:'m7', name:'Polymer Mind',
    flavor:'Plastic and copper laid in impossible lattices. The machines improve the machines.',
    req:{ advCircuit:350, plastic:300 },
    unlocks:['r:titanIngot','r:frame'],
    grant:{},
    hint:'Titanium waits at the far edges — a violet ore for the last age of machines. Only star-hot machines can work it: plasma bores to mine it, plasma forges to smelt it, nano-forges to press the frames.',
    recap:'The machines now improve the machines. Star-metal needs star-hot tools.' },
  { id:'m8', name:'Star Metal',
    flavor:'Titanium bones for a sleeping god.',
    req:{ titanIngot:350, frame:125 },
    unlocks:['r:processor','r:pack4'],
    grant:{},
    hint:'Titanium waits at the far edges of the world — smelt it, frame it. The processor is the first thing worthy of it: advanced circuits, silicon and glass, etched into judgement. Quantum science comes with it.',
    recap:'Star-metal and the processor — the factory can think now.' },
  { id:'mThink', name:'Quantum Thought',
    flavor:'A thousand processors thinking in lockstep. Feed the flask that feeds the mind.',
    req:{ processor:240, pack4:100 },
    unlocks:['r:logicMatrix'],
    grant:{},
    hint:'Processors and quantum science are both slow, deep chains — build them wide, not fast. When both flow steadily, the logic matrix opens: the Engine\'s mind, woven from processors and glass.',
    recap:'Processors by the crate, science by the flask. The mind can be built.' },
  { id:'mCore', name:'The Beating Heart',
    flavor:'A mind is nothing without a fire to drive it. Cage a star in a shell of steel.',
    req:{ logicMatrix:60 },
    unlocks:['r:powerCore'],
    grant:{},
    hint:'The power core burns fuel cells inside a titanium frame — the same fuel your turbines drink, now bound into a heart. Keep the fuel-cell line rich.',
    recap:'The heart is a caged fire. Fuel cells become the Engine\'s pulse.' },
  { id:'mHull', name:'Star-Metal Skin',
    flavor:'Mind and heart need a body to hold them against the dark.',
    req:{ powerCore:60 },
    unlocks:['r:hullPlate'],
    grant:{},
    hint:'Hull segments are titanium, steel and glass pressed into armour — the last of the three works. Every earlier line feeds this one.',
    recap:'The body is star-metal skin. All three works are within reach.' },
  { id:'m9', name:'Ignition',
    flavor:'Mind, heart, body. Deliver the three works and the World Engine breathes again.',
    req:{ logicMatrix:60, powerCore:60, hullPlate:60 },
    unlocks:[],
    grant:{},
    hint:'The dawn you build is the only dawn there is.',
    recap:'The dawn you built.' },
];

/* Derive every building/recipe's "Unlocks at" tier index from the spine —
   the milestone unlock lists are the single source of truth, so any
   hand-written unlock: numbers in the tables above are overwritten here
   and inserting tiers can never leave stale labels behind. */
{
  const at = {};
  F.MILESTONES.forEach((ms, i) => { for (const u of ms.unlocks) at[u] = i; });
  for (const k in F.BUILDINGS) if (at[k] != null) F.BUILDINGS[k].unlock = at[k];
  for (const k in F.RECIPES) if (at['r:' + k] != null) F.RECIPES[k].unlock = at['r:' + k];
}

/* ================= GUIDED STEPS =================
   Live checklists on the objective card: full walkthroughs for the early
   tiers, two-or-three-step mini-guides for later firsts. Each step is a
   pure predicate over sim state — the UI latches a step once it has ever
   been true, so transient conditions (a pack sitting in a lab buffer)
   still count. Steps never block anything; do things out of order and
   they tick themselves off.
     t: step text (small HTML ok)
     done(S): predicate
     arrow: 'ore:N' | 'core' | 'ent:<matcher>' — aims the world arrow
     pulse: build-bar key (or 'tree') to pulse while the step is current */
{
  const any = (S, f) => S.ents.some(f);
  const fam = (e, f) => e.kind === 'machine' && F.BUILDINGS[e.key].fam === f;
  const oreUnder = (S, e) => S.oreType[e.y * S.w + e.x];
  const minerOn = (S, t) => any(S, e => e.kind === 'miner' && oreUnder(S, e) === t);
  const fueled = e => (e.fuelBuf || 0) > 0 || (e.fuelT || 0) > 0;
  /* a belt on any side of 1×1 entity e, pointed into it */
  const beltInto = (S, e) => {
    for (let d = 0; d < 4; d++){
      const b = F.entAt(S, e.x - F.DX[d], e.y - F.DY[d]);
      if (b && b.kind === 'belt' && b.dir === d) return true;
    }
    return false;
  };
  /* a belt pointed into any tile of e's footprint, carrying coal right now
     (latching makes the moment count, however briefly the coal rides) */
  const coalBeltInto = (S, e) => {
    for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++)
      for (let d = 0; d < 4; d++){
        const b = F.entAt(S, e.x + i - F.DX[d], e.y + j - F.DY[d]);
        if (b && b.kind === 'belt' && b.dir === d && b.item === 'coal') return true;
      }
    return false;
  };

  F.GUIDES = {
    m0: [
      { t:'Hold left-click on an <b>iron deposit</b> to mine it', arrow:'ore:1',
        done: S => (S.handMined.ironOre || 0) > 0 },
      { t:'Mine some <b>stone</b> the same way', arrow:'ore:4',
        done: S => (S.handMined.stone || 0) > 0 },
    ],
    mFire: [
      { t:'Place a <b>Burner drill</b> on iron ore', arrow:'ore:1', pulse:'miner1',
        done: S => minerOn(S, 1) },
      { t:'Click the drill and move <b>coal</b> into its fuel slot', arrow:'ent:miner',
        done: S => any(S, e => e.kind === 'miner' && fueled(e)) },
      { t:'Belt its ore into the <b>Core</b> — from the drill\'s chute to any Core side', arrow:'core', pulse:'belt1',
        done: S => (S.msProg.ironOre || 0) > 0 },
    ],
    mVeins: [
      { t:'Place a drill on <b>coal</b>', arrow:'ore:3', pulse:'miner1',
        done: S => minerOn(S, 3) },
      { t:'Point a coal belt into an iron drill\'s <b>side</b> — it feeds itself', arrow:'ent:ironMiner',
        done: S => any(S, e => e.kind === 'miner' && oreUnder(S, e) === 1 && fueled(e) && beltInto(S, e)) },
      { t:'Deliver both ores to the Core',
        done: S => (S.msProg.ironOre || 0) > 0 && (S.msProg.coal || 0) > 0 },
    ],
    m1: [
      { t:'Place a <b>Stone kiln</b>', pulse:'smelter1',
        done: S => any(S, e => fam(e, 'smelter')) },
      { t:'Belt <b>iron ore</b> into any side of the kiln, and keep <b>coal</b> in its fire', arrow:'ent:smelter',
        done: S => any(S, e => fam(e, 'smelter') && (e.crafting || (e.outTotal || 0) > 0)) },
      { t:'Belt the <b>ingots</b> from its front into the Core', arrow:'core',
        done: S => (S.msProg.ironIngot || 0) > 0 },
    ],
    m2: [
      { t:'Place a <b>Splitter</b> where one ore line must feed two kilns', pulse:'splitter',
        done: S => any(S, e => e.kind === 'splitter') },
      { t:'Belt <b>coal</b> into your kilns\' sides — hand-feeding three fires doesn\'t scale', arrow:'ent:smelter',
        done: S => any(S, e => fam(e, 'smelter') && coalBeltInto(S, e)) },
      { t:'Start a <b>copper</b> chain: drill → kiln → Core',
        done: S => (S.msProg.copperIngot || 0) > 0 },
      { t:'Smelt <b>stone into brick</b>',
        done: S => (S.msProg.brick || 0) > 0 },
    ],
    mCog: [
      { t:'Place a <b>Fabricator</b>', pulse:'asm1',
        done: S => any(S, e => fam(e, 'asm')) },
      { t:'Click it and choose the <b>Gear</b> recipe', arrow:'ent:asm',
        done: S => any(S, e => fam(e, 'asm') && e.recipe === 'gear') },
      { t:'Feed it iron ingots; belt the <b>gears</b> to the Core', arrow:'core',
        done: S => (S.msProg.gear || 0) > 0 },
    ],
    m3: [
      { t:'Set a second fabricator to <b>Copper wire</b>',
        done: S => any(S, e => fam(e, 'asm') && e.recipe === 'wire') },
      { t:'Balance the ratio — about <b>two kilns per fabricator</b>',
        done: S => (S.msProg.wire || 0) >= 10 },
    ],
    mLab: [
      { t:'Craft brick, wire and gear — then place the <b>Laboratory</b>', pulse:'lab',
        done: S => any(S, e => e.kind === 'lab') },
      { t:'Set a fabricator to <b>Cog science</b> (gear + copper ingot)',
        done: S => any(S, e => fam(e, 'asm') && e.recipe === 'pack1') },
      { t:'Belt cog science into the <b>lab</b> — and some into the Core', arrow:'ent:lab',
        done: S => any(S, e => e.kind === 'lab' && ((e.inBuf.pack1 || 0) > 0 || e.workItem)) },
      { t:'Open the <b>Tech tree</b> (T) and pick a project', pulse:'tree',
        done: S => !!S.research.cur || Object.keys(S.research.done).length > 0 },
      { t:'Finish your first <b>research</b>',
        done: S => Object.keys(S.research.done).length > 0 },
    ],
    /* mini-guides for later firsts */
    m4: [
      { t:'Quartz waits in the <b>mid rings</b> — scout out and place a drill on it', arrow:'ore:5',
        done: S => minerOn(S, 5) },
    ],
    mAlloy: [
      { t:'Research <b>Electrification</b> if you haven\'t — the alloy furnace is electric', pulse:'tree',
        done: S => !!S.research.done.electrification },
      { t:'Place the <b>Alloy furnace</b>; belt in iron ingots AND coal', pulse:'alloy',
        done: S => any(S, e => fam(e, 'alloy')) },
      { t:'Power it: fueled <b>generators</b> and a <b>pole</b> whose area covers them — it drinks deep, expect to build several', arrow:'ent:alloy',
        done: S => any(S, e => fam(e, 'alloy') && e.netId) },
    ],
    mA: [
      { t:'Research <b>Oil prospecting</b> — the pumpjack and the pipe', pulse:'tree',
        done: S => !!S.research.done.pumpjacks },
      { t:'Find an <b>oil seep</b> at the world\'s edge and place a pumpjack on it', arrow:'ore:7', pulse:'pump',
        done: S => any(S, e => e.kind === 'pump') },
      { t:'Run <b>pipes</b> from the pumpjack — stockpile crude for the refinery to come', pulse:'pipe',
        done: S => any(S, e => e.kind === 'pipe' && e.fluid > 0) },
    ],
    mCrack: [
      { t:'Place the <b>Refinery</b>, pipe in crude, and choose the <b>Plastic</b> recipe', pulse:'refinery',
        done: S => any(S, e => fam(e, 'refinery') && e.recipe === 'plastic') },
      { t:'<b>Tar</b> shares its chute — drag tar onto a splitter exit to pull it aside', pulse:'splitter',
        done: S => any(S, e => e.kind === 'splitter' && e.exFilt &&
          (e.exFilt.left === 'tar' || e.exFilt.front === 'tar' || e.exFilt.right === 'tar')) },
      { t:'Smelt the tar back into <b>coal</b> in any kiln',
        done: S => any(S, e => fam(e, 'smelter') && ((e.inBuf.tar || 0) > 0 || e.activeRecipe === 'tarCoal')) },
    ],
  };
}

/* ================= TECHNOLOGIES =================
   The branches — and most of the arsenal. Milestones hand out only the
   basic machines; everything faster, brighter or electric is researched
   here with science packs in laboratories.
   cost: packs consumed · req: prerequisite techs · unlocks: buildings/recipes
   effect: engine-level bonus flag (checked in sim) */
F.TECHS = {
  /* --- the coal age --- */
  combustion:  { name:'Efficient combustion', icon:'coal',
    desc:'Refined firebox airflow — coal burns 35% longer in every burner machine and generator.',
    cost:{ pack1:8 }, req:[], effect:'burn' },
  coalHoppers: { name:'Coal hoppers', icon:'coal',
    desc:'Triple bunkers: every coal-burning building holds 36 coal instead of 12 — far fewer refuelling runs.',
    cost:{ pack1:12 }, req:[], effect:'hopper' },
  forcedDraft: { name:'Forced draft', icon:'brick',
    desc:'Superheated fireboxes: every coal-fired building works 30% faster — and eats coal 60% faster. Keep the belts black.',
    cost:{ pack1:18 }, req:['coalHoppers'], effect:'draft' },
  /* --- early logistics --- */
  depots:      { name:'Depots', icon:'plate',
    desc:'A buffer chest holding 60 items — smooths surges and stockpiles for milestone pushes.',
    cost:{ pack1:8 }, req:[], unlocks:['chest'] },
  tunnels:     { name:'Tunnels', icon:'gear',
    desc:'Send items under 4 tiles of anything — the only way to cross two belt lines.',
    cost:{ pack1:8 }, req:[], unlocks:['ubelt1'] },
  platforms:   { name:'Pontoon platforms', icon:'stone',
    desc:'Drive piles into the lakebed and deck them over: platforms turn open water into buildable ground — for belts, machines, even power poles.',
    cost:{ pack1:6 }, req:[], unlocks:['platform'] },
  fastBelts:   { name:'Fast conveyors', icon:'plate',
    desc:'Twice the throughput of a basic conveyor. Your mainline will thank you.',
    cost:{ pack1:14 }, req:[], unlocks:['belt2'] },
  crushing:    { name:'Ore crushing', icon:'ironDust',
    desc:'The jaw crusher grinds 1 ore into 2 grit, and grit smelts into full ingots — double the metal from every deposit.',
    cost:{ pack1:15 }, req:[], unlocks:['crusher1','r:ironDust','r:copperDust','r:ironIngotD','r:copperIngotD'] },
  massStorage: { name:'Mass storage', icon:'plate',
    desc:'The vault: a reinforced depot that holds 240 items.',
    cost:{ pack1:12 }, req:['depots'], unlocks:['chest2'] },
  /* --- the electric age --- */
  electrification:{ name:'Electrification', icon:'wire',
    desc:'The grid: burner generators feed power poles, and each pole energises everything around it — no more hauling coal to every machine. Also unlocks lamps to hold back the night.',
    cost:{ pack1:25 }, req:[], unlocks:['gen1','pole1','lamp'] },
  electricDrills:{ name:'Electric drills', icon:'ironOre',
    desc:'A drill with no firebox at all — 2.2× base speed, fed by the grid.',
    cost:{ pack1:12 }, req:['electrification'], unlocks:['miner2'] },
  arcFurnaces: { name:'Arc furnaces', icon:'ironIngot',
    desc:'Electric smelting, over twice as fast as a stone kiln.',
    cost:{ pack1:14 }, req:['electrification'], unlocks:['smelter2'] },
  poweredAssembly:{ name:'Powered assembly', icon:'circuit',
    desc:'The assembler: a powered line over twice as fast as a fabricator.',
    cost:{ pack2:12 }, req:['electrification'], unlocks:['asm2'] },
  pylons:      { name:'Pylons', icon:'wire',
    desc:'Steel giants that link across 14 tiles and power a 7×7 area — the grid goes long-distance.',
    cost:{ pack2:10 }, req:['electrification'], unlocks:['pole2'] },
  substations: { name:'Substations', icon:'wire',
    desc:'A humming grid hub that powers a huge 11×11 area — far fewer poles in dense factory blocks.',
    cost:{ pack1:10, pack2:12 }, req:['pylons'], unlocks:['pole3'] },
  solarPower:  { name:'Solar power', icon:'glass',
    desc:'Silent, fuel-free panels — 12 P in full sun, nothing at night.',
    cost:{ pack2:14 }, req:['electrification'], unlocks:['solar'] },
  accumulators:{ name:'Accumulators', icon:'fuelCell',
    desc:'Grid batteries: bank surplus power by day, spend it through the night. Each stores 900 P·s — they charge at a trickle, so start banking early.',
    cost:{ pack2:16 }, req:['solarPower'], unlocks:['acc'] },
  sunAnchor:   { name:'The Sun Anchor', icon:'glass',
    desc:'The Engine grips the sky itself: a toggle appears by the power bar to hold the day-night cycle still — freeze the sun wherever it stands, release it when you choose.',
    cost:{ pack2:5, pack3:4 }, req:['solarPower'], effect:'sunAnchor' },
  /* --- mid logistics & industry --- */
  modules:     { name:'Machine modules', icon:'speedModule',
    desc:'The science of machine tuning. Opens the research for each module TYPE and for the SLOTS to fit them in — but grants nothing on its own. A machine has no module slots until you research them.',
    cost:{ pack2:16 }, req:[], unlocks:[] },
  speedModuleTech:{ name:'Speed modules', icon:'speedModule',
    desc:'Craft speed modules: +35% machine speed each — at a ruinous ×11.2 power draw. Pair one with an efficiency module to tame the bill to ×2.3.',
    cost:{ pack2:6 }, req:['modules'], unlocks:['r:speedModule'] },
  effModuleTech:{ name:'Efficiency modules', icon:'effModule',
    desc:'Craft efficiency modules: a huge cut to a machine\'s power draw, and the counterweight that makes speed modules affordable.',
    cost:{ pack2:6 }, req:['modules'], unlocks:['r:effModule'] },
  durModuleTech:{ name:'Hardened modules', icon:'durModule',
    desc:'Craft hardened modules: +120% service life each, and each one widens a machine\'s breakdown odds (1/4 → 1/6 → 1/8).',
    cost:{ pack2:6 }, req:['modules'], unlocks:['r:durModule'] },
  moduleSlot1: { name:'Module slot I', icon:'gear',
    desc:'Cut a single module socket into every drill and machine. Without it, modules have nowhere to go.',
    cost:{ pack2:8 }, req:['modules'], effect:'slot' },
  moduleSlot2: { name:'Module slot II', icon:'gear',
    desc:'A second module socket in every drill and machine.',
    cost:{ pack2:6 }, req:['moduleSlot1'], effect:'slot' },
  moduleSlot3: { name:'Module slot III', icon:'gear',
    desc:'A third module socket in every drill and machine — the most any can hold.',
    cost:{ pack3:4 }, req:['moduleSlot2'], effect:'slot' },
  crushing2:   { name:'Ball mills', icon:'titanDust',
    desc:'An electric mill that crushes 2.4× faster — and is hard enough to crack titanium.',
    cost:{ pack1:10, pack2:15 }, req:['crushing'], unlocks:['crusher2','r:titanDust','r:titanIngotD'] },
  magRails:    { name:'Mag-rails', icon:'steel',
    desc:'Frictionless magnetic rail moving 4.2 tiles a second.',
    cost:{ pack2:16 }, req:['fastBelts'], unlocks:['belt3'] },
  deepTunnels: { name:'Deep tunnels', icon:'steel',
    desc:'A longer, faster tunnel — 8 tiles under, at mag-rail speed.',
    cost:{ pack2:12 }, req:['tunnels'], unlocks:['ubelt2'] },
  pumpjacks:   { name:'Oil prospecting', icon:'motor',
    desc:'The pumpjack and the pipe: machines to drink the black blood of the deep waste and carry it home. Pumpjacks are electric — bring the grid with you.',
    cost:{ pack2:10 }, req:[], unlocks:['pump','pipe'] },
  reservoirs:  { name:'Reservoirs', icon:'plate',
    desc:'A 240-crude buffer tank for pipe networks — banks oil when pumps run rich, feeds refineries when they fall behind.',
    cost:{ pack2:14 }, req:['pumpjacks'], unlocks:['tank'] },
  /* --- the oil age & beyond --- */
  fuelTurbines:{ name:'Fuel turbines', icon:'fuelCell',
    desc:'Burns refinery fuel cells for 150 P a machine — five burner generators in one footprint.',
    cost:{ pack3:12 }, req:['electrification'], unlocks:['turbine'] },
  tarSynthesis:{ name:'Tar synthesis', icon:'tar',
    desc:'Re-polymerise refinery tar: 2 tar + coal → plastic in any assembler. Turns your dirtiest byproduct into your most-wanted material.',
    cost:{ pack3:12 }, req:[], unlocks:['r:plasticTar'] },
  prodModules: { name:'Productivity modules', icon:'prodModule',
    desc:'The subtlest module of all, learned only after the hardened kind: skims material off every craft for +12% bonus output apiece. Machines only — too delicate to broadcast.',
    cost:{ pack2:4, pack3:6 }, req:['durModuleTech'], unlocks:['r:prodModule'] },
  solarTowers: { name:'Solar towers', icon:'glass',
    desc:'Concentrated mirrors around a molten-salt core: 45 P of silent, fuel-free power.',
    cost:{ pack2:18 }, req:['solarPower'], unlocks:['solar2'] },
  plasmaBores: { name:'Plasma bores', icon:'motor',
    desc:'A drill that cuts ore with a plasma lance — 4.4× base speed, and the first drill hard enough to bite titanium. Weaker drills sit idle on a titanium deposit.',
    cost:{ pack2:14, pack3:12 }, req:['electricDrills'], unlocks:['miner3'] },
  plasmaForges:{ name:'Plasma forges', icon:'steel',
    desc:'Star-hot smelting, 4× base speed — and the first furnace hot enough to melt titanium ore into ingots. Kilns and arc furnaces can\'t.',
    cost:{ pack2:14, pack3:12 }, req:['arcFurnaces'], unlocks:['smelter3'] },
  nanoForges:  { name:'Nano-forges', icon:'advCircuit',
    desc:'Assembly at the molecular scale — 4× base speed, and strong enough to press titanium frames. Fabricators and assemblers can\'t work the star-metal.',
    cost:{ pack2:14, pack3:14 }, req:['poweredAssembly'], unlocks:['asm3'] },
  chromeworks: { name:'Chromeworks', icon:'chromite',
    desc:'The Chrome furnace, and the recipes it runs: chromite + coal → chrome, chrome + steel → chromsteel — the metal of the last machines. Teal chromite waits in the mid & far rings.',
    cost:{ pack2:12, pack3:12 }, req:[], unlocks:['alloy2','r:chrome','r:chromsteel'] },
  beacons:     { name:'Beacons', icon:'glass',
    desc:'A transmitter that broadcasts its modules at half strength to every machine in a 10×10 area — one beacon, a whole block boosted.',
    cost:{ pack3:14, pack4:8 }, req:['modules'], unlocks:['beacon'] },
  gravBelts:   { name:'Grav-belts', icon:'advCircuit',
    desc:'Items float above the track on gravity pins — 6.5 tiles/s, the fastest logistics there is.',
    cost:{ pack2:12, pack3:14 }, req:['magRails'], unlocks:['belt4'] },
  drones:      { name:'Cargo drones', icon:'motor',
    desc:'Drone depots: one PROVIDES an item, another REQUESTS it, and drones ferry 10 at a time across any distance — titanium from the world\'s edge without a single belt.',
    cost:{ pack3:18, pack4:12 }, req:['electrification'], unlocks:['port'] },
  chromeTurbines:{ name:'Chrome turbines', icon:'chrome',
    desc:'A turbine whose chromsteel blades spin near the speed of sound — 400 P from a single machine.',
    cost:{ pack3:14, pack4:12 }, req:['chromeworks','fuelTurbines'], unlocks:['turbine2'] },
  quantumDrills:{ name:'Quantum drills', icon:'processor',
    desc:'A drill that folds the deposit through itself. 7× base mining speed.',
    cost:{ pack3:16, pack4:10 }, req:['plasmaBores'], unlocks:['miner4'] },
  helios:      { name:'Helios arrays', icon:'frame',
    desc:'A 3×3 field of sun-tracking mirrors — 130 P without a whisper of smoke.',
    cost:{ pack3:10, pack4:16 }, req:['solarTowers'], unlocks:['solar3'] },
  sunforge:    { name:'The Sunforge', icon:'chromsteel',
    desc:'Mk4 production: the Sunforge smelter and Chrome fabricator — 7× base speed, built from chromsteel.',
    cost:{ pack3:20, pack4:14 }, req:['chromeworks'], unlocks:['smelter4','asm4'] },
};
F.TECH_ORDER = Object.keys(F.TECHS);

/* Research costs compound HARD with depth — in science packs and nothing
   else. Techs with no prerequisites keep the prices written above; every
   layer beyond that triples the whole cost (×3, ×9, ×27 …) and non-root
   layers pay a further ×5. Computed from the req chains so re-wiring the
   tree re-prices itself. */
{
  const depth = {};
  const dep = id => {
    if (depth[id] != null) return depth[id];
    const rq = F.TECHS[id].req || [];
    return depth[id] = rq.length ? 1 + Math.max(...rq.map(dep)) : 0;
  };
  for (const id of F.TECH_ORDER){
    const tk = F.TECHS[id], d = dep(id);
    if (d < 1) continue;
    const mul = Math.pow(3, d) * 5;
    for (const pk in tk.cost) tk.cost[pk] *= mul;
  }
}

/* which tech (if any) unlocks a building / 'r:recipe' key */
F.techOf = function(u){
  for (const id of F.TECH_ORDER){
    const tk = F.TECHS[id];
    if (tk.unlocks && tk.unlocks.includes(u)) return id;
  }
  return null;
};

/* burn-time multiplier from the combustion tech */
F.burnMul = S => (S.research && S.research.done.combustion) ? 1.35 : 1;

/* Electric machines take no fuel — the grid or nothing. Coal belongs to
   burner machines (def.fuel) and generators only. */
F.fuelCap  = S => (S.research && S.research.done.coalHoppers) ? 36 : F.FUEL_CAP;
F.draftSpd  = S => (S.research && S.research.done.forcedDraft) ? 1.3 : 1;
F.draftBurn = S => (S.research && S.research.done.forcedDraft) ? 1.6 : 1;

/* ================= MODULES =================
   Slotted into drills/machines (F.modSlots, earned by research) or beacons
   (def.slots). Beacons rebroadcast speed/efficiency at half strength to
   machines in range; productivity is machine-only. */
F.MODULES = {
  /* speed is a devil's bargain: one module alone drives draw to ×11.2.
     Efficiency pulls it back down — a speed+efficiency pair lands at ×2.3
     (the ×0.2 floor in modEffects catches an efficiency module running solo). */
  speedModule: { spd:.35, pow:10.2 },
  effModule:   { pow:-8.9 },
  prodModule:  { prod:.12 },
  durModule:   { dur:1.20 },  // +120% service life; slotted only, never broadcast
};
F.MOD_SLOTS = 3;   // the most any machine can earn (Module slot III)
F.BEACON_FACTOR = .5;
F.MODDABLE = e => e.kind === 'miner' || e.kind === 'machine';

/* combined module effects for an entity: own slots + beacon field.
   Returns { spd, pow } as multipliers and prod as a bonus fraction. */
F.modEffects = function(S, e){
  let spd = 0, pow = 0, prod = 0;
  if (e.mods) for (const m of e.mods){
    const d = F.MODULES[m];
    if (d){ spd += d.spd || 0; pow += d.pow || 0; prod += d.prod || 0; }
  }
  if (e._bcn) for (const b of e._bcn){
    if (!b.mods || !b.mods.length) continue;
    const r = b.netId ? ((S._netRatio && S._netRatio[b.netId]) || 0) : 0;
    if (r <= 0) continue;
    for (const m of b.mods){
      const d = F.MODULES[m];
      if (d){ spd += (d.spd || 0) * F.BEACON_FACTOR * r; pow += (d.pow || 0) * F.BEACON_FACTOR * r; }
    }
  }
  return { spd: Math.max(.1, 1 + spd), pow: Math.max(.2, 1 + pow), prod };
};

/* ================= UPGRADES ================= */
F.UPGRADES = {
  logistics:  { name:'Logistics',   desc:'All conveyors move +12% faster per rank.', per:.12, max:5,
    costs:[ {gear:20}, {gear:40, plate:20}, {motor:10, circuit:15}, {motor:25, advCircuit:10}, {processor:6, motor:40} ] },
  extraction: { name:'Extraction',  desc:'All drills mine +12% faster per rank.', per:.12, max:5,
    costs:[ {gear:15, plate:10}, {gear:30, wire:30}, {steel:20, circuit:10}, {motor:20, advCircuit:8}, {processor:5, frame:6} ] },
  metallurgy: { name:'Metallurgy',  desc:'All furnaces smelt +12% faster per rank.', per:.12, max:5,
    costs:[ {brick:20, wire:15}, {plate:25, gear:15}, {steel:15, circuit:12}, {plastic:20, advCircuit:8}, {processor:5, titanIngot:15} ] },
  fabrication:{ name:'Fabrication', desc:'All assemblers craft +12% faster per rank.', per:.12, max:5,
    costs:[ {plate:15, wire:20}, {gear:25, circuit:6}, {steel:18, circuit:15}, {motor:15, plastic:15}, {processor:6, advCircuit:20} ] },
  gridOutput: { name:'Grid output', desc:'All generators produce +15% more power per rank.', per:.15, max:5,
    costs:[ {plate:20, wire:20}, {steel:12, circuit:8}, {motor:12, glass:15}, {fuelCell:10, advCircuit:8}, {processor:4, motor:30} ] },
  efficiency: { name:'Efficiency',  desc:'All machines use 8% less power per rank.', per:.08, max:5,
    costs:[ {wire:30, brick:10}, {circuit:10, glass:10}, {steel:15, circuit:15}, {advCircuit:10, plastic:10}, {processor:5, glass:30} ] },
  prospecting:{ name:'Prospecting', desc:'Hand-mining is +35% faster per rank.', per:.35, max:5,
    costs:[ {stone:20, coal:10}, {ironIngot:20, brick:10}, {gear:15, plate:10}, {steel:10, circuit:5}, {motor:8, advCircuit:4} ] },
  capacitors: { name:'Capacitors',  desc:'Machine input buffers +2 and depots +20 capacity per rank.', per:2, max:5,
    costs:[ {copperIngot:20, wire:10}, {plate:15, circuit:5}, {glass:12, circuit:12}, {steel:15, plastic:10}, {advCircuit:12, frame:4} ] },
  durability: { name:'Durability',  desc:'All drills and machines last +16% longer before wearing out per rank. At rank V, all machines become immortal and nothing wears out.', per:.16, max:5,
    costs:[ {plate:25, gear:20}, {steel:20, circuit:10}, {steel:40, motor:12}, {advCircuit:12, plastic:20}, {processor:5, frame:5} ] },
  pumping:    { name:'Deep pumping', desc:'All pumpjacks draw crude +18% faster per rank.', per:.18, max:5,
    costs:[ {gear:15, plate:10}, {steel:15, circuit:8}, {motor:12, plastic:10}, {motor:20, advCircuit:8}, {processor:5, frame:5} ] },
};

/* Upgrade rank costs compound like the tech tree — triple per rank — and
   then the whole science-free ledger is doubled on top:
   I ×2, II ×6, III ×18, IV ×54, V ×162 of the base prices written above. */
for (const id in F.UPGRADES){
  F.UPGRADES[id].costs.forEach((cost, i) => {
    const mul = 2 * Math.pow(3, i);
    for (const k in cost) cost[k] *= mul;
  });
}

/* upgrade-derived multipliers */
F.upRank = (S, id) => S.upgrades[id] || 0;
F.beltMul   = S => 1 + F.upRank(S,'logistics')  * F.UPGRADES.logistics.per;
F.mineMul   = S => 1 + F.upRank(S,'extraction') * F.UPGRADES.extraction.per;
F.smeltMul  = S => 1 + F.upRank(S,'metallurgy') * F.UPGRADES.metallurgy.per;
F.asmMul    = S => 1 + F.upRank(S,'fabrication')* F.UPGRADES.fabrication.per;
F.powerMul  = S => 1 + F.upRank(S,'gridOutput') * F.UPGRADES.gridOutput.per;
F.powerUseMul = S => Math.max(.2, 1 - F.upRank(S,'efficiency') * F.UPGRADES.efficiency.per);
F.handMul   = S => 1 + F.upRank(S,'prospecting')* F.UPGRADES.prospecting.per;
F.pumpMul   = S => 1 + F.upRank(S,'pumping')    * F.UPGRADES.pumping.per;
F.bufBonus  = S => F.upRank(S,'capacitors') * 2;
F.lifeMul   = S => 1 + F.upRank(S,'durability') * F.UPGRADES.durability.per;

/* effective service stretch of an entity: base × research × hardened modules.
   The number itself stays hidden from the player — only the multipliers
   are ever shown. */
F.lifeOf = function(S, e){
  const def = F.BUILDINGS[e.key];
  if (!def || !def.life) return Infinity;
  let mul = F.lifeMul(S);
  if (e.mods) for (const m of e.mods) if (F.MODULES[m] && F.MODULES[m].dur) mul += F.MODULES[m].dur;
  return def.life * mul;
};
/* Odds a machine dies at the end of each service stretch: 1 in 4 — and every
   hardened module widens that denominator by two (1/6 with one module,
   1/8 with two), on top of the stretch it already lengthens. At durability
   rank V, all machines become immortal and nothing wears out. */
F.BREAK_DENOM = 4;
F.BREAK_CHANCE = 1 / F.BREAK_DENOM;
F.breakChance = function(S, e){
  if ((S.upgrades.durability || 0) >= 5) return 0;
  let den = F.BREAK_DENOM;
  if (e.mods) for (const m of e.mods) if (F.MODULES[m] && F.MODULES[m].dur) den += 2;
  return 1 / den;
};

/* upgrade-rank prerequisites for a tech (e.g. Invincibility needs Durability V) */
F.rankMet = function(S, tk){
  if (!tk || !tk.reqRank) return true;
  for (const k in tk.reqRank) if ((S.upgrades[k] || 0) < tk.reqRank[k]) return false;
  return true;
};

/* how many module slots an entity has: beacons keep their built-in count,
   drills/machines earn theirs by researching Module slot I / II / III */
F.modSlots = function(S, e){
  const def = F.BUILDINGS[e.key];
  if (def && def.kind === 'beacon') return def.slots || 2;
  const d = S.research.done;
  return d.moduleSlot3 ? 3 : d.moduleSlot2 ? 2 : d.moduleSlot1 ? 1 : 0;
};

/* ================= ONE-SHOT TIPS ================= */
F.TIPS = {
  firstSelect:  'R rotates before you place. Right-click removes a building (full refund).',
  firstBelt:    'Belts carry items in the direction of the chevrons. Point a belt INTO a machine or the Core to feed it.',
  firstFuelLow: 'A machine is out of coal — click it and move coal from your pocket into its fuel slot, or belt coal into its side.',
  firstBrownout:'Power demand exceeds supply — everything electric is running slow. Build more generators.',
  firstUnpowered:'An electric machine has no power pole in range. String poles out from a generator until one covers it.',
  firstBlocked: 'A machine\'s output is jammed — give it an empty belt to push onto.',
  firstUpgrade: 'The Tech tree (T) is one map of everything: amber <b>upgrade ranks</b> bought with parts, violet <b>technologies</b> researched by labs. It all grows from the Engine.',
  firstSplitter:'Splitters deal items evenly to every open exit — perfect for feeding rows of machines.',
  firstLab:     'Belt science packs into any side of the laboratory, then pick a project in the <b>Tech tree</b> (T) — nearly every machine, belt and generator in the game grows from that tree.',
  firstModule:  'Modules boost the machine they\'re slotted in. Speed costs a FORTUNE in power — pair it with efficiency to tame the bill — and a <b>beacon</b> broadcasts its modules to every machine around it.',
  firstTar:     'Cracking crude leaves <b>tar</b> — it shares the refinery\'s output chute, and a chute full of tar jams the plastic. Filter it aside with a splitter and <b>smelt it back into coal</b>, or research Tar synthesis to re-polymerise it.',
  firstPipe:    'Pipes only connect to pumpjacks, refineries and other pipes.',
  coreFull:     'Deliveries fund construction: everything you belt into the Core becomes buildable material.',
};

/* ================= TRIBUTE (post-win endless goal) =================
   Once the Engine wakes it asks for escalating baskets of goods. Each
   completed tribute grants +3% global machine/drill speed (cap +30%);
   beyond the cap it's for glory. Pool holds only milestone-spine items
   so a tribute can never demand tech-gated goods. */
F.TRIBUTE_POOL = [
  ['circuit', 30],  ['steel', 30],     ['motor', 24],   ['plastic', 26],
  ['advCircuit', 20], ['frame', 14],   ['processor', 12], ['titanIngot', 24],
  ['fuelCell', 18], ['logicMatrix', 6], ['powerCore', 6], ['hullPlate', 6],
];
F.makeTribute = function(lvl){
  const rng = F.makeRng((0x51ab3e7 + lvl * 2654435761) >>> 0);
  const idx = [];
  while (idx.length < 3){
    const i = rng.int(0, F.TRIBUTE_POOL.length - 1);
    if (!idx.includes(i)) idx.push(i);
  }
  const scale = 1 + lvl * .2;
  const req = {};
  for (const i of idx){
    const [item, base] = F.TRIBUTE_POOL[i];
    req[item] = Math.round(base * scale);
  }
  return req;
};
/* what the Engine whispers when each tier completes (index = finished milestone) */
F.ENGINE_LINES = [
  '…warm. after so long, warm…',
  '…the first flame. i felt it…',
  '…iron. i remember iron…',
  '…ore becomes intent. good…',
  '…shapes. you make shapes of the world…',
  '…small teeth, turning. i know this song…',
  '…current in old veins. yes…',
  '…you ask questions. the best machines do…',
  '…glass and light. keep going…',
  '…two made one. stronger. always stronger…',
  '…thought, etched small. clever hands…',
  '…you listen for the deep places. good…',
  '…the black blood still flows…',
  '…even the waste has a use. waste nothing…',
  '…you tame what burns. careful hands…',
  '…you build faster than the ash falls…',
  '…star-metal bones. almost. almost…',
  '…I WAKE.',
];

F.TRIBUTE_LINES = [
  'The Engine hums. It asks for more.',
  'A pulse from below: the Engine dreams of gears.',
  'The Engine turns its vast attention to your belts.',
  'Deep chords roll under the ash. It is listening.',
  'The Engine remembers hunger.',
];
F.tributeMul = S => 1 + Math.min(S.tribute ? S.tribute.lvl : 0, 10) * .03;

/* ================= DAY / NIGHT =================
   One full cycle every DAY_LEN sim-seconds. Solar output scales with
   sunFactor: full day 45%, dusk 10%, night 35%, dawn 10%. */
F.DAY_LEN = 660;   // 11-minute days
F.sunFactor = function(S){
  const t = ((S.dayT || 0) % F.DAY_LEN) / F.DAY_LEN;
  if (t < .45) return 1;
  if (t < .55) return 1 - (t - .45) / .1;
  if (t < .9) return 0;
  return (t - .9) / .1;
};

/* accumulator behaviour (per unit) — they fill at a trickle (12× slower
   than they once did) and give back at half their old rate */
F.ACC_CAP = 900;         // stored energy, P·s
F.ACC_CHARGE = 3.75;     // max charge, P
F.ACC_DISCHARGE = 22.5;  // max discharge, P

/* cargo drones */
F.DRONE_CAP = 10;      // items per trip
F.DRONES_PER_PORT = 2; // owned by each requester depot
F.DRONE_SPEED = 7;     // tiles per second

/* fuel: seconds of burn per coal */
F.COAL_BURN = 10;
F.FUEL_CAP = 12;         // max coal stored in a burner machine
F.HAND_MINE_TIME = 1.1;  // base seconds per hand-mined ore
F.CHEST_CAP = 60;

})(typeof window !== 'undefined' ? window : globalThis);
