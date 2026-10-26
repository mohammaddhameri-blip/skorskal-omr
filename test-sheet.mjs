import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createCanvas,loadImage}=require('@napi-rs/canvas');
import {buildTemplate,sheetSVG,splitCount} from './sheet.js';
import {findAnchors,straighten,analyze} from './vision.js';
globalThis.document={createElement:()=>createCanvas(1,1)};
const base=JSON.parse(readFileSync(new URL('./template.json',import.meta.url)));
assert.equal(splitCount(10),5);assert.equal(splitCount(20),10);assert.equal(splitCount(25),15);
assert.deepEqual(buildTemplate(base,{}).questions,base.questions);
let tested=0;
for(const count of [1,10,20,25,40,60])for(const options of [2,3,4,5])for(const shape of ['circle','oval']){
const t=buildTemplate(base,{count,options,shape}),cv=createCanvas(1191,1684),ctx=cv.getContext('2d');
const img=await loadImage(Buffer.from(sheetSVG(t)));ctx.drawImage(img,0,0,cv.width,cv.height);
const blank=analyze(straighten(cv,findAnchors(cv).corners),t);assert.ok(Object.values(blank.answers).every(a=>a.status==='blank'),`blank ${count}/${options}/${shape}`);
for(const [q,row] of Object.entries(t.questions)){const b=row.bubbles['ABCDE'[(q-1)%options]],scale=cv.width/t.page.width_pt;ctx.beginPath();ctx.ellipse(b.x*scale,(t.page.height_pt-b.y)*scale,(b.rx||b.radius_pt)*scale*.85,(b.ry||b.radius_pt)*scale*.85,0,0,Math.PI*2);ctx.fill();}
const scanned=analyze(straighten(cv,findAnchors(cv).corners),t);
for(const [q,a] of Object.entries(scanned.answers))assert.equal(a.answer,'ABCDE'[(q-1)%options],`${count}/${options}/${shape} Q${q}: ${JSON.stringify(a)}`);tested++;
}
console.log(`Passed ${tested} sheet configurations: blank + shaded recognition, anchors and legacy geometry.`);
