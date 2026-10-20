// Dependency-free XLSX import/export for current Excel browsers.
const decoder = new TextDecoder();const encoder=new TextEncoder();
const u16=(d,i)=>d.getUint16(i,true),u32=(d,i)=>d.getUint32(i,true);
const norm=s=>String(s??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g,'');
const alphaToIndex=s=>[...s].reduce((n,ch)=>n*26+(ch.charCodeAt(0)-64),0)-1;
const indexToAlpha=n=>{let s='';for(n++;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const byName=(node,local)=>[...node.getElementsByTagName('*')].filter(el=>el.localName===local);
function parseXML(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('The Excel XML is invalid.');return doc;}
function xmlText(node,tag){return byName(node,tag)[0]?.textContent||'';}
function csvQuote(s){s=String(s??'');if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export const resultsCSV=(recs)=>{
  const cols=['Year','Class','Examinee No','Name','Subject Code','Answer Key','Q1-20','Q21-40','Total Correct','Questions Graded','Percentage','Scan Status','Scanned At'];
  const rows=recs.map(r=>[r.year,r.classCode,r.examNo,r.name,r.subject,r.keyTitle,r.left,r.right,r.correct,r.count,r.percent,r.status,r.date]);
  return [cols,...rows].map(row=>row.map(csvQuote).join(',')).join('\r\n');
};
export function parseCSV(text){
  text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],v='',quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){v+='"';i++;}else quoted=!quoted;}
  else if(ch===','&&!quoted){row.push(v);v='';}
  else if((ch==='\r'||ch==='\n')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(v);if(row.some(c=>c.trim()))rows.push(row);v='';row=[];}
  else v+=ch;
  }
  if(v||row.length){row.push(v);rows.push(row);}return rows;
}
export function rosterFromRows(matrix,sheetName='',sheetPath=''){
  if(!matrix.length)return [];
  let headerIndex=0,header=[];
  for(let i=0;i<Math.min(matrix.length,15);i++){
    const h=matrix[i].map(norm);
    const hasName=h.some(c=>/^(name|nama|pupilname|studentname|namamurid|namapelajar|namacalon)$/.test(c));
    if(hasName){headerIndex=i;header=h;break;}
  }
  if(!header.length){header=matrix[0].map(norm);}
  const col=(patterns)=>header.findIndex(s=>patterns.some(re=>re.test(s)));
  const ni=col([/^(name|nama|pupilname|studentname|namamurid|namapelajar|namacalon)$/]);
  const ii=col([/^(no|nombor|bil|bilangan|number|id|examineeno|examinenumber|angkagiliran|nocalon|nomurid)$/]);
  const yi=col([/^(year|tahun|thn)$/]);const ci=col([/^(class|kelas|cls)$/]);
  if(ni<0)throw new Error(`Could not find a Name/Nama column in sheet “${sheetName||'CSV'}”. Use a header named Name, Nama, or Nama Murid.`);
  const smatch=String(sheetName).toUpperCase().match(/([1-6])\s*[-_ ]?\s*(C|G|T|CERDAS|GEMILANG|TERBILANG)\b/);
  const defaultYear=smatch?smatch[1]:'';
  const defaultClass=smatch?smatch[2][0]:'';
  const out=[];
  for(let r=headerIndex+1;r<matrix.length;r++){
    const cells=matrix[r]||[];const name=String(cells[ni]??'').trim();if(!name)continue;
    const rawNo=ii>=0?String(cells[ii]??'').trim():'';
    // If an examinee number column is missing, use consecutive numbered data rows.
    const examNo=/^\d{1,2}$/.test(rawNo)?Number(rawNo):(ii<0?r-headerIndex:null);
    const yr=yi>=0?String(cells[yi]??'').trim():defaultYear;
    let cls=ci>=0?String(cells[ci]??'').trim():defaultClass;
    cls=({CERDAS:'C',GEMILANG:'G',TERBILANG:'T'})[cls.toUpperCase()]||cls.toUpperCase()[0]||'';
    if(examNo===null||examNo<0||examNo>99)continue;
    out.push({year:String(yr),classCode:cls,examNo:String(examNo).padStart(2,'0'),name,
              _sheet:sheetName,_sheetPath:sheetPath,_row:r+1});
  }
  return out;
}
async function unzip(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let pos=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--){if(u32(view,i)===0x06054b50){pos=i;break;}}
  if(pos<0)throw new Error('This file is not a valid .xlsx archive.');
  const count=u16(view,pos+10),central=u32(view,pos+16),entries=new Map();let off=central;
  for(let i=0;i<count;i++){
    if(u32(view,off)!==0x02014b50)throw new Error('Invalid XLSX central directory.');
    const flags=u16(view,off+8),method=u16(view,off+10),len=u32(view,off+20),nameLen=u16(view,off+28),extraLen=u16(view,off+30),commentLen=u16(view,off+32),local=u32(view,off+42);
    const name=decoder.decode(bytes.subarray(off+46,off+46+nameLen));
    const lName=u16(view,local+26),lExtra=u16(view,local+28),start=local+30+lName+lExtra;
    entries.set(name,{name,method,flags,payload:bytes.slice(start,start+len)});
    off+=46+nameLen+extraLen+commentLen;
  }
  return entries;
}
async function contents(entry){
  if(!entry)throw new Error('Missing Excel worksheet file.');
  if(entry.method===0)return entry.payload;
  if(entry.method!==8)throw new Error('Unsupported XLSX compression method.');
  if(typeof DecompressionStream!=='function')throw new Error('This browser does not support native XLSX decompression. Please upload a CSV roster.');
  const ds=new DecompressionStream('deflate-raw');const stream=new Blob([entry.payload]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function asText(entries,path){return decoder.decode(await contents(entries.get(path)));}
function filename(base,target){
  if(target.startsWith('/'))return target.replace(/^\//,'');
  const levels=base.split('/');levels.pop();for(const part of target.split('/')){if(part==='..')levels.pop();else if(part!=='.')levels.push(part);}return levels.join('/');
}
function worksheetRows(doc,shared){
  const out=[];
  for(const row of byName(doc,'row')){
    const rid=Number(row.getAttribute('r'))||out.length+1;
    const values=[];
    for(const c of [...row.children].filter(el=>el.localName==='c')){
      const col=alphaToIndex((c.getAttribute('r')||'A1').replace(/[0-9]/g,''));
      const t=c.getAttribute('t');const raw=xmlText(c,'v');let value=raw;
      if(t==='s')value=shared[Number(raw)]??'';
      if(t==='inlineStr')value=xmlText(c,'t');
      values[col]=value;
    }
    out[rid-1]=values;
  }
  return out.map(row=>row||[]);
}
export async function importXLSX(arraybuffer){
  const bytes=new Uint8Array(arraybuffer),entries=await unzip(bytes);
  const wb=parseXML(await asText(entries,'xl/workbook.xml'));
  const rels=parseXML(await asText(entries,'xl/_rels/workbook.xml.rels'));
  const relMap=new Map(byName(rels,'Relationship').map(e=>[e.getAttribute('Id'),e.getAttribute('Target')]));
  const shared=entries.has('xl/sharedStrings.xml')?byName(parseXML(await asText(entries,'xl/sharedStrings.xml')),'si').map(el=>byName(el,'t').map(t=>t.textContent).join('')):[];
  const list=[];const invalid=[];
  for(const sh of byName(wb,'sheet')){
    const sname=sh.getAttribute('name')||'Sheet',rel=sh.getAttribute('r:id')||sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const path=filename('xl/workbook.xml',relMap.get(rel)||'');
    if(!entries.has(path))continue;
    const matrix=worksheetRows(parseXML(await asText(entries,path)),shared);
    try{list.push(...rosterFromRows(matrix,sname,path));}catch(e){invalid.push(sname);}
  }
  if(!list.length)throw new Error('No usable roster found. Excel sheets need a Name/Nama header and ideally Year, Class, and No. Columns; or a sheet name like 5T.');
  return {people:list,skipped:invalid};
}
// CRC32 and uncompressed ZIP for exporting a workbook without third-party libraries.
const crcTable=new Uint32Array(256).map((_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?(0xEDB88320^(c>>>1)):c>>>1;return c>>>0;});
function crc32(data){let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
const set16=(v,off,n)=>v.setUint16(off,n,true),set32=(v,off,n)=>v.setUint32(off,n,true);
function zipStored(files){
  const pieces=[],central=[];let offset=0;
  for(const [name,data] of files){const n=encoder.encode(name),crc=crc32(data),local=new Uint8Array(30+n.length),v=new DataView(local.buffer);
    set32(v,0,0x04034b50);set16(v,4,20);set16(v,6,0x800);set16(v,8,0);set32(v,14,crc);set32(v,18,data.length);set32(v,22,data.length);set16(v,26,n.length);local.set(n,30);
    pieces.push(local,data);
    const cent=new Uint8Array(46+n.length),cv=new DataView(cent.buffer);
    set32(cv,0,0x02014b50);set16(cv,4,20);set16(cv,6,20);set16(cv,8,0x800);set32(cv,16,crc);set32(cv,20,data.length);set32(cv,24,data.length);set16(cv,28,n.length);set32(cv,42,offset);cent.set(n,46);central.push(cent);offset+=local.length+data.length;
  }
  const centerLen=central.reduce((n,c)=>n+c.length,0),eocd=new Uint8Array(22),ev=new DataView(eocd.buffer);
  set32(ev,0,0x06054b50);set16(ev,8,files.length);set16(ev,10,files.length);set32(ev,12,centerLen);set32(ev,16,offset);
  return new Blob([...pieces,...central,eocd],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function escapeXML(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
export async function updateWorkbook(originalBuffer,people,results){
  const entries=await unzip(new Uint8Array(originalBuffer));const bySheet=new Map();
  for(const p of people){if(!p._sheetPath||!p._row)continue;const id=`${p.year}${p.classCode}-${p.examNo}`;
    const recs=results.filter(r=>`${r.year}${r.classCode}-${r.examNo}`===id);
    if(!recs.length)continue;if(!bySheet.has(p._sheetPath))bySheet.set(p._sheetPath,[]);
    bySheet.get(p._sheetPath).push({row:p._row,records:recs});
  }
  const headers=['SKORSKAL SUBJECT','SKORSKAL MARK','SKORSKAL MAX','SKORSKAL PERCENT','SKORSKAL SCANNED AT'];
  for(const [path,rows] of bySheet){
    const doc=parseXML(await asText(entries,path));const sheetData=byName(doc,'sheetData')[0];if(!sheetData)continue;
    const nodes=byName(sheetData,'row');let maxCol=0;
    for(const row of nodes)for(const c of [...row.children].filter(c=>c.localName==='c')){
      const ci=alphaToIndex((c.getAttribute('r')||'A1').replace(/\d/g,''));if(ci>maxCol)maxCol=ci;
    }
    const start=maxCol+1;
    let header=nodes.find(n=>Number(n.getAttribute('r'))===1);
    if(!header){header=doc.createElementNS(sheetData.namespaceURI,'row');header.setAttribute('r','1');sheetData.insertBefore(header,sheetData.firstChild);}
    const put=(row,col,value)=>{
      const coord=`${indexToAlpha(col)}${row.getAttribute('r')}`;
      const old=[...row.children].find(c=>c.localName==='c'&&c.getAttribute('r')===coord);if(old)row.removeChild(old);
      const c=doc.createElementNS(sheetData.namespaceURI,'c');c.setAttribute('r',coord);c.setAttribute('t','inlineStr');
      const is=doc.createElementNS(sheetData.namespaceURI,'is'),t=doc.createElementNS(sheetData.namespaceURI,'t');t.textContent=String(value??'');is.appendChild(t);c.appendChild(is);row.appendChild(c);
    };
    for(let j=0;j<headers.length;j++)put(header,start+j,headers[j]);
    for(const item of rows){const row=nodes.find(n=>Number(n.getAttribute('r'))===item.row);if(!row)continue;
      const r=item.records.at(-1);const values=[r.subject,r.correct,r.count,r.percent,r.date];values.forEach((v,j)=>put(row,start+j,v));
    }
    const dim=byName(doc,'dimension')[0];if(dim){const lastRow=Math.max(1,...nodes.map(n=>Number(n.getAttribute('r'))||1));dim.setAttribute('ref',`A1:${indexToAlpha(start+headers.length-1)}${lastRow}`);}
    entries.get(path).payload=encoder.encode(new XMLSerializer().serializeToString(doc));entries.get(path).method=0;
  }
  const files=[];for(const [name,entry] of entries)files.push([name,await contents(entry)]);
  return zipStored(files);
}