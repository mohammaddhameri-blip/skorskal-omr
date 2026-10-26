import {settings,buildTemplate,sheetSVG,sheetCanvas} from './sheet.js';
import {imageToPixels,findAnchors,straighten,analyze} from './vision.js';
import {resultsCSV,createRosterWorkbook} from './workbook.js';
const $=id=>document.getElementById(id),all=s=>[...document.querySelectorAll(s)];
const yearChoices=['1','2','3','4','5','6'];
const subjects={'00':'Pendidikan Muzik (proposed)','01':'Bahasa Melayu','02':'Bahasa Inggeris','03':'Mathematics (proposed)','04':'Science (proposed)','05':'Pendidikan Islam (proposed)','06':'Pendidikan Moral (proposed)','07':'Sejarah (proposed)','08':'RBT (proposed)','09':'Pendidikan Seni Visual (proposed)','10':'PJPK (proposed)'};
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(`skorskal_${key}`))||fallback;}catch{return fallback;}};
const persist=(key,value)=>localStorage.setItem(`skorskal_${key}`,JSON.stringify(value));
let baseTemplate,config=settings(load('sheet',{}));
let template,keys=load('keys',{}),records=load('results',[]),workCanvas=null,corners=null,warp=null,scanned=null,current=null,
  stream=null,adjusting=false,selectedCorner=-1,sample=false,imageSource=null,workbookBuffer=null,workbookFileName='';
