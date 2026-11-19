export const AU=149597870.7, C=299792.458, DAY=86400000, UNIX_JD=2440587.5;
export const jd=(date)=>Date.parse(date.length===10?date+'T00:00:00Z':date)/DAY+UNIX_JD;
export const START=jd('1977-08-20'), END=jd('2026-11-19');
const leaps=['1972-01-01','1972-07-01','1973-01-01','1974-01-01','1975-01-01','1976-01-01','1977-01-01','1978-01-01','1979-01-01','1980-01-01','1981-07-01','1982-07-01','1983-07-01','1985-07-01','1988-01-01','1990-01-01','1991-01-01','1992-07-01','1993-07-01','1994-07-01','1996-01-01','1997-07-01','1999-01-01','2006-01-01','2009-01-01','2012-07-01','2015-07-01','2017-01-01'].map(jd);
const ttOffset=(utc)=>41.184+leaps.filter(d=>d<=utc).length;
const periodic=(t)=>{const g=(357.53+.9856003*(t-2451545))*Math.PI/180;return .001657*Math.sin(g)+.000022*Math.sin(2*g);};
export const utcToTdb=(utc)=>utc+(ttOffset(utc)+periodic(utc))/86400;
export function dateUTC(t){
  const guess=t-69.184/86400;
  return new Date(Math.round((t-UNIX_JD)*DAY-(ttOffset(guess)+periodic(t))*1000));
}
export function sample(table,t,columns=7){
  if(!table||t<table[0]||t>table.at(-columns))return null;
  let lo=0,hi=table.length/columns-1;
  while(hi-lo>1){const mid=(hi+lo)>>1;if(table[mid*columns]<=t)lo=mid;else hi=mid;}
  const a=lo*columns,b=hi*columns;
  const gap=table[b]-table[a];
  const f=gap?(t-table[a])/gap:0;
  return Array.from({length:columns-1},(_,i)=>table[a+i+1]+f*(table[b+i+1]-table[a+i+1]));
}
const names=['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'];
export const planetNames=names;
const eventKeys=[['v1_jupiter','v1_saturn','v1_heliopause'],['v2_saturn','v2_uranus','v2_neptune']];
const stateKeys=(i)=>{
  const name='voyager'+(i+1);
  return [...eventKeys[i],name+'_extension',name+'_heliocentric_hourly_recent',
    ...(i?['voyager2_launch']:[]),name+'_heliocentric_daily'];
};
export async function loadData(base){
  const response=await fetch(base+'data/manifest.json');
  if(!response.ok)throw Error('Horizons manifest unavailable');
  const manifest=await response.json(), tables={};
  const keys=[...new Set([...names,'earth_extension',...stateKeys(0),...stateKeys(1)])];
  await Promise.all(keys.map(async key=>{
    const spec=manifest.datasets[key];
    const r=await fetch(base+'data/'+spec.file);
    if(!r.ok)throw Error('Could not load '+key);
    const bytes=await r.arrayBuffer();
    if(bytes.byteLength!==spec.rows*spec.columns*8)throw Error('Invalid trajectory size: '+key);
    const view=new DataView(bytes);
    tables[key]=Float64Array.from({length:bytes.byteLength/8},(_,i)=>view.getFloat64(i*8,true));
  }));
  const state=(i,t)=>{
    for(const key of stateKeys(i)){
      const row=sample(tables[key],t);
      if(row)return row;
    }
    return null;
  };
  const planet=(name,t)=>name==='earth'?(sample(tables.earth_extension,t)||sample(tables.earth,t)):sample(tables[name],t);
  const distance=(i,t)=>{
    const s=state(i,t),e=planet('earth',t);
    return s&&e?Math.hypot(s[0]-e[0],s[1]-e[1],s[2]-e[2]):null;
  };
  let a=jd('2026-11-13'),b=END, milestone=null;
  if(distance(0,a)<C*86400&&distance(0,b)>=C*86400){
    for(let i=0;i<30;i++){const m=(a+b)/2;if(distance(0,m)>=C*86400)b=m;else a=m;}
    milestone=b;
  }
  return {manifest,tables,state,planet,distance,milestone};
}
export const scenePoint=(s)=>[s[0]/AU,s[2]/AU,-s[1]/AU];
