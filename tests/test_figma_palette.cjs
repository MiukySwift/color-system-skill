// Exercise the standalone board without a live Figma file or Variable APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const scripts = process.env.COLOR_SKILL_SCRIPTS || path.resolve(__dirname, '../scripts');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(scripts, 'figma_palette.js'), 'utf8'), context);
let nextId = 0;
class Node {
  constructor(type, direction) {
    Object.assign(this, {type,id:String(++nextId),name:'',children:[],parent:null,
      layoutMode:direction || 'NONE',layoutSizingHorizontal:'FIXED',layoutSizingVertical:'FIXED',
      paddingTop:0,paddingBottom:0,paddingLeft:0,paddingRight:0,itemSpacing:0,
      fills:[],fontSize:16,lineHeight:{unit:'PIXELS',value:24},textAutoResize:'NONE',
      _width:1,_height:1,_x:0,_y:0,_characters:''});
  }
  appendChild(n) { if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);this.children.push(n);n.parent=this; }
  resize(w,h) {this._width=w;this._height=h;this.layoutSizingVertical='FIXED';this.layoutSizingHorizontal='FIXED';if(this.type==='TEXT')this.textAutoResize='NONE';}
  set characters(s) {this._characters=s;}
  get characters() {return this._characters;}
  get width() {return this._width;}
  get height() {
    if(this.type==='TEXT' && this.textAutoResize==='HEIGHT')return this.characters.split('\n').reduce((sum,s)=>sum+Math.max(1,Math.ceil(s.length*this.fontSize*0.55/this.width)),0)*this.lineHeight.value;
    if(this.layoutSizingVertical!=='HUG')return this._height;
    const middle=this.layoutMode==='VERTICAL'?this.children.reduce((s,n)=>s+n.height,0)+Math.max(0,this.children.length-1)*this.itemSpacing:Math.max(0,...this.children.map(n=>n.height));
    return this.paddingTop+middle+this.paddingBottom;
  }
  set x(v) {this._x=v;}
  set y(v) {this._y=v;}
  get x() {
    if(!this.parent || this.parent.layoutMode==='NONE')return this._x;
    const p=this.parent;const before=p.children.slice(0,p.children.indexOf(this));
    return p.paddingLeft+(p.layoutMode==='HORIZONTAL'?before.reduce((s,n)=>s+n.width+p.itemSpacing,0):0);
  }
  get y() {
    if(!this.parent || this.parent.layoutMode==='NONE')return this._y;
    const p=this.parent;const before=p.children.slice(0,p.children.indexOf(this));
    return p.paddingTop+(p.layoutMode==='VERTICAL'?before.reduce((s,n)=>s+n.height+p.itemSpacing,0):0);
  }
  findAllWithCriteria({types}) {return this.children.flatMap(n=>[...(types.includes(n.type)?[n]:[]),...n.findAllWithCriteria({types})]);}
  remove() {if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);}
}
function api(fonts=true) {
  const page = new Node('PAGE');
  return {currentPage:page,createAutoLayout:direction=>new Node('FRAME',direction),
    createText:()=>new Node('TEXT'),createRectangle:()=>new Node('RECTANGLE'),
    listAvailableFontsAsync:async()=>fonts?[{fontName:{family:'Inter',style:'Regular'}}]:[],loadFontAsync:async()=>{},
    variables:new Proxy({}, {get(){throw new Error('Standalone mode must not access Variables');}})};
}
async function run() {
  const palette=JSON.parse(execFileSync('python3',['-c',"import json,sys;sys.path.insert(0,sys.argv[1]);from single_palette import generate_palette;print(json.dumps(generate_palette('#3178A9','A long neutral palette name for wrapping validation',True)))",scripts],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}));
  const figma=api();const unrelated=new Node('FRAME');unrelated.resize(500,500);figma.currentPage.appendChild(unrelated);
  const result=await context.createSinglePalette(figma,palette,'test-snapshot');
  assert.equal(result.status,'verified');assert.equal(result.swatches,12);assert.equal(result.contrastPairs,60);
  assert.equal(figma.currentPage.children.length,2);
  const board=figma.currentPage.children[1];assert.ok(board.x>unrelated.x+unrelated.width);
  assert.equal(result.createdNodeIds.length,1+board.findAllWithCriteria({types:['FRAME','TEXT','RECTANGLE']}).length);
  const text=board.findAllWithCriteria({types:['TEXT']});
  for(const row of palette.swatches)for(const key of ['white','black','stepOnWhite','stepOnBlack','seedOnStep']) {
    const ratio=text.find(n=>n.name===`${row.step}/${key}/ratio`);
    assert.equal(ratio.characters,`${row.contrast[key].ratio.toFixed(2)}:1`);
    const aa=text.find(n=>n.name===`${row.step}/${key}/Aa`);
    const sample=board.findAllWithCriteria({types:['FRAME']}).find(n=>n.name===`${row.step}/${key}/sample`);
    for(const [channel,start]of [['r',1],['g',3],['b',5]]){
      assert.equal(aa.fills[0].color[channel],parseInt(row.contrast[key].foreground.slice(start,start+2),16)/255);
      assert.equal(sample.fills[0].color[channel],parseInt(row.contrast[key].background.slice(start,start+2),16)/255);
    }
  }
  assert.ok(text.every(n=>n.textAutoResize==='HEIGHT'&&n.layoutSizingVertical==='HUG'&&n.height>=n.fontSize));
  const again=await context.createSinglePalette(figma,palette,'test-snapshot');
  assert.equal(again.reused,true);assert.equal(again.createdNodeIds.length,0);
  const fixedSeed=text.find(n=>n.name==='50/seedOnStep/Aa');const originalFill=fixedSeed.fills;
  fixedSeed.fills=[{type:'SOLID',color:{r:1,g:1,b:1}}];
  await assert.rejects(()=>context.createSinglePalette(figma,palette,'test-snapshot'),/text\/fill mismatch/);
  fixedSeed.fills=originalFill;
  text.find(n=>n.name==='500/white/ratio').characters='incorrect';
  await assert.rejects(()=>context.createSinglePalette(figma,palette,'test-snapshot'),/missing ratio/);
  assert.equal(figma.currentPage.children.length,2);
  await assert.rejects(()=>context.createSinglePalette(api(false),palette,'missing-font'),/Inter Regular/);
  console.log('Standalone palette: editable layout, 60 directed text/fill pairs, no Variables, reuse, and drift rejection passed.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
