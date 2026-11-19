import {jd,utcToTdb,dateUTC} from './trajectory.js';
const nasa='https://science.nasa.gov/mission/voyager/timeline/';
export const events=[
 ['1977-08-20','Launch','启程',1,'Voyager 2 launched first, followed by Voyager 1 on September 5.','旅行者 2 号率先升空，1 号于 9 月 5 日发射。源星历从稍晚的首个可用采样点开始。','launch'],
 ['1979-03-05','Jupiter encounter','飞掠木星',0,'Voyager 1 passed Jupiter and revealed Io’s active volcanoes.','旅行者 1 号掠过木星，观测到木卫一的活火山。','jupiter'],
 ['1980-11-12','Saturn encounter · V1','飞掠土星 · V1',0,'Saturn and Titan redirected Voyager 1 out of the plane of the planets.','土星与泰坦飞掠改变了旅行者 1 号的方向，使它离开行星轨道面。','saturn'],
 ['1981-08-25','Saturn encounter · V2','飞掠土星 · V2',1,'Voyager 2 used Saturn’s gravity to continue toward Uranus.','旅行者 2 号借助土星引力飞往天王星。','saturn'],
 ['1986-01-24','Uranus encounter','飞掠天王星',1,'Voyager 2 made the first spacecraft flyby of Uranus.','旅行者 2 号首次近距离飞掠天王星。','uranus'],
 ['1989-08-25','Neptune encounter','飞掠海王星',1,'The last planetary encounter sent Voyager 2 south of the ecliptic.','最后一次行星飞掠将旅行者 2 号送往黄道面南侧。','neptune'],
 ['1990-02-14','Pale Blue Dot','暗淡蓝点',0,'Voyager 1 looked back and photographed Earth from nearly 6 billion km away.','旅行者 1 号回望地球，在约 60 亿公里外拍下这张照片。','pale'],
 ['2012-08-25','Interstellar space · V1','进入星际空间 · V1',0,'Voyager 1 crossed the heliopause into the interstellar medium.','旅行者 1 号穿越日球层顶，进入星际介质。','interstellar'],
 ['2018-11-05','Interstellar space · V2','进入星际空间 · V2',1,'Voyager 2 became the second spacecraft to cross the heliopause.','旅行者 2 号成为第二艘穿越日球层顶的航天器。','interstellar'],
 ['2026-11-13','One light-day','一光日',0,'Geometric Earth range reaches the distance light travels in 24 hours.','由 Horizons 同历元位置计算，旅行者 1 号与地球之间的几何距离达到光传播 24 小时的距离。','milestone']
].map(([date,title,zh,target,description,subtitle,asset],i)=>({date,title,zh,target,description,subtitle,asset,
  time:utcToTdb(jd(date)+(i===0?16.01/24:i===5?4/24:i===6?12/24:.5)),
  source:i===9?'https://www.nasa.gov/news-release/nasa-invites-media-public-to-join-voyager-1-one-light-day-activities/':nasa}));
export const shots=[
 {event:0,seconds:12,span:90,near:4,far:10},
 {event:1,seconds:8,span:6,near:3,far:6},
 {event:2,seconds:8,span:6,near:4,far:7},
 {event:3,seconds:7,span:6,near:4,far:8},
 {event:4,seconds:7,span:6,near:5,far:10},
 {event:5,seconds:8,span:6,near:6,far:12},
 {event:6,seconds:15,span:24,near:18,far:32},
 {event:7,seconds:7,span:150,near:28,far:46},
 {event:8,seconds:7,span:150,near:30,far:48},
 {event:9,seconds:11,span:1,near:44,far:68}
];
export function resolveEvents(data){
  return events.map((event,i)=>i===9&&data.milestone?{...event,time:data.milestone,date:dateUTC(data.milestone).toISOString().slice(0,10)}:event);
}
export function shotAt(seconds,chapters){
  let index=0;
  for(;index<shots.length-1 && seconds>=shots[index].seconds;index++) seconds-=shots[index].seconds;
  const shot=shots[index],event=chapters[shot.event],progress=Math.min(1,Math.max(0,seconds/shot.seconds));
  const ease=(1-Math.cos(Math.PI*progress))/2;
  const time=event.time+shot.span*(shot.event===0?ease:ease-.5);
  const angle=2.3+ease*.7+index*.53;
  const distance=shot.near+(shot.far-shot.near)*ease;
  return {event,time,progress,index,offset:[Math.cos(angle)*distance,distance*.49,Math.sin(angle)*distance]};
}
