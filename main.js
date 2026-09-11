// UTGÅNG — a VR IKEA horror game. Self-contained Three.js WebXR build. No network deps.
import * as THREE from 'three';

// ---------------------------------------------------------------- params / rng
const Q = new URLSearchParams(location.search);
const SHOT = Q.get('shot') || null;            // headless screenshot presets
const FORCE_NIGHT_IDX = parseInt(Q.get('night') || '0', 10);

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rng = mulberry32(30080915); // fixed store layout: learning the aisles is the game
const rand=(a,b)=>a+rng()*(b-a);
const pick=(arr)=>arr[Math.floor(rng()*arr.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

// ---------------------------------------------------------------- renderer
const app=document.getElementById('app');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;
renderer.xr.enabled=true;
renderer.xr.setReferenceSpaceType('local-floor');
app.appendChild(renderer.domElement);

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,0.05,220);
const rig=new THREE.Group();           // player dolly; camera rides inside
rig.add(camera);
scene.add(rig);
camera.position.set(0,1.6,0);

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

// ---------------------------------------------------------------- audio (all synth)
const AudioSys={
  ctx:null,master:null,padGain:null,droneGain:null,whisperGain:null,whisperFilter:null,
  started:false,heartT:0,clangT:6,
  init(){
    if(this.started)return;
    const C=window.AudioContext||window.webkitAudioContext; if(!C)return;
    this.ctx=new C(); this.started=true;
    this.master=this.ctx.createGain(); this.master.gain.value=0.55; this.master.connect(this.ctx.destination);
    // day pad: two detuned triangles through a soft lowpass
    this.padGain=this.ctx.createGain(); this.padGain.gain.value=0.0;
    const lp=this.ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=640;
    this.padGain.connect(lp); lp.connect(this.master);
    const o1=this.ctx.createOscillator(),o2=this.ctx.createOscillator(),o3=this.ctx.createOscillator();
    o1.type='triangle';o2.type='triangle';o3.type='sine';
    o1.frequency.value=220.0;o2.frequency.value=277.18;o3.frequency.value=329.63;
    o2.detune.value=6;o1.detune.value=-4;
    o1.connect(this.padGain);o2.connect(this.padGain);o3.connect(this.padGain);
    o1.start();o2.start();o3.start();
    // night drone
    this.droneGain=this.ctx.createGain(); this.droneGain.gain.value=0.0; this.droneGain.connect(this.master);
    const d1=this.ctx.createOscillator(),d2=this.ctx.createOscillator();
    d1.type='sine';d1.frequency.value=48;d2.type='sawtooth';d2.frequency.value=49.7;
    const dlp=this.ctx.createBiquadFilter();dlp.type='lowpass';dlp.frequency.value=120;
    d1.connect(dlp);d2.connect(dlp);dlp.connect(this.droneGain);d1.start();d2.start();
    // whisper noise (staff proximity)
    const nb=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate);
    const ch=nb.getChannelData(0); for(let i=0;i<ch.length;i++)ch[i]=Math.random()*2-1;
    const nsrc=this.ctx.createBufferSource(); nsrc.buffer=nb; nsrc.loop=true;
    this.whisperFilter=this.ctx.createBiquadFilter(); this.whisperFilter.type='bandpass';
    this.whisperFilter.frequency.value=1100; this.whisperFilter.Q.value=2.2;
    this.whisperGain=this.ctx.createGain(); this.whisperGain.gain.value=0;
    nsrc.connect(this.whisperFilter); this.whisperFilter.connect(this.whisperGain); this.whisperGain.connect(this.master);
    nsrc.start();
  },
  setDayNight(nightF){ // nightF 0..1
    if(!this.started)return;
    const t=this.ctx.currentTime;
    this.padGain.gain.linearRampToValueAtTime(0.05*(1-nightF),t+1.5);
    this.droneGain.gain.linearRampToValueAtTime(0.16*nightF,t+1.5);
  },
  setWhisper(v){ // 0..1 staff proximity
    if(!this.started)return;
    this.whisperGain.gain.linearRampToValueAtTime(0.22*v,this.ctx.currentTime+0.25);
    this.whisperFilter.frequency.value=900+900*v;
  },
  blip(freq,dur,type,vol,slideTo){ // generic sfx
    if(!this.started)return;
    const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type||'sine';o.frequency.setValueAtTime(freq,t);
    if(slideTo)o.frequency.exponentialRampToValueAtTime(slideTo,t+dur);
    g.gain.setValueAtTime(vol||0.2,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+0.02);
  },
  eat(){this.blip(300,0.12,'square',0.14,140);setTimeout(()=>this.blip(240,0.1,'square',0.12,120),90);},
  batterySfx(){this.blip(880,0.07,'square',0.12);setTimeout(()=>this.blip(1320,0.09,'square',0.12),80);},
  heal(){this.blip(520,0.18,'sine',0.16,780);},
  chime(up){ if(!this.started)return; const f=up?[523,659,784]:[392,330,262];
    f.forEach((fr,i)=>setTimeout(()=>this.blip(fr,0.5,'sine',0.14),i*160)); },
  shriek(){ if(!this.started)return; const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type='sawtooth';o.frequency.setValueAtTime(1400,t);o.frequency.exponentialRampToValueAtTime(500,t+0.5);
    g.gain.setValueAtTime(0.001,t);g.gain.exponentialRampToValueAtTime(0.22,t+0.05);g.gain.exponentialRampToValueAtTime(0.0001,t+0.55);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+0.6); },
  hit(){this.blip(90,0.25,'square',0.3,45);},
  clang(){ // distant metal, night ambience
    if(!this.started)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type='square';o.frequency.value=rand(180,420);
    g.gain.setValueAtTime(0.0,t);g.gain.linearRampToValueAtTime(rand(0.02,0.06),t+0.005);
    g.gain.exponentialRampToValueAtTime(0.0001,t+rand(0.8,1.6));
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+1.7); },
  heart(){this.blip(55,0.14,'sine',0.34,40);setTimeout(()=>this.blip(50,0.12,'sine',0.26,38),170);},
  door(){this.blip(160,1.2,'sine',0.2,320);setTimeout(()=>this.chime(true),600);}
};

// ---------------------------------------------------------------- canvas texture helpers
function cTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}

const SWEDISH_BLUE='#0058a3',SWEDISH_YELLOW='#ffdb00';

function floorTexture(){return cTex(512,512,(g)=>{
  g.fillStyle='#b9b3a6';g.fillRect(0,0,512,512);
  for(let i=0;i<2200;i++){g.fillStyle=`rgba(${rand(60,110)|0},${rand(58,100)|0},${rand(50,90)|0},0.05)`;
    g.fillRect(rng()*512,rng()*512,rng()*3+1,rng()*3+1);}
  g.strokeStyle='rgba(70,66,58,0.35)';g.lineWidth=2;
  for(let i=0;i<=4;i++){g.beginPath();g.moveTo(i*128,0);g.lineTo(i*128,512);g.stroke();
    g.beginPath();g.moveTo(0,i*128);g.lineTo(512,i*128);g.stroke();}
});}

function wallTexture(){return cTex(1024,256,(g)=>{
  g.fillStyle=SWEDISH_BLUE;g.fillRect(0,0,1024,256);
  g.fillStyle=SWEDISH_YELLOW;g.fillRect(0,0,1024,26);g.fillRect(0,230,1024,26);
  g.fillStyle='rgba(255,255,255,0.92)';g.font='900 92px Arial';g.textBaseline='middle';
  for(let x=40;x<1024;x+=340){g.fillText('IKEA',x,128);}
  g.fillStyle='rgba(255,255,255,0.25)';g.font='700 30px Arial';
  for(let x=190;x<1024;x+=340){g.fillText('ÖPPET 10–22',x,180);}
});}

function hangSignTexture(text,arrow){return cTex(512,192,(g)=>{
  g.fillStyle='#f6f4ee';g.fillRect(0,0,512,192);
  g.strokeStyle='#1a1a1a';g.lineWidth=10;g.strokeRect(5,5,502,182);
  g.fillStyle='#111';g.font='900 74px Arial';g.textAlign='center';g.textBaseline='middle';
  g.fillText(text,arrow?200:256,98);
  if(arrow){g.font='900 90px Arial';g.fillText(arrow,440,100);}
});}

function priceTagTexture(name,price,weird){return cTex(256,384,(g)=>{
  g.fillStyle='#fdfdf8';g.fillRect(0,0,256,384);
  g.fillStyle='#111';g.font='900 44px Arial';g.textAlign='left';
  g.fillText(name,18,64);
  g.font='400 22px Arial';g.fillStyle='#444';
  g.fillText(weird||'flat-pack. some assembly',18,104);
  g.fillText(weird?'required. do not open.':'required. instructions',18,132);
  g.fillStyle=SWEDISH_YELLOW;g.fillRect(0,220,256,110);
  g.fillStyle='#111';g.font='900 84px Arial';g.fillText(price,18,308);
  g.fillStyle=SWEDISH_BLUE;g.fillRect(0,350,256,34);
});}

