// skorskal — offline-friendly OMR image registration and bubble reading.
const WIDTH = 595.2756, HEIGHT = 841.8898;
const markerPts = [[39,39],[556.276,39],[39,802.8898],[556.276,802.8898]];

export function imageToPixels(source, maxLong = 1600) {
  const w = source.naturalWidth || source.videoWidth || source.width;
  const h = source.naturalHeight || source.videoHeight || source.height;
  if(!w || !h) throw new Error('The image is empty.');
  const scale = Math.min(1,maxLong/Math.max(w,h));
  const cv = document.createElement('canvas');
  cv.width=Math.max(1,Math.round(w*scale));cv.height=Math.max(1,Math.round(h*scale));
  cv.getContext('2d',{willReadFrequently:true}).drawImage(source,0,0,cv.width,cv.height);
  return cv;
}

function luminance(img){
  const {data,width,height}=img;
  const gray=new Uint8Array(width*height);
  for(let i=0,j=0;i<data.length;i+=4,j++) gray[j]=(77*data[i]+150*data[i+1]+29*data[i+2])>>8;
  return gray;
}

export function findAnchors(cv) {
  // Locate four fully dark, filled approximately square connected components.
  const max=990, scale=Math.min(1,max/Math.max(cv.width,cv.height));
  const small=document.createElement('canvas');small.width=Math.max(1,Math.round(cv.width*scale));small.height=Math.max(1,Math.round(cv.height*scale));
  const ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(cv,0,0,small.width,small.height);
  const {width:w,height:h}=small, gray=luminance(ctx.getImageData(0,0,w,h));
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),cs=[];
  const limit=w*h,minArea=Math.max(42,limit*.000065);
  for(let p=0;p<limit;p++){
    if(seen[p] || gray[p]>115) continue;
    let st=0,en=1;queue[0]=p;seen[p]=1;
    let xMin=p%w,xMax=xMin,yMin=(p/w)|0,yMax=yMin;
    while(st<en){
      const k=queue[st++],x=k%w,y=(k/w)|0;
      if(x<xMin)xMin=x;if(x>xMax)xMax=x;if(y<yMin)yMin=y;if(y>yMax)yMax=y;
      const n1=x>0?k-1:-1, n2=x<w-1?k+1:-1,n3=y>0?k-w:-1,n4=y<h-1?k+w:-1;
      for(const q of [n1,n2,n3,n4]) if(q>=0 && !seen[q] && gray[q]<115){seen[q]=1;queue[en++]=q;}
    }
    if(en<minArea) continue;
    const bw=xMax-xMin+1,bh=yMax-yMin+1,ratio=bw/bh,fill=en/(bw*bh);
    if(bw<8 || bh<8 || bw>w*.095 || bh>h*.095 || ratio<.70 || ratio>1.43 || fill<.69)continue;
    cs.push({x:(xMin+xMax)/2/scale,y:(yMin+yMax)/2/scale,area:en,fill,size:Math.sqrt(bw*bh),box:[xMin,yMin,xMax,yMax]});
  }
  if(cs.length<4) throw new Error('Could not detect four square anchors. Use Adjust corners, or retake the photo with all four squares visible.');
  cs.sort((a,b)=>b.area-a.area);
  // Prefer consistently sized square candidates, distant enough to span an A4 sheet.
  let best=null,bscore=-Infinity;
  const top=cs.slice(0,Math.min(20,cs.length));
  for(let a=0;a<top.length;a++)for(let b=a+1;b<top.length;b++)for(let d=b+1;d<top.length;d++)for(let e=d+1;e<top.length;e++){
    const arr=[top[a],top[b],top[d],top[e]];
    const areas=arr.map(v=>v.area),aratio=Math.max(...areas)/Math.min(...areas);
    if(aratio>2.8)continue;
    const m=arr.slice().sort((u,v)=>u.y-v.y),upper=m.slice(0,2).sort((u,v)=>u.x-v.x),lower=m.slice(2).sort((u,v)=>u.x-v.x);
    const sorted=[upper[0],upper[1],lower[0],lower[1]];
    const [tl,tr,bl,br]=sorted;
    if(!(tl.x<tr.x && bl.x<br.x && tl.y<bl.y && tr.y<br.y))continue;
    const xspan=Math.min(tr.x-tl.x,br.x-bl.x), yspan=Math.min(bl.y-tl.y,br.y-tr.y);
    if(xspan<cv.width*.35 || yspan<cv.height*.35)continue;
    const vertical=yspan/xspan;
    if(vertical<.85 || vertical>2.7)continue;
    const sizeScore=areas.reduce((s,n)=>s+Math.sqrt(n),0);
    const areaScore=(xspan*yspan)/(cv.width*cv.height);
    const score=areaScore*180 + sizeScore*.45 - Math.log(aratio)*13 - Math.abs(vertical-1.48)*14;
    if(score>bscore){bscore=score;best=sorted;}
  }
  if(!best) throw new Error('Square anchors detected, but their layout does not match the portrait A4 template. Straighten the page or use manual corners.');
  return {corners:best.map(v=>({x:v.x,y:v.y})),candidates:cs.length};
}

