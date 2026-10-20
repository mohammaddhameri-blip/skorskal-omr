import {cpSync,copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'../..');
const dst=join(root,'android/app/src/main/assets/web');
mkdirSync(dst,{recursive:true});
for (const name of ['index.html','app.js','style.css','vision.js','workbook.js','template.json','manifest.webmanifest','Skorskal_A4_OMR_40.pdf']) {
  const from=join(root,name);
  if(!existsSync(from)) throw new Error('Missing website asset: '+name);
  copyFileSync(from,join(dst,name));
}
cpSync(join(root,'assets'),join(dst,'assets'),{recursive:true});

const appFile=join(dst,'app.js');
let script=readFileSync(appFile,'utf8');
const originalStart=script.indexOf("function download(data,name,type='text/plain'){");
if(originalStart < 0) throw new Error('Could not locate Skorskal download() in app.js');
const originalEnd=script.indexOf('\n', originalStart);
if(originalEnd < 0) throw new Error('Unexpected app.js download() format');
const nativeDownload=`function download(data,name,type='text/plain'){
  const blob=data instanceof Blob?data:new Blob([data],{type});
  if(window.SkorskalAndroid && typeof window.SkorskalAndroid.saveBase64==='function'){
    const reader=new FileReader();
    reader.onload=()=>window.SkorskalAndroid.saveBase64(String(reader.result).split(',')[1],name,blob.type||type);
    reader.onerror=()=>alert('Could not prepare the export file.');
    reader.readAsDataURL(blob);
    return;
  }
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}`;
script=script.slice(0,originalStart)+nativeDownload+script.slice(originalEnd);
const swLine="if('serviceWorker'in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});";
if(!script.includes(swLine)) throw new Error('Could not locate service worker startup');
script=script.replace(swLine,'// Offline assets are bundled in this APK. No web service worker is needed.');
writeFileSync(appFile,script,'utf8');

const html=join(dst,'index.html');
let h=readFileSync(html,'utf8');
h=h.replace('v1.2 <span>·</span> On-device marking','Android v0.1.0 <span>·</span> On-device marking');
writeFileSync(html,h,'utf8');
console.log('Bundled Skorskal website assets with native exports and camera support.');