function boxLabelTexture(i){return cTex(256,128,(g)=>{
  g.fillStyle=['#b08954','#a67f4e','#bb9461'][i%3];g.fillRect(0,0,256,128);
  g.strokeStyle='rgba(60,40,20,0.5)';g.lineWidth=3;g.strokeRect(4,4,248,120);
  g.fillStyle='rgba(40,26,12,0.85)';g.font='900 30px Arial';
  g.fillText(['LÖVKULLA','BRÖTTA','SMÖRRE'][i%3],16,44);
  g.font='400 18px Arial';g.fillText(['wardrobe, 2-door','sofa, 3-seat','bed frame, 140'][i%3],16,74);
  g.fillText('MADE IN SWEDEN',16,108);
  g.fillStyle='rgba(40,26,12,0.4)';
  for(let x=150;x<246;x+=6)g.fillRect(x,84,3,32); // barcode
});}

function posterTexture(kind){return cTex(256,340,(g)=>{
  if(kind==='meat'){g.fillStyle='#f4efe4';g.fillRect(0,0,256,340);
    g.fillStyle='#a31212';g.font='900 56px Arial';g.textAlign='center';g.fillText('KÖTT-',128,90);g.fillText('BULLAR',128,150);
    g.fillStyle='#111';g.font='700 40px Arial';g.fillText('49:-',128,230);
    g.font='400 20px Arial';g.fillText('med potatismos',128,270);}
  else if(kind==='smaland'){g.fillStyle=SWEDISH_YELLOW;g.fillRect(0,0,256,340);
    g.fillStyle=SWEDISH_BLUE;g.font='900 52px Arial';g.textAlign='center';g.fillText('SMÅLAND',128,110);
    g.fillStyle='#111';g.font='400 22px Arial';g.fillText('leave your children',128,180);g.fillText('here. forever.',128,210);}
  else{g.fillStyle='#0d0d0d';g.fillRect(0,0,256,340);
    g.fillStyle=SWEDISH_YELLOW;g.font='900 46px Arial';g.textAlign='center';g.fillText('NYHET',128,100);
    g.fillStyle='#eee';g.font='400 22px Arial';g.fillText('the night collection',128,160);g.fillText('do not approach staff',128,190);
    g.fillText('after 22:00',128,220);}
  g.strokeStyle='#222';g.lineWidth=8;g.strokeRect(4,4,248,332);
});}

function exitSignTexture(open){return cTex(512,160,(g)=>{
  g.fillStyle=open?'#063': '#411';g.fillRect(0,0,512,160);
  g.fillStyle=open?'#9fffc9':'#ff9a8a';g.font='900 100px Arial';g.textAlign='center';g.textBaseline='middle';
  g.fillText('UTGÅNG',256,84);
});}

// ---------------------------------------------------------------- geometry merge (keeps draw calls low for Quest)
function mergeGeoms(list){ // list of {geom, matrix} — indexed, position/normal/uv
  let vCount=0,iCount=0;
  for(const {geom} of list){vCount+=geom.attributes.position.count;iCount+=geom.index.count;}
  const pos=new Float32Array(vCount*3),nor=new Float32Array(vCount*3),uv=new Float32Array(vCount*2);
  const idx=new Uint32Array(iCount);
  let vo=0,io=0;const nm=new THREE.Matrix3();
  for(const {geom,matrix} of list){
    const p=geom.attributes.position,n=geom.attributes.normal,u=geom.attributes.uuid;void u;
    const uvA=geom.attributes.uv;const nm2=nm.getNormalMatrix(matrix);
    const v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i).applyMatrix4(matrix);
      pos[(vo+i)*3]=v.x;pos[(vo+i)*3+1]=v.y;pos[(vo+i)*3+2]=v.z;
      v.fromBufferAttribute(n,i).applyMatrix3(nm2).normalize();
      nor[(vo+i)*3]=v.x;nor[(vo+i)*3+1]=v.y;nor[(vo+i)*3+2]=v.z;
      if(uvA){uv[(vo+i)*2]=uvA.getX(i);uv[(vo+i)*2+1]=uvA.getY(i);}
    }
    const gi=geom.index;for(let i=0;i<gi.count;i++)idx[io+i]=gi.getX(i)+vo;
    vo+=p.count;io+=gi.count;
  }
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(pos,3));
  out.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  out.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  out.setIndex(new THREE.BufferAttribute(idx,1));
  return out;
}
const _m4=new THREE.Matrix4(),_q=new THREE.Quaternion(),_s=new THREE.Vector3(1,1,1),_p=new THREE.Vector3();
function boxAt(list,w,h,d,x,y,z,ry){ // queue a box into merge list
  const g=new THREE.BoxGeometry(w,h,d);
  _q.setFromAxisAngle(new THREE.Vector3(0,1,0),ry||0);
  _m4.compose(_p.set(x,y,z),_q,_s);
  list.push({geom:g,matrix:_m4.clone()});
}
function cylAt(list,rT,rB,h,x,y,z,seg){const g=new THREE.CylinderGeometry(rT,rB,h,seg||12);
  _m4.compose(_p.set(x,y,z),_q.identity(),_s);list.push({geom:g,matrix:_m4.clone()});}

// ---------------------------------------------------------------- materials
const M={
  birch:new THREE.MeshStandardMaterial({color:0xc9a86a,roughness:0.8}),
  white:new THREE.MeshStandardMaterial({color:0xf2efe8,roughness:0.85}),
  dark:new THREE.MeshStandardMaterial({color:0x4d4740,roughness:0.9}),
  fabBlue:new THREE.MeshStandardMaterial({color:0x33507a,roughness:1}),
  fabGray:new THREE.MeshStandardMaterial({color:0x84878c,roughness:1}),
  fabRed:new THREE.MeshStandardMaterial({color:0x7a2e2a,roughness:1}),
  metal:new THREE.MeshStandardMaterial({color:0x9aa0a6,roughness:0.35,metalness:0.65}),
  rack:new THREE.MeshStandardMaterial({color:0xd7a300,roughness:0.55,metalness:0.25}),
  card0:new THREE.MeshStandardMaterial({map:boxLabelTexture(0),roughness:0.95}),
  card1:new THREE.MeshStandardMaterial({map:boxLabelTexture(1),roughness:0.95}),
  card2:new THREE.MeshStandardMaterial({map:boxLabelTexture(2),roughness:0.95}),
  rugRed:new THREE.MeshStandardMaterial({color:0x8c3a30,roughness:1}),
  rugGray:new THREE.MeshStandardMaterial({color:0x92959b,roughness:1}),
  rugGreen:new THREE.MeshStandardMaterial({color:0x4a5d3a,roughness:1}),
};
const mergeLists={birch:[],white:[],dark:[],fabBlue:[],fabGray:[],fabRed:[],metal:[],rack:[],card0:[],card1:[],card2:[],rugRed:[],rugGray:[],rugGreen:[]};

// ---------------------------------------------------------------- collision world
const obstacles=[]; // {minX,maxX,minZ,maxZ}
function addObstacle(cx,cz,w,d,pad){const p=(pad||0)+0.02;
  obstacles.push({minX:cx-w/2-p,maxX:cx+w/2+p,minZ:cz-d/2-p,maxZ:cz+d/2+p});}
function collide(pos,radius){ // resolve circle vs AABBs, axis separated
  for(const o of obstacles){
    if(pos.x>o.minX-radius&&pos.x<o.maxX+radius&&pos.z>o.minZ-radius&&pos.z<o.maxZ+radius){
      const dxl=pos.x-(o.minX-radius),dxr=(o.maxX+radius)-pos.x;
      const dzl=pos.z-(o.minZ-radius),dzr=(o.maxZ+radius)-pos.z;
      const m=Math.min(dxl,dxr,dzl,dzr);
      if(m===dxl)pos.x=o.minX-radius;else if(m===dxr)pos.x=o.maxX+radius;
      else if(m===dzl)pos.z=o.minZ-radius;else pos.z=o.maxZ+radius;
    }
  }
}
function losClear(a,b){ // sample the segment against obstacles (sight, not collision radius)
  const steps=Math.max(4,Math.floor(a.distanceTo(b)/0.9));
  for(let i=1;i<steps;i++){const t=i/steps;
    const x=lerp(a.x,b.x,t),z=lerp(a.z,b.z,t);
    for(const o of obstacles){if(x>o.minX&&x<o.maxX&&z>o.minZ&&z<o.maxZ)return false;}
  }
  return true;
}

