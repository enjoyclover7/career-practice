import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
await build({absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),entryPoints:['src/cloud.js'],bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,outfile:'dist/cloud.js'});
const hash=createHash('sha256');
async function assets(dir){const result=[];for(const item of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${item.name}`;if(item.isDirectory())result.push(...await assets(path));else if(path!=='dist/sw.js')result.push(path);}return result;}
for(const path of (await assets('dist')).sort())hash.update(await readFile(path));
const worker=await readFile('dist/sw.js','utf8');
// Worker logic is part of the version, while its previous generated stamp is not.
hash.update(worker.replace(/const CACHE='career-practice[^']*'/,"const CACHE='career-practice'"));
await writeFile('dist/sw.js',worker.replace(/const CACHE='career-practice[^']*'/,`const CACHE='career-practice-${hash.digest('hex').slice(0,12)}'`));
