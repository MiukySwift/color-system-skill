// Editable standalone palette. Does not create or modify Variables or semantic mappings.
async function createSinglePalette(figma, palette, snapshot) {
  const page = figma.currentPage;
  const rootName = `Single Palette / ${palette.name} / ${snapshot}`;
  const views = [
    ['white','WHITE TEXT / STEP FILL'], ['black','BLACK TEXT / STEP FILL'],
    ['stepOnWhite','STEP TEXT / WHITE FILL'], ['stepOnBlack','STEP TEXT / BLACK FILL'],
    ['seedOnStep','SEED TEXT / STEP FILL']
  ];
  const INNER=1632, STEP=80, FILL=208, CELL=240, GAP=24;
  const created = [], labels = [], samples = [];
  const matches = page.children.filter(n => n.name === rootName);
  if (matches.length > 1) throw new Error('Duplicate palette boards; inspect their IDs before continuing');
  const color = hex => ({r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255});
  const paint = hex => ({type:'SOLID',color:color(hex)});
  const matchesColor=(paints,hex)=>paints.length===1&&paints[0].type==='SOLID'&&['r','g','b'].every(k=>Math.abs(paints[0].color[k]-color(hex)[k])<1e-6)&&(paints[0].opacity===undefined||Math.abs(paints[0].opacity-1)<1e-6);
  const status=c=>c.normalTextPass?'Normal text':c.largeTextPass?'Large text only':'Below text thresholds';
  const border = {type:'SOLID',color:color('#808080'),opacity:0.3};
  const track = n => {created.push(n.id);return n;};
  const describe = (root, reused) => {
    const textNodes = root.findAllWithCriteria({types:['TEXT']});
    const errors = [];
    for (const n of textNodes) {
      if (n.textAutoResize !== 'HEIGHT' || n.layoutSizingVertical !== 'HUG' || n.height < n.fontSize || n.lineHeight.unit !== 'PIXELS' || n.lineHeight.value < n.fontSize) errors.push(n.id + ': invalid text height');
    }
    for (const n of root.findAllWithCriteria({types:['FRAME']})) {
      if (n.children.some(c => c.x < -1 || c.y < -1 || c.x+c.width > n.width+1 || c.y+c.height > n.height+1)) errors.push(n.id + ': content overflow');
    }
    for (const row of palette.swatches) {
      for (const [foreground] of views) {
        const c=row.contrast[foreground];
        const expected = `${row.contrast[foreground].ratio.toFixed(2)}:1`;
        if (!textNodes.some(n => n.name === `${row.step}/${foreground}/ratio` && n.characters === expected)) errors.push(`${row.step}/${foreground}: missing ratio`);
        const aa=textNodes.find(n=>n.name===`${row.step}/${foreground}/Aa`);
        const sample=root.findAllWithCriteria({types:['FRAME']}).find(n=>n.name===`${row.step}/${foreground}/sample`);
        if(!aa||!matchesColor(aa.fills,c.foreground)||!sample||!matchesColor(sample.fills,c.background))errors.push(`${row.step}/${foreground}: text/fill mismatch`);
        if(!textNodes.some(n=>n.name===`${row.step}/${foreground}/status`&&n.characters===status(c)))errors.push(`${row.step}/${foreground}: missing text status`);
      }
      const swatch = root.findAllWithCriteria({types:['FRAME']}).find(n => n.name === `Swatch / ${row.step} / ${row.hex}`);
      if (!swatch || swatch.fills.length !== 1 || swatch.fills[0].type !== 'SOLID' || ['r','g','b'].some(k => Math.abs(swatch.fills[0].color[k]-color(row.hex)[k])>1e-6)) errors.push(`${row.step}: swatch mismatch`);
    }
    if (errors.length) throw new Error(errors.join('; '));
    return {status:'verified',reused,rootId:root.id,pageId:page.id,createdNodeIds:created,
      mutatedNodeIds:[],swatches:palette.swatches.length,contrastPairs:palette.swatches.length*views.length,
      textNodeIds:textNodes.map(n=>n.id),snapshot,visualReview:'required'};
  };
  if (matches.length) return describe(matches[0], true);
  const available = await figma.listAvailableFontsAsync();
  const font = {family:'Inter',style:'Regular'};
  if (!available.some(f=>f.fontName.family===font.family && f.fontName.style===font.style)) throw new Error('Inter Regular is required for the palette board');
  await figma.loadFontAsync(font);
  function auto(parent, name, direction, width, gap=0, height=null) {
    const n=track(figma.createAutoLayout(direction));n.name=name;n.fills=[];n.itemSpacing=gap;
    parent.appendChild(n);n.resize(width,height===null?1:height);
    n.layoutSizingHorizontal='FIXED';n.layoutSizingVertical=height===null?'HUG':'FIXED';
    n.clipsContent=false;n.primaryAxisAlignItems='MIN';n.counterAxisAlignItems='MIN';return n;
  }
  function text(parent, name, value, width, size=18, ink='#181818') {
    const n=track(figma.createText());n.name=name;n.fontName=font;n.fontSize=size;
    const lh=Math.ceil(size*1.4);n.lineHeight={unit:'PIXELS',value:lh};n.fills=[paint(ink)];parent.appendChild(n);
    n.resize(width,lh);n.layoutSizingHorizontal='FIXED';n.textAutoResize='HEIGHT';n.characters=String(value);n.layoutSizingVertical='HUG';labels.push(n.id);return n;
  }
  function line(parent) {
    const n=track(figma.createRectangle());parent.appendChild(n);n.name='Divider';n.resize(INNER,1);n.fills=[border];return n;
  }
  const rightEdge=page.children.length?Math.max(...page.children.map(n=>n.x+n.width)):0;
  const top=page.children.length?Math.min(...page.children.map(n=>n.y)):80;
  let root;
  try {
    root=auto(page,rootName,'VERTICAL',INNER+96,18);root.x=rightEdge+120;root.y=top;
    root.paddingTop=48;root.paddingBottom=48;root.paddingLeft=48;root.paddingRight=48;root.fills=[paint('#FFFFFF')];root.cornerRadius=16;
    text(root,'Title',`${palette.name} / Single-color palette`,INNER,32);
    text(root,'Method',`${palette.seed} · ${palette.swatches.length} opaque steps · 500 preserves the seed · 5 text/fill views per step`,INNER,18,'#555555');
    const header=auto(root,'Column labels','HORIZONTAL',INNER,GAP);
    for(const [label,width]of [['STEP',STEP],['OPAQUE FILL',FILL],...views.map(v=>[v[1],CELL])])text(header,label,label,width,14,'#555555');
    line(root);
    const table=auto(root,'Palette and contrast','VERTICAL',INNER,16);
    for(const row of palette.swatches){
      const r=auto(table,`Step / ${row.step}`,'HORIZONTAL',INNER,GAP);r.counterAxisAlignItems='CENTER';
      text(r,`Step / ${row.step} / label`,String(row.step)+(row.step===500?' / Seed':''),STEP,18);
      const fill=auto(r,'Opaque fill','HORIZONTAL',FILL,12);fill.counterAxisAlignItems='CENTER';
      const swatch=auto(fill,`Swatch / ${row.step} / ${row.hex}`,'HORIZONTAL',64,0,64);
      swatch.fills=[paint(row.hex)];swatch.cornerRadius=8;swatch.clipsContent=true;swatch.strokes=[border];swatch.strokeWeight=1;swatch.strokeAlign='INSIDE';swatch.strokesIncludedInLayout=false;samples.push(swatch.id);
      text(fill,`${row.step}/hex`,row.hex,132,18);
      for(const [key]of views){
        const c=row.contrast[key];const cell=auto(r,`${row.step}/${key}`,'HORIZONTAL',CELL,12);cell.counterAxisAlignItems='CENTER';
        const sample=auto(cell,`${row.step}/${key}/sample`,'HORIZONTAL',48,0,64);sample.fills=[paint(c.background)];sample.cornerRadius=8;sample.strokes=[border];sample.strokeWeight=1;sample.strokeAlign='INSIDE';sample.strokesIncludedInLayout=false;sample.clipsContent=true;sample.primaryAxisAlignItems='CENTER';sample.counterAxisAlignItems='CENTER';
        text(sample,`${row.step}/${key}/Aa`,'Aa',32,24,c.foreground);
        const caption=auto(cell,'Contrast and text status','VERTICAL',180,2);
        text(caption,`${row.step}/${key}/ratio`,`${c.ratio.toFixed(2)}:1`,180,22);
        text(caption,`${row.step}/${key}/status`,status(c),180,16,'#555555');
      }
    }
    line(root);
    text(root,'Thresholds','WCAG 2.2 text: normal ≥4.5:1; large ≥3:1 (24 CSS px regular / 18.67 CSS px bold).',INNER,16,'#555555');
    text(root,'View definitions',`Seed text stays ${palette.seed} in every row; seed on step 500 is 1:1. Reversed text/fill pairs share the same ratio but show different visual uses.`,INNER,16,'#555555');
    text(root,'Audit scope','Pure white and pure black (100%), not black90. Unrounded values determine status; two decimals are display only. These pairwise checks do not imply overall WCAG conformance.',INNER,16,'#555555');
    return describe(root, false);
  } catch(error) {
    let rollbackComplete=true;
    if(root)try{root.remove();}catch(cleanup){rollbackComplete=false;}
    return {status:'failed',error:String(error.message||error),createdNodeIds:created,rootId:root?root.id:null,rollbackComplete};
  }
}