// ---------------------------------------------------------------- static world
const STORE=72,HALF=36,WALL_H=4.6;
function buildWorld(){
  // floor + ceiling
  const floorTex=floorTexture();floorTex.wrapS=floorTex.wrapT=THREE.RepeatWrapping;floorTex.repeat.set(18,18);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(STORE,STORE),new THREE.MeshStandardMaterial({map:floorTex,roughness:0.92}));
  floor.rotation.x=-Math.PI/2;scene.add(floor);
  const ceilTex=cTex(512,512,(g)=>{g.fillStyle='#e9e6dd';g.fillRect(0,0,512,512);
    g.strokeStyle='rgba(120,118,110,0.5)';g.lineWidth=3;
    for(let i=0;i<=4;i++){g.beginPath();g.moveTo(i*128,0);g.lineTo(i*128,512);g.stroke();g.beginPath();g.moveTo(0,i*128);g.lineTo(512,i*128);g.stroke();}});
  ceilTex.wrapS=ceilTex.wrapT=THREE.RepeatWrapping;ceilTex.repeat.set(18,18);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(STORE,STORE),
    new THREE.MeshBasicMaterial({map:ceilTex,color:0xfaf7ef}));
  ceil.rotation.x=Math.PI/2;ceil.position.y=WALL_H;scene.add(ceil);
  worldMats.ceil=ceil.material;

  // walls (north wall has the exit gap)
  const wallTex=wallTexture();wallTex.wrapS=THREE.RepeatWrapping;wallTex.repeat.set(6,1);
  const wallMat=new THREE.MeshStandardMaterial({map:wallTex,roughness:0.9});
  function wall(w,h,x,y,z,ry,mat){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat||wallMat);
    m.position.set(x,y,z);m.rotation.y=ry||0;scene.add(m);return m;}
  wall(STORE,WALL_H,0,WALL_H/2, HALF,Math.PI);        // south
  wall(STORE,WALL_H,-HALF,WALL_H/2,0, Math.PI/2);     // west
  wall(STORE,WALL_H, HALF,WALL_H/2,0,-Math.PI/2);     // east
  wall(33,WALL_H,-19.5,WALL_H/2,-HALF,0);             // north left of gate
  wall(33,WALL_H, 19.5,WALL_H/2,-HALF,0);             // north right of gate
  wall(6,1.1,0,WALL_H-0.55,-HALF,0);                  // lintel over gate
  addObstacle(0,HALF+0.3,STORE+2,0.8,0); addObstacle(0,-HALF-0.3,STORE+2,0.8,0);
  addObstacle(HALF+0.3,0,0.8,STORE+2,0); addObstacle(-HALF-0.3,0,0.8,STORE+2,0);
  addObstacle(-19.5,-HALF,33,1,0); addObstacle(19.5,-HALF,33,1,0);

  // exit doors (glass) + sign, opened at dawn
  const doorMat=new THREE.MeshStandardMaterial({color:0x9fb8c8,roughness:0.15,metalness:0.4,transparent:true,opacity:0.5});
  const dL=new THREE.Mesh(new THREE.BoxGeometry(2.9,3.4,0.12),doorMat);dL.position.set(-1.48,1.7,-HALF+0.05);
  const dR=dL.clone();dR.position.x=1.48;scene.add(dL,dR);
  worldRefs.doors=[dL,dR];
  exitObstacle={minX:-3.2,maxX:3.2,minZ:-HALF-0.4,maxZ:-HALF+0.4};
  obstacles.push(exitObstacle);
  const exitSignMat=new THREE.MeshBasicMaterial({map:exitSignTexture(false)});
  const exitSign=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.05),exitSignMat);
  exitSign.position.set(0,3.9,-HALF+0.12);scene.add(exitSign);
  worldRefs.exitSignMat=exitSignMat;

  // ceiling light panels (emissive at day)
  const panelGeo=new THREE.PlaneGeometry(3.4,1.1);
  const panelMat=new THREE.MeshBasicMaterial({color:0xfff6e0});
  const panels=[];const panelList=[];
  for(let x=-30;x<=30;x+=10)for(let z=-30;z<=30;z+=10)panelList.push([x+rand(-1,1),z+rand(-1,1)]);
  const panelInst=new THREE.InstancedMesh(panelGeo,panelMat,panelList.length);
  panelList.forEach(([x,z],i)=>{_q.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
    _m4.compose(_p.set(x,WALL_H-0.02,z),_q,_s);panelInst.setMatrixAt(i,_m4);});
  scene.add(panelInst);worldRefs.panelMat=panelMat;

  // structural pillars
  for(let x=-24;x<=24;x+=12)for(let z=-24;z<=24;z+=12){
    boxAt(mergeLists.white,0.55,WALL_H,0.55,x,WALL_H/2,z,0);addObstacle(x,z,0.55,0.55,0.05);}

  buildRacks();buildShowroom();buildRestaurant();buildSigns();buildPosters();

  // commit merged static geometry
  for(const k of Object.keys(mergeLists)){
    if(!mergeLists[k].length)continue;
    const mesh=new THREE.Mesh(mergeGeoms(mergeLists[k]),M[k]);scene.add(mesh);
  }
}
const worldRefs={},worldMats={};

let exitObstacle=null;
const itemSpawns={meat:[],battery:[],heal:[]};
const staffStations=[];

// ---- self-serve warehouse: yellow pallet racks, flat-pack boxes (SE + center of store)
function buildRacks(){
  const rows=[]; // rack x positions; racks run along z
  for(let x=0;x<=32;x+=4)rows.push(x+2);
  const zSegs=[];for(let z=0;z<=24;z+=12)zSegs.push([z+0.5,z+10.5]); // 10m rack + 2m cross aisle... widen: gaps at z 10.5-12.5
  for(const rx of rows){
    for(const [z0,z1] of zSegs){
      const len=z1-z0,cz=(z0+z1)/2;
      // uprights + 3 beam levels
      for(const sx of [-0.55,0.55])for(const zz of [z0+0.2,z1-0.2]){
        boxAt(mergeLists.rack,0.14,3.3,0.14,rx+sx,1.65,zz,0);}
      for(const lv of [0.35,1.55,2.75]){
        boxAt(mergeLists.rack,1.25,0.1, len, rx, lv, cz, 0);
      }
      addObstacle(rx,cz,1.35,len+0.4,0.08);
      // flat-packs stacked on the levels
      for(const lv of [0.45,1.65,2.85]){
        let zz=z0+0.7;
        while(zz<z1-0.7){
          const bl=rand(1.1,2.1),bh=rand(0.12,0.3),bw=rand(0.6,1.0);
          const card=pick(['card0','card1','card2']);
          boxAt(mergeLists[card],bw,bh,bl,rx+rand(-0.12,0.12),lv+bh/2,zz+bl/2,rng()<0.5?0:0.04);
          zz+=bl+rand(0.15,0.5);
        }
      }
      // battery spawns on mid shelf ends
      if(rng()<0.75)itemSpawns.battery.push([rx+rand(-0.3,0.3),1.75,rng()<0.5?z0+0.8:z1-0.8]);
    }
  }
  // staff stations lurk between racks
  for(const rx of rows)for(const [z0,z1] of zSegs)if(rng()<0.3)staffStations.push([rx+2,(z0+z1)/2]);
}

// ---- showroom vignettes (north half): bedroom / living / kitchen sets
const VIG_NAMES=[['LÖVKULLA','899:-'],['BRÖTTA','4 299:-'],['SMÖRRE','1 499:-'],['KNÄPP','349:-'],
  ['FLÄRKE','649:-'],['DÖDSTER','1 099:-'],['MÖRKER','79:-'],['ÖNDRÅG','2 199:-'],['GRAVLID','549:-']];
function buildShowroom(){
  const cells=[];
  for(let cx=-31.5;cx<=-3.5;cx+=7)for(let cz=-31.5;cz<=-10.5;cz+=7)cells.push([cx,cz]);
  for(let cx=3.5;cx<=31.5;cx+=7)for(let cz=-31.5;cz<=-10.5;cz+=7)cells.push([cx,cz]);
  let tagI=0;
  for(const [cx,cz] of cells){
    const kind=tagI%3, rugM=['rugRed','rugGray','rugGreen'][tagI%3];
    boxAt(mergeLists[rugM],5.6,0.03,5.6,cx,0.015,cz,0); // rug
    if(kind===0){ // bedroom
      boxAt(mergeLists.birch,2.2,0.45,1.7,cx-1.2,0.22,cz-1.2,0);           // bed frame
      boxAt(mergeLists.white,2.1,0.25,1.6,cx-1.2,0.55,cz-1.2,0);          // mattress
      boxAt(mergeLists.fabBlue,2.1,0.12,0.5,cx-1.2,0.68,cz-1.75,0);       // blanket fold
      boxAt(mergeLists.dark,2.0,2.1,0.7,cx+1.6,1.05,cz-1.6,0);            // wardrobe
      addObstacle(cx-1.2,cz-1.2,2.3,1.8);addObstacle(cx+1.6,cz-1.6,2.1,0.8);
      lamp(cx+1.9,cz+1.7);
      itemSpawns.heal.push([cx-1.2,0.85,cz-1.2]);
    }else if(kind===1){ // living
      boxAt(mergeLists.fabGray,2.4,0.75,1.0,cx-1.0,0.38,cz-1.6,0);        // sofa
      boxAt(mergeLists.fabGray,2.4,0.35,0.28,cx-1.0,0.95,cz-1.95,0);      // sofa back
      boxAt(mergeLists.birch,1.4,0.42,0.7,cx-0.9,0.21,cz-0.1,0);          // coffee table
      boxAt(mergeLists.dark,0.5,2.0,2.6,cx+1.9,1.0,cz-0.6,0);             // shelf wall
      addObstacle(cx-1.0,cz-1.6,2.5,1.1);addObstacle(cx-0.9,cz-0.1,1.5,0.8);addObstacle(cx+1.9,cz-0.6,0.6,2.7);
      itemSpawns.battery.push([cx-0.9,0.5,cz-0.1]);
      itemSpawns.heal.push([cx+1.9,1.35,cz-0.6+rand(-0.8,0.8)]);
    }else{ // kitchen
      boxAt(mergeLists.white,3.2,0.9,0.7,cx-0.6,0.45,cz-1.7,0);           // counter run
      boxAt(mergeLists.metal,0.6,0.15,0.5,cx-1.6,0.95,cz-1.7,0);          // sink
      boxAt(mergeLists.white,0.8,2.1,0.7,cx+1.7,1.05,cz-1.7,0);           // tall cabinet
      boxAt(mergeLists.birch,1.6,0.78,0.9,cx+0.4,0.39,cz+1.0,0.1);        // island
      addObstacle(cx-0.6,cz-1.7,3.3,0.8);addObstacle(cx+1.7,cz-1.7,0.9,0.8);addObstacle(cx+0.4,cz+1.0,1.7,1.0);
      lamp(cx-2.2,cz+1.6);
      itemSpawns.meat.push([cx+0.4,0.85,cz+1.0]);
    }
    // price tag on a post
    const [nm,pr]=VIG_NAMES[tagI%VIG_NAMES.length];tagI++;
    const tag=new THREE.Mesh(new THREE.PlaneGeometry(0.34,0.51),
      new THREE.MeshBasicMaterial({map:priceTagTexture(nm,pr,nm==='MÖRKER'||nm==='DÖDSTER'||nm==='GRAVLID'?null:undefined)}));
    tag.position.set(cx+rand(-2,2),1.25,cz+rand(-2,2));
    tag.rotation.y=rand(0,Math.PI*2);scene.add(tag);
    boxAt(mergeLists.metal,0.04,1.1,0.04,tag.position.x,0.55,tag.position.z,0);
    if(rng()<0.35)staffStations.push([cx+rand(-1.5,1.5),cz+rand(-1.5,1.5)]);
  }
}
function lamp(x,z){
  boxAt(mergeLists.metal,0.05,1.5,0.05,x,0.75,z,0);
  const shade=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.3,10,1,true),
    new THREE.MeshStandardMaterial({color:0xf4efe4,roughness:0.9,emissive:0xffe9b8,emissiveIntensity:0.0,side:THREE.DoubleSide}));
  shade.position.set(x,1.62,z);scene.add(shade);
  (worldRefs.lamps=worldRefs.lamps||[]).push(shade.material);
  addObstacle(x,z,0.25,0.25);
}