function linearSolve(a,b){
  for(let j=0;j<b.length;j++){
    let p=j;for(let k=j+1;k<b.length;k++)if(Math.abs(a[k][j])>Math.abs(a[p][j]))p=k;
    if(Math.abs(a[p][j])<1e-10)throw new Error('The anchor geometry is invalid.');
    [a[p],a[j]]=[a[j],a[p]];[b[p],b[j]]=[b[j],b[p]];
    const z=a[j][j];for(let c=j;c<b.length;c++)a[j][c]/=z;b[j]/=z;
    for(let r=0;r<b.length;r++)if(r!==j){const v=a[r][j];for(let c=j;c<b.length;c++)a[r][c]-=v*a[j][c];b[r]-=v*b[j];}
  }
  return b;
}
function homography(dst) {
  const A=[],b=[];
  for(let i=0;i<4;i++){
    const [x,y]=markerPts[i],{x:u,y:v}=dst[i];
    A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);
  }
  return linearSolve(A,b);
}

export function straighten(cv,corners){
  const im=cv.getContext('2d',{willReadFrequently:true}).getImageData(0,0,cv.width,cv.height);
  const source=luminance(im), srcW=cv.width,srcH=cv.height;
  const scale=1.55, w=Math.round(WIDTH*scale), h=Math.round(HEIGHT*scale);
  const out=new Uint8Array(w*h),H=homography(corners);
  let k=0,valid=0;
  for(let y=0;y<h;y++){
    const yp=y/scale;
    for(let x=0;x<w;x++,k++){
      const xp=x/scale,d=H[6]*xp+H[7]*yp+1;
      const sx=(H[0]*xp+H[1]*yp+H[2])/d,sy=(H[3]*xp+H[4]*yp+H[5])/d;
      const ix=Math.floor(sx),iy=Math.floor(sy);
      if(ix>=0&&iy>=0&&ix<srcW-1&&iy<srcH-1){
        const fx=sx-ix,fy=sy-iy,p=iy*srcW+ix;
        out[k]=Math.round(source[p]*(1-fx)*(1-fy)+source[p+1]*fx*(1-fy)+source[p+srcW]*(1-fx)*fy+source[p+srcW+1]*fx*fy);valid++;
      }else out[k]=255;
    }
  }
  if(valid<out.length*.62)throw new Error('Too much of the sheet is outside the photograph. Please retake it.');
  const aligned=document.createElement('canvas');aligned.width=w;aligned.height=h;
  const ac=aligned.getContext('2d',{willReadFrequently:true}),rgba=ac.createImageData(w,h);
  for(let i=0;i<out.length;i++){rgba.data[4*i]=out[i];rgba.data[4*i+1]=out[i];rgba.data[4*i+2]=out[i];rgba.data[4*i+3]=255;}
  ac.putImageData(rgba,0,0);
  return {aligned,gray:out,width:w,height:h,scale};
}

function bubbleIntensity(warp,bub){
  const {gray,width,height,scale}=warp;
  const x=bub.x*scale,y=(HEIGHT-bub.y)*scale,r=bub.radius_pt*scale,rx=(bub.rx||bub.radius_pt)*scale,ry=(bub.ry||bub.radius_pt)*scale;
  // Diagonal background samples stay outside the printed bubble border.
  const samples=[];
  for(const [dx,dy] of [[-1.62,-1.62],[-1.62,1.62],[1.62,-1.62],[1.62,1.62],[0,-1.95],[0,1.95]]){
    const sx=Math.round(x+dx*rx),sy=Math.round(y+dy*ry);
    if(sx>=0&&sx<width&&sy>=0&&sy<height)samples.push(gray[sy*width+sx]);
  }
  samples.sort((a,b)=>a-b);const base=samples.length ? samples[Math.floor(samples.length*.55)] : 250;
  let total=0,n=0,filled=0;
  const bx=rx*.66,by=ry*.66;
  for(let iy=Math.ceil(y-by);iy<=Math.floor(y+by);iy++){
    for(let ix=Math.ceil(x-bx);ix<=Math.floor(x+bx);ix++){
      if(((ix-x)/bx)**2+((iy-y)/by)**2>1 || iy<0 || ix<0 || iy>=height || ix>=width)continue;
      const delta=base-gray[iy*width+ix];
      total+=Math.max(0,Math.min(1,(delta-13)/145));n++;
      if(delta>54)filled++;
    }
  }
  return {score:n?total/n:0,coverage:n?filled/n:0};
}
export function analyze(warp,template){
  const evaluate=(obj)=>{
    const vals=Object.entries(obj).map(([opt,b])=>({option:opt,...bubbleIntensity(warp,b)})).sort((a,b)=>b.score-a.score);
    const strongest=vals[0],second=vals[1]||{score:0};
    let answer=null,status='blank';
    if(strongest.score>.22){
      if(second.score>.19 && second.score>strongest.score*.48)status='multiple';
      else if(strongest.score<.31 || strongest.score-second.score<.12)status='uncertain';
      else {answer=strongest.option;status='ok';}
    }
    return {answer,status,confidence:+strongest.score.toFixed(3),scores:Object.fromEntries(vals.map(v=>[v.option,+v.score.toFixed(3)]))};
  };
  return {id:Object.fromEntries(Object.entries(template.identification).map(([k,v])=>[k,evaluate(v.bubbles)])),
          answers:Object.fromEntries(Object.entries(template.questions).map(([k,v])=>[k,evaluate(v.bubbles)]))};
}
