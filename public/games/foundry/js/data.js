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
  6: { id:'titanOre',  name:'Titanium', c1:'#b9a7e8', c2:'#7a68b0' },
  7: { id:'crude',     name:'Oil seep', c1:'#2a2f2a', c2:'#141712' },
};
F.OIL_TYPE = 7;
F.oreTypeByItem = { ironOre:1, copperOre:2, coal:3, stone:4, quartz:5, titanOre:6 };

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
  /* smelted */
  ironIngot:  { name:'Iron ingot',     tier:1, icon:{kind:'ingot', c1:'#c9d4e2', c2:'#7c8ba0'} },
  copperIngot:{ name:'Copper ingot',   tier:1, icon:{kind:'ingot', c1:'#f0a26a', c2:'#a86038'} },
  brick:      { name:'Stone brick',    tier:1, icon:{kind:'brick', c1:'#b5a894', c2:'#78705f'} },
  glass:      { name:'Glass',          tier:1, icon:{kind:'glass', c1:'#d8f2ff', c2:'#7fb8d8'} },
  titanIngot: { name:'Titanium ingot', tier:3, icon:{kind:'ingot', c1:'#cdbdf5', c2:'#8672c4'} },
  steel:      { name:'Steel bar',      tier:2, icon:{kind:'ingot', c1:'#8f9dad', c2:'#4d5866'} },
  silicon:    { name:'Silicon',        tier:2, icon:{kind:'chip0', c1:'#3f4c5c', c2:'#93aac2'} },
  /* parts */
  gear:       { name:'Gear',           tier:1, icon:{kind:'gear',  c1:'#c8cfda', c2:'#8892a2'} },
  wire:       { name:'Copper wire',    tier:1, icon:{kind:'coil',  c1:'#f2a86c', c2:'#b06a3a'} },
  plate:      { name:'Iron plate',     tier:1, icon:{kind:'plate', c1:'#bfcbdb', c2:'#75849b'} },
  circuit:    { name:'Circuit',        tier:2, icon:{kind:'chip',  c1:'#3f7f5f', c2:'#8fe0b0'} },
  motor:      { name:'Motor',          tier:2, icon:{kind:'motor', c1:'#96a3b5', c2:'#5b6674'} },
  plastic:    { name:'Plastic',        tier:2, icon:{kind:'plate', c1:'#f5f0e6', c2:'#b5ae9d'} },
  fuelCell:   { name:'Fuel cell',      tier:2, icon:{kind:'cell',  c1:'#ffcf6e', c2:'#c78430'} },
  advCircuit: { name:'Adv. circuit',   tier:3, icon:{kind:'chip',  c1:'#7f3f4f', c2:'#f09ab4'} },
  frame:      { name:'Titan frame',    tier:3, icon:{kind:'frame', c1:'#cdbdf5', c2:'#7a68b0'} },
  processor:  { name:'Processor',      tier:3, icon:{kind:'chip2', c1:'#2f4560', c2:'#6ec6ff'} },
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
  titanIngot: { out:'titanIngot', outN:1, in:{titanOre:1},  time:3.6, machine:'smelter', unlock:7 },
  /* alloy furnace (auto) */
  steel:      { out:'steel',      outN:1, in:{ironIngot:2, coal:1},  time:3.2, machine:'alloy', unlock:4 },
  silicon:    { out:'silicon',    outN:1, in:{quartz:1, coal:1},     time:2.6, machine:'alloy', unlock:4 },
  /* assembler */
  gear:       { out:'gear',   outN:1, in:{ironIngot:2},              time:1.6, machine:'asm', unlock:2 },
  wire:       { out:'wire',   outN:2, in:{copperIngot:1},            time:1.4, machine:'asm', unlock:2 },
  plate:      { out:'plate',  outN:2, in:{ironIngot:3},              time:2.2, machine:'asm', unlock:2 },
  circuit:    { out:'circuit',outN:1, in:{wire:2, silicon:1},        time:2.4, machine:'asm', unlock:4 },
  motor:      { out:'motor',  outN:1, in:{gear:2, steel:1, wire:2},  time:3.2, machine:'asm', unlock:5 },
  advCircuit: { out:'advCircuit', outN:1, in:{circuit:1, plastic:1, wire:2}, time:3.4, machine:'asm', unlock:6 },
  frame:      { out:'frame',  outN:1, in:{steel:2, titanIngot:1},    time:3.6, machine:'asm', unlock:7 },
  processor:  { out:'processor', outN:1, in:{advCircuit:2, silicon:1, glass:1}, time:4.2, machine:'asm', unlock:8 },
  logicMatrix:{ out:'logicMatrix', outN:1, in:{processor:2, circuit:2, glass:1}, time:6.0, machine:'asm', unlock:8 },
  powerCore:  { out:'powerCore',   outN:1, in:{fuelCell:2, frame:1, motor:1},    time:6.0, machine:'asm', unlock:8 },
  hullPlate:  { out:'hullPlate',   outN:1, in:{titanIngot:2, steel:2, glass:1},  time:6.0, machine:'asm', unlock:8 },
  /* refinery (fluid) */
  plastic:    { out:'plastic',  outN:2, in:{coal:1}, fluid:8,  time:3.2, machine:'refinery', unlock:6 },
  fuelCell:   { out:'fuelCell', outN:1, in:{steel:1}, fluid:10, time:3.0, machine:'refinery', unlock:6 },
};