// ---- restaurant (west middle): counters, tables, meatballs
function buildRestaurant(){
  const cx=-21,cz=4;
  boxAt(mergeLists.rugGray,24,0.025,18,cx,0.012,cz,0); // big floor mat
  // counter along west wall
  boxAt(mergeLists.white,1.0,1.05,14,-33,0.52,cz,0);
  boxAt(mergeLists.metal,0.9,0.06,13.6,-33,1.08,cz,0);
  addObstacle(-33,cz,1.2,14.2,0.05);
  for(let i=0;i<6;i++)itemSpawns.meat.push([-32.9,1.2,cz-5.5+i*2.1]);
  // tables + chairs
  for(let tx=-29;tx<=-11;tx+=4.6)for(let tz=-1;tz<=9;tz+=4.6){
    if(rng()<0.18)continue;
    cylAt(mergeLists.white,0.55,0.55,0.05,tx,0.74,tz,14);
    cylAt(mergeLists.metal,0.05,0.07,0.72,tx,0.37,tz,8);
    addObstacle(tx,tz,0.9,0.9);
    for(let a=0;a<4;a++){const ang=a*Math.PI/2+0.4;
      const chx=tx+Math.cos(ang)*1.0,chz=tz+Math.sin(ang)*1.0;
      boxAt(mergeLists.dark,0.42,0.5,0.42,chx,0.25,chz,ang);
      boxAt(mergeLists.dark,0.42,0.5,0.08,chx+Math.cos(ang)*0.2,0.72,chz+Math.sin(ang)*0.2,ang);}
    if(rng()<0.7)itemSpawns.meat.push([tx,0.82,tz]);
    if(rng()<0.2)itemSpawns.battery.push([tx,0.82,tz]);
  }
  staffStations.push([-26,4],[-14,8]);
}

// ---- hanging wayfinding + posters
function buildSigns(){
  const defs=[
    ['VARDAGSRUM','←',-24,-8],['SOVRUM','←',-10,-8],['KÖK','→',8,-8],['RESTAURANG','←',-14,-2],
    ['SJÄLVBETJÄNING','→',6,0],['UTGÅNG','↑',0,-24],['MARKNAD','→',16,-8],['KASSA','↓',24,14],
  ];
  for(const [txt,arrow,x,z] of defs){
    const s=new THREE.Mesh(new THREE.PlaneGeometry(2.6,0.98),
      new THREE.MeshBasicMaterial({map:hangSignTexture(txt,arrow),side:THREE.DoubleSide}));
    s.position.set(x,3.55,z);s.rotation.y=Math.PI/2*(rng()<0.5?0:1)*(rng()<0.3?1:0)+ (rng()<0.5?0:Math.PI/2);
    scene.add(s);
    boxAt(mergeLists.metal,0.03,WALL_H-3.9,0.03,x-0.9,3.9+(WALL_H-3.9)/2,z,0);
    boxAt(mergeLists.metal,0.03,WALL_H-3.9,0.03,x+0.9,3.9+(WALL_H-3.9)/2,z,0);
  }
}
function buildPosters(){
  const kinds=['meat','smaland','nyhet','meat','nyhet','smaland'];
  const spots=[[-35.6,-14,Math.PI/2],[-35.6,10,Math.PI/2],[35.6,-6,-Math.PI/2],[35.6,18,-Math.PI/2],[-8,35.6,Math.PI],[20,35.6,Math.PI]];
  spots.forEach(([x,z,ry],i)=>{
    const p=new THREE.Mesh(new THREE.PlaneGeometry(1.3,1.73),new THREE.MeshBasicMaterial({map:posterTexture(kinds[i%kinds.length])}));
    p.position.set(x,2.1,z);p.rotation.y=ry;scene.add(p);});
}

// ---------------------------------------------------------------- items
const items=[];
const itemMats={
  plate:new THREE.MeshStandardMaterial({color:0xf4f2ec,roughness:0.6}),
  meat:new THREE.MeshStandardMaterial({color:0x6b4226,roughness:0.8}),
  batt:new THREE.MeshStandardMaterial({color:0xffdb00,roughness:0.4}),
  battTop:new THREE.MeshStandardMaterial({color:0x0058a3,roughness:0.4}),
  healBox:new THREE.MeshStandardMaterial({color:0xf6f6f6,roughness:0.7}),
  healCross:new THREE.MeshStandardMaterial({color:0xc02020,roughness:0.7}),
};
function spawnItem(type,x,y,z){
  const g=new THREE.Group();
  if(type==='meat'){
    const plate=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.14,0.025,14),itemMats.plate);plate.position.y=0.012;
    g.add(plate);
    for(let i=0;i<5;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(0.038,8,8),itemMats.meat);
      const a=i/5*Math.PI*2;m.position.set(Math.cos(a)*0.08,0.05,Math.sin(a)*0.08);g.add(m);}
  }else if(type==='battery'){
    const b=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.12,10),itemMats.batt);b.position.y=0.06;
    const t=new THREE.Mesh(new THREE.CylinderGeometry(0.037,0.037,0.03,10),itemMats.battTop);t.position.y=0.115;
    g.add(b,t);
  }else{
    const box=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.07,0.12),itemMats.healBox);box.position.y=0.035;
    const c1=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.012,0.03),itemMats.healCross);c1.position.y=0.073;
    const c2=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.012,0.09),itemMats.healCross);c2.position.y=0.073;
    g.add(box,c1,c2);
  }
  g.position.set(x,y,z);
  scene.add(g);
  items.push({type,group:g,baseY:y,taken:false});
}
function seedItems(initial){
  for(const [type,spots] of Object.entries(itemSpawns)){
    for(const [x,y,z] of spots){
      if(initial){ if(type==='meat'||rng()<0.85)spawnItem(type,x,y,z); }
      else{
        const near=items.some(it=>!it.taken&&Math.abs(it.group.position.x-x)<0.6&&Math.abs(it.group.position.z-z)<0.6);
        if(!near&&rng()<0.6)spawnItem(type,x,y,z);
      }
    }
  }
}
function useItem(it){
  it.taken=true;scene.remove(it.group);
  if(it.type==='meat'){player.hunger=clamp(player.hunger+45,0,100);player.eaten++;AudioSys.eat();}
  else if(it.type==='battery'){player.batt=clamp(player.batt+55,0,100);AudioSys.batterySfx();}
  else{player.hp=clamp(player.hp+45,0,100);AudioSys.heal();}
}
const ITEM_LABEL={meat:'KÖTTBULLAR — ät (+hunger)',battery:'BATTERI — ladda (+battery)',heal:'PLÅSTER — lappa ihop (+health)'};

