import './style.css';
import {loadData,START,END,AU,C,dateUTC} from './trajectory.js';
import {createScene} from './scene.js';
import {resolveEvents,shotAt,shots} from './timeline.js';
const base=import.meta.env.BASE_URL;
const app=document.querySelector('#app');
const video=new URLSearchParams(location.search).has('film');
const $=(selector)=>document.querySelector(selector);
const num=(value,digits=2)=>value.toLocaleString('en-US',{maximumFractionDigits:digits,minimumFractionDigits:digits});
const iso=t=>dateUTC(t).toISOString().slice(0,10);
const date=t=>dateUTC(t).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).toUpperCase();
const total=shots.reduce((sum,shot)=>sum+shot.seconds,0);
const images=new Set(['launch','jupiter','saturn','uranus','neptune','pale','interstellar','milestone']);
const glyph='<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="5"/><ellipse cx="16" cy="16" rx="15" ry="7" transform="rotate(-35 16 16)"/><circle cx="24" cy="7" r="1.8" class="orb"/></svg>';
function caption(event){
 const el=$('#chapter');
 el.innerHTML=`<div class="chapter-copy"><p class="eyebrow">${event.date.slice(0,4)} / MISSION LOG</p><h2>${event.title}</h2><p>${event.description}</p><a href="${event.source}" target="_blank" rel="noopener">NASA reference</a></div>${images.has(event.asset)?`<img src="${base}assets/${event.asset}.jpg" alt="${event.title} archival image" loading="lazy">`:''}`;
 el.querySelector('img')?.addEventListener('error',e=>e.target.remove(),{once:true});
}
if(video){
 app.innerHTML='<main class="film"><div id="space"></div><div class="film-top"><span>VOYAGER</span><span>NASA / JPL HORIZONS</span></div><div class="film-caption"><div id="film-date"></div><h1 id="film-title"></h1><p id="film-zh"></p><p id="film-description"></p></div><img id="film-image" alt="NASA archival image" hidden><div id="film-fade"></div></main>';
}else{
 app.innerHTML=`<header class="top"><div class="brand">${glyph}<span>VOYAGER<span class="brand-sub">MISSION ATLAS</span></span></div><nav aria-label="Mode"><button id="explore" aria-pressed="true">Explore</button><button id="journey" aria-pressed="false">Journey</button></nav><a href="#sources" id="sources-link">Data &amp; sources</a></header>
 <main class="wrap"><div class="intro"><p class="eyebrow"><i></i> NASA / JPL HORIZONS <span>1977 — 2026</span></p><h1>49 Years Into <em>the Unknown</em></h1><p>Follow Voyager 1 and 2 through nearly five decades of deep space.</p><p class="zh" lang="zh">旅行者：飞向未知的 49 年</p></div>
 <div class="dashboard"><section class="atlas" aria-label="Orbit explorer"><div class="scene-top"><span><i></i> HELIOCENTRIC VIEW</span><span>J2000 ECLIPTIC</span></div>
 <div id="space"><p id="loading" role="status">Loading NASA trajectory data…</p></div>
 <div class="scene-hud"><div class="legend"><label><input id="show-v1" type="checkbox" checked><i></i> Voyager 1</label><label><input id="show-v2" type="checkbox" checked><i></i> Voyager 2</label></div><button id="reset" title="Reset camera">⟲ <span>Reset view</span></button></div>
 <div class="scale"><label for="scale">Scale</label><select id="scale"><option value="presentation">Presentation</option><option value="scientific">Scientific</option></select><label class="boundary"><input type="checkbox" id="boundary"> Heliopause</label></div>
 </section>
 <aside class="telemetry" aria-label="Telemetry"><header><span class="eyebrow"><i></i> TELEMETRY</span><span>UTC</span></header><div class="probe-tabs" role="group" aria-label="Select spacecraft"><button id="v1" aria-pressed="true"><i></i> Voyager 1</button><button id="v2" aria-pressed="false"><i></i> Voyager 2</button></div>
 <div id="readings" aria-live="off"><p>Waiting for ephemerides</p></div><button id="track" aria-pressed="false">◎ Track spacecraft</button></aside></div>
 <section class="timeline" aria-label="Mission timeline"><div class="time-head"><div><div class="eyebrow">MISSION TIMELINE</div><time id="current-date">—</time></div><div class="transport"><button id="play" aria-label="Play">▶︎</button><label for="speed">Rate</label><select id="speed" aria-label="Playback rate"><option value="1">1 day/s</option><option value="30">30 days/s</option><option value="180" selected>180 days/s</option><option value="730">730 days/s</option></select></div></div>
 <input id="time" type="range" min="${START}" max="${END}" value="${END}" step="0.0416666667" aria-label="Mission date"><div class="ticks"><span>1977</span><span>1985</span><span>1995</span><span>2005</span><span>2015</span><span>2026</span></div>
 <div class="events" id="events" aria-label="Mission events"></div></section>
 <article id="chapter" class="chapter"></article>
 <details id="sources" class="sources"><summary>Data, scales &amp; credits</summary><p>Spacecraft and planets use NASA/JPL Horizons geometric positions in the Sun-centered J2000 ecliptic frame. Dates shown in UTC are converted from TDB. The Earth range is calculated by subtracting positions at the same epoch. Light time is geometric range / c.</p><p>Presentation scale enlarges the Sun, planets and spacecraft. In scientific scale, physical body radii use the same AU scale as positions. Probe dots, circular orbit guides, and the optional 120 AU heliopause sphere are visual guides. The heliopause sphere is schematic. Planet surface textures are artistic.</p><p>Hourly samples are preferred at covered events and near the endpoint. Positions and velocities are interpolated component by component. Early flyby trajectories are approximate mission-design solutions. The 2026 end segment is a Horizons model prediction.</p><div class="source-links"><a href="${base}data/manifest.json">Dataset and validation</a><a href="${base}data/archive-meta.json">Archive query provenance</a><a href="https://science.nasa.gov/resource/voyager-3d-model/">NASA model</a><a href="https://science.nasa.gov/mission/voyager/timeline/">NASA timeline</a><a href="${base}data/asset-credits.md">Asset credits</a></div></details>
 </main><footer class="wrap"><span>VOYAGER / MISSION ATLAS</span><span>Independent project · Data and archives courtesy of NASA / JPL</span></footer>`;
}
async function init(){
 const data=await loadData(base),chapters=resolveEvents(data);
 const scene=await createScene($('#space'),data,base,{video});
 if(video){
  const photos=await Promise.all([...images].map(async asset=>{
   const img=new Image();img.src=base+'assets/'+asset+'.jpg';
   try{await img.decode();return [asset,img.src];}catch{return [asset,null];}
  }));
  const photoMap=Object.fromEntries(photos);
  window.renderFrame=(frame,fps)=>{
   const shot=shotAt(frame/fps,chapters),event=shot.event,t=Math.min(END,Math.max(START,shot.time));
   scene.frame(t,{shot,heliopause:shot.index===7||shot.index===8});
   $('#film-date').textContent=date(t)+' UTC · '+(shot.index<7?'OUTER PLANETS':'INTERSTELLAR MISSION');
   $('#film-title').textContent=shot.index===0?'49 Years Into the Unknown':event.title;
   $('#film-zh').textContent=event.zh+' · '+event.subtitle;
   $('#film-description').textContent=event.description;
   const image=$('#film-image');
   image.hidden=!photoMap[event.asset];
   if(!image.hidden&&image.src!==photoMap[event.asset])image.src=photoMap[event.asset];
   image.style.opacity=Math.min(.92,Math.max(0,(shot.progress-.12)*6),Math.max(0,(1-shot.progress)*8));
   $('#film-fade').style.opacity=Math.max(0,1-shot.progress*18,1-(1-shot.progress)*18)*.7;
  };
  window.videoDuration=total;window.renderFrame(0,30);return;
 }
 $('#loading').remove();
 let t=END,selected=0,active=chapters.length-1,visible=[true,true],playing=false,journey=false,track=false,seconds=0;
 let latest=performance.now(),lastUI=0;
 scene.reset(true);
 function readouts(){
   const s=data.state(selected,t),earth=data.distance(selected,t);
   const event=chapters.filter(e=>e.target===selected&&e.time<=t).at(-1);
   $('#current-date').textContent=date(t)+' UTC';
   $('#time').value=t;$('#time').setAttribute('aria-valuetext',iso(t)+' UTC');
   $('#time').style.setProperty('--progress',((t-START)/(END-START)*100)+'%');
   const r=s?Math.hypot(...s.slice(0,3)):null;
   const phase=selected===0?(t>=chapters[7].time?'Interstellar mission':t>=chapters[2].time?'Outbound cruise':'Planetary mission'):(t>=chapters[8].time?'Interstellar mission':t>=chapters[5].time?'Outbound cruise':'Planetary mission');
   $('#readings').innerHTML=s&&earth!==null?`<dl><div><dt>Distance from Sun</dt><dd>${num(r/AU)} <small>AU</small></dd><p>${num(r,0)} km</p></div><div><dt>Distance from Earth</dt><dd>${num(earth/AU)} <small>AU</small></dd><p>${num(earth,0)} km</p></div><div class="paired"><div><dt>Light time</dt><dd>${num(earth/C/3600)} <small>h</small></dd></div><div><dt>Speed</dt><dd>${num(Math.hypot(...s.slice(3)))} <small>km/s</small></dd></div></div></dl><p class="phase"><strong>${phase}</strong><span>${event?.title||'Launch & early cruise'}</span></p><details class="coordinates"><summary>Position and velocity</summary><div>${s.map((v,i)=>`<span>${['X','Y','Z','VX','VY','VZ'][i]} ${num(v,i<3?0:3)} ${i<3?'km':'km/s'}</span>`).join('')}</div></details>`:'<p class="missing">No spacecraft ephemeris at this date.</p>';
   const detailsOpened=$('#readings').dataset.open==='true';
   const details=$('.coordinates');
   if(details){details.open=detailsOpened;details.addEventListener('toggle',()=>{if(details.isConnected)$('#readings').dataset.open=details.open;});}
 }
 function playback(value){playing=value;$('#play').textContent=value?'❚❚':'▶︎';$('#play').setAttribute('aria-label',value?'Pause':'Play');}
 function select(i){
   selected=i;$('#v1').setAttribute('aria-pressed',i===0);$('#v2').setAttribute('aria-pressed',i===1);
   if(track)scene.follow(i,t);
   readouts();
 }
 function mark(i){
   active=i;caption(chapters[i]);document.querySelectorAll('.event').forEach((b,j)=>b.setAttribute('aria-current',i===j?'true':'false'));
 }
 function mode(value){
   journey=value;$('#journey').setAttribute('aria-pressed',value);$('#explore').setAttribute('aria-pressed',!value);
   if(value){track=false;$('#track').setAttribute('aria-pressed',false);scene.clearFollow();seconds=0;playback(true);}
   else playback(false);
 }
 function jump(i){
   if(journey)mode(false);playback(false);
   t=chapters[i].time;select(chapters[i].target);mark(i);
   track=true;$('#track').setAttribute('aria-pressed',true);scene.follow(selected,t);
 }
 $('#events').innerHTML=chapters.map(e=>`<button class="event"><span>${e.date.slice(0,4)}</span>${e.title}</button>`).join('');
 document.querySelectorAll('.event').forEach((el,i)=>el.onclick=()=>jump(i));
 $('#explore').onclick=()=>mode(false);$('#journey').onclick=()=>mode(true);
 $('#v1').onclick=()=>select(0);$('#v2').onclick=()=>select(1);
 $('#track').onclick=()=>{if(journey)mode(false);track=!track;$('#track').setAttribute('aria-pressed',track);if(track){
    visible[selected]=true;$(selected?'#show-v2':'#show-v1').checked=true;scene.follow(selected,t);
   }else scene.clearFollow();};
 $('#reset').onclick=()=>{if(journey)mode(false);track=false;$('#track').setAttribute('aria-pressed',false);scene.reset(t>2451545);};
 $('#show-v1').onchange=e=>{visible[0]=e.target.checked;};$('#show-v2').onchange=e=>{visible[1]=e.target.checked;};
 $('#scale').onchange=e=>{e.target.title=e.target.value==='scientific'?'Body radii at the same scale as coordinates':'Body radii exaggerated for visibility';};
 $('#time').oninput=e=>{if(journey)mode(false);playback(false);t=Number(e.target.value);readouts();};
 $('#play').onclick=()=>{if(!playing&&!journey&&t>=END-.001)t=START;if(journey&&seconds>=total)seconds=0;playback(!playing);};
 mark(active);readouts();
 window.voyager={data,scene,chapters};
 function frame(now){
  const delta=Math.min(.1,(now-latest)/1000);latest=now;
  let shot=null;
  if(journey){
   if(playing)seconds=Math.min(total,seconds+delta);
   shot=shotAt(seconds,chapters);t=Math.max(START,Math.min(END,shot.time));
   if(active!==shot.index){mark(shot.index);select(shot.event.target);}
   if(seconds>=total&&playing)playback(false);
  }else if(playing){
   t=Math.min(END,t+Number($('#speed').value)*delta);
   if(t>=END)playback(false);
  }
  if((playing||journey)&&now-lastUI>120){readouts();lastUI=now;}
  scene.frame(t,{scientific:$('#scale').value==='scientific',visible,heliopause:$('#boundary').checked||journey&&[7,8].includes(active),shot});
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}
init().catch(error=>{
 console.error(error);
 const element=$('#loading')||$('#space');
 element.innerHTML='<strong>Unable to open the atlas.</strong><p>Check WebGL support and reload the page to retry.</p>';
 element.classList.add('load-error');
});
