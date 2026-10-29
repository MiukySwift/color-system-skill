// One tiled image beneath one bound color; matching clipping prevents exposed corners.
function setGuideCheckerboard(node, imageHash) {
  node.name = 'Transparency checkerboard';
  node.cornerRadius = 6;
  node.clipsContent = true;
  node.strokes = [{type:'SOLID',color:{r:128/255,g:128/255,b:128/255},opacity:0.3}];
  node.strokeWeight = 1;node.strokeAlign = 'INSIDE';node.strokesIncludedInLayout = false;
  node.fills = [{type:'IMAGE', imageHash, scaleMode:'TILE', scalingFactor:1}];
}
function guideCheckerboardIssue(node) {
  const sample=node.children?.[0];
  if(node.children?.length!==1||sample?.type!=='RECTANGLE'||sample.width!==node.width||sample.height!==node.height||sample.cornerRadius!==0||sample.x!==0||sample.y!==0||sample.strokes.length!==0||sample.layoutSizingHorizontal!=='FILL'||sample.layoutSizingVertical!=='FILL')return 'Checkerboard requires one full-size color swatch';
  const outline=node.strokes?.[0];
  if(!outline||node.strokes.length!==1||outline.type!=='SOLID'||Math.abs(outline.opacity-0.3)>1e-6||['r','g','b'].some(k=>Math.abs(outline.color[k]-128/255)>1e-6)||node.strokeWeight!==1||node.strokeAlign!=='INSIDE'||node.strokesIncludedInLayout!==false)return 'Checkerboard outline belongs only to the full outer frame';
  return node.clipsContent && node.cornerRadius === 6 && node.fills[0]?.type === 'IMAGE' && node.fills[0].scaleMode === 'TILE'
    ? null : 'Checkerboard must use a tiled image and clipped matching corners';
}
// resize() resets text sizing; always restore auto-height and Hug after resizing.
function setGuideTextLayout(node, width, lineHeight, content) {
  node.resize(width, lineHeight);
  node.layoutSizingHorizontal = 'FIXED';
  node.textAutoResize = 'HEIGHT';
  node.characters = String(content);
  node.layoutSizingVertical = 'HUG';
}
function guideTextLayoutIssue(node) {
  const minimum = node.lineHeight.unit === 'PIXELS' ? node.lineHeight.value : node.fontSize;
  if (node.textAutoResize !== 'HEIGHT' || node.layoutSizingVertical !== 'HUG' || node.layoutSizingHorizontal !== 'FIXED') return 'Text must use fixed width and Hug height';
  if (node.height <= 1.1 || node.height + 0.75 < minimum * node.characters.split('\n').length) return 'Text height is smaller than its content';
  return null;
}
// Fixed, editable System Guide. Token colors are always bound to real Variables.
async function createColorGuide(figma, system, imported, options) {
  if (figma.fileKey && figma.fileKey !== options.fileKey) throw new Error('Target file differs from import ledger');
  const W = 1440, H = 1080, PAD = 56, INNER = W - PAD * 2, PANEL = 652;
  const ink = '#18181B', muted = '#62626C', paper = '#FFFFFF', darkInk = '#FAFAFA';
  const border = {type:'SOLID',color:{r:128/255,g:128/255,b:128/255},opacity:0.3};
  const created = [], labels = [], bindings = [], modePanels = [], inventoryWarnings=[];
  let root, newPage, checkerHash;
  const allTokens = {};
  for (const c of system.collections) for (const v of c.variables) {
    v.codeSyntax={WEB:'var(--color-'+c.key+'-'+v.name.replaceAll('/','-')+')'};
    allTokens[`${c.key}:${v.name}`] = v;
  }
  const primitiveNames = system.collections[0].variables.map(v => v.name);
  const titles = [
    ['01','Color foundations','Roles, structure, and the rules behind the palette.'],
    ['02','Opaque primitives','One fixed mixing rule. Every step is an opaque color; 500 preserves the seed.'],
    ['03','Black & White alpha','Original RGB plus alpha. A checkerboard reveals transparency beneath each complete color sample.'],
    ['04','Brand & Surface','Brand emphasis and surface hierarchy. Light and Dark use the same semantic names.'],
    ['05','Font','Information hierarchy and functional text. Preview: surface.primary; ratios cover all three opaque Surfaces.'],
    ['06','Notice / Solid','Pair each solid status fill with its on-color. Use the actual paired contrast to decide text usage.'],
    ['07','Notice / Subtle','Low-emphasis status backgrounds with their matching foregrounds.'],
    ['08','Lines','Borders, dividers, and focus. Previews use surface.primary; the ranges cover all three opaque Surfaces.'],
    ['09','Contrast review','Unrounded ratios determine status. Text, necessary boundaries, and decorative lines have different requirements.']
  ];
  const boardName = i => `Board / ${titles[i][0]} / ${titles[i][1]}`;
  const rgb = hex => ({r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255});
  const paint = hex => ({type:'SOLID',color:rgb(hex)});
  const tokenValue = (key,mode) => {
    const v = allTokens[key].values[key.startsWith('primitive:')?'Value':mode];
    return v.alias ? tokenValue(v.alias,'Value') : v;
  };
  const valueLabel = (key,mode) => {
    const value = tokenValue(key,mode);
    return value.hex + (value.alpha < 1 ? ` / ${Math.round(value.alpha*100)}%` : '');
  };
  const aliasLabel = (key,mode) => allTokens[key].values[mode].alias.replace('primitive:','');
  const record = node => {created.push(node.id);return node;};
  const font = (style='Regular',mono=false) => ({family:mono?'JetBrains Mono':'Inter',style});
  const vars = {};
  for (const [key,id] of Object.entries(imported.variableIds)) {
    const variable = await figma.variables.getVariableByIdAsync(id);
    if (!variable) throw new Error(`Missing variable: ${key}`);
    vars[key] = variable;
  }
  // Refuse stale ledgers or changed live values before drawing any swatches.
  for(const collection of system.collections){
    const c=await figma.variables.getVariableCollectionByIdAsync(imported.collectionIds[collection.key]);
    if(!c||c.name!==collection.name)throw new Error('Collection missing or renamed: '+collection.key);
    if(c.modes.length!==Object.keys(imported.modeIds[collection.key]).length||c.defaultModeId!==Object.values(imported.modeIds[collection.key])[0])throw new Error('Collection modes changed: '+collection.key);
    if(c.variableIds.length&&c.variableIds.length!==collection.variables.length)throw new Error('Collection changed: '+collection.key);
    if(!c.variableIds.length)inventoryWarnings.push('Empty collection.variableIds metadata for '+collection.key+'; every expected variable is verified by exact ID.');
    for(const [mode,id]of Object.entries(imported.modeIds[collection.key])){
      if(!c.modes.some(m=>m.modeId===id&&m.name===mode))throw new Error('Mode changed: '+mode);
    }
    for(const token of collection.variables){
      const key=collection.key+':'+token.name,v=vars[key];
      if(v.name!==token.name||v.variableCollectionId!==c.id||v.resolvedType!=='COLOR')throw new Error('Variable changed: '+key);
      const scopes=collection.key==='primitive'?[]:token.name.startsWith('font/')?['TEXT_FILL']:token.name.startsWith('lines/')?['STROKE_COLOR']:token.name.includes('/on-')?['TEXT_FILL','SHAPE_FILL','STROKE_COLOR']:['FRAME_FILL','SHAPE_FILL'];
      if(JSON.stringify([...v.scopes].sort())!==JSON.stringify(scopes.sort())||v.codeSyntax.WEB!=='var(--color-'+collection.key+'-'+token.name.replaceAll('/','-')+')')throw new Error('Variable metadata changed: '+key);
      for(const [mode,value]of Object.entries(token.values)){
        const actual=v.valuesByMode[imported.modeIds[collection.key][mode]];
        const expected=value.alias?{type:'VARIABLE_ALIAS',id:imported.variableIds[value.alias]}:{...rgb(value.hex),a:value.alpha};
        const ok=value.alias?actual?.type===expected.type&&actual.id===expected.id:actual&&['r','g','b','a'].every(k=>Math.abs(actual[k]-expected[k])<1e-6);
        if(!ok)throw new Error('Live value differs from JSON: '+key+' / '+mode);
      }
    }
  }
  function bind(node,key,mode='Value',field='fills') {
    const value = tokenValue(key,mode);
    const bound = figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb(value.hex)},'color',vars[key]);
    node[field] = [bound];
    node.name = `Color|${key}|${mode}|${field}`;
    bindings.push({id:node.id,key,mode,field});
    return node;
  }
  function auto(parent,name,direction,width,height,gap=0) {
    const n = record(figma.createAutoLayout(direction));
    n.name=name;n.fills=[];n.itemSpacing=gap;n.primaryAxisAlignItems='MIN';n.counterAxisAlignItems='MIN';
    if(parent)parent.appendChild(n);
    n.resize(width,height || 1);n.layoutSizingHorizontal='FIXED';n.layoutSizingVertical=height?'FIXED':'HUG';
    n.clipsContent=false;
    return n;
  }
  function text(parent,content,width,size=14,color=ink,style='Regular',mono=false,name='Label') {
    const n = record(figma.createText());n.name=name;n.fontName=font(style,mono);
    n.fontSize=size;n.lineHeight={unit:'PIXELS',value:Math.ceil(size*1.35)};
    n.fills=[paint(color)];parent.appendChild(n);
    setGuideTextLayout(n,width,Math.ceil(size*1.35),content);
    labels.push(n.id);return n;
  }
  function rect(parent,width,height,fill=paper,outlined=true) {
    const n=record(figma.createRectangle());n.resize(width,height);n.cornerRadius=6;n.fills=[paint(fill)];
    if(outlined){n.strokes=[border];n.strokeWeight=1;n.strokeAlign='INSIDE';}
    parent.appendChild(n);return n;
  }
  function line(parent,width){const n=rect(parent,width,1,paper,false);n.fills=[border];return n;}
  function caption(parent,key,mode,width,color=ink,compact=false) {
    text(parent,key.split(':')[1],width,compact?12:14,color,'Medium',true,`Token|${key}|${mode}`);
    if(key.startsWith('semantic:'))text(parent,'→ '+aliasLabel(key,mode),width,12,color,'Regular',true,`Alias|${key}|${mode}`);
    text(parent,valueLabel(key,mode),width,12,color,'Regular',true,`Value|${key}|${mode}`);
    if(!compact)text(parent,allTokens[key].codeSyntax.WEB,width,10,color,'Regular',true,`CSS|${key}|${mode}`);
  }
  function checkerSample(parent,key,mode,width,height) {
    if(!checkerHash)checkerHash=figma.createImage(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,16,0,0,0,16,8,6,0,0,0,31,243,255,97,0,0,0,32,73,68,65,84,120,156,99,248,79,0,92,184,112,1,47,102,24,53,96,88,24,64,72,1,33,48,106,192,176,48,0,0,253,200,181,174,160,43,85,53,0,0,0,0,73,69,78,68,174,66,96,130])).hash;
    const substrate=auto(parent,'Transparency checkerboard','VERTICAL',width,height,0);
    setGuideCheckerboard(substrate,checkerHash);
    const sample=rect(substrate,width,height,paper,false);sample.cornerRadius=0;sample.strokes=[];
    sample.layoutSizingHorizontal='FILL';sample.layoutSizingVertical='FILL';bind(sample,key,mode);
    return substrate;
  }
  function swatch(parent,key,mode,width=60,height=52) {
    return tokenValue(key,mode).alpha===1?bind(rect(parent,width,height),key,mode):checkerSample(parent,key,mode,width,height);
  }
  function board(parent,index){
    const n=auto(parent,boardName(index),'VERTICAL',W,H,24);n.fills=[paint(paper)];
    n.paddingLeft=n.paddingRight=n.paddingTop=n.paddingBottom=PAD;
    const header=auto(n,'Header','VERTICAL',INNER,112,8);
    text(header,`SYSTEM GUIDE   /   COLOR   /   ${titles[index][0]}`,INNER,12,muted,'Medium');
    text(header,titles[index][1],INNER,34,ink,'Bold');
    text(header,titles[index][2],INNER,14,muted);
    const body=auto(n,'Content','VERTICAL',INNER,784,16);
    const foot=auto(n,'Footer','HORIZONTAL',INNER,20,16);
    text(foot,'COLOR SYSTEM   ·   sRGB   ·   Variable-bound swatches   ·   Snapshot '+options.snapshot,INNER-150,10,muted,'Regular',true);
    text(foot,`${titles[index][0]} / 09`,134,10,muted,'Medium',true);
    return {node:n,body};
  }
  function modePair(body,index) {
    const pair=auto(body,'Light and Dark','HORIZONTAL',INNER,784,24);
    return ['Light','Dark'].map(mode=>{
      const p=auto(pair,`Mode|${index}|${mode}`,'VERTICAL',PANEL,784,0);
      p.paddingLeft=p.paddingRight=p.paddingTop=p.paddingBottom=20;p.cornerRadius=12;
      p.setExplicitVariableModeForCollection(imported.collectionIds.semantic,imported.modeIds.semantic[mode]);
      const b=figma.variables.setBoundVariableForPaint(paint(paper),'color',vars['semantic:surface/primary']);p.fills=[b];
      modePanels.push({id:p.id,mode});
      text(p,mode,PANEL-40,22,mode==='Dark'?darkInk:ink,'Bold');
      return {panel:p,mode,color:mode==='Dark'?darkInk:ink,width:PANEL-40};
    });
  }
  function ratioRange(row){const vals=Object.values(row.contrasts),a=Math.min(...vals),b=Math.max(...vals);return a.toFixed(2)+(b-a>0.005?'–'+b.toFixed(2):'')+':1';}
  function tokenRow(parent,name,mode,width,color,sampleType='fill') {
    const key='semantic:'+name;
    const row=auto(parent,'Row / '+name,'HORIZONTAL',width,sampleType==='text'?92:76,12);row.counterAxisAlignItems='CENTER';
    if(sampleType==='text'){
      const sample=auto(row,'Text preview','VERTICAL',60,52,0);sample.primaryAxisAlignItems='CENTER';
      bind(text(sample,'Aa',60,28,color,'Bold'),'semantic:'+name,mode);
    }else if(sampleType==='line'){
      const sample=rect(row,60,52,paper);sample.fills=[];bind(sample,key,mode,'strokes');sample.strokeWeight=name.includes('focus')?2:1;
    }else swatch(row,key,mode);
    const details=auto(row,'Token details','VERTICAL',width-72,undefined,2);
    if(sampleType==='line'){
      text(details,name,width-72,14,color,'Medium',true,`Token|${key}|${mode}`);
      const metadata=auto(details,'Alias and value','HORIZONTAL',width-72,17,10);
      text(metadata,'→ '+aliasLabel(key,mode),180,12,color,'Regular',true,`Alias|${key}|${mode}`);
      text(metadata,valueLabel(key,mode),width-262,12,color,'Regular',true,`Value|${key}|${mode}`);
      text(details,allTokens[key].codeSyntax.WEB,width-72,10,color,'Regular',true,`CSS|${key}|${mode}`);
      text(details,ratioRange(auditFor(name,mode)),width-72,11,color,'Regular',true);
    }else caption(details,key,mode,width-72,color);
    if(sampleType==='text')text(details,ratioRange(auditFor(name,mode)),width-72,11,color,'Regular',true);
    return row;
  }
  function auditFor(name,mode){return [...system.contrastAudit[mode].text,...system.contrastAudit[mode].lines].find(r=>r.token===name);}

  async function inspectGuide(existing) {
    const nodes=[];
    function walk(n){nodes.push(n);if('children'in n)for(const c of n.children)walk(c);}
    walk(existing);
    const errors=[],coverage=new Set(),boardIds={},captionKeys=new Set();
    for(let i=0;i<titles.length;i++){
      const found=nodes.filter(n=>n.name===boardName(i));
      if(found.length!==1||found[0].width!==W||found[0].height!==H)errors.push('Board structure: '+boardName(i));
      else boardIds[titles[i][0]]=found[0].id;
    }
    for(const n of nodes) {
      if(n.name.startsWith('Color|')){
        const [,key,mode,field]=n.name.split('|');
        if(!vars[key]||n[field]?.[0]?.boundVariables?.color?.id!==vars[key].id)errors.push('Binding: '+n.id);
        else coverage.add(key+'|'+mode);
        if(n.type!=='TEXT'&&field==='fills'){
          const outline=n.parent?.name==='Transparency checkerboard'?n.parent:n;
          const s=outline.strokes?.[0];
          if(!s||Math.abs(s.opacity-0.3)>1e-6||['r','g','b'].some(k=>Math.abs(s.color[k]-128/255)>1e-6))errors.push('Swatch border: '+n.id);
        }
      }
      if(n.name==='Transparency checkerboard'){
        const problem=guideCheckerboardIssue(n);
        if(problem)errors.push(problem+': '+n.id);
      }
      if(n.type==='TEXT'){
        const problem=guideTextLayoutIssue(n);
        if(problem)errors.push(problem+': '+n.id);
      }
      if('children'in n&&n.layoutMode&&n.layoutMode!=='NONE'){
        const horizontal=n.layoutMode==='HORIZONTAL',axis=horizontal?'x':'y',size=horizontal?'width':'height';
        const flow=n.children.filter(c=>c.visible&&c.layoutPositioning!=='ABSOLUTE');
        for(let i=1;i<flow.length;i++)if(flow[i][axis]+0.75<flow[i-1][axis]+flow[i-1][size])errors.push('Sibling overlap: '+flow[i].id);
      }
      if(n.type==='TEXT'&&/^(Token|Alias|Value|CSS)\|/.test(n.name)){
        const [kind,key,mode]=n.name.split('|');
        if(!allTokens[key]){errors.push('Unknown caption: '+n.id);continue;}
        const expected=kind==='Token'?key.split(':')[1]:kind==='Alias'?'→ '+aliasLabel(key,mode):kind==='Value'?valueLabel(key,mode):allTokens[key].codeSyntax.WEB;
        if(n.characters!==expected)errors.push('Caption: '+n.id);
        captionKeys.add(kind+'|'+key+'|'+mode);
      }
      if(n.name.startsWith('Mode|')){
        const mode=n.name.split('|')[2];
        if(n.explicitVariableModes[imported.collectionIds.semantic]!==imported.modeIds.semantic[mode])errors.push('Mode: '+n.id);
      }
      if(n.parent&&n.parent.type!=='PAGE'&&n.parent.id!==existing.parent?.id){
        if(n.x < -0.75||n.y < -0.75||n.x+n.width>n.parent.width+0.75||n.y+n.height>n.parent.height+0.75)errors.push('Layout overflow: '+n.id+' / '+n.name);
      }
    }
    for(const key of Object.keys(allTokens)){
      for(const mode of key.startsWith('primitive:')?['Value']:['Light','Dark']){
        if(!coverage.has(key+'|'+mode))errors.push('Missing sample: '+key+' / '+mode);
        for(const kind of ['Token','Value'])if(!captionKeys.has(kind+'|'+key+'|'+mode))errors.push('Missing caption: '+kind+' / '+key+' / '+mode);
        if(key.startsWith('semantic:'))for(const kind of ['Alias','CSS'])if(!captionKeys.has(kind+'|'+key+'|'+mode))errors.push('Missing caption: '+kind+' / '+key+' / '+mode);
      }
    }
    return {errors,boardIds,nodeCount:nodes.length,coveredPrimitive:primitiveNames.length,coveredSemanticModes:90,textCount:nodes.filter(n=>n.type==='TEXT').length,textSizingVerified:true};
  }

  const pages=figma.root.children.filter(p=>p.name==='System Guide');
  if(pages.length>1)return {status:'guide_conflict',error:'Multiple System Guide pages; resolve the destination first'};
  let page=pages[0];
  if(page){
    await figma.setCurrentPageAsync(page);
    const matches=page.children.filter(n=>n.name===options.rootName);
    if(matches.length>1)return {status:'guide_conflict',error:'Duplicate snapshot roots'};
    if(matches.length){const audit=await inspectGuide(matches[0]);return {status:audit.errors.length?'guide_conflict':'verified',reused:true,pageId:page.id,rootId:matches[0].id,guideVersion:options.guideVersion,snapshot:options.snapshot,createdNodeIds:[],...audit};}
  }
  // Validate and load every required font before the first canvas mutation.
  const available=await figma.listAvailableFontsAsync();
  for(const spec of [font('Regular'),font('Medium'),font('Bold'),font('Regular',true),font('Medium',true)]){
    if(!available.some(f=>f.fontName.family===spec.family&&f.fontName.style===spec.style))throw new Error('Required guide font unavailable: '+JSON.stringify(spec));
    await figma.loadFontAsync(spec);
  }
  try {
    if(!page){page=record(figma.createPage());newPage=page;page.name='System Guide';await figma.setCurrentPageAsync(page);}
    const right=page.children.reduce((a,n)=>Math.max(a,n.x+n.width),-80);
    root=auto(page,options.rootName,'VERTICAL',W*3+160,undefined,80);root.x=right+80;root.y=0;
    root.setExplicitVariableModeForCollection(imported.collectionIds.primitive,imported.modeIds.primitive.Value);
    const boards=[];
    for(let row=0;row<3;row++){
      const r=auto(root,'Guide row '+(row+1),'HORIZONTAL',W*3+160,H,80);
      for(let col=0;col<3;col++)boards.push(board(r,row*3+col));
    }
    // 01. Role overview, distinct from the primitive family path labels.
    const intro=boards[0].body;
    text(intro,'A small input. A complete color language.',INNER,28,ink,'Bold');
    text(intro,'Seed → opaque or alpha palette → semantic alias → actual UI usage',INNER,18,muted);
    const seeds=auto(intro,'Seed roles','HORIZONTAL',INNER,228,16);
    const roleDefs=[['Brand','brand','Primary identity and emphasis'],['Neutral','neutral','Neutral surfaces and structure'],['Error','red','Failures and invalid states'],['Success','green','Valid and completed states'],['Link',system.roleFamilies.link,'Navigation and interaction']];
    const seedWidth=(INNER-64)/5;
    for(const [role,family,purpose]of roleDefs){
      const c=auto(seeds,role,'VERTICAL',seedWidth,228,8);
      bind(rect(c,seedWidth,80),`primitive:${family}/500`,'Value');
      text(c,role,seedWidth,18,ink,'Bold');
      caption(c,`primitive:${family}/500`,'Value',seedWidth,ink,true);
      text(c,role==='Link'&&!system.seeds.link?'Shares Brand · no extra seed':purpose,seedWidth,12,muted);
    }
    const stats=auto(intro,'System facts','HORIZONTAL',INNER,116,24);
    for(const [value,label]of [[primitiveNames.length,'Primitive variables'],[45,'Semantic variables'],[90,'Light / Dark aliases']]){
      const c=auto(stats,'Metric','VERTICAL',(INNER-48)/3,116,6);c.paddingLeft=c.paddingTop=16;c.fills=[paint('#F5F5F6')];c.cornerRadius=10;
      text(c,String(value),340,32,ink,'Bold');text(c,label,340,14,muted);
    }
    const notes=[['01 / Generate','Mix encoded sRGB channels with fixed white/black weights. Round final 8-bit channels half-up.'],['02 / Map','Use 600 for Light chromatic text, 400 for Dark. Keep focus at 500. Neutral850 supports Dark secondary.'],['03 / Apply','Use Semantic aliases. Chromatic seed/Surface <2:1 → black90 on its solid fill; otherwise white. Neutral keeps white.']];
    for(const [label,copy]of notes){const r=auto(intro,'Rule','HORIZONTAL',INNER,52,20);text(r,label,190,15,ink,'Bold');text(r,copy,INNER-210,14,muted);}
    // 02. Fixed 12-column step grid; only Neutral occupies the 850 column.
    const grid=boards[1].body;
    const steps=[50,100,200,300,400,500,600,700,800,850,900,950];
    const top=auto(grid,'Step labels','HORIZONTAL',INNER,48,16);text(top,'STEP / MIX',122,12,muted,'Medium');
    const headings=auto(top,'Columns','HORIZONTAL',1190,48,10);
    for(const step of steps){const c=auto(headings,'Step '+step,'VERTICAL',90,48,3);text(c,String(step),90,14,ink,'Bold',true);text(c,step===500?'SEED':(step<500?({50:10,100:20,200:40,300:60,400:80}[step])+'% · W':({600:80,700:60,800:40,850:30,900:20,950:10}[step])+'% · K'),90,10,muted,'Regular',true);}
    for(const [family,role]of [['neutral','Neutral'],['brand','Brand'],['red','Error'],['green','Success'],...(system.seeds.link?[['blue','Link']]:[])]){
      const row=auto(grid,'Palette / '+family,'HORIZONTAL',INNER,116,16);
      const title=auto(row,'Role','VERTICAL',122,116,8);text(title,role,122,18,ink,'Bold');text(title,family,122,12,muted,'Regular',true);
      const cells=auto(row,'Steps','HORIZONTAL',1190,116,10);
      for(const step of steps){
        const cell=auto(cells,'Cell','VERTICAL',90,116,6),key=`primitive:${family}/${step}`;
        if(!allTokens[key]){text(cell,'—',90,24,muted);text(cell,'Neutral only',90,10,muted);continue;}
        bind(rect(cell,90,56),key,'Value');
        text(cell,valueLabel(key,'Value'),90,12,ink,'Regular',true,`Value|${key}|Value`);
        text(cell,`${family}/${step}`,90,10,muted,'Regular',true,`Token|${key}|Value`);
      }
    }
    text(grid,'W = white substrate · K = black substrate · percentage = seed opacity used during generation. Saved colors are fully opaque.',INNER,13,muted);
    text(grid,'These steps are reproducible mixing weights, not perceptually equal lightness or contrast intervals.',INNER,13,muted);
    // 03. Each alpha variable over a single tiled checkerboard, retaining RGB/alpha.
    const alpha=boards[2].body;
    for(const family of ['black','white']){
      text(alpha,family==='black'?'Black / alpha ladder':'White / alpha ladder',INNER,24,ink,'Bold');
      const row=auto(alpha,'Alpha / '+family,'HORIZONTAL',INNER,224,16),width=(INNER-144)/10;
      for(let percent=10;percent<=100;percent+=10){
        const key=`primitive:${family}/${percent===100?'solid':percent}`;
        const c=auto(row,'Alpha sample','VERTICAL',width,224,6);
        text(c,`${percent}%`,width,16,ink,'Bold',true);
        checkerSample(c,key,'Value',width,112);
        text(c,'Checkerboard',width,10,muted);
        text(c,key.split(':')[1],width,11,ink,'Regular',true,`Token|${key}|Value`);
        text(c,valueLabel(key,'Value'),width,10,muted,'Regular',true,`Value|${key}|Value`);
      }
    }
    text(alpha,'The checkerboard is a visual aid. The variable retains its original RGB and alpha.',INNER,16,ink,'Medium');
    text(alpha,'For contrast calculations, composite the color over the actual opaque UI background, not the checkerboard.',INNER,14,muted);
    // 04 and 05. Semantic rows contain a bound sample, token, alias, HEX/alpha, and WEB syntax.
    const foundationNames=system.collections[1].variables.filter(v=>/^(brand|surface)\//.test(v.name)).map(v=>v.name);
    for(const {panel,mode,color,width}of modePair(boards[3].body,3))for(const name of foundationNames)tokenRow(panel,name,mode,width,color);
    for(const {panel,mode,color,width}of modePair(boards[4].body,4)){
      for(const v of system.collections[1].variables.filter(v=>v.name.startsWith('font/'))){
        tokenRow(panel,v.name,mode,width,color,'text');
      }
      text(panel,'Ratio range: background / primary / secondary.',width,11,color);
    }
    // 06 and 07. Five explicit foreground/background pairs in each mode.
    for(const [index,subtle]of [[5,false],[6,true]])for(const {panel,mode,color,width}of modePair(boards[index].body,index)){
      for(const role of ['default','error','success','accent','link']){
        const bg=`notice/${role}${subtle?'-background':''}`,fg=`notice/on-${role}${subtle?'-background':''}`;
        const r=auto(panel,'Pair / '+role,'HORIZONTAL',width,132,12);r.counterAxisAlignItems='CENTER';
        const demo=auto(r,'Paired sample','VERTICAL',124,108,8);demo.paddingTop=demo.paddingBottom=20;demo.primaryAxisAlignItems='CENTER';demo.counterAxisAlignItems='CENTER';demo.cornerRadius=8;demo.strokes=[border];
        bind(demo,'semantic:'+bg,mode);
        bind(text(demo,'Aa',92,26,color,'Bold'),'semantic:'+fg,mode);
        const details=auto(r,'Pair definitions','VERTICAL',width-136,undefined,2);
        for(const name of [bg,fg]){
          const key='semantic:'+name;
          text(details,name,width-136,12,color,'Medium',true,`Token|${key}|${mode}`);
          const metadata=auto(details,'Alias and value','HORIZONTAL',width-136,14,10);
          text(metadata,'→ '+aliasLabel(key,mode),180,10,color,'Regular',true,`Alias|${key}|${mode}`);
          text(metadata,valueLabel(key,mode),width-326,10,color,'Regular',true,`Value|${key}|${mode}`);
          text(details,allTokens[key].codeSyntax.WEB,width-136,9,color,'Regular',true,`CSS|${key}|${mode}`);
        }
        const a=auditFor(fg,mode);
        text(details,ratioRange(a)+' · '+(a.normalTextPass?'Normal text':a.largeTextPass?'Large text only':'Text needs review'),width-136,10,color,'Medium');
      }
    }
    // 08. Borders remain actual stroke samples, not misleading high-contrast fills.
    for(const {panel,mode,color,width}of modePair(boards[7].body,7)){
      for(const v of system.collections[1].variables.filter(v=>v.name.startsWith('lines/')))tokenRow(panel,v.name,mode,width,color,'line');
    }
    // 09. Complete exception lists; a necessary-boundary failure is not a decorative-line failure.
    for(const {panel,mode,color,width}of modePair(boards[8].body,8)){
      const audit=system.contrastAudit[mode],failures=audit.text.filter(r=>!r.normalTextPass),boundaries=audit.lines.filter(r=>!r.necessaryNonTextPass);
      const count=failures.length+boundaries.length;
      panel.itemSpacing=Math.min(8,Math.max(0,Math.floor((744-(136+count*18))/(count+5))));
      text(panel,`${failures.length} / 19 text combinations need usage review`,width,16,color,'Bold');
      for(const row of failures){const r=auto(panel,'Text contrast / '+row.token,'HORIZONTAL',width,18,12);text(r,row.token,330,11,color,'Regular',true);text(r,ratioRange(row),width-342,11,color,'Medium',true);}
      line(panel,width);
      text(panel,'Necessary boundary checks / below 3:1',width,14,color,'Bold');
      for(const row of boundaries){const r=auto(panel,'Boundary / '+row.token,'HORIZONTAL',width,18,12);text(r,row.token,330,11,color,'Regular',true);text(r,ratioRange(row),width-342,11,color,'Regular',true);}
      text(panel,'Normal text ≥4.5:1 · Large text ≥3:1\nNecessary non-text ≥3:1; decorative lines depend on purpose.',width,12,color);
      text(panel,'Large: regular ≥24 CSS px or bold ≥18.67 CSS px.\nCheck actual background, size, and adjacent colors. Passing contrast alone is not overall WCAG conformance.',width,11,color);
    }
    const audit=await inspectGuide(root);
    if(audit.errors.length)throw new Error(JSON.stringify(audit.errors));
    return {status:'verified',guideVersion:options.guideVersion,snapshot:options.snapshot,pageId:page.id,rootId:root.id,createdNodeIds:created,inventoryWarnings,...audit};
  } catch(error) {
    const cleanupErrors=[];
    if(root)try{root.remove();}catch(e){cleanupErrors.push(String(e));}
    if(newPage)try{newPage.remove();}catch(e){cleanupErrors.push(String(e));}
    return {status:'guide_failed',error:String(error),createdNodeIds:created,rollbackComplete:cleanupErrors.length===0,cleanupErrors};
  }
}