/* what a smelter/alloy can make, for auto-select */
F.AUTO_RECIPES = { smelter:[], alloy:[] };
for (const k in F.RECIPES){
  const r = F.RECIPES[k];
  if (r.machine === 'smelter') F.AUTO_RECIPES.smelter.push(k);
  if (r.machine === 'alloy')   F.AUTO_RECIPES.alloy.push(k);
}

/* ================= BUILDINGS ================= */
const B = F.BUILDINGS = {
  /* --- logistics --- */
  belt1:   { name:'Conveyor',        cat:'log', kind:'belt', w:1, h:1, speed:1.25, cost:{ironOre:1},          unlock:0,
             desc:'Moves items. Drag to lay a line; R rotates.' },
  belt2:   { name:'Fast conveyor',   cat:'log', kind:'belt', w:1, h:1, speed:2.5,  cost:{plate:1, gear:1},    unlock:4,
             desc:'Twice the throughput of a basic conveyor.' },
  belt3:   { name:'Mag-rail',        cat:'log', kind:'belt', w:1, h:1, speed:4.2,  cost:{steel:1, gear:1},    unlock:7,
             desc:'Frictionless magnetic rail. Very fast.' },
  ubelt1:  { name:'Tunnel',          cat:'log', kind:'ubelt', w:1, h:1, span:5, speed:1.25, cost:{ironIngot:4, gear:1}, unlock:3,
             desc:'Sends items under 4 tiles. Place entrance, then exit. Lets lines cross.' },
  ubelt2:  { name:'Deep tunnel',     cat:'log', kind:'ubelt', w:1, h:1, span:9, speed:4.2, cost:{steel:4, plastic:2}, unlock:7,
             desc:'A longer, faster tunnel.' },
  splitter:{ name:'Splitter',        cat:'log', kind:'splitter', w:1, h:1, speed:2.5, cost:{ironIngot:6},     unlock:2,
             desc:'Takes items in from behind and deals them evenly to every open exit.' },
  chest:   { name:'Depot',           cat:'log', kind:'chest', w:1, h:1, cap:60, cost:{plate:4},               unlock:3,
             desc:'Buffers up to 60 items, releases them out the front. Smooths surges.' },
  pipe:    { name:'Pipe',            cat:'log', kind:'pipe', w:1, h:1, cap:40, cost:{plate:1},                unlock:6,
             desc:'Carries crude oil between pumpjacks and refineries.' },
  /* --- extraction --- */
  miner1:  { name:'Burner drill',    cat:'ext', kind:'miner', w:1, h:1, speed:1, mineTime:2.4, fuel:true, cost:{ironOre:6, stone:4}, unlock:0,
             desc:'Chews ore out of a deposit. Burns coal — feed it by belt or by hand.' },
  miner2:  { name:'Electric drill',  cat:'ext', kind:'miner', w:1, h:1, speed:2.2, mineTime:2.4, power:5, cost:{plate:6, gear:4, wire:4}, unlock:3,
             desc:'No fuel needed — draws from the power grid.' },
  miner3:  { name:'Plasma bore',     cat:'ext', kind:'miner', w:1, h:1, speed:4.4, mineTime:2.4, power:12, cost:{steel:8, motor:3, advCircuit:2}, unlock:7,
             desc:'Cuts ore with a plasma lance. Extremely fast.' },
  pump:    { name:'Pumpjack',        cat:'ext', kind:'pump', w:2, h:2, rate:3, power:6, cost:{steel:8, gear:6, motor:2}, unlock:6,
             desc:'Draws crude oil from a seep. Connect pipes to carry it away.' },
  /* --- production --- */
  smelter1:{ name:'Stone kiln',      cat:'pro', kind:'machine', fam:'smelter', w:2, h:2, speed:1,   fuel:true, cost:{stone:12}, unlock:1,
             desc:'Smelts ore into ingots. Burns coal.' },
  smelter2:{ name:'Arc furnace',     cat:'pro', kind:'machine', fam:'smelter', w:2, h:2, speed:2.2, power:8,  cost:{brick:8, plate:8, wire:6}, unlock:3,
             desc:'Electric smelting, over twice as fast.' },
  smelter3:{ name:'Plasma forge',    cat:'pro', kind:'machine', fam:'smelter', w:2, h:2, speed:4,   power:20, cost:{steel:12, advCircuit:3, plastic:6}, unlock:7,
             desc:'Star-hot. Smelts anything almost instantly.' },
  alloy:   { name:'Alloy furnace',   cat:'pro', kind:'machine', fam:'alloy', w:2, h:2, speed:1.6, power:10, cost:{brick:12, plate:10, wire:8}, unlock:4,
             desc:'Fuses two inputs: iron + coal → steel, quartz + coal → silicon.' },
  asm1:    { name:'Fabricator',      cat:'pro', kind:'machine', fam:'asm', w:2, h:2, speed:1,   fuel:true, cost:{brick:8, ironIngot:8}, unlock:2,
             desc:'Crafts parts from a chosen recipe. Burns coal.' },
  asm2:    { name:'Assembler',       cat:'pro', kind:'machine', fam:'asm', w:2, h:2, speed:2.2, power:10, cost:{steel:6, gear:8, circuit:4}, unlock:5,
             desc:'Powered assembly line, over twice as fast.' },
  asm3:    { name:'Nano-forge',      cat:'pro', kind:'machine', fam:'asm', w:2, h:2, speed:4,   power:24, cost:{steel:10, motor:4, advCircuit:4}, unlock:7,
             desc:'Assembles at the molecular scale.' },
  refinery:{ name:'Refinery',        cat:'pro', kind:'machine', fam:'refinery', w:3, h:3, speed:1.6, power:16, tank:60, cost:{steel:14, brick:10, circuit:6}, unlock:6,
             desc:'Cracks crude oil into plastic and fuel cells. Needs pipe input.' },
  /* --- power --- */
  pole1:   { name:'Power pole',      cat:'pow', kind:'pole', w:1, h:1, reach:7, cover:2, cost:{ironIngot:2, wire:2}, unlock:3,
             desc:'Carries power. Links to poles within 7 tiles and powers machines in the 5×5 area around it. Generators must be in a pole\'s area too.' },
  pole2:   { name:'Pylon',           cat:'pow', kind:'pole', w:1, h:1, reach:14, cover:3, cost:{steel:4, wire:6}, unlock:7,
             desc:'A steel giant. Links across 14 tiles and powers a 7×7 area.' },
  gen1:    { name:'Burner generator',cat:'pow', kind:'gen', w:2, h:2, out:30, burn:6, cost:{brick:10, plate:6}, unlock:3,
             desc:'Burns coal to feed the grid. 30 P at full load. Needs a power pole in range to deliver it.' },
  solar:   { name:'Solar array',     cat:'pow', kind:'solar', w:2, h:2, out:12, cost:{glass:6, circuit:2, plate:4}, unlock:6,
             desc:'Silent, fuel-free power. 12 P, always on.' },
  turbine: { name:'Fuel turbine',    cat:'pow', kind:'turbine', w:2, h:2, out:150, burn:20, cost:{steel:10, motor:4, plate:8}, unlock:6,
             desc:'Burns fuel cells for serious power. 150 P at full load.' },
};
F.BUILD_ORDER = Object.keys(B);
F.CATS = [
  { id:'ext', name:'Extraction' },
  { id:'log', name:'Logistics' },
  { id:'pro', name:'Production' },
  { id:'pow', name:'Power' },
];

