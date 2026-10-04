import {STORAGE_KEY,parseProgress} from '../dist/progress.js';
import {LEARNING_KEY,validateContent} from '../dist/learning.js';
export function validRecord(row,ids){
  if(!row||!ids.has(row.question_id)||!['drafts','assessments','learning'].includes(row.kind))return false;
  const v=row.value;
  if(row.kind==='drafts')return typeof v==='string'&&v.length<=50000;
  if(row.kind==='assessments')return ['known','uncertain','unknown'].includes(v);
  if(v===null)return true;
  try{validateContent(v);return true;}catch{return false;}
}
export class AccountStore{
  constructor(storage,userId,ids,onWrite=()=>{}){
    this.storage=storage;this.userId=userId;this.ids=ids;this.onWrite=onWrite;
    this.key=`career-practice:account:v1:${userId}`;
    this.read(); // Refuse to overwrite a damaged cache.
  }
  read(){
    const raw=this.storage.getItem(this.key);
    if(raw===null)return {version:1,records:{},pending:{}};
    const s=JSON.parse(raw);
    if(!s||s.version!==1||!s.records||!s.pending||Array.isArray(s.records)||Array.isArray(s.pending))throw Error('계정 기록을 읽을 수 없어요.');
    for(const [key,row] of Object.entries(s.records))if(key!==`${row.question_id}:${row.kind}`||!validRecord(row,this.ids))throw Error('계정 기록 형식을 확인해 주세요.');
    for(const [key,row] of Object.entries(s.pending))if(key!==`${row.question_id}:${row.kind}`||!validRecord(row,this.ids)||typeof row.mutation_id!=='string')throw Error('동기화 대기 기록 형식을 확인해 주세요.');
    return s;
  }
  write(s){this.storage.setItem(this.key,JSON.stringify(s));}
  getItem(key){
    const s=this.read();
    if(key===STORAGE_KEY){const p={version:1,drafts:{},assessments:{}};for(const r of Object.values(s.records))if(r.kind!=='learning')p[r.kind][r.question_id]=r.value;return JSON.stringify(p);}
    if(key===LEARNING_KEY){const p={version:1,overrides:{}};for(const r of Object.values(s.records))if(r.kind==='learning'&&r.value!==null)p.overrides[r.question_id]=r.value;return JSON.stringify(p);}
    return null;
  }
  setItem(key,raw){
    const s=this.read();let fields;
    if(key===STORAGE_KEY){const p=parseProgress(raw,this.ids);fields={drafts:p.drafts,assessments:p.assessments};}
    else if(key===LEARNING_KEY){const p=JSON.parse(raw);if(p.version!==1||!p.overrides)throw Error('수정 내용 형식 오류');fields={learning:p.overrides};}
    else throw Error('지원하지 않는 저장 항목');
    let changed=false;
    for(const [kind,values] of Object.entries(fields)){
      const ids=new Set([...Object.keys(values),...Object.values(s.records).filter(r=>r.kind===kind).map(r=>r.question_id)]);
      for(const id of ids){
        const value=Object.hasOwn(values,id)?values[id]:null,k=`${id}:${kind}`;
        if(value===null&&kind!=='learning')continue;
        const row={question_id:id,kind,value};if(!validRecord(row,this.ids))throw Error('저장 내용 형식 오류');
        if(JSON.stringify(s.records[k]?.value??null)===JSON.stringify(value))continue;
        row.mutation_id=crypto.randomUUID();s.records[k]=row;s.pending[k]=row;changed=true;
      }
    }
    if(changed){this.write(s);this.onWrite();}
  }
  pending(){return Object.values(this.read().pending);}
  acknowledge(row){const s=this.read(),k=`${row.question_id}:${row.kind}`;if(s.pending[k]?.mutation_id===row.mutation_id){delete s.pending[k];this.write(s);}}
  merge(rows){const s=this.read();let changed=false;
    for(const r of rows){if(!validRecord(r,this.ids))throw Error('서버 기록 형식 오류');const k=`${r.question_id}:${r.kind}`;if(s.pending[k])continue;if(!Object.hasOwn(s.records,k)||JSON.stringify(s.records[k].value)!==JSON.stringify(r.value)){s.records[k]=r;changed=true;}}
    if(changed)this.write(s);return changed;
  }
  importMissing(progress,learning){
    const s=this.read();let count=0;
    for(const [kind,values] of Object.entries({drafts:progress.drafts,assessments:progress.assessments,learning:learning.overrides}))for(const [id,value] of Object.entries(values)){
      const k=`${id}:${kind}`,r={question_id:id,kind,value,mutation_id:crypto.randomUUID()};
      if(!s.records[k]&&validRecord(r,this.ids)){s.records[k]=r;s.pending[k]=r;count++;}
    }
    if(count){this.write(s);this.onWrite();}return count;
  }
}
