import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { slides as narrative, referenceGroups, webReference } from './content-libraries.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=process.env.GENESIS_DECK_RUNTIME;
const skill=process.env.GENESIS_DECK_SKILL;
if(!runtime||!skill) throw new Error('Set GENESIS_DECK_RUNTIME and GENESIS_DECK_SKILL to the bundled runtime and Presentations skill.');
process.env.RUNTIME_NODE_MODULES=path.join(runtime,'node/node_modules');
const {PresentationFile,FileBlob}=await import(pathToFileURL(path.join(runtime,'node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs')));
const {finalizePresentation,resolvePresentationFont,applyPresentationChartFont}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')));
const revision=process.env.GENESIS_DECK_REVISION||'v1';
if(!/^v\d+$/.test(revision)) throw new Error('Revision must match vN.');
const build=path.join(root,'artifacts/private/presentation-condensed',revision);
const output=path.join(root,'presentations/output');
await fs.mkdir(build,{recursive:true});
await fs.mkdir(output,{recursive:true});
const source=path.join(output,'Genesis-Architecture-Technologies-2026-10-11-v4.pptx');
const p=await PresentationFile.importPptx(await FileBlob.load(source));
await fs.writeFile(path.join(build,'source-layout.ndjson'),(await p.inspect({kind:'layout',maxChars:20000})).ndjson);
// Keep the original branded cover, canvas and theme. The requested compression rebuilds the body.
p.slides.keep([0]);
const font=resolvePresentationFont({fontFamily:'Arial'});
const C={ink:'#173039',teal:'#146C78',paper:'#F4F7F7',white:'#FFFFFF',muted:'#526870',light:'#B5DED7',warm:'#F1E9DE',copper:'#925E27'};
const tables=[],charts=[];
const sourceRefs=new Set();
function text(s,v,x,y,w,h,size=28,color=C.ink,bold=false){
  const t=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
  t.text=v;t.text.style={fontSize:size,typeface:font,color,bold,verticalAlignment:'top',insets:0};return t;
}
function note(s,d){
  for(const ref of d.sources||[]) sourceRefs.add(ref);
  s.speakerNotes.text=d.notes+'\n\nSources du dépôt, état au 11 octobre 2026 (U17–U19) :\n'+(d.sources||[]).join('\n');
}
function header(s,d,i,dark=false){
  text(s,d.title,64,58,1148,112,46,dark?C.white:C.ink,true);
  text(s,String(i+1).padStart(2,'0'),1192,682,48,22,15,dark?C.light:C.muted);
  if(d.caption)text(s,d.caption,64,634,1135,44,19,dark?C.light:C.muted);
}
function rows(s,items,x,y,w,step,dark=false){
  for(const [i,item]of items.entries()){
    text(s,item[0],x,y+i*step,w,44,28,dark?C.white:C.ink,true);
    text(s,item[1],x,y+45+i*step,w,step-45,24,dark?C.light:C.muted);
  }
}
function nativeTable(s,d,i){
  const values=[d.columns||['COUCHE','TECHNOLOGIES','RÔLE'],...d.rows];
  const widths=d.columnWidths||(values[0].length===3?[260,330,562]:[310,842]);
  const table=s.tables.add({rows:values.length,columns:values[0].length,left:64,top:198,width:1152,height:410,values,columnWidths:widths});
  tables.push(i+1);table.styleOptions={headerRow:false,bandedRows:false};
  table.borders.assign({fill:'#D7E1E3',width:1});
  for(let r=0;r<values.length;r++){
    table.rows[r].height=r===0?48:362/(values.length-1);
    for(let c=0;c<values[r].length;c++){
      const cell=table.getCell(r,c);cell.fill=r===0?C.ink:(r%2?C.white:'#EAF0F1');
      cell.text.style={typeface:font,fontSize:23,color:r===0?C.white:C.ink,bold:r===0||c===0};
    }
  }
}
async function draw(d,i){
  if(i===0){note(p.slides.getItem(0),d);return;}
  const s=p.slides.add();
  const dark=['statement','budget','closing'].includes(d.kind);
  s.background.fill=dark?C.ink:(['fleet','allocation','benchmark'].includes(d.kind)?C.warm:C.paper);
  header(s,d,i,dark);
  if(d.kind==='statement'){
    text(s,d.lead,64,208,1130,190,65,C.white,true);
    text(s,d.body,64,465,1040,125,31,C.light);
  }else if(d.kind==='split'){
    text(s,d.leftTitle,64,207,536,52,30,C.teal,true);text(s,d.left,64,284,532,312,28);
    text(s,d.rightTitle,676,207,536,52,30,C.teal,true);text(s,d.right,676,284,532,312,28);
  }else if(d.kind==='editorial'){
    text(s,d.feature,64,235,410,280,47,C.teal,true);rows(s,d.items,545,209,660,128);
  }else if(d.kind==='sequence'){
    d.steps.forEach((a,j)=>{let x=64+j*292;text(s,String(j+1).padStart(2,'0'),x,215,240,100,76,C.teal,true);text(s,a[0],x,348,250,60,29,C.ink,true);text(s,a[1],x,425,250,145,26,C.muted);});
  }else if(['table','architecture'].includes(d.kind))nativeTable(s,d,i);
  else if(d.kind==='roles'){
    d.rows.forEach((a,j)=>{let y=204+j*80;text(s,a[0],64,y,80,62,43,C.teal,true);text(s,a[1],174,y+6,310,50,29,C.ink,true);text(s,a[2],512,y+7,684,58,27,C.muted);});
  }else if(d.kind==='calls'){
    const chart=s.charts.add('bar',{position:{left:64,top:203,width:820,height:378},categories:d.chart.categories,series:[{name:'Appels prévus',values:d.chart.values,fill:C.teal}],barOptions:{direction:'bar',grouping:'clustered',gapWidth:80},hasLegend:false,xAxis:{textStyle:{fontSize:21,fill:C.ink}},yAxis:{visible:true,min:0,max:6,majorUnit:1,title:'Nombre d’appels',textStyle:{fontSize:20,fill:C.muted},majorGridlines:{fill:'#D7E1E3',width:1}},dataLabels:{showValue:true,position:'outEnd',textStyle:{fontSize:23,fill:C.ink,bold:true}},chartFill:C.paper,plotAreaFill:C.paper});
    applyPresentationChartFont(chart,{fontFamily:font});charts.push(i+1);
    text(s,d.aside,930,260,270,280,32,C.teal,true);
  }else if(d.kind==='allocation'){
    d.items.forEach((a,j)=>{let x=64+j*396;text(s,String(j+1),x,210,320,110,84,C.copper,true);text(s,a[0],x,352,350,55,34,C.ink,true);text(s,a[1],x,435,344,145,28,C.muted);});
  }else if(['fleet','budget'].includes(d.kind)){
    text(s,d.number,64,216,440,190,156,dark?C.white:C.teal,true);text(s,d.unit,70,416,390,68,47,dark?C.light:C.ink);
    rows(s,d.items,560,213,642,129,dark);
  }else if(d.kind==='screenshot'){
    text(s,'Quatre arrêts.\nUn certificat.',64,227,330,140,42,C.teal,true);
    text(s,'Le planning, le marqueur et la fiche montrent le même arrêt.',64,429,302,150,27,C.muted);
    const bytes=await fs.readFile(path.join(root,d.image));
    s.images.add({blob:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),contentType:'image/png',alt:'Capture de la tournée QA synthétique, carte et arrêt sélectionné',fit:'contain',position:{left:400,top:169,width:816,height:444}});
  }else if(d.kind==='benchmark'){
    d.numbers.forEach((a,j)=>{let x=96+j*400;text(s,a[0],x,211,312,155,126,C.teal,true);text(s,a[1],x,390,310,55,30);});
    text(s,d.result,96,503,1100,65,45,C.ink,true);
  }else if(d.kind==='evidence'){
    d.numbers.forEach((a,j)=>{let x=64+j*404;text(s,a[0],x,203,340,145,112,C.teal,true);text(s,a[1],x,346,345,55,29);});
    d.items.forEach((a,j)=>{let x=64+j*606;text(s,a[0],x,468,550,46,28,C.ink,true);text(s,a[1],x,523,550,83,24,C.muted);});
  }else if(d.kind==='priority'){
    d.items.forEach((a,j)=>{let x=64+(j%2)*606,y=215+Math.floor(j/2)*205;text(s,String(j+1).padStart(2,'0'),x,y,70,60,40,C.teal,true);text(s,a[0],x+85,y,455,70,30,C.ink,true);text(s,a[1],x+85,y+76,455,90,25,C.muted);});
  }else if(d.kind==='closing'){
    text(s,d.lead,64,202,1140,190,61,C.white,true);
    d.items.forEach((a,j)=>{let x=64+j*398;text(s,a[0],x,467,350,48,29,C.white,true);text(s,a[1],x,525,350,100,24,C.light);});
  }else if(d.kind==='inventory'){
    text(s,d.count,64,213,345,150,117,C.teal,true);text(s,'paquets Python',70,370,345,55,29);
    text(s,d.definition,64,467,355,143,25,C.muted);
    rows(s,d.items,520,216,683,125);
  }else if(d.kind==='inventory-js'){
    d.entries.forEach(([name,version],j)=>{let x=j<9?64:670,y=199+(j%9)*44;text(s,name,x,y,430,37,23,C.ink,j<9);text(s,version,x+440,y,105,37,22,C.teal);});
  }
  note(s,d);
}

