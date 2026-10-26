// One geometry definition drives printing, previews and recognition.
export function settings(value={}) {
  return {count:Math.max(1,Math.min(60,Math.round(Number(value.count)||20))),options:Math.max(2,Math.min(5,Math.round(Number(value.options)||4))),shape:value.shape==='oval'?'oval':'circle'};
}
export function splitCount(n){return n<=5?Math.ceil(n/2):Math.min(n,Math.ceil(n/10)*5);}
export function buildTemplate(base,value){
  const s=settings(value),t=structuredClone(base);t.settings=s;t.split=splitCount(s.count);
  t.format='skorskal_answers_only_v1';t.identification={};
  for(const [key,a] of Object.entries(t.anchors))a.y=t.page.height_pt-(key.startsWith('top')?170:790);
  t.questions={};const step=Math.min(20,540/Math.max(1,t.split-1));
  for(let q=1;q<=s.count;q++){
    const right=q>t.split,row=right?q-t.split-1:q-1;
    const bubbles={};for(let i=0;i<s.options;i++)bubbles['ABCDE'[i]]={x:(right?347:100)+i*34,y:t.page.height_pt-210-row*step,radius_pt:6.2,rx:s.shape==='oval'?10:6.2,ry:6.2};
    t.questions[q]={bubbles};
  }return t;
}
export function sheetSVG(t){
  const h=t.page.height_pt,w=t.page.width_pt,s=t.settings;
  const text=(x,y,v,size=10)=>`<text x="${x}" y="${y}" font-size="${size}" font-family="Times New Roman, Times, serif">${v}</text>`;
  let out=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="210mm" height="297mm"><rect width="100%" height="100%" fill="white"/>`;
  for(const a of Object.values(t.anchors))out+=`<rect x="${a.x-10}" y="${h-a.y-10}" width="20" height="20"/>`;
  out+=`<text x="${w/2}" y="55" text-anchor="middle" font-size="18" font-weight="bold" font-family="Times New Roman, Times, serif">KERTAS JAWAPAN OBJEKTIF</text>`;
  out+=`<text x="${w/2}" y="77" text-anchor="middle" font-size="13" font-family="Times New Roman, Times, serif">OBJECTIVE ANSWER SHEET (OAS)</text>`;
  out+=text(65,112,'NAMA / NAME: __________________________________________________',11);
  out+=text(65,140,'KELAS / CLASS: _________________________________________________',11);
  const bubble=(b,label)=>`<ellipse cx="${b.x}" cy="${h-b.y}" rx="${b.rx||b.radius_pt}" ry="${b.ry||b.radius_pt}" fill="none" stroke="black" stroke-width="0.7"/>`+text(b.x-2.2,h-b.y+2,label,6);
  for(const [q,row] of Object.entries(t.questions)){const first=Object.values(row.bubbles)[0];out+=text(first.x-30,h-first.y+3,q+'.');for(const [label,b] of Object.entries(row.bubbles))out+=bubble(b,label);}
  out+=`<text x="${w/2}" y="815" text-anchor="middle" font-size="10" font-family="Times New Roman, Times, serif">skorskal© by MrDhameri</text>`+'</svg>';return out;
}
export async function sheetCanvas(t){const svg=sheetSVG(t),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try{const img=new Image();img.src=url;await img.decode();const cv=document.createElement('canvas');cv.width=1191;cv.height=1684;cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);return cv;}finally{URL.revokeObjectURL(url);}}

