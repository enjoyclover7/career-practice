export const LEARNING_KEY='career-practice:learning:v1';
export function validateContent(content){
  if(!content||typeof content.answerText!=='string'||!content.answerText.trim()||content.answerText.length>50000)throw new Error('모범답안을 입력해 주세요. 최대 50,000자까지 저장할 수 있어요.');
  if(typeof content.tipText!=='string'||content.tipText.length>10000)throw new Error('암기 팁은 10,000자 이내로 입력해 주세요.');
  return {answerText:content.answerText,tipText:content.tipText};
}
export function originalContent(q){
  const lines=[];
  if(q.answerIntro)lines.push(q.answerIntro,'');
  if(q.answerGroups){
    for(const group of q.answerGroups){
      lines.push(`${group.label} · ${group.requiredCount}가지 선택`);
      if(group.intro)lines.push(group.intro);
      lines.push(...group.answers.map((a,i)=>`${i+1}. ${a}`),'');
    }
  }else lines.push(...q.answers.map((a,i)=>`${i+1}. ${a}`));
  return {answerText:lines.join('\n').trim(),tipText:q.memoryTip||''};
}
export function loadLearning(storage,validIds){
  const raw=storage.getItem(LEARNING_KEY);
  if(raw===null)return {version:1,overrides:{}};
  const value=JSON.parse(raw);
  if(!value||value.version!==1||!value.overrides||typeof value.overrides!=='object'||Array.isArray(value.overrides))throw new Error('저장된 수정 내용의 형식을 확인해 주세요.');
  const result={version:1,overrides:{}};
  for(const [id,content] of Object.entries(value.overrides)){
    if(!validIds.has(id))continue;
    // Refuse to overwrite damaged records with a partially recovered object.
    result.overrides[id]=validateContent(content);
  }
  return result;
}
export function saveLearning(storage,validIds,id,content){
  if(!validIds.has(id))throw new Error('저장할 문항이 올바르지 않습니다.');
  const verified=validateContent(content),latest=loadLearning(storage,validIds);
  latest.overrides[id]=verified;
  storage.setItem(LEARNING_KEY,JSON.stringify(latest));
  return verified;
}
export function restoreLearning(storage,validIds,id){
  if(!validIds.has(id))throw new Error('복원할 문항이 올바르지 않습니다.');
  const latest=loadLearning(storage,validIds);
  delete latest.overrides[id];
  storage.setItem(LEARNING_KEY,JSON.stringify(latest));
}