// ---------------------------------------------------------------- the staff
const staffs=[];
class Staff{
  constructor(x,z){
    const g=new THREE.Group();
    const legG=new THREE.BoxGeometry(0.17,0.92,0.17);legG.translate(0,-0.46,0);
    const legM=new THREE.MeshStandardMaterial({color:0x23252b,roughness:0.95});
    this.legL=new THREE.Mesh(legG,legM);this.legL.position.set(-0.12,0.92,0);
    this.legR=new THREE.Mesh(legG,legM);this.legR.position.set(0.12,0.92,0);
    const torso=new THREE.Mesh(new THREE.BoxGeometry(0.56,0.72,0.3),
      new THREE.MeshStandardMaterial({color:0xffc500,roughness:0.85}));
    torso.position.y=1.3;
    const armG=new THREE.BoxGeometry(0.1,1.15,0.1);armG.translate(0,-0.55,0);
    const armM=new THREE.MeshStandardMaterial({color:0xe6ddcd,roughness:0.9});
    this.armL=new THREE.Mesh(armG,armM);this.armL.position.set(-0.35,1.62,0);this.armL.rotation.z=0.12;
    this.armR=new THREE.Mesh(armG,armM);this.armR.position.set(0.35,1.62,0);this.armR.rotation.z=-0.12;
    const headG=new THREE.SphereGeometry(0.155,14,12);headG.scale(1,1.45,1.08);
    this.head=new THREE.Mesh(headG,new THREE.MeshStandardMaterial({color:0xeae2d6,roughness:0.55}));
    this.head.position.y=1.92;
    const blob=new THREE.Mesh(new THREE.CircleGeometry(0.42,16),
      new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.42}));
    blob.rotation.x=-Math.PI/2;blob.position.y=0.02;
    g.add(this.legL,this.legR,torso,this.armL,this.armR,this.head,blob);
    g.position.set(x,0,z);
    scene.add(g);
    this.g=g;this.pos=g.position;
    this.state='frozen';
    this.target=new THREE.Vector3(x,0,z);
    this.lastSeen=new THREE.Vector3();
    this.yaw=rand(0,Math.PI*2);this.walkPhase=rand(0,6);
    this.detT=rand(0,0.15);this.wpT=0;this.lostT=0;this.searchT=0;this.stunT=0;this.alerted=false;
    this.speed=0;
  }
  newWaypoint(){
    for(let i=0;i<10;i++){
      const x=rand(-33,33),z=rand(-33,33);
      if(!pointBlocked(x,z,0.6)&&Math.hypot(x-this.pos.x,z-this.pos.z)>6){this.target.set(x,0,z);this.wpT=0;return;}
    }
    this.target.set(rand(-30,30),0,rand(-30,30));this.wpT=0;
  }
  detect(nightNum){
    const px=rig.position.x,pz=rig.position.z;
    const dx=px-this.pos.x,dz=pz-this.pos.z,d=Math.hypot(dx,dz);
    // hearing: sprint noise carries
    if(player.sprinting&&player.moving&&d<9){return d;}
    let sightR=11.5+nightNum*0.8;
    if(player.flashlight) sightR*=1.7;
    if(player.crouch) sightR*=0.55;
    else if(!player.moving) sightR*=0.8;
    if(d>sightR)return 0;
    const fx=Math.sin(this.yaw),fz=Math.cos(this.yaw); // facing +z rotated by yaw
    const dot=(dx*fx+dz*fz)/(d||1);
    if(dot<0.42&&d>1.6)return 0; // ~65° half-cone, point-blank exempt
    if(!losClear(new THREE.Vector3(this.pos.x,0,this.pos.z),new THREE.Vector3(px,0,pz)))return 0;
    return d;
  }
  update(dt,nightNum,t){
    const g=this.g;
    if(this.state==='frozen'){
      // heads follow you. only the heads.
      const want=Math.atan2(rig.position.x-this.pos.x,rig.position.z-this.pos.z);
      let dy=want-this.yaw;while(dy>Math.PI)dy-=Math.PI*2;while(dy<-Math.PI)dy+=Math.PI*2;
      this.yaw+=clamp(dy,-0.25*dt*3,0.25*dt*3);
      g.rotation.y=this.yaw;
      g.position.y=Math.sin(t*0.7+this.walkPhase)*0.008; // barely breathing
      return;
    }
    if(this.stunT>0){this.stunT-=dt;g.rotation.y=this.yaw+Math.sin(t*30)*0.03;return;}
    // detection tick
    this.detT-=dt;
    if(this.detT<=0){
      this.detT=0.15;
      const d=this.detect(nightNum);
      if(d>0){
        if(this.state!=='chase'){AudioSys.shriek();pulseHaptics(0.7,120);}
        this.state='chase';this.lastSeen.set(rig.position.x,0,rig.position.z);this.lostT=0;
      }else if(this.state==='chase'){
        this.lostT+=0.15;
        if(this.lostT>3.5){this.state='search';this.searchT=6;}
      }
    }
    let speed=1.5;
    if(this.state==='chase'){this.target.set(rig.position.x,0,rig.position.z);speed=3.3+nightNum*0.18;}
    else if(this.state==='search'){speed=2.1;this.searchT-=dt;
      if(this.searchT<=0){this.state='patrol';this.newWaypoint();}}
    else speed=1.5;
    if(this.state==='patrol'){
      this.wpT+=dt;
      const ddx=this.target.x-this.pos.x,ddz=this.target.z-this.pos.z;
      if(Math.hypot(ddx,ddz)<1.2||this.wpT>6)this.newWaypoint();
    }
    // steering with obstacle probe
    let dirx=this.target.x-this.pos.x,dirz=this.target.z-this.pos.z;
    const dl=Math.hypot(dirx,dirz);if(dl>0.01){dirx/=dl;dirz/=dl;}
    let best=null;
    for(const ang of [0,0.6,-0.6,1.2,-1.2,1.9,-1.9]){
      const ca=Math.cos(ang),sa=Math.sin(ang);
      const rx=dirx*ca-dirz*sa,rz=dirx*sa+dirz*ca;
      const px=this.pos.x+rx*1.1,pz=this.pos.z+rz*1.1;
      if(!pointBlocked(px,pz,0.42)){best=[rx,rz];break;}
    }
    if(!best)best=[-dirx,-dirz];
    this.speed=lerp(this.speed,speed,dt*4);
    this.pos.x+=best[0]*this.speed*dt;
    this.pos.z+=best[1]*this.speed*dt;
    collide(this.pos,0.34);
    const wantYaw=Math.atan2(best[0],best[1]);
    let dy=wantYaw-this.yaw;while(dy>Math.PI)dy-=Math.PI*2;while(dy<-Math.PI)dy+=Math.PI*2;
    this.yaw+=clamp(dy,-3.4*dt,3.4*dt);
    g.rotation.y=this.yaw;
    // walk cycle
    this.walkPhase+=dt*this.speed*3.4;
    const sw=Math.sin(this.walkPhase);
    this.legL.rotation.x=sw*0.6;this.legR.rotation.x=-sw*0.6;
    this.armL.rotation.x=-sw*0.4;this.armR.rotation.x=sw*0.4;
    this.head.rotation.z=Math.sin(this.walkPhase*0.5)*0.06;
    // catch
    const pdx=rig.position.x-this.pos.x,pdz=rig.position.z-this.pos.z;
    if(this.state==='chase'&&Math.hypot(pdx,pdz)<1.0&&player.iframes<=0&&state==='playing'){
      hurtPlayer();
      this.stunT=2.6;this.state='patrol';this.newWaypoint();
    }
  }
}
function pointBlocked(x,z,pad){
  for(const o of obstacles)if(x>o.minX-pad&&x<o.maxX+pad&&z>o.minZ-pad&&z<o.maxZ+pad)return true;
  return false;
}
function ensureStaff(n){
  while(staffs.length<n){
    const st=staffStations.length?staffStations[(staffs.length*3)%staffStations.length]:[rand(-20,20),rand(-20,20)];
    staffs.push(new Staff(st[0]+rand(-1,1),st[1]+rand(-1,1)));
  }
}
function freezeStaff(){for(const s of staffs){s.state='frozen';s.speed=0;}}
function activateStaff(){for(const s of staffs){s.state='patrol';s.newWaypoint();}}

// ---------------------------------------------------------------- player + controls
const player={hp:100,stam:100,hunger:100,batt:100,flashlight:false,crouch:false,sprinting:false,moving:false,
  iframes:0,eaten:0,camY:1.6};
let state='title'; // title | playing | dead | win
let totalTime=0;

const keys={};
addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyF'&&state==='playing')toggleFlash();});
addEventListener('keyup',e=>{keys[e.code]=false;});
let pitch=0;
document.addEventListener('mousemove',e=>{
  if(document.pointerLockElement!==renderer.domElement||state!=='playing')return;
  rig.rotation.y-=e.movementX*0.0022;
  pitch=clamp(pitch-e.movementY*0.0022,-1.45,1.45);
});
renderer.domElement.addEventListener('click',()=>{
  if(state==='playing'&&!renderer.xr.isPresenting)renderer.domElement.requestPointerLock();
});
function toggleFlash(){
  if(player.batt<=0&&!player.flashlight){AudioSys.blip(180,0.1,'square',0.1);return;}
  player.flashlight=!player.flashlight;
  AudioSys.blip(player.flashlight?1200:700,0.05,'square',0.1);
  pulseHaptics(0.3,40);
}