/* ================= MILESTONES ================= */
F.MILESTONES = [
  { id:'m0', name:'Strike the Earth',
    flavor:'The Core is dark. Everything begins with your own two hands: tear iron and stone from the ground.',
    handMine:{ ironOre:10, stone:6 },
    unlocks:['miner1','belt1'],
    grant:{ ironOre:20, stone:16, coal:10 },
    hint:'Hold left-click on an ore deposit to hand-mine it.' },
  { id:'m1', name:'The First Vein',
    flavor:'Machines dig so you don\'t have to. Feed the Core by conveyor — only belted deliveries count.',
    req:{ ironOre:25 },
    unlocks:['smelter1','r:ironIngot','r:copperIngot','r:brick'],
    grant:{ stone:20, coal:15 },
    hint:'Place a burner drill on iron ore, then run a conveyor from the drill into the Core. Drills burn coal — click one to fuel it.' },
  { id:'m2', name:'The Ingot Age',
    flavor:'Raw ore is a promise, not a material. Smelt it.',
    req:{ ironIngot:25, copperIngot:15 },
    unlocks:['asm1','splitter','r:gear','r:wire','r:plate'],
    grant:{ ironIngot:10, brick:8 },
    hint:'Belt ore into a kiln\'s side — ingots come out the marked front. Kilns burn coal too.' },
  { id:'m3', name:'Cogs & Current',
    flavor:'Gears to turn, wire to carry the spark. The grid wakes.',
    req:{ gear:30, wire:40 },
    unlocks:['gen1','pole1','miner2','smelter2','chest','ubelt1','r:glass'],
    grant:{ plate:10, coal:20 },
    hint:'Fabricators craft a chosen recipe — click one to set it. A single fabricator eats the output of several kilns.' },
  { id:'m4', name:'Vitreous Earth',
    flavor:'Quartz sleeps in the middle distance. Melt it to glass, fuse it to silicon — the factory must reach outward.',
    req:{ glass:25, plate:40 },
    unlocks:['alloy','belt2','r:steel','r:silicon','r:circuit'],
    grant:{ steel:6 },
    hint:'Quartz deposits lie beyond your starting field. Electric machines need power: place a generator, then string power poles from it — each pole energises the machines around it.' },
  { id:'m5', name:'The First Circuit',
    flavor:'Wire and silicon, etched into thought.',
    req:{ circuit:35, steel:25 },
    unlocks:['asm2','r:motor'],
    grant:{ circuit:5, steel:5 },
    hint:'The alloy furnace fuses two belts of input. Steel: iron ingots + coal. Silicon: quartz + coal.' },
  { id:'m6', name:'Black Blood',
    flavor:'Deep in the waste, the ground weeps oil. Drink it.',
    req:{ motor:25, circuit:30 },
    unlocks:['pump','pipe','refinery','turbine','solar','r:plastic','r:fuelCell','r:advCircuit'],
    grant:{ steel:10 },
    hint:'Pumpjacks sit on oil seeps; pipes carry crude to refineries. Fuel turbines dwarf burner generators.' },
  { id:'m7', name:'Polymer Mind',
    flavor:'Plastic and copper laid in impossible lattices. The machines improve the machines.',
    req:{ advCircuit:40, plastic:30 },
    unlocks:['miner3','smelter3','asm3','belt3','ubelt2','pole2','r:titanIngot','r:frame'],
    grant:{ advCircuit:5 },
    hint:'Titanium waits at the far edges of the world — a violet ore for the last age of machines.' },
  { id:'m8', name:'Star Metal',
    flavor:'Titanium bones for a sleeping god.',
    req:{ titanIngot:40, frame:15 },
    unlocks:['r:processor','r:logicMatrix','r:powerCore','r:hullPlate'],
    grant:{},
    hint:'Everything you have built converges here: processors, cores, hull. Three final components.' },
  { id:'m9', name:'Ignition',
    flavor:'Mind, heart, body. Deliver the three works and the World Engine breathes again.',
    req:{ logicMatrix:8, powerCore:8, hullPlate:8 },
    unlocks:[],
    grant:{},
    hint:'The dawn you build is the only dawn there is.' },
];

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
};

