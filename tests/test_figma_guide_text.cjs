// Model the sizing reset that Figma performs when resize() is called on text.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/figma_guide.js'), 'utf8'), context);
function textNode() {
  let content = '';
  const node = {
    fontSize: 14, lineHeight: {unit: 'PIXELS', value: 19},
    width: 1, height: 1, textAutoResize: 'NONE',
    layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    resize(width, height) {
      this.width = width; this.height = height;
      this.textAutoResize = 'NONE'; this.layoutSizingVertical = 'FIXED';
      this.layoutSizingHorizontal = 'FIXED';
    },
    get characters() { return content; },
    set characters(value) {
      content = value;
      if (this.textAutoResize === 'HEIGHT') {
        const columns = Math.max(1, Math.floor(this.width / 8));
        const lines = content.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / columns)), 0);
        this.height = lines * this.lineHeight.value;
      }
    }
  };
  return node;
}
for (const content of ['One line', 'First line\nSecond line', 'Wrapping metadata '.repeat(12)]) {
  const node = textNode();
  context.setGuideTextLayout(node, 160, 19, content);
  assert.equal(node.width, 160);
  assert.equal(node.characters, content);
  assert.equal(node.textAutoResize, 'HEIGHT');
  assert.equal(node.layoutSizingVertical, 'HUG');
  assert.equal(node.layoutSizingHorizontal, 'FIXED');
  assert.ok(node.height >= 19 * content.split('\n').length);
  assert.equal(context.guideTextLayoutIssue(node), null);
  if (content.length > 30) assert.ok(node.height > 19);
}
for (const mutate of [
  node => { node.layoutSizingVertical = 'FIXED'; },
  node => { node.textAutoResize = 'NONE'; },
  node => { node.height = 1; },
  node => { node.characters = 'First\nSecond'; node.height = 19; },
  node => { node.resize(160, 1); }
]) {
  const node = textNode();
  context.setGuideTextLayout(node, 160, 19, 'Actual content');
  mutate(node);
  assert.notEqual(context.guideTextLayoutIssue(node), null);
}
console.log('Text sizing regression: multiline, wrapping, Hug, and one-pixel rejection passed.');

const backdrop = {width:60,height:52,cornerRadius:0,clipsContent:false,fills:[],children:[{type:'RECTANGLE',width:60,height:52,x:0,y:0,cornerRadius:0,strokes:[],layoutSizingHorizontal:'FILL',layoutSizingVertical:'FILL'}]};
context.setGuideCheckerboard(backdrop, 'synthetic-image-hash');
assert.equal(backdrop.cornerRadius, 6);
assert.equal(backdrop.strokesIncludedInLayout, false);
assert.equal(backdrop.clipsContent, true);
assert.equal(backdrop.fills[0].type, 'IMAGE');
assert.equal(backdrop.fills[0].scaleMode, 'TILE');
assert.equal(context.guideCheckerboardIssue(backdrop), null);
backdrop.clipsContent = false;
assert.notEqual(context.guideCheckerboardIssue(backdrop), null);
backdrop.clipsContent=true;backdrop.children[0].width=30;assert.notEqual(context.guideCheckerboardIssue(backdrop),null);

backdrop.children[0].width=60;backdrop.children[0].strokes=[{type:'SOLID'}];assert.notEqual(context.guideCheckerboardIssue(backdrop),null);
backdrop.children[0].strokes=[];backdrop.children[0].layoutSizingHorizontal='FIXED';assert.notEqual(context.guideCheckerboardIssue(backdrop),null);
backdrop.children[0].layoutSizingHorizontal='FILL';backdrop.strokesIncludedInLayout=true;assert.notEqual(context.guideCheckerboardIssue(backdrop),null);