// VR controllers
const controllers=[];
for(let i=0;i<2;i++){
  const c=renderer.xr.getController(i);
  const hand=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.045,0.12),
    new THREE.MeshStandardMaterial({color:0xd8d4c8,roughness:0.6}));
  c.add(hand);rig.add(c);controllers.push(c);
  c.addEventListener('selectstart',()=>onVrAction(c));
  c.addEventListener('squeezestart',()=>onVrAction(c));
}
function onVrAction(c){
  AudioSys.init();
  if(state==='title'){startGame();return;}
  if(state==='dead'){retryNight();return;}
  if(state==='win'){fullRestart();return;}
  // grab nearest item near the controller
  const cp=new THREE.Vector3();c.getWorldPosition(cp);
  let best=null,bd=1.15;
  for(const it of items){if(it.taken)continue;
    const d=cp.distanceTo(it.group.position);if(d<bd){bd=d;best=it;}}
  if(best){useItem(best);pulseHaptics(0.5,70);}
}
function pulseHaptics(i,ms){
  for(const c of controllers){const gp=c.gamepad||c._gp;
    const h=gp&&gp.hapticActuators&&gp.hapticActuators[0];
    if(h&&h.pulse)try{h.pulse(i,ms);}catch(e){}}
}
let snapLatch=false,btnLatchA=false;
function pollVrInput(dt){
  const session=renderer.xr.getSession();if(!session)return;
  let mx=0,mz=0;
  for(const src of session.inputSources){
    const gp=src.gamepad;if(!gp)continue;
    const ax=gp.axes[2]||0,ay=gp.axes[3]||0;
    if(src.handedness==='left'){mx=ax;mz=ay;}
    else{
      if(Math.abs(ax)>0.7){if(!snapLatch){rig.rotation.y-=Math.sign(ax)*Math.PI/4;snapLatch=true;AudioSys.blip(500,0.03,'square',0.06);}}
      else snapLatch=false;
      const aBtn=gp.buttons[4]&&gp.buttons[4].pressed;
      if(aBtn&&!btnLatchA&&state==='playing')toggleFlash();
      btnLatchA=!!aBtn;
    }
  }
  if(state!=='playing')return;
  const dead=0.12;
  if(Math.abs(mx)>dead||Math.abs(mz)>dead){
    const yaw=getHeadYaw();
    const sp=3.2;
    const fx=-Math.sin(yaw),fz=-Math.cos(yaw);
    const rx=Math.cos(yaw),rz=-Math.sin(yaw);
    rig.position.x+=(fx*-mz+rx*mx)*sp*dt;
    rig.position.z+=(fz*-mz+rz*mx)*sp*dt;
    player.moving=true;player.sprinting=false;
  }else player.moving=false;
  collide(rig.position,0.35);
  rig.position.x=clamp(rig.position.x,-HALF+0.4,HALF-0.4);
  rig.position.z=clamp(rig.position.z,-HALF+0.4,HALF-0.4);
  // physical crouch: headset low
  player.crouch=camera.position.y<1.15;
}
function getHeadYaw(){
  const e=new THREE.Euler().setFromQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()),'YXZ');
  return e.y;
}
function desktopMove(dt){
  if(state!=='playing')return;
  const f=(keys.KeyW?1:0)-(keys.KeyS?1:0),r=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  player.crouch=!!keys.KeyC;
  const wantSprint=!!keys.ShiftLeft||!!keys.ShiftRight;
  player.sprinting=wantSprint&&player.stam>1&&f>0;
  const sp=player.crouch?1.6:(player.sprinting?5.2:3.0);
  player.moving=(f!==0||r!==0);
  const yaw=rig.rotation.y;
  const fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
  rig.position.x+=(fx*f+rx*r)*sp*dt;
  rig.position.z+=(fz*f+rz*r)*sp*dt;
  collide(rig.position,0.35);
  rig.position.x=clamp(rig.position.x,-HALF+0.4,HALF-0.4);
  rig.position.z=clamp(rig.position.z,-HALF+0.4,HALF-0.4);
  const targetY=player.crouch?0.95:1.6;
  player.camY=lerp(player.camY,targetY,dt*8);
  camera.position.y=player.camY;
  camera.rotation.x=pitch;
  if(player.moving&&!player.crouch){
    camera.position.y=player.camY+Math.sin(totalTime*(player.sprinting?11:7.5))*0.028; // head bob
  }
}
function hurtPlayer(){
  player.hp-=34;player.iframes=1.6;
  AudioSys.hit();pulseHaptics(1,260);
  const vg=document.getElementById('vignette');vg.style.opacity=1;
  // knockback
  let nearest=staffs[0],bd=1e9;
  for(const s of staffs){const d=s.pos.distanceTo(rig.position);if(d<bd){bd=d;nearest=s;}}
  if(nearest){const dx=rig.position.x-nearest.pos.x,dz=rig.position.z-nearest.pos.z,l=Math.hypot(dx,dz)||1;
    rig.position.x+=dx/l*2.1;rig.position.z+=dz/l*2.1;collide(rig.position,0.35);}
  if(player.hp<=0)die();
}

// ---------------------------------------------------------------- interaction (desktop E)
let nearItem=null;
function updateInteract(){
  nearItem=null;let bd=1.35;
  const pp=rig.position;
  for(const it of items){if(it.taken)continue;
    const dx=it.group.position.x-pp.x,dz=it.group.position.z-pp.z;
    const dy=it.group.position.y-1.2;
    const d=Math.hypot(dx,dz)+Math.abs(dy)*0.6;
    if(d<bd){bd=d;nearItem=it;}}
  const pr=document.getElementById('prompt');
  if(nearItem&&state==='playing'&&!renderer.xr.isPresenting){pr.textContent='E — '+ITEM_LABEL[nearItem.type];pr.style.opacity=1;}
  else pr.style.opacity=0;
}
addEventListener('keydown',e=>{
  if(e.code==='KeyE'&&nearItem&&state==='playing'&&!renderer.xr.isPresenting){useItem(nearItem);}

});

// ---------------------------------------------------------------- phases + lighting
const PHASES=[
  {label:'DAG 1',dur:150,night:false,nightNum:0,banner:'DAG 1 — PLUNDRA. MÖBLERNA VAKTAR INTE. ÄNNU.'},
  {label:'NATT 1',dur:120,night:true,nightNum:1,banner:'NATT 1 — PERSONALEN BÖRJAR INVENTERA'},
  {label:'DAG 2',dur:110,night:false,nightNum:0,banner:'DAG 2 — DE STÅR STILL. TITTA INTE FÖR LÄNGE.'},
  {label:'NATT 2',dur:125,night:true,nightNum:2,banner:'NATT 2 — FLER AV DEM IKVÄLL'},
  {label:'DAG 3',dur:105,night:false,nightNum:0,banner:'DAG 3 — SISTA DAGEN. FYLL FICKORNA.'},
  {label:'NATT 3',dur:140,night:true,nightNum:3,banner:'NATT 3 — DE VET VAR DU BRUKAR GÖMMA DIG'},
  {label:'GRYNING',dur:1e9,night:false,dawn:true,nightNum:0,banner:'UTGÅNGEN ÄR ÖPPEN. SPRING.'},
];
let phaseIdx=0,phaseT=0,nightF=0,doorsOpen=false,doorAnim=0;

const hemi=new THREE.HemisphereLight(0xf5f0e2,0x8a8378,1.0);scene.add(hemi);
const dirL=new THREE.DirectionalLight(0xfff2dd,0.65);dirL.position.set(18,30,12);scene.add(dirL);
const emergency=[];
[[-24,-24],[24,-24],[0,0],[-24,20],[24,20],[0,28]].forEach(([x,z])=>{
  const pl=new THREE.PointLight(0xff2a18,0,17,1.6);pl.position.set(x,3.7,z);scene.add(pl);emergency.push(pl);});
const exitGlow=new THREE.PointLight(0x36ff88,0,16,1.4);exitGlow.position.set(0,3.2,-HALF+1);scene.add(exitGlow);
const flash=new THREE.SpotLight(0xfff4d6,0,24,0.52,0.5,1.1);
camera.add(flash);flash.position.set(0.06,-0.08,0.02);
const flashTarget=new THREE.Object3D();flashTarget.position.set(0,-0.12,-4);camera.add(flashTarget);
flash.target=flashTarget;

const DAY_BG=new THREE.Color(0xd8dee8),NIGHT_BG=new THREE.Color(0x03050c);
const DAY_FOG=[16,90],NIGHT_FOG=[7,38];
scene.background=new THREE.Color(DAY_BG);
scene.fog=new THREE.Fog(DAY_BG.getHex(),DAY_FOG[0],DAY_FOG[1]);