/* upgrade-derived multipliers */
F.upRank = (S, id) => S.upgrades[id] || 0;
F.beltMul   = S => 1 + F.upRank(S,'logistics')  * F.UPGRADES.logistics.per;
F.mineMul   = S => 1 + F.upRank(S,'extraction') * F.UPGRADES.extraction.per;
F.smeltMul  = S => 1 + F.upRank(S,'metallurgy') * F.UPGRADES.metallurgy.per;
F.asmMul    = S => 1 + F.upRank(S,'fabrication')* F.UPGRADES.fabrication.per;
F.powerMul  = S => 1 + F.upRank(S,'gridOutput') * F.UPGRADES.gridOutput.per;
F.powerUseMul = S => Math.max(.2, 1 - F.upRank(S,'efficiency') * F.UPGRADES.efficiency.per);
F.handMul   = S => 1 + F.upRank(S,'prospecting')* F.UPGRADES.prospecting.per;
F.bufBonus  = S => F.upRank(S,'capacitors') * 2;

/* ================= ONE-SHOT TIPS ================= */
F.TIPS = {
  firstSelect:  'R rotates before you place. Right-click removes a building (full refund).',
  firstBelt:    'Belts carry items in the direction of the chevrons. Point a belt INTO a machine or the Core to feed it.',
  firstFuelLow: 'A machine is out of coal — click it and move coal from your pocket into its fuel slot, or belt coal into its side.',
  firstBrownout:'Power demand exceeds supply — everything electric is running slow. Build more generators.',
  firstUnpowered:'An electric machine has no power pole in range. String poles from a generator to it — each pole powers the area around it.',
  firstBlocked: 'A machine\'s output is jammed — give it an empty belt to push onto.',
  firstUpgrade: 'The Foundry panel (U) sells permanent upgrades for parts. Faster belts, drills, furnaces…',
  firstSplitter:'Splitters deal items evenly to every open exit — perfect for feeding rows of machines.',
  firstPipe:    'Pipes only connect to pumpjacks, refineries and other pipes.',
  coreFull:     'Deliveries fund construction: everything you belt into the Core becomes buildable material.',
};

/* fuel: seconds of burn per coal */
F.COAL_BURN = 10;
F.FUEL_CAP = 12;         // max coal stored in a burner machine
F.HAND_MINE_TIME = 1.1;  // base seconds per hand-mined ore
F.CHEST_CAP = 60;

})(typeof window !== 'undefined' ? window : globalThis);