const inventory=JSON.parse(await fs.readFile(path.join(root,'presentations/package-inventory.json'),'utf8'));
const details=JSON.parse(await fs.readFile(path.join(root,'presentations/package-details.json'),'utf8'));
const req=(await fs.readFile(path.join(root,'requirements.txt'),'utf8')).trim().split(/\r?\n/).filter(Boolean).map(v=>v.split('=='));
const states={runtime:'Usage direct',support:'Support de dépendance',optional:'Intégration optionnelle',tooling:'Développement et tests',installed:'Installé sans usage métier direct'};
assert.equal(narrative.length,30);
for(const language of ['python','javascript']){
  assert.deepEqual(Object.keys(details[language]).sort(),Object.keys(inventory[language]).sort());
  for(const entry of Object.values(details[language])){
    for(const field of ['function','genesis','inclusion','example'])assert(entry[field]?.trim(),`Missing package field ${field}`);
    assert(entry.evidence.length>0);
    for(const ref of entry.evidence)if(!ref.startsWith('https://'))await fs.access(path.join(root,ref));
  }
}
function packageNote(language,name,version,status){
  const d=details[language][name];
  return `${name}${language==='python'?'==':'@'}${version}\nClassement de référence : ${states[status]}.\nFonction : ${d.function}\nUtilisation Genesis : ${d.genesis}\nPourquoi présent : ${d.inclusion}\nExemple : ${d.example}\nSources :\n${d.evidence.join('\n')}`;
}
const slides=[...narrative],packageKeys=[];
for(const [status,g]of Object.entries(referenceGroups)){
  const batch=req.filter(([name])=>{assert(inventory.python[name],`Missing description: ${name}`);return inventory.python[name].status===status;});
  packageKeys.push(...batch.map(([n,v])=>`python:${n}==${v}`));
  slides.push({kind:'table',...g,columns:['PAQUET OU GROUPE','SUPPORT / FONCTION','RÔLE ET LIMITE'],columnWidths:[292,330,530],caption:`${batch.length} paquets du groupe en notes : fonction, usage, dépendances, exemple et sources.`,notes:`${states[status]}. Les versions décrivent le dépôt, sans affirmation de dernière version disponible. Les relations Python proviennent des métadonnées installées, dont les 87 versions correspondent aux épingles. Les extras conditionnels restent distincts de l’usage actif. Les exemples du tableau peuvent citer un paquet détaillé dans un autre groupe.\n\n`+batch.map(([n,v])=>packageNote('python',n,v,inventory.python[n].status)).join('\n\n'),sources:['requirements.txt','pyproject.toml','presentations/package-inventory.json','presentations/package-details.json']});
}
const js=[];
for(const rel of ['apps/web/package.json','qa/package.json']){
  const pkg=JSON.parse(await fs.readFile(path.join(root,rel),'utf8'));
  for(const [n,v]of Object.entries({...pkg.dependencies,...pkg.devDependencies})){
    assert(inventory.javascript[n],`Missing description: ${n}`);js.push([n,v,rel]);packageKeys.push(`${rel}:${n}@${v}`);
  }
}
slides.push({kind:'table',...webReference,caption:'17 paquets directs détaillés en notes. Les lockfiles conservent les transitifs.',notes:'Chaque dépendance directe déclarée est conservée ci-dessous. Les arbres transitifs npm restent dans les deux package-lock.json. Un paquet de développement peut produire du code livré au navigateur, sans que son moteur soit lui-même exécuté par le site.\n\n'+js.map(([n,v,rel])=>`Manifeste : ${rel}.\n${packageNote('javascript',n,v,inventory.javascript[n].status)}`).join('\n\n'),sources:['apps/web/package.json','qa/package.json','apps/web/package-lock.json','qa/package-lock.json','presentations/package-details.json']});
assert.equal(slides.length,36);assert.equal(req.length,87);assert.equal(js.length,17);assert.equal(new Set(packageKeys).size,104);
const notes=slides.map(s=>s.notes).join('\n');
for(const [n,v]of req)assert(notes.includes(`${n}==${v}`),`Omitted Python package ${n}`);
for(const [n,v]of js)assert(notes.includes(`${n}@${v}`),`Omitted JS package ${n}`);
for(const entries of Object.values(details))for(const entry of Object.values(entries)){
  for(const field of ['function','genesis','inclusion','example'])assert(notes.includes(entry[field]),`Omitted detail: ${field}`);
  for(const ref of entry.evidence)assert(notes.includes(ref),`Omitted source: ${ref}`);
}
for(const s of slides)for(const ref of s.sources||[])if(!ref.startsWith('https://'))await fs.access(path.join(root,ref));
if(/Ã|â€|Â/.test(JSON.stringify(slides)))throw new Error('Invalid text encoding');
for(const [i,s]of slides.entries())await draw(s,i);
await fs.writeFile(path.join(build,'slides.json'),JSON.stringify(slides.map((s,i)=>({number:i+1,...s})),null,2));
await fs.writeFile(path.join(build,'coverage.json'),JSON.stringify({slides:slides.length,python:req.length,javascript:js.length,packageKeys,tables,charts},null,2));
const candidate=path.join(build,'candidate.pptx');
await(await PresentationFile.exportPptx(p)).save(candidate);
for(const [i,s]of p.slides.items.entries()){
  const stem=`slide-${String(i+1).padStart(2,'0')}`;
  await fs.writeFile(path.join(build,stem+'.png'),new Uint8Array(await(await p.export({slide:s,format:'png',scale:1})).arrayBuffer()));
  await fs.writeFile(path.join(build,stem+'.layout.json'),await(await s.export({format:'layout'})).text());
  console.log('Rendered',i+1,'/',slides.length);
}
const finalPath=path.join(output,`Genesis-Synthese-Technique-2026-10-11-${revision}.pptx`);
await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath,explicitTotalSlideCount:36,pythonExecutable:path.join(runtime,'python/python.exe'),integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit',...tables.flatMap(n=>['--require-native-table-slide',String(n)])],requiredNativeTableOwnerSlides:tables,requiredNativeChartOwnerSlides:charts,materializeLiteralChartWorkbooks:true,fontPolicy:{basis:'reference',families:[font],referencePath:source,referenceSha256:createHash('sha256').update(await fs.readFile(source)).digest('hex')},verifyArtifactToolImport:true,receiptPath:path.join(build,'validation.json')});
console.log(JSON.stringify({finalPath,slides:slides.length,python:req.length,javascript:js.length}));