function applyLight(f){
  nightF=f;
  hemi.intensity=lerp(1.05,0.05,f);
  dirL.intensity=lerp(0.65,0.0,f);
  for(const pl of emergency)pl.intensity=lerp(0,1.35,f);
  worldRefs.panelMat.color.setHex(f>0.5?0x1a1e28:0xfff6e0);
  if(worldMats.ceil)worldMats.ceil.color.setHex(f>0.5?0x141821:0xfaf7ef);
  if(worldRefs.lamps)for(const lm of worldRefs.lamps)lm.emissiveIntensity=lerp(0.85,0.02,f);
  scene.background.copy(DAY_BG).lerp(NIGHT_BG,f);
  scene.fog.color.copy(scene.background);
  scene.fog.near=lerp(DAY_FOG[0],NIGHT_FOG[0],f);
  scene.fog.far=lerp(DAY_FOG[1],NIGHT_FOG[1],f);
  AudioSys.setDayNight(f);
}
let lightTarget=0;
function enterPhase(i){
  phaseIdx=i;phaseT=0;
  const ph=PHASES[i];
  showBanner(ph.banner);
  lightTarget=ph.night?1:0;
  if(ph.night){
    AudioSys.chime(false);
    ensureStaff(2+ph.nightNum);
    activateStaff();
    if(!player.flashlight&&player.batt>0){player.flashlight=true;}
  }else{
    AudioSys.chime(true);
    freezeStaff();
    if(ph.dawn){
      doorsOpen=true;AudioSys.door();
      worldRefs.exitSignMat.map=exitSignTexture(true);
      worldRefs.exitSignMat.needsUpdate=true;
      exitGlow.intensity=2.2;
      const oi=obstacles.indexOf(exitObstacle);if(oi>=0)obstacles.splice(oi,1);
    }else seedItems(false);
  }
  drawBoard();
}
function showBanner(txt){
  const b=document.getElementById('banner');b.textContent=txt;b.style.opacity=1;
  clearTimeout(showBanner._t);showBanner._t=setTimeout(()=>b.style.opacity=0,3400);
}

// ---------------------------------------------------------------- HUD: DOM + VR panel + board
const hudEls={health:document.querySelector('#m-health .fill'),stam:document.querySelector('#m-stam .fill'),
  hunger:document.querySelector('#m-hunger .fill'),batt:document.querySelector('#m-batt .fill'),
  phaseTitle:document.getElementById('phase-title'),phaseTimer:document.getElementById('phase-timer')};
function updateHudDom(){
  hudEls.health.style.width=clamp(player.hp,0,100)+'%';
  hudEls.stam.style.width=clamp(player.stam,0,100)+'%';
  hudEls.hunger.style.width=clamp(player.hunger,0,100)+'%';
  hudEls.batt.style.width=clamp(player.batt,0,100)+'%';
  const ph=PHASES[phaseIdx];
  hudEls.phaseTitle.textContent=ph.label+(ph.night?` — ${staffs.length} PÅ GOLVET`:'');
  if(ph.dawn)hudEls.phaseTimer.textContent='UTGÅNG NORRUT';
  else{const left=Math.max(0,ph.dur-phaseT);
    hudEls.phaseTimer.textContent=`${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`;}
}
// VR panel on camera
const panelCanvas=document.createElement('canvas');panelCanvas.width=512;panelCanvas.height=224;
const panelCtx=panelCanvas.getContext('2d');
const panelTex=new THREE.CanvasTexture(panelCanvas);panelTex.colorSpace=THREE.SRGBColorSpace;
const vrPanel=new THREE.Mesh(new THREE.PlaneGeometry(0.62,0.27),
  new THREE.MeshBasicMaterial({map:panelTex,transparent:true,opacity:0.94,depthTest:false}));
vrPanel.position.set(0,-0.42,-1.05);vrPanel.renderOrder=999;vrPanel.visible=false;
camera.add(vrPanel);
function drawVrPanel(){
  const g=panelCtx;g.clearRect(0,0,512,224);
  g.fillStyle='rgba(5,8,16,0.72)';g.fillRect(0,0,512,224);
  g.strokeStyle='rgba(255,219,0,0.5)';g.lineWidth=3;g.strokeRect(2,2,508,220);
  g.fillStyle='#f4efe4';g.font='800 30px Arial';
  const ph=PHASES[phaseIdx];
  let label=ph.label;
  if(!ph.dawn){const left=Math.max(0,ph.dur-phaseT);
    label+=`   ${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`;}
  else label+='   UTGÅNG NORRUT';
  g.fillText(label,20,42);
  const bars=[['HP',player.hp,'#d8453a'],['STA',player.stam,'#7fb069'],['MAT',player.hunger,'#e0a33a'],['BATT',player.batt,'#5aa9e6']];
  bars.forEach(([n,v,c],i)=>{const y=66+i*38;
    g.fillStyle='#9aa4b5';g.font='700 20px Arial';g.fillText(n,20,y+17);
    g.fillStyle='rgba(255,255,255,0.14)';g.fillRect(90,y,400,18);
    g.fillStyle=c;g.fillRect(90,y,400*clamp(v,0,100)/100,18);});
  panelTex.needsUpdate=true;
}
// spawn board (world-space, also the VR title/death panel)
const boardCanvas=document.createElement('canvas');boardCanvas.width=1024;boardCanvas.height=560;
const boardCtx=boardCanvas.getContext('2d');
const boardTex=new THREE.CanvasTexture(boardCanvas);boardTex.colorSpace=THREE.SRGBColorSpace;
const board=new THREE.Mesh(new THREE.PlaneGeometry(3.0,1.64),new THREE.MeshBasicMaterial({map:boardTex}));
board.position.set(0,1.7,29.4);board.rotation.y=Math.PI;scene.add(board);
let boardMode='title';
function drawBoard(){
  const g=boardCtx;
  g.fillStyle='#0a0f1c';g.fillRect(0,0,1024,560);
  g.strokeStyle='#ffdb00';g.lineWidth=6;g.strokeRect(8,8,1008,544);
  g.textAlign='center';
  if(boardMode==='title'){
    g.fillStyle='#ffdb00';g.font='900 92px Arial';g.fillText('UTGÅNG',512,140);
    g.fillStyle='#9fb4d8';g.font='700 30px Arial';g.fillText('A VR IKEA HORROR GAME',512,196);
    g.fillStyle='#e8e2d2';g.font='400 30px Arial';
    g.fillText('Stängningsdags var 22:00. Du är kvar.',512,268);
    g.fillText('Plundra om dagarna. Överlev tre nätter.',512,312);
    g.fillText('Vid gryningen öppnas UTGÅNGEN i norr.',512,356);
    g.fillStyle='#ffdb00';g.font='700 34px Arial';
    g.fillText(renderer.xr.isPresenting?'PULL TRIGGER TO ENTER':'',512,440);
  }else if(boardMode==='dead'){
    g.fillStyle='#e0534a';g.font='900 84px Arial';g.fillText('RESTOCKED.',512,170);
    g.fillStyle='#e8e2d2';g.font='400 32px Arial';
    g.fillText(`Du överlevde till ${PHASES[phaseIdx].label}`,512,260);
    g.fillText(`Köttbullar ätna: ${player.eaten}`,512,306);
    g.fillStyle='#ffdb00';g.font='700 32px Arial';
    g.fillText(renderer.xr.isPresenting?'PULL TRIGGER — TRY THE NIGHT AGAIN':'',512,420);
  }else if(boardMode==='win'){
    g.fillStyle='#7fd17f';g.font='900 84px Arial';g.fillText('UTGÅNG!',512,170);
    g.fillStyle='#e8e2d2';g.font='400 32px Arial';
    g.fillText(`Tid inne: ${Math.floor(totalTime/60)}:${String(Math.floor(totalTime%60)).padStart(2,'0')}`,512,260);
    g.fillText(`Köttbullar ätna: ${player.eaten}`,512,306);
    g.fillStyle='#ffdb00';g.font='700 32px Arial';
    g.fillText(renderer.xr.isPresenting?'PULL TRIGGER — PLAY AGAIN':'',512,420);
  }else{ // playing: status board
    const ph=PHASES[phaseIdx];
    g.fillStyle='#ffdb00';g.font='900 62px Arial';g.fillText(ph.label,512,120);
    g.fillStyle='#e8e2d2';g.font='400 30px Arial';
    if(ph.dawn){g.fillText('UTGÅNGEN ÄR ÖPPEN — norra väggen, grönt ljus.',512,200);}
    else{
      const left=Math.max(0,ph.dur-phaseT);
      g.fillText(ph.night?'Överlev till morgonen.':'Plundra före mörkret.',512,200);
      g.font='900 74px Arial';g.fillStyle='#f4efe4';
      g.fillText(`${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`,512,300);
    }
    g.font='400 26px Arial';g.fillStyle='#9fb4d8';
    g.fillText(`HP ${Math.round(player.hp)}   MAT ${Math.round(player.hunger)}   BATT ${Math.round(player.batt)}`,512,380);
    g.fillText(`köttbullar ätna: ${player.eaten}`,512,420);
  }
  boardTex.needsUpdate=true;
}

// ---------------------------------------------------------------- state flow
const el=id=>document.getElementById(id);
function resetPlayer(){player.hp=100;player.stam=100;player.hunger=100;player.batt=100;
  player.flashlight=false;player.crouch=false;player.iframes=0;player.eaten=0;player.camY=1.6;}
