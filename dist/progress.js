export const STORAGE_KEY='career-practice:progress:v1';
export const MEMORY_LABELS=Object.freeze({known:'잘 기억나요',uncertain:'조금 헷갈려요',unknown:'아직 기억 안 나요',unrated:'아직 확인 안 했어요'});
export const MEMORY_VALUES=['known','uncertain','unknown'];
export function parseProgress(raw,validIds){
  if(raw===null)return {version:1,drafts:{},assessments:{}};
  const value=JSON.parse(raw);
  if(!value||value.version!==1||!value.drafts||Array.isArray(value.drafts)||typeof value.drafts!=='object'||!value.assessments||Array.isArray(value.assessments)||typeof value.assessments!=='object')throw new Error('저장된 기록 형식이 올바르지 않습니다.');
  const result={version:1,drafts:{},assessments:{}};
  for(const [id,text] of Object.entries(value.drafts))if(validIds.has(id)&&typeof text==='string'&&text.length<=50000)result.drafts[id]=text;
  for(const [id,status] of Object.entries(value.assessments)){
    const normalized=status==='again'?'unknown':status;
    if(validIds.has(id)&&MEMORY_VALUES.includes(normalized))result.assessments[id]=normalized;
  }
  return result;
}
export function loadProgress(storage,validIds){return parseProgress(storage.getItem(STORAGE_KEY),validIds);}
export function saveProgress(storage,validIds,id,field,value){
  if(!validIds.has(id)||!['drafts','assessments'].includes(field))throw new Error('저장할 문항이 올바르지 않습니다.');
  if(field==='drafts'&&(typeof value!=='string'||value.length>50000))throw new Error('답안은 50,000자 이내여야 합니다.');
  if(field==='assessments'&&!MEMORY_VALUES.includes(value))throw new Error('기억 정도가 올바르지 않습니다.');
  // Merge the latest records to preserve unrelated writes from another tab.
  const progress=loadProgress(storage,validIds);progress[field][id]=value;
  storage.setItem(STORAGE_KEY,JSON.stringify(progress));
}
export function normalizeReviewScope(scope){
  if(scope==='all')return 'all';
  const lectures=Number.isInteger(scope)?[scope]:scope;
  if(!Array.isArray(lectures)||lectures.some(n=>!Number.isInteger(n)||n<1||n>12))throw new Error('강의 번호는 1~12입니다.');
  return [...new Set(lectures)].sort((a,b)=>a-b);
}
export function matchingQuestions(questions,assessments,statuses,scope='all'){
  if(!Array.isArray(statuses)||statuses.some(s=>!Object.hasOwn(MEMORY_LABELS,s)))throw new Error('복습할 기억 정도가 올바르지 않습니다.');
  const lectures=normalizeReviewScope(scope);
  const selected=new Set(statuses);
  return questions.filter(q=>(lectures==='all'||lectures.includes(q.lecture))&&selected.has(assessments.get(q.id)||'unrated'));
}
export function createReviewSession(questions,assessments,statuses,scope='all',order='sequential',random=Math.random){
  if(!['sequential','random'].includes(order))throw new Error('풀이 순서는 순서대로 또는 랜덤을 선택하세요.');
  const selected=matchingQuestions(questions,assessments,statuses,scope);
  if(!selected.length)throw new Error('선택한 기억 정도에 해당하는 문항이 없습니다.');
  const questionIds=selected.map(q=>q.id);
  if(order==='random'){
    // Shuffle only at session creation; navigation and rating changes keep this queue.
    for(let i=questionIds.length-1;i>0;i--){
      const j=Math.floor(random()*(i+1));
      [questionIds[i],questionIds[j]]=[questionIds[j],questionIds[i]];
    }
  }
  return {questionIds,statuses:[...new Set(statuses)],scope:normalizeReviewScope(scope),order,assessedIds:new Set()};
}
