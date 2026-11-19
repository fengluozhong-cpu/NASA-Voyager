import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {chromium} from 'playwright-core';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.glb':'model/gltf-binary','.bin':'application/octet-stream','.mp3':'audio/mpeg','.txt':'text/plain','.md':'text/plain; charset=utf-8'};
export async function browserHarness(url){
 const launch={executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']};
 if(url){
  const proxy=process.env.HTTPS_PROXY;
  const browser=await chromium.launch({...launch,...(proxy?{proxy:{server:proxy}}:{})});
  return {browser,url,close:()=>browser.close()};
 }
 const root=resolve('dist');
 const server=createServer(async(req,res)=>{
   const url=new URL(req.url,'http://localhost');
   const path=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
   if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
   try{const body=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'}).end(body);}
   catch{res.writeHead(404).end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const browser=await chromium.launch(launch);
  return {browser,url:'http://127.0.0.1:'+server.address().port,close:async()=>{await browser.close();server.close();}};
 }catch(error){server.close();throw error;}
}