function storeBest(){
  try{
    const b=JSON.parse(localStorage.getItem('utgang-best')||'{"nights":0,"wins":0}');
    b.nights=Math.max(b.nights,nightsCompleted);if(state==='win')b.wins++;
    localStorage.setItem('utgang-best',JSON.stringify(b));return b;
  }catch(e){return{nights:nightsCompleted,wins:state==='win'?1:0};}
}
let nightsCompleted=0;
function startGame(){
  resetPlayer();totalTime=0;nightsCompleted=0;
  rig.position.set(0,0,32);rig.rotation.y=0;pitch=0;
  el('title').classList.add('hidden');el('death').classList.add('hidden');el('win').classList.add('hidden');
  el('hud').classList.remove('hidden');el('crosshair').classList.remove('hidden');
  state='playing';boardMode='playing';
  enterPhase(0);
}
function die(){
  if(state!=='playing')return;
  state='dead';boardMode='dead';const best=storeBest();drawBoard();
  if(document.pointerLockElement)document.exitPointerLock();
  el('retry-night').textContent=PHASES[phaseIdx].label.replace('DAG','DAY').replace('NATT','NIGHT');
  el('death-stats').innerHTML=
    `you survived to ${PHASES[phaseIdx].label.replace('DAG','DAY').replace('NATT','NIGHT')} · meatballs eaten: ${player.eaten}`+
    `<br>best run: ${best.nights} night${best.nights===1?'':'s'} · escapes: ${best.wins}`;
  if(!renderer.xr.isPresenting)el('death').classList.remove('hidden');
}
function retryNight(){
  resetPlayer();
  rig.position.set(0,0,32);rig.rotation.y=0;pitch=0;
  el('death').classList.add('hidden');
  state='playing';boardMode='playing';
  enterPhase(phaseIdx);
}
function winGame(){
  if(state!=='playing')return;
  state='win';boardMode='win';const best=storeBest();drawBoard();
  AudioSys.chime(true);pulseHaptics(0.6,300);
  if(document.pointerLockElement)document.exitPointerLock();
  el('win-stats').innerHTML=
    `time inside: ${Math.floor(totalTime/60)}:${String(Math.floor(totalTime%60)).padStart(2,'0')} · meatballs eaten: ${player.eaten}`+
    `<br>total escapes: ${best.wins}`;
  if(!renderer.xr.isPresenting)el('win').classList.remove('hidden');
}
function fullRestart(){
  for(const it of items)scene.remove(it.group);items.length=0;
  for(const s of staffs)scene.remove(s.g);staffs.length=0;
  ensureStaff(3);freezeStaff();
  if(!obstacles.includes(exitObstacle))obstacles.push(exitObstacle);
  doorsOpen=false;doorAnim=0;
  worldRefs.doors[0].position.x=-1.48;worldRefs.doors[1].position.x=1.48;
  worldRefs.exitSignMat.map=exitSignTexture(false);worldRefs.exitSignMat.needsUpdate=true;
  exitGlow.intensity=0;
  el('win').classList.add('hidden');el('death').classList.add('hidden');
  seedItems(true);
  startGame();
}

// DOM wiring
el('start-desktop').addEventListener('click',()=>{AudioSys.init();startGame();renderer.domElement.requestPointerLock();});
el('retry').addEventListener('click',()=>{AudioSys.init();retryNight();renderer.domElement.requestPointerLock();});
el('again').addEventListener('click',()=>{AudioSys.init();fullRestart();renderer.domElement.requestPointerLock();});
let pendingVr=null;
async function enterVr(action){
  AudioSys.init();pendingVr=action;
  if(renderer.xr.isPresenting){pendingVr();pendingVr=null;return;}
  try{
    const session=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});
    await renderer.xr.setSession(session);
  }catch(e){pendingVr=null;}
}
el('start-vr').addEventListener('click',()=>enterVr(()=>{if(state==='title')startGame();}));
el('death-vr').addEventListener('click',()=>enterVr(()=>retryNight()));
renderer.xr.addEventListener('sessionstart',()=>{
  if(pendingVr){pendingVr();pendingVr=null;}
  boardMode=state==='playing'?'playing':state;drawBoard();
});
renderer.xr.addEventListener('sessionend',()=>{boardMode=state;drawBoard();});
if(navigator.xr&&navigator.xr.isSessionSupported){
  navigator.xr.isSessionSupported('immersive-vr').then(ok=>{
    if(!ok){el('start-vr').textContent='VR NOT DETECTED — QUEST 3 BROWSER ONLY';el('start-vr').style.opacity=0.5;}
  }).catch(()=>{});
}else{el('start-vr').textContent='VR NOT DETECTED — QUEST 3 BROWSER ONLY';el('start-vr').style.opacity=0.5;}

// ---------------------------------------------------------------- shot presets (headless verification)
function applyShot(name){
  const silent=true;
  if(name==='title')return; // leave overlay up, scene renders behind
  startGame();
  if(name==='day'){rig.position.set(-1,0,-22);rig.rotation.y=Math.PI/2;}
  else if(name==='racks'){rig.position.set(4,0,14);rig.rotation.y=0;}
  else if(name==='restaurant'){rig.position.set(-11,0,4);rig.rotation.y=Math.PI/2;}
  else if(name==='night'||name==='staffnight'){
    enterPhase(1);nightF=1;applyLight(1);
    rig.position.set(4,0,6);rig.rotation.y=0;
    player.flashlight=true;
    staffs[0].pos.set(4,0,-1.5);staffs[0].state='chase';staffs[0].yaw=0;staffs[0].walkPhase=1.2;
    staffs[1].pos.set(1.5,0,-5);staffs[1].state='patrol';staffs[1].yaw=0.5;
    AudioSys.setWhisper(0.6);
  }
  else if(name==='dawn'){
    enterPhase(6);nightF=0;applyLight(0);doorAnim=1;
    worldRefs.doors[0].position.x=-1.48-2.9;worldRefs.doors[1].position.x=1.48+2.9;
    rig.position.set(0,0,-26);rig.rotation.y=0;
  }
  if(silent){/* no audio in headless */}
}

// ---------------------------------------------------------------- main loop
const clock=new THREE.Clock();
let vignetteO=0,hudT=0,boardT=0,panelT=0;
function loop(){
  const dt=Math.min(clock.getDelta(),0.05);
  const t=clock.elapsedTime;
  // lighting transitions
  if(Math.abs(nightF-lightTarget)>0.002){applyLight(lerp(nightF,lightTarget,dt*0.4));}
  // doors
  if(doorsOpen&&doorAnim<1){doorAnim=Math.min(1,doorAnim+dt*0.5);
    worldRefs.doors[0].position.x=-1.48-doorAnim*2.9;
    worldRefs.doors[1].position.x=1.48+doorAnim*2.9;}
  // items bob
  for(let i=0;i<items.length;i++){const it=items[i];if(it.taken)continue;
    it.group.position.y=it.baseY+Math.sin(t*2+i*1.7)*0.022;
    it.group.rotation.y+=dt*0.6;}
  if(state==='playing'){
    totalTime+=dt;
    if(renderer.xr.isPresenting)pollVrInput(dt);else desktopMove(dt);
    // vitals
    player.hunger-=dt*100/300;
    if(player.hunger<=0){player.hunger=0;player.hp-=3*dt;if(player.hp<=0){die();}}
    if(player.sprinting&&player.moving)player.stam=Math.max(0,player.stam-26*dt);
    else player.stam=Math.min(100,player.stam+16*dt);
    if(player.flashlight){player.batt-=dt*100/90;
      if(player.batt<=0){player.batt=0;player.flashlight=false;AudioSys.blip(180,0.12,'square',0.1);}}
    player.iframes=Math.max(0,player.iframes-dt);
    flash.intensity=player.flashlight?1.7*(player.batt<15?0.65+0.35*Math.sin(t*38):1):0;
    // phases
    phaseT+=dt;
    const ph=PHASES[phaseIdx];
    if(phaseT>=ph.dur){if(ph.night)nightsCompleted++;enterPhase(phaseIdx+1);}
    // staff
    for(const s of staffs)s.update(dt,ph.night?ph.nightNum:1,t);
    // ambience
    let nd=1e9;for(const s of staffs){const d=Math.hypot(s.pos.x-rig.position.x,s.pos.z-rig.position.z);if(d<nd)nd=d;}
    AudioSys.setWhisper(clamp(1-nd/13,0,1)*nightF);
    AudioSys.clangT-=dt;if(nightF>0.5&&AudioSys.clangT<=0){AudioSys.clang();AudioSys.clangT=rand(4,10);}
    if(player.hp<35){AudioSys.heartT-=dt;if(AudioSys.heartT<=0){AudioSys.heart();AudioSys.heartT=0.55+player.hp/70;}}
    updateInteract();
    // dawn escape check
    if(doorsOpen&&rig.position.z<-34.4&&Math.abs(rig.position.x)<3.4)winGame();
  }
  // damage vignette decay
  vignetteO=Math.max(player.iframes>0?0.85:0,vignetteO-dt*1.4);
  el('vignette').style.opacity=vignetteO;
  // HUD cadence
  hudT-=dt;if(hudT<=0){hudT=0.12;updateHudDom();}
  boardT-=dt;if(boardT<=0){boardT=0.5;if(boardMode==='playing')drawBoard();}
  panelT-=dt;
  if(renderer.xr.isPresenting&&state==='playing'){vrPanel.visible=true;
    if(panelT<=0){panelT=0.25;drawVrPanel();}}
  else vrPanel.visible=false;
  renderer.render(scene,camera);
}

// ---------------------------------------------------------------- boot
buildWorld();
seedItems(true);
ensureStaff(3);freezeStaff();
applyLight(0);updateHudDom();drawBoard();
if(SHOT)applyShot(SHOT);
renderer.setAnimationLoop(loop);
