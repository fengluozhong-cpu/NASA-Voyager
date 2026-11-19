import {spawn} from 'node:child_process';
import {finished} from 'node:stream/promises';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {dirname} from 'node:path';
import {browserHarness} from './browser.mjs';
import {shots,events} from '../src/timeline.js';
const {values:v}=parseArgs({options:{width:{type:'string',default:'1920'},height:{type:'string',default:'1080'},
 fps:{type:'string',default:'30'},start:{type:'string',default:'0'},duration:{type:'string',default:'90'},out:{type:'string',default:'artifacts/voyager.mp4'}}});
const [width,height,fps,start,duration]=[v.width,v.height,v.fps,v.start,v.duration].map(Number);
if(![width,height,fps].every(n=>Number.isInteger(n)&&n>0)||width%2||height%2||!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<=0)
 throw Error('Use positive even dimensions, a positive integer fps, start >= 0 and duration > 0.');
await mkdir(dirname(v.out),{recursive:true});
const harness=await browserHarness();
let ff;
const fmt=(s)=>new Date(Math.round(s*1000)).toISOString().slice(11,23).replace('.',',');
try{
 const page=await harness.browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 page.on('pageerror',error=>console.error(error.message));
 await page.goto(harness.url+'/?film=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof window.renderFrame==='function',{},{timeout:45000});
 const total=await page.evaluate(()=>window.videoDuration);
 if(start>=total)throw Error('Start is beyond the storyboard duration.');
 const count=Math.min(Math.round(duration*fps),Math.round((total-start)*fps));
 ff=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0',
  '-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',v.out],{stdio:['pipe','ignore','inherit']});
 const exited=once(ff,'exit');
 const cdp=await page.context().newCDPSession(page);
 for(let i=0;i<count;i++){
  await page.evaluate(([f,r])=>window.renderFrame(f,r),[i+Math.round(start*fps),fps]);
  const {data}=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:91,fromSurface:true});
  if(!ff.stdin.write(Buffer.from(data,'base64')))await once(ff.stdin,'drain');
  if((i+1)%Math.max(fps*5,1)===0||i+1===count)console.log(`Rendered ${i+1}/${count} frames`);
 }
 ff.stdin.end();await finished(ff.stdin);
 const [code]=await exited;if(code!==0)throw Error('FFmpeg failed: '+code);
 let cursor=0,seq=0,subs='';
 for(const shot of shots){
  const a=Math.max(0,cursor-start),b=Math.min(count/fps,cursor+shot.seconds-start),e=events[shot.event];
  if(a<b)subs+=`${++seq}\n${fmt(a)} --> ${fmt(b)}\n${e.description}\n${e.subtitle}\n\n`;
  cursor+=shot.seconds;
 }
 await writeFile(v.out.replace(/\.mp4$/i,'.srt'),subs);
 console.log(v.out);
}finally{
 if(ff&&ff.exitCode===null)ff.kill();
 await harness.close();
}
