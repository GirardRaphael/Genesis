import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Authoring dependencies belong to the supplied desktop runtime, not Genesis.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = process.env.GENESIS_DECK_RUNTIME;
const skill = process.env.GENESIS_DECK_SKILL;
if (!runtime || !skill) throw new Error('Set GENESIS_DECK_RUNTIME and GENESIS_DECK_SKILL to the bundled runtime and Presentations skill directories.');
process.env.RUNTIME_NODE_MODULES=path.join(runtime,'node/node_modules');
const { Presentation, PresentationFile } = await import(pathToFileURL(path.join(runtime, 'node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs')));
const { finalizePresentation, resolvePresentationFont } = await import(pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs')));
const { slides: core } = await import('./content.mjs');
const build = path.join(root, 'artifacts/private/presentation');
const output = path.join(root, 'presentations/output');
await fs.mkdir(build, {recursive:true});
await fs.mkdir(output, {recursive:true});
const font = resolvePresentationFont();
const p = Presentation.create({slideSize:{width:1280,height:720}});
const colors = {ink:'#173039', teal:'#146C78', paper:'#F4F7F7', muted:'#526870', white:'#FFFFFF', light:'#B5DED7'};
const tableOwners = [];

function text(slide, value, x, y, w, h, size, color=colors.ink, bold=false) {
  const shape=slide.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
  shape.text=value;
  shape.text.style={fontSize:size,typeface:font,color,bold,verticalAlignment:'top',insets:0};
  return shape;
}

function draw(data, index) {
  const slide=p.slides.add();
  const dark=data.kind==='cover'||data.kind==='section';
  slide.background.fill=dark?colors.ink:colors.paper;
  const fg=dark?colors.white:colors.ink;
  text(slide,data.section||'GENESIS / ARCHITECTURE TECHNIQUE',64,35,1120,28,16,dark?colors.light:colors.teal,true);
  if (data.kind==='cover') {
    text(slide,'genesis',64,151,1120,110,88,fg,true);
    text(slide,data.title,68,280,1050,155,52,fg,true);
    text(slide,data.subtitle,68,485,1010,85,25,colors.light);
  } else {
    text(slide,data.title,64,86,1148,106,44,fg,true);
    if (data.rows) {
      const values=[data.columns||['ÉLÉMENT','RÔLE / PORTÉE'],...data.rows];
      const widths=data.widths|| (values[0].length===3?[350,160,642]:[330,822]);
      const table=slide.tables.add({rows:values.length,columns:values[0].length,left:64,top:205,width:1152,height:405,values,columnWidths:widths});
      tableOwners.push(index+1);
      table.styleOptions={headerRow:false,bandedRows:false};
      table.borders.assign({fill:'#D7E1E3',width:1});
      for(let r=0;r<values.length;r++){
        table.rows[r].height=r===0?48:357/(values.length-1);
        for(let c=0;c<values[r].length;c++){
          const cell=table.getCell(r,c);
          cell.fill=r===0?colors.ink:(r%2?colors.white:'#EAF0F1');
          cell.text.style={typeface:font,fontSize:data.tableSize||23,color:r===0?colors.white:colors.ink,bold:r===0||c===0};
        }
      }
    } else if (data.items) {
      const step=400/data.items.length;
      for(let i=0;i<data.items.length;i++) {
        text(slide,String(i+1).padStart(2,'0'),64,215+i*step,70,52,36,dark?colors.light:colors.teal,true);
        const item=data.items[i];
        text(slide,item[0],156,212+i*step,1030,43,28,fg,true);
        text(slide,item[1],156,258+i*step,1030,step-48,24,dark?colors.light:colors.muted);
      }
    } else {
      text(slide,data.body||'',64,225,1135,360,32,fg);
    }
    if(data.caption) text(slide,data.caption,64,630,1135,43,19,dark?colors.light:colors.muted);
  }
  text(slide,String(index+1).padStart(2,'0'),1192,678,48,23,15,dark?colors.light:colors.muted);
  slide.speakerNotes.text=(data.notes||'')+'\n\nSources — état du dépôt au 11 octobre 2026 :\n'+(data.sources||[]).join('\n');
}

const slides=[...core];
if (!process.argv.includes('--smoke')) {
  const inventory=JSON.parse(await fs.readFile(path.join(root,'presentations/package-inventory.json'),'utf8'));
  const req=(await fs.readFile(path.join(root,'requirements.txt'),'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line=>line.split('=='));
  if(req.some(([name])=>!inventory.python[name])) throw new Error('Missing Python dependency description');
  const statuses={runtime:'Usage direct',support:'Support de dépendance',optional:'Option / non validée',tooling:'Développement / QA',installed:'Installé, sans usage métier direct'};
  for(let i=0;i<req.length;i+=5){
    const batch=req.slice(i,i+5);
    slides.push({title:`Inventaire Python · ${i+1}–${Math.min(i+5,req.length)}`,section:'ANNEXE / ENVIRONNEMENT ÉPINGLÉ',columns:['PAQUET','VERSION','RÔLE TECHNIQUE'],widths:[380,175,597],tableSize:23,rows:batch.map(([name,version])=>[name,version,inventory.python[name].purpose]),caption:'Usage direct, support, option ou installation seule : classification détaillée dans les notes.',notes:batch.map(([name])=>`${name} : ${statuses[inventory.python[name].status]}. ${inventory.python[name].purpose}`).join('\n'),sources:['requirements.txt','pyproject.toml','presentations/package-inventory.json']});
  }
  for(const rel of ['apps/web/package.json','qa/package.json']) {
    const pkg=JSON.parse(await fs.readFile(path.join(root,rel),'utf8'));
    const entries=Object.entries({...pkg.dependencies,...pkg.devDependencies});
    for(let i=0;i<entries.length;i+=5) {
      const batch=entries.slice(i,i+5);
      if(batch.some(([n])=>!inventory.javascript[n])) throw new Error('Missing JS dependency description');
      slides.push({title:`${rel.startsWith('qa')?'Outils QA':'Interface et build'} · dépendances ${i+1}–${Math.min(i+5,entries.length)}`,section:'ANNEXE / DÉPENDANCES DIRECTES JAVASCRIPT',columns:['PAQUET','VERSION','POURQUOI / COMMENT'],widths:[360,165,627],tableSize:23,rows:batch.map(([n,v])=>[n,v,inventory.javascript[n].purpose]),notes:'Dépendances directes déclarées. Le graphe transitif complet et ses résolutions sont conservés dans package-lock.json.\n'+batch.map(([n])=>`${n} : ${statuses[inventory.javascript[n].status]}.`).join('\n'),sources:[rel,rel.replace('package.json','package-lock.json'),'presentations/package-inventory.json']});
    }
  }
}
for(const s of slides) for(const source of s.sources||[]) {
  if(!source.startsWith('https://')) await fs.access(path.join(root,source));
}
for(let i=0;i<slides.length;i++)draw(slides[i],i);
const serialized=slides.map((s,i)=>({number:i+1,...s}));
if (/Ã|â€|Â/.test(JSON.stringify(serialized))) throw new Error('Invalid text encoding in slide data');
await fs.writeFile(path.join(build,'slides.json'),JSON.stringify(serialized,null,2));
await fs.writeFile(path.join(build,'font-policy.json'),JSON.stringify({basis:'design',families:[font]}));
const candidatePath=path.join(build,'candidate-v4.pptx');
await (await PresentationFile.exportPptx(p)).save(candidatePath);
for(const [i,s]of p.slides.items.entries()) {
  const stem=`slide-${String(i+1).padStart(2,'0')}`;
  await fs.writeFile(path.join(build,stem+'.png'),new Uint8Array(await (await p.export({slide:s,format:'png',scale:1})).arrayBuffer()));
  await fs.writeFile(path.join(build,stem+'.layout.json'),await (await s.export({format:'layout'})).text());
  console.log('Rendered',i+1,'/',slides.length);
}
if(process.argv.includes('--smoke')){console.log('Smoke export complete',font);process.exit(0);}
const finalPath=path.join(output,'Genesis-Architecture-Technologies-2026-10-11-v4.pptx');
await finalizePresentation({workspaceDir:root,candidatePath,finalPath,pythonExecutable:path.join(runtime,'python/python.exe'),integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit',...tableOwners.flatMap(n=>['--require-native-table-slide',String(n)])],requiredNativeTableOwnerSlides:tableOwners,fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(build,'validation-v4.json')});
console.log(JSON.stringify({finalPath,slides:slides.length,font}));
