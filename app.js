import {imageToPixels,findAnchors,straighten,analyze} from './vision.js';
import {resultsCSV,createRosterWorkbook} from './workbook.js';
const $=id=>document.getElementById(id),all=s=>[...document.querySelectorAll(s)];
const yearChoices=['1','2','3','4','5','6'];
const subjects={'00':'Pendidikan Muzik (proposed)','01':'Bahasa Melayu','02':'Bahasa Inggeris','03':'Mathematics (proposed)','04':'Science (proposed)','05':'Pendidikan Islam (proposed)','06':'Pendidikan Moral (proposed)','07':'Sejarah (proposed)','08':'RBT (proposed)','09':'Pendidikan Seni Visual (proposed)','10':'PJPK (proposed)'};
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(`skorskal_${key}`))||fallback;}catch{return fallback;}};
const persist=(key,value)=>localStorage.setItem(`skorskal_${key}`,JSON.stringify(value));
let template,keys=load('keys',{}),people=[],rosterLoaded=false,records=load('results',[]),workCanvas=null,corners=null,warp=null,scanned=null,current=null,
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
function getPerson(y,c,no){return people.find(p=>personId(p.year,p.classCode,p.examNo)===personId(y,c,no));}
function getKey(y,s){return keys[keyId(y,s)]||null;}
function download(data,name,type='text/plain'){const blob=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function safeText(text){return String(text??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function setTab(tab){all('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));all('.page').forEach(s=>s.classList.toggle('visible',s.id===`page-${tab}`));if(tab==='roster')renderRoster();if(tab==='results')renderResults();if(tab==='keys')renderKeys();}
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
  const img=new Image();img.src='assets/sheet-preview.png';await img.decode();
  const cv=document.createElement('canvas');cv.width=img.naturalWidth;cv.height=img.naturalHeight;const ctx=cv.getContext('2d');ctx.drawImage(img,0,0);
  const scale=cv.width/template.page.width_pt, h=template.page.height_pt;
  const mark=b=>{ctx.fillStyle='#0a0c11';ctx.beginPath();ctx.arc(b.x*scale,(h-b.y)*scale,b.radius_pt*scale*.74,0,2*Math.PI);ctx.fill();};
  const ids={year:'5',class:'T',examinee_tens:'1',examinee_ones:'2',subject_tens:'0',subject_ones:'2'};
  Object.entries(ids).forEach(([key,val])=>mark(template.identification[key].bubbles[val]));
  Object.entries(template.questions).forEach(([q,obj])=>mark(obj.bubbles['ABCD'[(Number(q)-1)%4]]));
  stopCamera();await processCanvas(cv);sample=true;if(current){current.sample=true;refreshReview();}
  message('Sample sheet: 5T-12-02 with ABCD repeating. It uses a temporary sample answer key and cannot be saved as a pupil result.','success');
});

// Review, manual corrections, grading, result persistence.
function readId(){const fields=['year','class','examinee_tens','examinee_ones','subject_tens','subject_ones'];return fields.map(k=>scanned.id[k].answer||'');}
function currentInfo(){const year=$('editYear').value.trim(),cls=$('editClass').value.trim().toUpperCase(),num=code($('editNo').value.trim()),subject=code($('editSubject').value.trim());return {year,classCode:cls,examNo:num,subject};}
function initReview(){
  const [year,cls,n1,n2,s1,s2]=readId();
  $('reviewEmpty').hidden=true;$('reviewBody').hidden=false;
  $('editYear').value=year;$('editClass').value=cls;$('editNo').value=n1+n2;$('editSubject').value=s1+s2;
  current={answers:Object.fromEntries(Object.entries(scanned.answers).map(([q,o])=>[q,{...o}])),sample:sample};
  renderAnswerGrid();refreshReview();
}
for(const id of ['editYear','editClass','editNo','editSubject'])$(id).addEventListener('input',refreshReview);
function calculate(){
  const info=currentInfo(),key=current?.sample?{title:'Demo key (not saved)',answers:Object.fromEntries(Array.from({length:40},(_,i)=>[String(i+1),'ABCD'[i%4]]))}:getKey(info.year,info.subject),counts={left:0,right:0,total:0,checked:0};
  if(key)for(let q=1;q<=40;q++){
    const expected=key.answers[String(q)];if(!expected)continue;
    counts.checked++;
    const correct=current?.answers[String(q)]?.answer===expected;
    if(correct){counts.total++;if(q<=20)counts.left++;else counts.right++;}
  }
  return {info,key,counts};
}
function refreshReview(){
  if(!current)return;
  const {info,key,counts}=calculate(),p=getPerson(info.year,info.classCode,info.examNo);
  $('detectedId').textContent=`${info.year||'?'}${info.classCode||'?'}-${info.examNo}-${info.subject}`;
  $('pupilName').textContent=p?.name||'Pupil not found in roster';
  const goodId=yearChoices.includes(info.year)&&['C','G','T'].includes(info.classCode)&&/^\d{2}$/.test(info.examNo)&&/^\d{2}$/.test(info.subject)&&$('editNo').value.trim().length>0&&$('editSubject').value.trim().length>0;
  $('idBadge').textContent=goodId?(p?'Pupil found':'Verify name'):'Fix ID';$('idBadge').className=`mini-pill ${goodId&&p?'ok':'warn'}`;
  const invalid=Object.values(current.answers).filter(a=>a.status!=='ok').length;
  $('reviewStatus').textContent=invalid?`${invalid} require review`:'All read';$('reviewStatus').className=`mini-pill ${invalid?'warn':'ok'}`;
  $('markTotal').textContent=key?`${counts.total}/${counts.checked}`:'Not graded';
  $('gradeInfo').textContent=key?key.title:'No saved answer key for this year + subject';
  $('scorePercent').textContent=counts.checked?`${Math.round(100*counts.total/counts.checked)}%`:'—';
  const lmax=key?Object.keys(key.answers).filter(q=>Number(q)<=20&&key.answers[q]).length:0;
  const rmax=key?Object.keys(key.answers).filter(q=>Number(q)>20&&key.answers[q]).length:0;
  $('scoreLeft').textContent=key?`${counts.left}/${lmax}`:'—';$('scoreRight').textContent=key?`${counts.right}/${rmax}`:'—';
  $('scoreReview').textContent=invalid;
  $('saveWarning').hidden=!!(p&&key&&goodId&&!invalid&&!current.sample);
  $('saveWarning').textContent=[current.sample?'Demo mode: this is not a real pupil. Scan a real sheet to save marks.':'',!goodId?'Correct the examinee ID before saving.':'',!p?'No roster match: please verify the handwritten name.':'',!key?'No answer key: this scan will be saved as Ungraded.':'',invalid?`${invalid} blank, multiple, or uncertain answers currently count as zero.`:''].filter(Boolean).join(' ');
  $('saveResultBtn').disabled=!goodId||!rosterLoaded||!p||!!current.sample;
}
function renderAnswerGrid(){
  const grid=$('answerGrid');
  grid.replaceChildren();
  for(const [first,last] of [[1,20],[21,40]]){
    const column=document.createElement('div');
    column.className='answer-column';
    for(let q=first;q<=last;q++){
      const data=current.answers[String(q)]||{answer:null,status:'blank'};
      const row=document.createElement('div');row.className='answer-line';
      const title=document.createElement('span');title.className='answer-num';title.textContent=q+'.';row.appendChild(title);
      for(const ans of ['A','B','C','D']){
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
function makeRecord(){const {info,key,counts}=calculate(),p=getPerson(info.year,info.classCode,info.examNo);
  if(!info.year||!info.classCode||$('editNo').value.trim()===''||$('editSubject').value.trim()==='')throw new Error('Complete pupil year, class, number, and subject.');
  const invalid=Object.values(current.answers).filter(a=>a.status!=='ok').length;
  return {...info,name:p?.name||'(Not matched)',date:new Date().toISOString(),keyTitle:key?.title||'',
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
  for(const [first,last] of [[1,20],[21,40]]){
    const column=document.createElement('div');column.className='key-column';
    for(let q=first;q<=last;q++){
      const row=document.createElement('div');row.className='key-row';
      const title=document.createElement('strong');title.textContent=`${q}.`;row.appendChild(title);
      const selected=keyDraft[String(q)]||null;
      for(const ans of ['A','B','C','D']){
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
function renderKeys(){const id=keyId($('keyYear').value,$('keySubject').value),key=keys[id];if(key){$('keyTitle').value=key.title;keyDraft={...key.answers};}else{keyDraft={};$('keyTitle').value='';}updateKeyGrid();renderSavedKeys();}
for(const id of ['keyYear','keySubject'])$(id).addEventListener('change',renderKeys);
$('loadKeyBtn').onclick=()=>{renderKeys();toast('Current key loaded.');};
$('clearKeyBtn').onclick=()=>{keyDraft={};updateKeyGrid();};
$('saveKeyBtn').onclick=()=>{const year=$('keyYear').value,subject=$('keySubject').value;
  if(!Object.keys(keyDraft).length){toast('Select at least one answer.');return;}
  keys[keyId(year,subject)]={year,subject,title:$('keyTitle').value.trim()||`Year ${year} · Subject ${subject}`,answers:{...keyDraft}};
  persist('keys',keys);renderSavedKeys();if(current)refreshReview();toast(`Saved key ${year}-${subject} (${Object.keys(keyDraft).length} answers).`);
};
$('applyPasteBtn').onclick=()=>{
  const source=$('keyPaste').value.trim().toUpperCase();
  if(!source){toast('Paste 20 or 40 answers first.');return;}
  const numbered=[...source.matchAll(/(?:^|[\s,;])([1-9]|[1-3]\d|40)\s*[:.=\-]\s*([ABCD])(?=$|[\s,;])/g)];
  const fresh={};let count=0;
  if(numbered.length){
    for(const match of numbered){const q=String(Number(match[1]));if(fresh[q]){toast('Duplicate question '+q+'.');return;}fresh[q]=match[2];}
    count=Object.keys(fresh).length;
  }else{
    const letters=source.replace(/[^ABCD]/g,'');
    if(letters.length!==20&&letters.length!==40){toast('Expected 20 or 40 A–D letters; found '+letters.length+'.');return;}
    for(let i=0;i<letters.length;i++)fresh[String(i+1)]=letters[i];
    count=letters.length;
  }
  keyDraft=fresh; // Replace the entire draft; no stale answers in Q21–40.
  updateKeyGrid();
  toast(count+' answers applied. Save the answer key to keep them.');
};
function renderSavedKeys(){const box=$('savedKeys');box.innerHTML='';const saved=Object.values(keys);
  if(!saved.length){box.innerHTML='<p>No answer keys saved yet.</p>';return;}
  for(const key of saved){const row=document.createElement('div');row.className='saved-key';
    const text=document.createElement('div');text.innerHTML=`<strong>${safeText(key.title)}</strong><small>Year ${safeText(key.year)} · Subject ${safeText(key.subject)} · ${Object.keys(key.answers).length}/40 answers</small>`;
    const b=document.createElement('button');b.textContent='Edit';b.onclick=()=>{$('keyYear').value=key.year;$('keySubject').value=key.subject;renderKeys();scrollTo({top:0,behavior:'smooth'});};row.append(text,b);box.appendChild(row);
  }
}

// Official publisher-managed roster. The public repository stores AES-GCM ciphertext only.
// Neither the web app nor APK accepts local pupil roster imports, edits or backup overrides.
const rosterUrl='./roster-2026.json';
const decode64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function unlockRoster(passphrase){
  if(!passphrase.trim())throw new Error('Enter the staff roster access phrase.');
  if(!globalThis.crypto?.subtle || typeof DecompressionStream!=='function')
    throw new Error('This browser cannot decrypt the official roster. Update Chrome or Android System WebView.');
  const res=await fetch(rosterUrl,{cache:'no-store'});
  if(!res.ok)throw new Error('Official 2026 roster not found. Update Skorskal from the publisher.');
  const file=await res.json();
  if(file.academicYear!==2026||file.algorithm!=='PBKDF2-SHA256-250000+AES-256-GCM+zlib')
    throw new Error('Unsupported official roster version.');
  const passKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
  const aes=await crypto.subtle.deriveKey(
    {name:'PBKDF2',salt:decode64(file.salt),iterations:250000,hash:'SHA-256'},
    passKey,{name:'AES-GCM',length:256},false,['decrypt']);
  let plaintext;
  try{
    plaintext=await crypto.subtle.decrypt(
      {name:'AES-GCM',iv:decode64(file.iv),additionalData:new TextEncoder().encode('skorskal-roster-2026')},
      aes,decode64(file.data));
  }catch{throw new Error('Incorrect roster access phrase or damaged roster file.');}
  const stream=new Blob([plaintext]).stream().pipeThrough(new DecompressionStream('deflate'));
  const rows=JSON.parse(await new Response(stream).text());
  if(!Array.isArray(rows)||rows.length!==file.count||rows.length<1)
    throw new Error('The official roster contents are incomplete.');
  const unique=new Set();
  const roster=rows.map(row=>{
    if(!Array.isArray(row)||row.length!==4)throw new Error('Invalid roster record.');
    const [year,classCode,examNo,name]=row.map(v=>String(v).trim());
    const id=personId(year,classCode,examNo);
    if(!/^[1-6]$/.test(year)||!['C','G','T'].includes(classCode)||!/^[0-9]{2}$/.test(examNo)||!name||unique.has(id))
      throw new Error('Invalid or duplicate pupil ID in official roster.');
    unique.add(id);
    return {year,classCode,examNo,name,_sheet:'2026 official'};
  });
  people=roster;rosterLoaded=true;
  $('rosterPassphrase').value='';$('rosterPassphrase').disabled=true;
  $('unlockRosterBtn').disabled=true;$('unlockRosterBtn').textContent='Roster unlocked';
  $('rosterImportStatus').textContent='Official '+file.academicYear+' roster · '+roster.length+' pupils · read-only · version '+file.version;
  $('rosterAccessPanel').hidden=true;
  renderRoster();if(current)refreshReview();
  try{sessionStorage.setItem('skorskal_staff_phrase_2026',passphrase);}catch{}
  return roster.length;
}
$('unlockRosterBtn').onclick=async()=>{
  const button=$('unlockRosterBtn');button.disabled=true;
  $('rosterImportStatus').textContent='Checking official roster…';
  try{const count=await unlockRoster($('rosterPassphrase').value);toast(count+' pupils loaded from official 2026 roster.');}
  catch(e){$('rosterImportStatus').textContent=e.message;button.disabled=false;toast(e.message);}
};
$('rosterPassphrase').addEventListener('keydown',e=>{if(e.key==='Enter')$('unlockRosterBtn').click();});
const openSkorskalUpdates=()=>{
  if(window.SkorskalAndroid?.checkForUpdates){window.SkorskalAndroid.checkForUpdates();return;}
  window.open('https://github.com/mohammaddhameri-blip/skorskal-omr/releases','_blank','noopener,noreferrer');
};
$('checkUpdatesBtn').onclick=openSkorskalUpdates;
if(window.SkorskalAndroid?.checkForUpdates){
  const nativeUpdate=$('androidUpdateBtn');
  if(nativeUpdate){nativeUpdate.style.display='inline-flex';nativeUpdate.onclick=openSkorskalUpdates;}
}
// The Pupils tab is a read-only OMR roster lookup, not an attendance app.
const classLabels={C:'CEMERLANG',G:'GEMILANG',T:'TERBILANG'};
for(const id of ['rosterYear','rosterClass'])$(id).addEventListener('change',renderRoster);
function renderRoster(){
 const list=$('attendanceList');list.replaceChildren();
 const count=$('rosterCount');
 if(!rosterLoaded){count.textContent='Locked';list.textContent='Unlock the official 2026 roster to view examination candidates.';return;}
 const year=$('rosterYear').value,cls=$('rosterClass').value;
 const pupils=people.filter(p=>p.year===year&&p.classCode===cls)
   .sort((a,b)=>Number(a.examNo)-Number(b.examNo)||a.name.localeCompare(b.name));
 count.textContent='Year '+year+' · '+classLabels[cls]+' · '+pupils.length+' examinees';
 for(const pupil of pupils){
   const line=document.createElement('div');line.className='attendance-pupil';
   line.style.cssText='display:flex;align-items:center;gap:16px;padding:12px;';
   const number=document.createElement('span');number.className='attendance-no';number.textContent=pupil.examNo;
   const name=document.createElement('strong');name.className='attendance-name';name.textContent=pupil.name;
   line.append(number,name);list.append(line);
 }
 if(!pupils.length)list.textContent='No candidates for the selected year and class.';
}

// Results and backups
function renderResults(){const tb=$('resultsTable');tb.innerHTML='';$('resultsCount').textContent=`${records.length} saved`;
  for(const rec of [...records].reverse()){
    const tr=document.createElement('tr'),mark=rec.correct===null?'—':`${rec.correct}/${rec.count}`;
    tr.innerHTML=`<td>${safeText(rec.name)}<br><small>${safeText(personId(rec.year,rec.classCode,rec.examNo))}</small></td><td>${safeText(rec.subject)}<br><small>${new Date(rec.date).toLocaleDateString()}</small></td><td>${mark}</td><td>${safeText(rec.status)}</td>`;
    const td=document.createElement('td'),del=document.createElement('button');del.className='table-btn danger';del.textContent='Delete';del.onclick=()=>{if(!confirm('Delete this saved scan?'))return;records=records.filter(r=>r.id!==rec.id);persist('results',records);renderResults();};td.appendChild(del);tr.appendChild(td);tb.append(tr);
  }
  if(!records.length)tb.innerHTML='<tr><td colspan="5">No results saved. Scan a paper to get started.</td></tr>';
}
$('exportResultsBtn').onclick=()=>{download(resultsCSV(records),'Skorskal_Results.csv','text/csv;charset=utf-8');toast('CSV exported.');};
$('backupBtn').onclick=()=>{
  download(JSON.stringify({app:'skorskal',version:4,keys,records},null,2),'Skorskal_Backup.json','application/json');
  toast('Keys and marking results backed up. Official roster is never exported in backups.');
};
$('restoreInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const backup=JSON.parse(await file.text());
    if(backup.app!=='skorskal'||!Array.isArray(backup.records)||!backup.keys||typeof backup.keys!=='object')
      throw new Error('Not a valid Skorskal backup.');
    if(!confirm('Restore saved keys and results? The official 2026 roster cannot be replaced.'))return;
    keys=backup.keys;records=backup.records;
    persist('keys',keys);persist('results',records);
    renderResults();renderKeys();renderRoster();toast('Exam keys and results restored; official roster unchanged.');
  }catch(err){toast(err.message);}
  finally{e.target.value='';}
});
$('exportWorkbookBtn').onclick=()=>{
  if(!rosterLoaded){toast('Unlock the official 2026 roster first.');return;}
  try{download(createRosterWorkbook(people,records),'Skorskal_2026_Marked_Roster.xlsx');toast('Official 2026 marked roster exported.');}
  catch(e){toast('Excel export failed: '+e.message);}
};

async function init(){try{
  template=await fetch('./template.json').then(r=>{if(!r.ok)throw new Error('Template not found.');return r.json();});
  if(Object.keys(template.questions).length!==40||Object.keys(template.anchors).length!==4)throw new Error('OMR calibration file invalid.');
  seedMenus();$('rosterYear').value='2';$('rosterClass').value='C';
  renderKeys();renderRoster();renderResults();
  // Session-only unlock avoids saving a plaintext roster or persistent passphrase.
  let phrase='';try{phrase=sessionStorage.getItem('skorskal_staff_phrase_2026')||'';}catch{}
  if(phrase){unlockRoster(phrase).catch(()=>{try{sessionStorage.removeItem('skorskal_staff_phrase_2026');}catch{};});}
  if('serviceWorker'in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
}catch(e){message('Could not initialize Skorskal: '+e.message+'. Serve this folder over localhost or HTTPS.','error');}}
init();