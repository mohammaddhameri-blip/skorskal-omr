import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {settings,buildTemplate} from './sheet.js';
class Element{
 constructor(){this.value='';this.children=[];this.dataset={};this.classList={add(){},remove(){},toggle(){}};this.style={};this.listeners={};}
 set innerHTML(v){this.children=[];this._html=v;}get innerHTML(){return this._html;}
 addEventListener(k,f){this.listeners[k]=f;}setAttribute(){}replaceChildren(...c){this.children=c;}append(...c){this.children.push(...c);}appendChild(c){this.children.push(c);}add(c){this.children.push(c);}focus(){}getContext(){return {};}
}
const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
const storage=new Map(),base=JSON.parse(readFileSync(new URL('./template.json',import.meta.url))),doc={getElementById:el,querySelectorAll:()=>[],querySelector:()=>new Element(),createElement:()=>new Element(),documentElement:new Element()};
const context=vm.createContext({console,assert,settings,buildTemplate,document:doc,window:{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},navigator:{},location:{protocol:'http:'},Option:class extends Element{constructor(t,v){super();this.value=v;this.textContent=t;}},fetch:async()=>({ok:true,json:async()=>base}),structuredClone,setTimeout:()=>1,clearTimeout(){},confirm:()=>true,scrollTo(){},sheetSVG:()=>'',sheetCanvas:()=>{},resultsCSV(){},createRosterWorkbook(){}});
let src=readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');src=src.replace(/init\(\);\s*$/,'');vm.runInContext(src,context);await vm.runInContext('init()',context);
vm.runInContext(`
assert.equal(template.split,20);
$('questionCount').value='25';$('optionCount').value='5';$('bubbleShape').value='oval';$('questionCount').onchange();
assert.equal(template.split,15);assert.equal($('keyGrid').children[0].children.length,15);assert.equal($('keyGrid').children[1].children.length,10);
$('keyPaste').value='ABCDE'.repeat(5);$('applyPasteBtn').onclick();assert.equal(Object.keys(keyDraft).length,25);$('saveKeyBtn').onclick();
assert.equal(getKey().sheet.count,25);assert.equal(getKey().sheet.options,5);
for(const id of ['editYear','editClass','editNo','editSubject','editPupilName'])$(id).value='';
current={answers:Object.fromEntries(Array.from({length:25},(_,i)=>[i+1,{answer:'ABCDE'[i%5],status:'ok'}]))};
refreshReview();assert.equal($('saveResultBtn').disabled,false);
const one=makeRecord();records.push(one);const two=makeRecord();records.push(two);
assert.equal(one.correct,25);assert.equal(one.name,'Scan 1');assert.equal(two.name,'Scan 2');assert.notEqual(one.id,two.id);assert.equal(one.examNo,'');
// Legacy partial key paste still clears unused questions without changing the 40-question calibration.
applyConfig({count:40,options:4,shape:'circle'});$('keyPaste').value='ABCD'.repeat(5);$('applyPasteBtn').onclick();assert.equal(Object.keys(keyDraft).length,20);assert.equal(keyDraft['21'],undefined);
$('optionCount').value='2';$('optionCount').onchange();assert.ok(Object.values(keyDraft).every(a=>'AB'.includes(a)));
console.log('Passed app flow: settings, splits, keys, partial paste, optional ID, independent unnamed records.');
`,context);
