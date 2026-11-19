import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AU,scenePoint,planetNames,END} from './trajectory.js';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
const palette=[0xef795b,0xeec58f,0x87bad5,0xd67952,0xd7ad86,0xe8cd9c,0x87c8cf,0x749fea];
const radii=[2439.7,6051.8,6371,3389.5,69911,58232,25362,24622];
const sizes=[.15,.22,.26,.2,.65,.55,.39,.37];
export const colors=[0x7ed8ec,0xf6b978];
const orbits=[.39,.72,1,1.52,5.2,9.58,19.2,30.05];
const jupiterIndex=planetNames.indexOf('jupiter');

function makeFlyby(scene,{samples,closest}){
 const path=samples.filter(({time})=>Math.abs(time-closest.time)<=.75);
 const points=path.map(({relative})=>new T.Vector3(...scenePoint(relative)));
 const normal=points[0].clone().cross(points.at(-1)).normalize();
 // Tilt away from the pole-on trajectory view to show Jupiter's cloud bands.
 const nearest=new T.Vector3(...scenePoint(samples.find(({time})=>time===closest.time).relative)).normalize();
 const side=normal.clone().cross(nearest).normalize();
 const view=normal.addScaledVector(side,1.1).normalize();
 const geometry=new LineGeometry().setPositions(points.flatMap(point=>point.toArray()));
 const material=new LineMaterial({color:colors[0],linewidth:2,transparent:true,opacity:.8});
 const line=new Line2(geometry,material);
 line.visible=false;
 scene.add(line);
 return {line,view};
}
function makeSprite(){
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
 const c=canvas.getContext('2d'),g=c.createRadialGradient(64,64,1,64,64,64);
 g.addColorStop(0,'#fff5d7');g.addColorStop(.12,'#ffd48b');g.addColorStop(.27,'#ffae5655');g.addColorStop(1,'#ffa94500');
 c.fillStyle=g;c.fillRect(0,0,128,128);return new T.CanvasTexture(canvas);
}
function texture(index){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
 const ctx=canvas.getContext('2d'),img=ctx.createImageData(512,256),color=new T.Color(palette[index]).convertLinearToSRGB();
 for(let y=0;y<256;y++)for(let x=0;x<512;x++){
   const u=x/512*2*Math.PI,v=y/256*Math.PI, wave=Math.sin(11*u+7*Math.sin(v*9))+Math.sin(u*21-v*26);
   const band=index>=4 ? .85+.15*Math.sin(v*32+.22*wave)+.09*Math.sin(v*67+.1*wave) : .8+.13*wave;
   const land=Math.sin(3*u+v*8)+Math.cos(5*u-v*7)*.5+Math.sin(8*u+v*16)*.25;
   const polar=Math.abs(y-128)>111;
   const c=index===2?(polar?[225,230,230]:land>.45?[91,126,87]:[44,104,163]):[color.r*255,color.g*255,color.b*255];
   const p=(y*512+x)*4;
   for(let k=0;k<3;k++)img.data[p+k]=c[k]*band;
   img.data[p+3]=255;
 }
 ctx.putImageData(img,0,0);const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;return tex;
}
export async function createScene(container,data,base,{video=false}={}){
 const scene=new T.Scene();scene.background=new T.Color('#090c13');
 const camera=new T.PerspectiveCamera(43,1,.005,1700);
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:video,powerPreference:'high-performance'});
 renderer.setPixelRatio(video?1:Math.min(1.65,devicePixelRatio));container.append(renderer.domElement);
 renderer.domElement.setAttribute('aria-label','Interactive three-dimensional Voyager orbit map');
 const controls=new OrbitControls(camera,renderer.domElement);
 controls.enableDamping=!video;controls.dampingFactor=.095;controls.minDistance=.015;controls.maxDistance=540;
 const sphere=new T.SphereGeometry(1,36,24);
 scene.add(new T.HemisphereLight(0xd7e5fc,0x3e312b,1.65));
 const light=new T.PointLight(0xffe5c4,3.6,0,0);scene.add(light);
 const sun=new T.Mesh(sphere,new T.MeshBasicMaterial({color:0xffe1a1}));scene.add(sun);
 const glow=new T.Sprite(new T.SpriteMaterial({map:makeSprite(),color:0xffa855,depthWrite:false,transparent:true,blending:T.AdditiveBlending}));scene.add(glow);
 let random=317;
 const rng=()=>{random=(random*1664525+1013904223)>>>0;return random/4294967296;};
 const stars=[],starColors=[];
 for(let i=0;i<2600;i++){
  const y=rng()*2-1,a=rng()*Math.PI*2,d=Math.sqrt(1-y*y),r=560+rng()*70;
  stars.push(Math.cos(a)*d*r,y*r,Math.sin(a)*d*r);
  const value=.2+rng()*.7;starColors.push(value*.81,value*.88,value);
 }
 const sg=new T.BufferGeometry();
 sg.setAttribute('position',new T.Float32BufferAttribute(stars,3));
 sg.setAttribute('color',new T.Float32BufferAttribute(starColors,3));
 scene.add(new T.Points(sg,new T.PointsMaterial({size:1.5,vertexColors:true,transparent:true,opacity:.68,sizeAttenuation:false})));
 const rings=new T.Group();scene.add(rings);
 for(const r of orbits){
  const points=Array.from({length:144},(_,i)=>{const a=i/144*Math.PI*2;return new T.Vector3(r*Math.cos(a),0,r*Math.sin(a));});
  rings.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0x5d748d,transparent:true,opacity:.22})));
 }
 const boundary=new T.Mesh(new T.SphereGeometry(120,28,18),new T.MeshBasicMaterial({color:0x7798b8,wireframe:true,transparent:true,opacity:.095,depthWrite:false}));
 boundary.visible=false;scene.add(boundary);
 const planets=planetNames.map((name,i)=>{
  const group=new T.Group(),body=new T.Mesh(sphere,new T.MeshStandardMaterial({map:texture(i),roughness:1}));
  group.add(body);scene.add(group);
  if(name==='saturn'){
   const ring=new T.Mesh(new T.RingGeometry(1.26,2.05,80),new T.MeshBasicMaterial({color:0xc6ad8d,side:T.DoubleSide,transparent:true,opacity:.48}));
   ring.rotation.x=Math.PI*.40;body.add(ring);
  }
  return group;
 });
 const flyby=makeFlyby(scene,data.jupiterFlyby);
 const flybyFill=new T.DirectionalLight(0xffe2c0,1.25);
 scene.add(flybyFill,flybyFill.target);
 if(!video){
  const material=planets[jupiterIndex].children[0].material;
  new T.TextureLoader().load(base+'assets/jupiter-map.jpg',map=>{
   map.colorSpace=T.SRGBColorSpace;
   material.map.dispose();
   material.map=map;
   material.needsUpdate=true;
  });
 }
 const probes=[0,1].map(i=>{
  const group=new T.Group(), beacon=new T.Mesh(sphere,new T.MeshBasicMaterial({color:colors[i]}));
  scene.add(group);scene.add(beacon);
  return {group,beacon,model:null};
 });
 let modelLoaded=false;
 try{
  const {scene:model}=await new GLTFLoader().loadAsync(base+'assets/voyager.glb');
  const box=new T.Box3().setFromObject(model),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
  model.position.sub(center);
  const normalized=new T.Group();normalized.add(model);normalized.scale.setScalar(1/Math.max(size.x,size.y,size.z));
  for(const probe of probes){probe.model=normalized.clone(true);probe.group.add(probe.model);}
  modelLoaded=true;
 }catch(error){console.warn('Voyager model unavailable; using track markers',error);}
 const tracks=[0,1].map(i=>{
   const raw=data.tables['voyager'+(i+1)+'_heliocentric_daily'], timeline=[], positions=[];
   const append=table=>{for(let p=0;p<table.length;p+=7){
      const t=table[p];if(t<=timeline.at(-1))continue;
      const state=data.state(i,t); if(!state)continue;
      timeline.push(t);positions.push(...scenePoint(state));
   }};
   if(i)append(data.tables.voyager2_launch);
   append(raw);append(data.tables['voyager'+(i+1)+'_extension']);
   const geometry=new T.BufferGeometry();
   geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
   const full=new T.Line(geometry,new T.LineBasicMaterial({color:colors[i],transparent:true,opacity:.22}));
   const current=new T.BufferGeometry();current.setAttribute('position',geometry.getAttribute('position'));current.setDrawRange(0,0);
   const bright=new T.Line(current,new T.LineBasicMaterial({color:colors[i],transparent:true,opacity:.95}));
   scene.add(full,bright);return {full,bright,timeline};
 });
 const labelLayer=document.createElement('div');labelLayer.className='scene-labels';container.append(labelLayer);
 const labels=['SUN','VOYAGER 1','VOYAGER 2',...planetNames.map(s=>s.toUpperCase())].map((text,i)=>{
  const node=document.createElement('span');node.className='object-label';
  node.textContent=text;if(i===1)node.style.setProperty('--object','#7ed8ec');if(i===2)node.style.setProperty('--object','#f6b978');
  labelLayer.append(node);return node;
 });
 const p=new T.Vector3();
 function label(node,position,visible){
  p.copy(position).project(camera);
  node.hidden=!visible||p.z<-1||p.z>1||Math.abs(p.x)>.98||Math.abs(p.y)>.98;
  if(!node.hidden)node.style.transform=`translate(${(p.x*.5+.5)*container.clientWidth+10}px,${(.5-p.y*.5)*container.clientHeight-10}px)`;
 }
 function fit(){
  const {clientWidth:w,clientHeight:h}=container;
  if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 }
 new ResizeObserver(fit).observe(container);fit();
 function reset(overview=false){
  if(overview){
   const points=[0,1].map(i=>scenePoint(data.state(i,END)));
   controls.target.set(...points[0].map((value,i)=>(value+points[1][i])/3));
   camera.position.copy(controls.target).add(new T.Vector3(303,153,-75));
  }
  else{camera.position.set(26,33,64);controls.target.set(0,0,0);}
  controls.update();
 }
 reset();
 let tracked=null, previous=null, desired=null;
 function follow(id,t){
  tracked=id;previous=null;
  const state=data.state(id,t);
  if(state){const v=new T.Vector3(...scenePoint(state));desired={target:v,position:v.clone().add(new T.Vector3(9,6,15))};}
 }
 function frame(t,{scientific=false,visible=[true,true],heliopause=false,shot=null,jupiterCloseUp=false}={}){
  const s=[data.state(0,t),data.state(1,t)];
  const relative=jupiterCloseUp&&data.jupiterFlyby.relative(t);
  const close=Boolean(relative);
  controls.minDistance=close ? .0001 : .015;
  const near=close ? .0001 : .005;
  if(camera.near!==near){camera.near=near;camera.updateProjectionMatrix();}
  flyby.line.visible=close&&visible[0];
  flybyFill.visible=close;
  rings.visible=!close;
  if(close){
   const jupiter=new T.Vector3(...scenePoint(data.planet('jupiter',t)));
   const offset=new T.Vector3(...scenePoint(relative));
   const separation=offset.length();
   const distance=Math.max(.0036,separation*Math.max(2.1,2.35/camera.aspect));
   const up=new T.Vector3(0,1,0).addScaledVector(flyby.view,-flyby.view.y).normalize();
   const headroom=camera.aspect<1.15 ? .15 : .065;
   controls.target.copy(jupiter).addScaledVector(offset,.5).addScaledVector(up,-distance*headroom);
   camera.position.copy(controls.target).addScaledVector(flyby.view,distance);
   flyby.line.position.copy(jupiter);
   flybyFill.position.copy(camera.position);
   flybyFill.target.position.copy(jupiter);
  }else if(shot){
   const position=s[shot.event.target]||data.planet('earth',t);
   const target=new T.Vector3(...scenePoint(position));
   controls.target.copy(target);camera.position.copy(target).add(new T.Vector3(...shot.offset));controls.update();
  }else if(tracked!==null&&s[tracked]){
   const current=new T.Vector3(...scenePoint(s[tracked]));
   if(desired){
    desired.position.add(current.clone().sub(desired.target));desired.target.copy(current);
    controls.target.lerp(desired.target,.12);camera.position.lerp(desired.position,.12);
    if(controls.target.distanceTo(desired.target)<.015){desired=null;previous=current;}
   }else if(previous){const offset=current.clone().sub(previous);controls.target.add(offset);camera.position.add(offset);previous=current;}
   else previous=current;
  }
  const distance=camera.position.distanceTo(controls.target);
  controls.update();
  sun.scale.setScalar(scientific?695700/AU:Math.max(.18,distance*.008));
  glow.scale.setScalar(sun.scale.x*7);
  boundary.visible=heliopause&&!close;
  for(let i=0;i<planets.length;i++){
   const state=data.planet(planetNames[i],t),group=planets[i];
   group.visible=!!state&&(!close||i===jupiterIndex);
   if(state)group.position.set(...scenePoint(state));
   if(close&&i===jupiterIndex)group.scale.setScalar(radii[i]/AU*(scientific?1:1.55));
   else group.scale.setScalar(scientific?radii[i]/AU:sizes[i]*Math.max(.16,Math.min(1,distance/40)));
   group.rotation.y=t*.19+i;
  }
  for(let i=0;i<2;i++){
   const {group,beacon}=probes[i],track=tracks[i];
   const shown=!!s[i]&&visible[i]&&(!close||i===0);
   group.visible=shown&&!scientific;
   beacon.visible=shown&&!group.visible;
   if(s[i]){group.position.set(...scenePoint(s[i]));beacon.position.copy(group.position);group.rotation.set(.22,-.64+i*1.7,.1);}
   group.scale.setScalar(close ? distance * .15 : video ? distance * .13 : Math.max(.12, distance * .027));
   beacon.scale.setScalar(distance*.003);
   if(!modelLoaded){group.visible=false;beacon.visible=shown;}
   track.full.visible=visible[i]&&!close;track.bright.visible=visible[i]&&!close;
   let lo=0,hi=track.timeline.length;
   while(lo<hi){const m=(lo+hi)>>1;if(track.timeline[m]<=t)lo=m+1;else hi=m;}
   track.bright.geometry.setDrawRange(0,lo);
  }
  renderer.render(scene,camera);
  label(labels[0],sun.position,!close);
  probes.forEach(({group},i)=>label(labels[i+1],group.position,!!s[i]&&visible[i]&&(!close||i===0)));
  planets.forEach((planet,i)=>{
   const anchor=close&&i===jupiterIndex
    ? new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(planet.scale.x).add(planet.position)
    : planet.position;
   label(labels[i+3],anchor,planet.visible&&distance<95&&[2,4,5,6,7].includes(i));
  });
 }
 return {frame,reset(overview){tracked=null;previous=null;desired=null;reset(overview);},
  follow,clearFollow(){tracked=null;previous=null;desired=null;},modelLoaded,canvas:renderer.domElement};
}