let toastTimer;
// Theme preference is local to this browser / APK, independent from exam records.
const themeButton=$('themeToggle');
function setTheme(mode){
  const dark=mode==='dark';
  document.documentElement.dataset.theme=dark?'dark':'light';
  const themeMeta=document.querySelector('meta[name="theme-color"]');
  if(themeMeta)themeMeta.setAttribute('content',dark?'#091923':'#102739');
  themeButton.textContent=dark?'☀️':'🌙';
  themeButton.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
  themeButton.setAttribute('title',dark?'Light mode':'Dark mode');
  themeButton.setAttribute('aria-pressed',String(dark));
}
setTheme(document.documentElement.dataset.theme==='dark'?'dark':'light');
themeButton.addEventListener('click',()=>{
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  setTheme(next);
  try{localStorage.setItem('skorskal_theme',next);}catch(e){console.warn('Theme preference was not saved.',e);}
});
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function message(text,type='neutral'){$('scanMessage').hidden=!text;$('scanMessage').textContent=text;$('scanMessage').className=`message ${type}`;}
function code(v){return String(v??'').padStart(2,'0');}
function keyId(y,s){return `${y}-${code(s)}`;}
function personId(y,c,no){return `${y}${(c||'').toUpperCase()}-${code(no)}`;}
function getPerson(y,c,no){return records.filter(r=>personId(r.year,r.classCode,r.examNo)===personId(y,c,no)&&r.name).at(-1)||null;}
function getKey(){return keys[$('activeKey').value]||null;}
function download(data,name,type='text/plain'){const blob=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function safeText(text){return String(text??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function setTab(tab){all('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));all('.page').forEach(s=>s.classList.toggle('visible',s.id===`page-${tab}`));if(tab==='roster')renderRoster();if(tab==='results')renderResults();if(tab==='keys')renderKeys();if(tab==='scan')selectKey();}
all('.nav').forEach(b=>b.addEventListener('click',()=>{stopCamera();setTab(b.dataset.tab);}));
function seedMenus(){for(const id of ['keyYear']){const s=$(id);s.innerHTML=yearChoices.map(y=>`<option value="${y}">Year ${y}</option>`).join('');s.value='5';}
  const select=$('keySubject');select.innerHTML=Array.from({length:100},(_,n)=>{const c=code(n);return `<option value="${c}">${c} ${safeText(subjects[c]||'Other subject')}</option>`;}).join('');select.value='02';
}

// Camera and image ingestion.
function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}$('camera').srcObject=null;$('camera').hidden=true;$('captureBtn').hidden=true;$('cameraBtn').hidden=false;}
$('cameraBtn').addEventListener('click',async()=>{
  try{stopCamera();if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera unavailable. Use HTTPS/localhost, or upload a photo.');
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
    const video=$('camera');video.srcObject=stream;video.hidden=false;await video.play();
    $('emptyScan').hidden=true;$('photoCanvas').hidden=true;$('alignedCanvas').hidden=true;$('cameraBtn').hidden=true;$('captureBtn').hidden=false;
    $('stageTag').hidden=false;$('stageTag').textContent='Live camera';$('scanTools').hidden=true;message('Hold the full answer sheet within view, then tap Capture & scan.');
  }catch(e){stopCamera();message(e.message,'error');}
});
$('captureBtn').addEventListener('click',async()=>{
  const video=$('camera');if(video.videoWidth<1)return;
  const canvas=imageToPixels(video,1750);stopCamera();await processCanvas(canvas);
});
$('imageInput').addEventListener('change',async(e)=>{const f=e.target.files?.[0];if(f)await loadPhoto(f);e.target.value='';});
async function loadPhoto(file){try{
  if(!file.type.startsWith('image/'))throw new Error('Please select a JPG, PNG, or other supported image.');
  const bmp=await createImageBitmap(file);const canvas=imageToPixels(bmp,1750);bmp.close?.();stopCamera();await processCanvas(canvas);
}catch(e){message(e.message,'error');}}
function showSource(){
  const cv=$('photoCanvas');cv.width=workCanvas.width;cv.height=workCanvas.height;
  const ctx=cv.getContext('2d');ctx.drawImage(workCanvas,0,0);const colors=['#18c39c','#18c39c','#18c39c','#18c39c'];
  if(corners)corners.forEach((p,i)=>{
    ctx.beginPath();ctx.arc(p.x,p.y,Math.max(9,workCanvas.width*.010),0,2*Math.PI);
    ctx.fillStyle='#ffffff';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle=colors[i];ctx.stroke();
    ctx.fillStyle='#003d41';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${Math.max(11,workCanvas.width*.012)}px sans-serif`;ctx.fillText(String(i+1),p.x,p.y);
  });
  cv.hidden=false;$('alignedCanvas').hidden=true;$('emptyScan').hidden=true;
  $('stageTag').hidden=false;$('stageTag').textContent=adjusting?'Drag markers to the centers of black squares':'Detected anchor positions';
}
function showAligned(){const out=$('alignedCanvas');out.width=warp.aligned.width;out.height=warp.aligned.height;out.getContext('2d').drawImage(warp.aligned,0,0);out.hidden=false;$('photoCanvas').hidden=true;$('emptyScan').hidden=true;$('stageTag').hidden=false;$('stageTag').textContent='Perspective corrected';}
async function processCanvas(cv){
  workCanvas=cv;corners=null;warp=null;scanned=null;current=null;sample=false;
  $('scanTools').hidden=false;$('manualBtn').hidden=false;$('applyBtn').hidden=true;
  message('Detecting registration squares...');
  await new Promise(requestAnimationFrame);
  try{corners=findAnchors(cv).corners;await processCorners();message('Four anchors detected. Answers aligned automatically.','success');}
  catch(e){
    corners=defaultCorners();adjusting=true;showSource();$('applyBtn').hidden=false;$('manualBtn').hidden=true;
    message(`${e.message} Drag the four numbered markers onto the center of each square, then press Apply corners.`,'error');
  }
}
function defaultCorners(){const w=workCanvas.width,h=workCanvas.height;return[{x:w*.07,y:h*.07},{x:w*.93,y:h*.07},{x:w*.07,y:h*.93},{x:w*.93,y:h*.93}];}
async function processCorners(){
  if(!workCanvas||!corners)return;
  warp=straighten(workCanvas,corners);scanned=analyze(warp,template);sample=false;
  adjusting=false;$('applyBtn').hidden=true;$('manualBtn').hidden=false;
  showAligned();initReview();
}
$('manualBtn').addEventListener('click',()=>{if(!workCanvas)return;adjusting=true;if(!corners)corners=defaultCorners();showSource();$('applyBtn').hidden=false;$('manualBtn').hidden=true;message('Drag marker 1 → top-left; 2 → top-right; 3 → bottom-left; 4 → bottom-right. Mark the centers of the black squares.');});
$('applyBtn').addEventListener('click',async()=>{try{await processCorners();message('Corners applied. Review detected answers before saving.','success');}catch(e){message(e.message,'error');}});
$('rescanBtn').addEventListener('click',async()=>{if(workCanvas)await processCanvas(workCanvas);});
$('rotate90Btn').addEventListener('click',async()=>{if(!workCanvas)return;const cv=document.createElement('canvas');cv.width=workCanvas.height;cv.height=workCanvas.width;const ctx=cv.getContext('2d');ctx.translate(cv.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(workCanvas,0,0);await processCanvas(cv);});
$('flipBtn').addEventListener('click',async()=>{if(!workCanvas)return;const cv=document.createElement('canvas');cv.width=workCanvas.width;cv.height=workCanvas.height;const ctx=cv.getContext('2d');ctx.translate(cv.width,cv.height);ctx.rotate(Math.PI);ctx.drawImage(workCanvas,0,0);await processCanvas(cv);});
const pc=$('photoCanvas');
function pCoord(e){const rect=pc.getBoundingClientRect();return{x:(e.clientX-rect.left)*pc.width/rect.width,y:(e.clientY-rect.top)*pc.height/rect.height};}
pc.addEventListener('pointerdown',e=>{if(!adjusting||!corners)return;const p=pCoord(e);let best=-1,min=Infinity;corners.forEach((v,i)=>{const d=Math.hypot(v.x-p.x,v.y-p.y);if(d<min){min=d;best=i;}});if(best>=0){selectedCorner=best;pc.setPointerCapture(e.pointerId);corners[best]=p;showSource();}});
pc.addEventListener('pointermove',e=>{if(!adjusting||selectedCorner<0)return;corners[selectedCorner]=pCoord(e);showSource();});
pc.addEventListener('pointerup',()=>{selectedCorner=-1;});pc.addEventListener('pointercancel',()=>{selectedCorner=-1;});

// Test with a generated sample sheet, using the exact printable PDF template as its reference.
$('demoBtn').addEventListener('click',async()=>{
  const cv=await sheetCanvas(template),ctx=cv.getContext('2d');
  const scale=cv.width/template.page.width_pt, h=template.page.height_pt;
  const mark=b=>{ctx.fillStyle='#0a0c11';ctx.beginPath();ctx.ellipse(b.x*scale,(h-b.y)*scale,(b.rx||b.radius_pt)*scale*.85,(b.ry||b.radius_pt)*scale*.85,0,0,2*Math.PI);ctx.fill();};
  const ids={year:'5',class:'T',examinee_tens:'1',examinee_ones:'2',subject_tens:'0',subject_ones:'2'};
  Object.entries(ids).forEach(([key,val])=>mark(template.identification[key].bubbles[val]));
  Object.entries(template.questions).forEach(([q,obj])=>mark(obj.bubbles['ABCDE'[(Number(q)-1)%config.options]]));
  stopCamera();await processCanvas(cv);sample=true;if(current){current.sample=true;refreshReview();}
  message('Sample sheet: 5T-12-02 with repeating answer choices. It uses a temporary sample answer key and cannot be saved as a pupil result.','success');
});

// Review, manual corrections, grading, result persistence.
function readId(){const fields=['year','class','examinee_tens','examinee_ones','subject_tens','subject_ones'];return fields.map(k=>scanned.id[k].answer||'');}
function currentInfo(){const year=$('editYear').value.trim(),cls=$('editClass').value.trim().toUpperCase(),num=$('editNo').value.trim()?code($('editNo').value.trim()):'',subject=$('editSubject').value.trim()?code($('editSubject').value.trim()):'';return {year,classCode:cls,examNo:num,subject};}
function initReview(){
  const [year,cls,n1,n2,s1,s2]=readId();
  $('reviewEmpty').hidden=true;$('reviewBody').hidden=false;
  $('editYear').value=year;$('editClass').value=cls;$('editNo').value=n1+n2;$('editSubject').value=s1+s2;$('editPupilName').value='';$('editPupilName').placeholder='Type name from paper (optional)';
  current={answers:Object.fromEntries(Object.entries(scanned.answers).map(([q,o])=>[q,{...o}])),sample:sample};
  renderAnswerGrid();refreshReview();
}
for(const id of ['editYear','editClass','editNo','editSubject'])$(id).addEventListener('input',refreshReview);
function calculate(){
  const info=currentInfo(),key=current?.sample?{title:'Demo key (not saved)',answers:Object.fromEntries(Array.from({length:config.count},(_,i)=>[String(i+1),'ABCDE'[i%config.options]]))}:getKey(info.year,info.subject),counts={left:0,right:0,total:0,checked:0};
  if(key)for(let q=1;q<=config.count;q++){
    const expected=key.answers[String(q)];if(!expected)continue;
    counts.checked++;
    const correct=current?.answers[String(q)]?.answer===expected;
    if(correct){counts.total++;if(q<=template.split)counts.left++;else counts.right++;}
  }
  return {info,key,counts};
}
function refreshReview(){
  if(!current)return;
  const {info,key,counts}=calculate(),p=(info.year&&info.classCode&&info.examNo?getPerson(info.year,info.classCode,info.examNo):null);
  $('detectedId').textContent=`${info.year||'?'}${info.classCode||'?'}-${info.examNo}-${info.subject}`;
  $('pupilName').textContent=p?.name||'Unnamed scan — name optional';
  if(p&&!$('editPupilName').value.trim())$('editPupilName').placeholder=p.name;
  const goodId=yearChoices.includes(info.year)&&['C','G','T'].includes(info.classCode)&&/^\d{2}$/.test(info.examNo)&&/^\d{2}$/.test(info.subject)&&$('editNo').value.trim().length>0&&$('editSubject').value.trim().length>0;
  $('idBadge').textContent=goodId?'ID ready':'ID optional';$('idBadge').className=`mini-pill ${goodId?'ok':'warn'}`;
  const invalid=Object.values(current.answers).filter(a=>a.status!=='ok').length;
  $('reviewStatus').textContent=invalid?`${invalid} require review`:'All read';$('reviewStatus').className=`mini-pill ${invalid?'warn':'ok'}`;
  $('markTotal').textContent=key?`${counts.total}/${counts.checked}`:'Not graded';
  $('gradeInfo').textContent=key?key.title:'Select a saved answer key above';
  $('scorePercent').textContent=counts.checked?`${Math.round(100*counts.total/counts.checked)}%`:'—';
  const lmax=key?Object.keys(key.answers).filter(q=>Number(q)<=template.split&&key.answers[q]).length:0;
  const rmax=key?Object.keys(key.answers).filter(q=>Number(q)>template.split&&key.answers[q]).length:0;
  $('scoreLeft').textContent=key?`${counts.left}/${lmax}`:'—';$('scoreRight').textContent=key?`${counts.right}/${rmax}`:'—';
  $('scoreReview').textContent=invalid;
  $('saveWarning').hidden=!!(key&&!invalid&&!current.sample);
  $('saveWarning').textContent=[current.sample?'Demo mode: this is not a real pupil. Scan a real sheet to save marks.':'','',!p?'Name and pupil ID are optional.':'',!key?'Select an answer key before saving.':'',invalid?`${invalid} blank, multiple, or uncertain answers currently count as zero.`:''].filter(Boolean).join(' ');
  $('saveResultBtn').disabled=!key||!!current.sample;
}
function renderAnswerGrid(){
  const grid=$('answerGrid');
  grid.replaceChildren();
  for(const [first,last] of [[1,template.split],[template.split+1,config.count]]){
    const column=document.createElement('div');
    column.className='answer-column';
    for(let q=first;q<=last;q++){
      const data=current.answers[String(q)]||{answer:null,status:'blank'};
      const row=document.createElement('div');row.className='answer-line';
      const title=document.createElement('span');title.className='answer-num';title.textContent=q+'.';row.appendChild(title);
      for(const ans of 'ABCDE'.slice(0,config.options)){
        const b=document.createElement('button');
        b.type='button';
        b.className=`opt ${data.answer===ans?'selected':''} ${data.status==='multiple'&&data.scores?.[ans]>.19?'mismatch':''}`;
        b.textContent=ans;b.title=`Question ${q}: ${ans}`;
        b.onclick=()=>{
          data.answer=data.answer===ans?null:ans;
          data.status=data.answer?'ok':'blank';
          current.answers[String(q)]=data;
          renderAnswerGrid();refreshReview();
        };
        row.appendChild(b);
      }
      column.appendChild(row);
    }
    grid.appendChild(column);
  }
}
function makeRecord(){const {info,key,counts}=calculate(),p=(info.year&&info.classCode&&info.examNo?getPerson(info.year,info.classCode,info.examNo):null);
  if(!key)throw new Error('Select a saved answer key first.');
  const invalid=Object.values(current.answers).filter(a=>a.status!=='ok').length;
  const name=$('editPupilName').value.trim().slice(0,120)||p?.name||`Scan ${records.length+1}`;
  return {...info,name,sheet:{...config},keyId:$('activeKey').value,date:new Date().toISOString(),keyTitle:key?.title||'',
    left:key?counts.left:null,right:key?counts.right:null,correct:key?counts.total:null,count:key?counts.checked:null,
    percent:key&&counts.checked?Math.round(10000*counts.total/counts.checked)/100:null,
    status:!key?'Ungraded':invalid?'Reviewed with blanks':'Graded',
    answers:Object.fromEntries(Object.entries(current.answers).map(([q,o])=>[q,o.answer])),
    flags:Object.fromEntries(Object.entries(current.answers).map(([q,o])=>[q,o.status])),id:`r${Date.now()}${Math.random().toString(36).slice(2,8)}`};
}
async function storeImage(id,canvas){try{const db=await openDb(),blob=await new Promise(res=>canvas.toBlob(res,'image/jpeg',.78));await new Promise((res,rej)=>{const tx=db.transaction('images','readwrite');tx.objectStore('images').put(blob,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();}catch(e){console.warn('Image cannot be persisted',e);}}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('skorskal-data',1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('images'))db.createObjectStore('images');if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function saveMeta(k,v){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(v,k);tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>rej(tx.error);});}
async function loadMeta(k){try{const db=await openDb();return await new Promise((res,rej)=>{const tx=db.transaction('meta','readonly'),r=tx.objectStore('meta').get(k);r.onsuccess=()=>{db.close();res(r.result||null);};r.onerror=()=>rej(r.error);});}catch{return null;}}
$('saveResultBtn').addEventListener('click',async()=>{try{
  const rec=makeRecord();records.push(rec);persist('results',records);
  if(warp)await storeImage(rec.id,warp.aligned);
  toast(`Saved ${rec.name} — ${rec.correct===null?'Ungraded':rec.correct+'/'+rec.count}`);$('nextPupilBtn').focus();
}catch(e){toast(e.message);}});
$('nextPupilBtn').addEventListener('click',()=>{current=null;scanned=null;warp=null;workCanvas=null;corners=null;
  $('reviewBody').hidden=true;$('reviewEmpty').hidden=false;$('reviewStatus').textContent='Waiting';$('reviewStatus').className='mini-pill';
  $('emptyScan').hidden=false;$('photoCanvas').hidden=true;$('alignedCanvas').hidden=true;$('scanTools').hidden=true;$('stageTag').hidden=true;message('Ready for the next pupil. The saved answer keys are unchanged.');});

// Answer keys
function updateKeyGrid(){
  const grid=$('keyGrid');grid.innerHTML='';
  for(const [first,last] of [[1,template.split],[template.split+1,config.count]]){
    const column=document.createElement('div');column.className='key-column';
    for(let q=first;q<=last;q++){
      const row=document.createElement('div');row.className='key-row';
      const title=document.createElement('strong');title.textContent=`${q}.`;row.appendChild(title);
      const selected=keyDraft[String(q)]||null;
      for(const ans of 'ABCDE'.slice(0,config.options)){
        const btn=document.createElement('button');btn.type='button';
        btn.className=`opt ${selected===ans?'selected':''}`;btn.textContent=ans;btn.title=`Key Q${q}: ${ans}`;
        btn.onclick=()=>{if(selected===ans)delete keyDraft[String(q)];else keyDraft[String(q)]=ans;updateKeyGrid();};
        row.appendChild(btn);
      }
      column.appendChild(row);
    }
    grid.appendChild(column);
  }
}
let keyDraft={};
function applyConfig(value){
  config=settings(value);template=buildTemplate(baseTemplate,config);persist('sheet',config);
  $('questionCount').value=config.count;$('optionCount').value=config.options;$('bubbleShape').value=config.shape;
  $('sheetInfo').textContent=`${config.count} questions · ${template.split} + ${config.count-template.split} · A–${'ABCDE'[config.options-1]} · ${config.shape}`;
  $('leftLabel').textContent=`Q1–${template.split}`;$('rightLabel').textContent=template.split<config.count?`Q${template.split+1}–${config.count}`:'—';
}
function refreshKeySelector(preferred=$('activeKey').value){
  const select=$('activeKey');select.replaceChildren(new Option('Select answer key',''));
  for(const [id,key] of Object.entries(keys))select.add(new Option(key.title,id));
  select.value=keys[preferred]?preferred:Object.keys(keys)[0]||'';
  selectKey();
}
function selectKey(){const key=getKey();persist('activeKey',$('activeKey').value);if(key)applyConfig(key.sheet||{count:40,options:4,shape:'circle'});else applyConfig(config);if(current){current=null;$('reviewBody').hidden=true;$('reviewEmpty').hidden=false;message('Answer key changed. Scan the paper again.');}}
$('activeKey').onchange=selectKey;
for(const id of ['questionCount','optionCount','bubbleShape'])$(id).onchange=()=>{
  const next=settings({count:$('questionCount').value,options:$('optionCount').value,shape:$('bubbleShape').value});
  const filtered=Object.fromEntries(Object.entries(keyDraft).filter(([q,a])=>Number(q)<=next.count&&'ABCDE'.slice(0,next.options).includes(a)));
  if(Object.keys(filtered).length<Object.keys(keyDraft).length&&!confirm('This removes answers outside the new question count/options. Continue?')){applyConfig(config);return;}
  keyDraft=filtered;applyConfig(next);updateKeyGrid();current=null;$('reviewBody').hidden=true;$('reviewEmpty').hidden=false;
};
$('printSheetBtn').onclick=()=>{download('<!doctype html><html><head><meta charset="utf-8"><title>Skorskal answer sheet</title><style>@page{size:A4;margin:0}body{margin:0}svg{display:block;width:210mm;height:297mm}button{margin:12px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print / Save as PDF (A4, actual size, no margins)</button>'+sheetSVG(template)+'</body></html>',`Skorskal_${config.count}_${config.options}_${config.shape}.html`,'text/html');toast('Open the downloaded sheet to print or save as PDF.');};

function renderKeys(){const id=keyId($('keyYear').value,$('keySubject').value),key=keys[id];if(key){$('keyTitle').value=key.title;keyDraft={...key.answers};applyConfig(key.sheet||{count:40,options:4,shape:'circle'});}else{keyDraft={};$('keyTitle').value='';}updateKeyGrid();renderSavedKeys();}
for(const id of ['keyYear','keySubject'])$(id).addEventListener('change',renderKeys);
$('loadKeyBtn').onclick=()=>{renderKeys();toast('Current key loaded.');};
$('clearKeyBtn').onclick=()=>{keyDraft={};updateKeyGrid();};
$('saveKeyBtn').onclick=()=>{const year=$('keyYear').value,subject=$('keySubject').value;
  if(!Object.keys(keyDraft).length){toast('Select at least one answer.');return;}
  keys[keyId(year,subject)]={year,subject,title:$('keyTitle').value.trim()||`Year ${year} · Subject ${subject}`,answers:{...keyDraft},sheet:{...config}};
  persist('keys',keys);renderSavedKeys();refreshKeySelector(keyId(year,subject));if(current)refreshReview();toast(`Saved key ${year}-${subject} (${Object.keys(keyDraft).length} answers).`);
};
$('applyPasteBtn').onclick=()=>{
  const source=$('keyPaste').value.trim().toUpperCase();
  if(!source){toast('Paste answers first.');return;}
  const fresh={},numbered=[...source.matchAll(/(?:^|[\s,;])(\d+)\s*[:.=\-]\s*([A-E])(?=$|[\s,;])/g)];
  if(numbered.length){
    const remainder=source.replace(/(?:^|[\s,;])(\d+)\s*[:.=\-]\s*([A-E])(?=$|[\s,;])/g,'').replace(/[\s,;]/g,'');
    if(remainder){toast('Check the numbered answer format.');return;}
    for(const [,n,ans] of numbered){const q=Number(n);if(q<1||q>config.count||fresh[q]||!'ABCDE'.slice(0,config.options).includes(ans)){toast('Check question numbers and selected answer options.');return;}fresh[q]=ans;}
  }else{
    const letters=source.replace(/[\s,;]/g,'');
    if(!letters.length||letters.length>config.count||[...letters].some(a=>!'ABCDE'.slice(0,config.options).includes(a))){toast('Use up to '+config.count+' answers from the selected options.');return;}
    [...letters].forEach((a,i)=>fresh[i+1]=a);
  }
  keyDraft=fresh;updateKeyGrid();toast(Object.keys(fresh).length+' answers applied. Save the answer key to keep them.');
};
function renderSavedKeys(){const box=$('savedKeys');box.innerHTML='';const saved=Object.values(keys);
  if(!saved.length){box.innerHTML='<p>No answer keys saved yet.</p>';return;}
  for(const key of saved){const row=document.createElement('div');row.className='saved-key';
    const text=document.createElement('div');text.innerHTML=`<strong>${safeText(key.title)}</strong><small>Year ${safeText(key.year)} · Subject ${safeText(key.subject)} · ${Object.keys(key.answers).length}/${key.sheet?.count||40} answers</small>`;
    const b=document.createElement('button');b.textContent='Edit';b.onclick=()=>{$('keyYear').value=key.year;$('keySubject').value=key.subject;renderKeys();scrollTo({top:0,behavior:'smooth'});};row.append(text,b);box.appendChild(row);
  }
}

// Skorskal is exam-only. Do not ask for a roster phrase or perform attendance.
// The Pupils tab displays locally saved exam records, not the private school roster.
const classLabels={C:'CEMERLANG',G:'GEMILANG',T:'TERBILANG'};
const openSkorskalUpdates=()=>{
 if(window.SkorskalAndroid?.checkForUpdates){window.SkorskalAndroid.checkForUpdates();return;}
 window.open('https://github.com/mohammaddhameri-blip/skorskal-omr/releases/tag/android-latest','_blank','noopener');
};
const nativeUpdate=$('androidUpdateBtn');
if(nativeUpdate&&window.SkorskalAndroid?.checkForUpdates){nativeUpdate.style.display='inline-flex';nativeUpdate.onclick=openSkorskalUpdates;}
for(const id of ['rosterYear','rosterClass'])$(id).addEventListener('change',renderRoster);
function renderRoster(){
 const list=$('attendanceList');list.replaceChildren();
 const year=$('rosterYear').value,cls=$('rosterClass').value;
 const latest=new Map();for(const r of records){if(r.year===year&&r.classCode===cls)latest.set(r.year&&r.classCode&&r.examNo?personId(r.year,r.classCode,r.examNo):r.id,r);}
 const pupils=[...latest.values()].sort((a,b)=>Number(a.examNo)-Number(b.examNo));
 $('rosterCount').textContent=pupils.length+' marked pupils';
 for(const pupil of pupils){
   const line=document.createElement('div');line.className='attendance-pupil';line.style.cssText='display:flex;align-items:center;gap:16px;padding:12px;';
   const number=document.createElement('span');number.className='attendance-no';number.textContent=pupil.examNo;
   const name=document.createElement('strong');name.className='attendance-name';name.textContent=pupil.name||personId(pupil.year,pupil.classCode,pupil.examNo);
   line.append(number,name);list.append(line);
 }
 if(!pupils.length)list.textContent='No exam records saved for this class on this device yet.';
}

// Results and backups
function renderResults(){const tb=$('resultsTable');tb.innerHTML='';$('resultsCount').textContent=`${records.length} saved`;
  for(const rec of [...records].reverse()){
    const tr=document.createElement('tr'),mark=rec.correct===null?'—':`${rec.correct}/${rec.count}`;
    tr.innerHTML=`<td>${safeText(rec.name)}<br><small>${safeText(personId(rec.year,rec.classCode,rec.examNo))}</small></td><td>${safeText(rec.keyTitle||rec.subject)}<br><small>${new Date(rec.date).toLocaleDateString()}</small></td><td>${mark}</td><td>${safeText(rec.status)}</td>`;
    const td=document.createElement('td'),del=document.createElement('button');del.className='table-btn danger';del.textContent='Delete';del.onclick=()=>{if(!confirm('Delete this saved scan?'))return;records=records.filter(r=>r.id!==rec.id);persist('results',records);renderResults();};const rename=document.createElement('button');rename.className='table-btn';rename.textContent='Name';rename.onclick=()=>{const name=prompt('Pupil name (optional):',rec.name||'');if(name===null)return;rec.name=name.trim().slice(0,120)||'Unnamed scan';persist('results',records);renderResults();};td.append(rename,del);tr.appendChild(td);tb.append(tr);
  }
  if(!records.length)tb.innerHTML='<tr><td colspan="5">No results saved. Scan a paper to get started.</td></tr>';
}
$('exportResultsBtn').onclick=()=>{download(resultsCSV(records),'Skorskal_Results.csv','text/csv;charset=utf-8');toast('CSV exported.');};
$('backupBtn').onclick=()=>{
  download(JSON.stringify({app:'skorskal',version:4,keys,records},null,2),'Skorskal_Backup.json','application/json');
  toast('Answer keys and exam results backed up.');
};
$('restoreInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const backup=JSON.parse(await file.text());
    if(backup.app!=='skorskal'||!Array.isArray(backup.records)||!backup.keys||typeof backup.keys!=='object')
      throw new Error('Not a valid Skorskal backup.');
    if(!confirm('Restore saved answer keys and exam results?'))return;
    keys=backup.keys;records=backup.records;
    persist('keys',keys);persist('results',records);
    renderResults();renderKeys();refreshKeySelector();renderRoster();toast('Exam keys and results restored.');
  }catch(err){toast(err.message);}
  finally{e.target.value='';}
});
$('exportWorkbookBtn').onclick=()=>{
  try{const latest=new Map();for(const r of records)latest.set(r.year&&r.classCode&&r.examNo?personId(r.year,r.classCode,r.examNo):r.id,r);
    const markedPeople=[...latest.values()].map(r=>({id:r.id,year:r.year,classCode:r.classCode,examNo:r.examNo,name:r.name}));
    download(createRosterWorkbook(markedPeople,records),'Skorskal_Marked_Pupils.xlsx');toast('Marked pupils exported to Excel.');}
  catch(e){toast('Excel export failed: '+e.message);}
};

async function init(){try{
  baseTemplate=await fetch('./template.json').then(r=>{if(!r.ok)throw new Error('Template not found.');return r.json();});
  template=buildTemplate(baseTemplate,config);
  if(Object.keys(baseTemplate.questions).length!==40||Object.keys(template.anchors).length!==4)throw new Error('OMR calibration file invalid.');
  seedMenus();$('rosterYear').value='2';$('rosterClass').value='C';
  renderKeys();refreshKeySelector(load('activeKey',''));renderRoster();renderResults();
  // No roster access code is required by the exam scanner.
  if('serviceWorker'in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
}catch(e){message('Could not initialize Skorskal: '+e.message+'. Serve this folder over localhost or HTTPS.','error');}}
init();
