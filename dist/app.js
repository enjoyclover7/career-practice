import {connectCloud} from './cloud.js';
import {MEMORY_LABELS,MEMORY_VALUES,loadProgress,saveProgress,matchingQuestions,createReviewSession,STORAGE_KEY} from './progress.js';
import {LEARNING_KEY,originalContent,loadLearning,saveLearning,restoreLearning,validateContent} from './learning.js';
const $ = id => document.getElementById(id);
let data, lecture = 1, currentId, reviewSession=null, storage=null, validIds, storageReady=false;
const drafts = new Map(), revealed = new Set(), assessments = new Map();
const overrides=new Map(), editBuffers=new Map();
let learningStorage,profileStore=null,cloud=null,activeUser=null;
const profileBuffers=new Map();
let profileId="guest";
const getQuestion = () => data.questions.find(q => q.id === currentId);
const currentQuestions = () => reviewSession ? reviewSession.questionIds.map(id=>data.questions.find(q=>q.id===id)) : data.questions.filter(q => q.lecture === lecture);
const setText = (id, text) => { $(id).textContent = text; };
function selectQuestion(id, focus = false) {
  const q = data.questions.find(q => q.id === id);
  if (!q) throw new Error('유효한 문항 번호가 필요합니다.');
  if(reviewSession&&!reviewSession.questionIds.includes(id))reviewSession=null;
  lecture = q.lecture; currentId = q.id; render();
  if (focus) { $('question').focus({preventScroll:true}); $('main').scrollIntoView({block:'start',behavior:'instant'}); }
}
function selectLecture(number) {
  const first = data.questions.find(q => q.lecture === number);
  if (!first) throw new Error('이 강의에 풀 수 있는 문항이 없습니다.');
  reviewSession=null; selectQuestion(first.id);
}
function render() {
  const q = getQuestion(), list = currentQuestions(), index = list.findIndex(x=>x.id===q.id);
  const lec = data.lectures.find(x=>x.number===lecture);
  for (const b of $('lectures').children) b.setAttribute('aria-current', Number(b.dataset.lecture)===lecture ? 'true':'false');
  setText('lectureLabel',reviewSession?`${reviewScopeLabel(reviewSession.scope,true)} · 복습`:lec.title);
  $('activeReview').hidden=!reviewSession;
  if(reviewSession){
    setText('activeReviewTitle',reviewSession.order==='random'?'랜덤 복습 중':'순서대로 복습 중');
    setText('activeReviewDescription',`${reviewScopeLabel(reviewSession.scope)} · ${reviewSession.statuses.map(s=>MEMORY_LABELS[s]).join(' · ')} / ${list.length}문항. 이번 문제 목록과 순서는 끝까지 유지돼요.`);
  }
  setText('sessionCurrent',index+1); setText('sessionTotal',`/ ${list.length}문항`);
  $('progressBar').style.width = `${(index+1)/list.length*100}%`;
  const select = $('questionSelect'); select.replaceChildren();
  for (const item of list) { const o = document.createElement('option'); o.value=item.id; o.textContent=`${String(item.number).padStart(3,'0')} · ${reviewSession?String(item.lecture).padStart(2,'0')+'강 · ':''}${item.prompt}`; select.append(o); }
  select.value=q.id;
  setText('questionNumber',`문제 ${String(q.number).padStart(3,'0')}${reviewSession?' · '+String(q.lecture).padStart(2,'0')+'강':''}`);setText('category',q.category);
  $('countBadge').hidden=!q.expectedCount;
  setText('countBadge', q.expectedCount ? (q.requirementLabel || (q.sourceNumber===99 ? '각 3가지' : `${q.expectedCount}개 항목`)) : '');
  setText('question',q.prompt);
  $('draft').value=drafts.get(q.id)||''; updateCharacterCount();
  const isRevealed=revealed.has(q.id);
  $('modelAnswer').hidden=!isRevealed; $('reveal').setAttribute('aria-expanded',String(isRevealed));
  setText('reveal',isRevealed?'모범답안 접기':'모범답안 보기');
  $('answerIntro').hidden=!q.answerIntro;setText('answerIntro',q.answerIntro||'');
  $('answerSelectionNote').hidden=!q.answerSelectionNote;
  setText('answerSelectionNote',q.answerSelectionNote||'');
  $('answerList').replaceChildren(); $('answerGroups').replaceChildren();
  $('answerList').hidden=!!q.answerGroups; $('answerGroups').hidden=!q.answerGroups;
  if(q.answerGroups){
    for(const group of q.answerGroups){
      const section=document.createElement('section'), heading=document.createElement('h4'), list=document.createElement('ol');
      section.className='answer-group';heading.textContent=`${group.label} · ${group.requiredCount}가지 선택`;
      list.className='model-answer-list';section.append(heading);
      if(group.intro){const intro=document.createElement('p');intro.textContent=group.intro;section.append(intro);}
      appendAnswers(list,group.answers);section.append(list);$('answerGroups').append(section);
    }
  }else appendAnswers($('answerList'),q.answers);
  renderLearning();
  $('sourceLink').href=q.sourceUrl;
  $('previous').disabled=index===0;
  const nextLecture=!reviewSession&&data.lectures.find(x=>x.number>lecture&&x.count>0);
  $('next').disabled=index===list.length-1&&!nextLecture;
  setText('next', index===list.length-1 ? (reviewSession?'마지막 복습 문제':nextLecture?'다음 강의':'마지막 문항'):'다음 문제');
  setText('assessmentFeedback',''); updateAssessment();updateReviewBuilder();
}
function appendAnswers(list,answers){
  for(const answer of answers){
    const li=document.createElement('li'), paragraph=document.createElement('div'), pos=answer.indexOf(':');
    if(pos>=0){const strong=document.createElement('strong');strong.textContent=answer.slice(0,pos);paragraph.append(strong,document.createTextNode(answer.slice(pos)));}
    else{const strong=document.createElement('strong');strong.textContent=answer;paragraph.append(strong);}
    li.append(paragraph);list.append(li);
  }
}
function renderLearning(){
  const q=getQuestion(),custom=overrides.get(q.id),content=custom||originalContent(q),buffer=editBuffers.get(q.id);
  $('modifiedBadge').hidden=!custom;
  $('viewOriginal').hidden=!custom&&!buffer;
  $('editLearning').hidden=!!buffer;
  $('answerDisplay').hidden=!!buffer;
  $('learningEditor').hidden=!buffer;
  $('answerIntro').hidden=!!custom||!q.answerIntro;
  $('answerList').hidden=!!custom||!!q.answerGroups;
  $('answerGroups').hidden=!!custom||!q.answerGroups;
  $('editedAnswer').hidden=!custom;
  setText('editedAnswer',custom?.answerText||'');
  $('memoryTipSection').hidden=!content.tipText.trim();
  setText('memoryTipText',content.tipText);
  if(buffer){$('editModelAnswer').value=buffer.answerText;$('editMemoryTip').value=buffer.tipText;}
  $('learningFeedback').hidden=true;
}
function learningMessage(message){setText('learningFeedback',message);$('learningFeedback').hidden=false;}
function beginLearningEdit(){
  const q=getQuestion();editBuffers.set(q.id,{...(overrides.get(q.id)||originalContent(q))});renderLearning();$('editModelAnswer').focus();
}
function captureLearningEdit(){editBuffers.set(currentId,{answerText:$('editModelAnswer').value,tipText:$('editMemoryTip').value});}
function saveLearningEdit(event){
  event.preventDefault();captureLearningEdit();
  let content;
  try{content=validateContent(editBuffers.get(currentId));}catch(error){learningMessage(error.message);return;}
  try{
    if(!learningStorage)learningStorage=profileStore||window.localStorage;
    const saved=saveLearning(learningStorage,validIds,currentId,content);
    overrides.set(currentId,saved);editBuffers.delete(currentId);renderLearning();
    learningMessage(activeUser?'모범답안과 암기 팁을 기기에 저장했어요. 연결되면 동기화됩니다.':'모범답안과 암기 팁을 이 브라우저에 저장했어요.');$('editLearning').focus();
  }catch{learningMessage('브라우저에 수정 내용을 저장할 수 없어요. 입력한 내용은 아직 이 편집 화면에 있습니다. 내용을 보관한 뒤 저장 설정을 확인해 주세요.');}
}
function showOriginal(){
  const q=getQuestion(),content=originalContent(q);
  setText('originalAnswerText',content.answerText);setText('originalTipText',content.tipText);
  $('originalTipSection').hidden=!content.tipText.trim();
  $('originalRequirement').hidden=!q.answerSelectionNote;setText('originalRequirement',q.answerSelectionNote||'');
  $('restoreOriginal').disabled=!overrides.has(currentId);
  $('restoreConfirmation').hidden=true;
  $('originalDialog').showModal();
}
function restoreOriginal(){
  try{
    restoreLearning(learningStorage,validIds,currentId);overrides.delete(currentId);editBuffers.delete(currentId);
    $('originalDialog').close();renderLearning();learningMessage('원본 모범답안과 암기 팁으로 되돌렸어요.');$('editLearning').focus();
  }catch{$('originalDialog').close();learningMessage('원본으로 되돌리지 못했어요. 저장 설정을 확인한 뒤 다시 시도해 주세요.');}
}
function restoreLearningContent(){
  try{learningStorage=profileStore||window.localStorage;const saved=loadLearning(learningStorage,validIds);for(const [id,content] of Object.entries(saved.overrides))overrides.set(id,content);}
  catch{setText('storageNotice','저장된 수정 내용을 불러올 수 없어요. 원본 답안을 표시합니다. 브라우저의 저장 설정을 확인해 주세요.');$('storageNotice').hidden=false;}
}
function updateCharacterCount(){setText('charCount',`${$('draft').value.length}자`);}
function updateAssessment(){
  const status=assessments.get(currentId);
  for(const value of MEMORY_VALUES)$(value).setAttribute('aria-pressed',String(status===value));
  setText('statusText',status?MEMORY_LABELS[status]:revealed.has(currentId)?'답안을 비교해 보세요':'아직 확인 안 했어요');
  const list=currentQuestions(), count=reviewSession?reviewSession.assessedIds.size:list.filter(q=>assessments.has(q.id)).length;
  setText('sessionSummary',`${reviewSession?'이번 복습':'기억 표시'} ${count} / ${list.length}`);
}
function revealAnswer(show = !revealed.has(currentId)){
  if(show) revealed.add(currentId);else revealed.delete(currentId);
  $('modelAnswer').hidden=!show;$('reveal').setAttribute('aria-expanded',String(show));setText('reveal',show?'모범답안 접기':'모범답안 보기');updateAssessment();
}
function writeAnswer(text){if(typeof text!=='string'||text.length>50000)throw new Error('답안은 50,000자 이내의 문자열이어야 합니다.');drafts.set(currentId,text);$('draft').value=text;updateCharacterCount();persist('drafts',text);}
function assess(value){
  if(!MEMORY_VALUES.includes(value))throw new Error('known, uncertain 또는 unknown 값을 사용하세요.');
  if(!revealed.has(currentId))throw new Error('먼저 모범답안을 확인하세요.');
  assessments.set(currentId,value);reviewSession?.assessedIds.add(currentId);
  const saved=persist('assessments',value);
  setText('assessmentFeedback',`‘${MEMORY_LABELS[value]}’${saved?'로 저장했어요.':'로 표시했어요. 이 화면에서 유지됩니다.'}`);
  updateAssessment();updateReviewBuilder();
}
function navigate(step){const list=currentQuestions(),index=list.findIndex(q=>q.id===currentId),next=list[index+step];if(next)selectQuestion(next.id,true);else if(step>0&&!reviewSession){const first=data.questions.find(q=>q.lecture>lecture);if(first)selectQuestion(first.id,true);}}
function showStorageProblem(){
  $('storageNotice').hidden=false;
  setText('storageNotice','브라우저에 기록을 저장할 수 없어요. 지금 작성한 답안과 기억 정도는 이 화면에서 유지됩니다. 브라우저의 저장 설정을 확인해 주세요.');
  setText('saveStatus','지금 기록은 현재 열린 화면에서만 유지됩니다.');
}
function restoreProgress(){
  try{
    storage=profileStore||window.localStorage;
    const saved=loadProgress(storage,validIds);
    for(const [id,text] of Object.entries(saved.drafts))drafts.set(id,text);
    for(const [id,status] of Object.entries(saved.assessments))assessments.set(id,status);
    storageReady=true;if(!activeUser)setText('saveStatus','로그인하면 휴대폰과 PC의 기록이 연결돼요. 지금은 이 브라우저에 저장돼요.');
  }catch{showStorageProblem();}
}
function persist(field,value){
  if(!storageReady)return false;
  try{
    saveProgress(storage,validIds,currentId,field,value);$('storageNotice').hidden=true;
    if(!activeUser)setText('saveStatus','내 답안과 기억 정도를 이 브라우저에 저장했어요.');return true;
  }catch{showStorageProblem();return false;}
}
function reviewScopeLabel(scope,compact=false){
  if(scope==='all')return '전체 강의';
  const labels=scope.map(n=>String(n).padStart(2,'0'));
  if(!labels.length)return '강의를 선택하세요';
  if(compact&&labels.length>1)return `${labels[0]}강 외 ${labels.length-1}개`;
  if(labels.length>4)return `${labels.slice(0,3).join('·')}강 외 ${labels.length-3}개`;
  return `${labels.join('·')}강`;
}
function reviewChoices(){
  const lectures=[...document.querySelectorAll('input[name="reviewLecture"]:checked')].map(input=>Number(input.value));
  return {statuses:[...document.querySelectorAll('input[name="reviewStatus"]:checked')].map(input=>input.value),scope:lectures.length===data.lectures.length?'all':lectures,order:document.querySelector('input[name="reviewOrder"]:checked').value};
}
function updateReviewBuilder(){
  const {statuses,scope,order}=reviewChoices();
  setText('reviewScopeLabel',reviewScopeLabel(scope));
  $('reviewAllLectures').checked=scope==='all';
  $('reviewAllLectures').indeterminate=scope!=='all'&&scope.length>0;
  for(const [value,id] of [['known','filterKnownCount'],['uncertain','filterUncertainCount'],['unknown','filterUnknownCount'],['unrated','filterUnratedCount']])setText(id,`${matchingQuestions(data.questions,assessments,[value],scope).length}문항`);
  const count=matchingQuestions(data.questions,assessments,statuses,scope).length;
  $('startMemoryReview').disabled=!count;
  setText('reviewSelectionCount',count?`${count}문항을 ${order==='random'?'랜덤으로':'순서대로'} 복습해요.`:scope!=='all'&&!scope.length?'복습할 강의를 하나 이상 선택해 주세요.':!statuses.length?'복습할 기억 정도를 하나 이상 선택해 주세요.':'해당 문항이 아직 없어요. 기억 정도를 표시하거나, 미확인 문항을 선택해 주세요.');
}
function startReview(statuses,scope='all',order='sequential'){
  reviewSession=createReviewSession(data.questions,assessments,statuses,scope,order);
  for(const input of document.querySelectorAll('input[name="reviewLecture"]'))input.checked=reviewSession.scope==='all'||reviewSession.scope.includes(Number(input.value));
  for(const input of document.querySelectorAll('input[name="reviewStatus"]'))input.checked=reviewSession.statuses.includes(input.value);
  for(const input of document.querySelectorAll('input[name="reviewOrder"]'))input.checked=input.value===order;
  $('reviewSetup').close();selectQuestion(reviewSession.questionIds[0],true);
}
function endReview(){reviewSession=null;render();}

function refreshAccountRecords(){
  drafts.clear();assessments.clear();overrides.clear();
  restoreProgress();restoreLearningContent();
  if(currentId){
    if(document.activeElement!==$('draft')){$('draft').value=drafts.get(currentId)||'';updateCharacterCount();}
    updateAssessment();updateReviewBuilder();renderLearning();
  }
}
function switchAccount(user,store){
  profileBuffers.set(profileId,new Map(editBuffers));
  profileId=user?.id||'guest';activeUser=user;profileStore=store;
  editBuffers.clear();for(const [id,buffer] of profileBuffers.get(profileId)||[])editBuffers.set(id,buffer);
  revealed.clear();reviewSession=null;storageReady=false;
  $('accountButton').textContent=user?'내 계정':'로그인';
  $('signInForm').hidden=!!user;$('signedInPanel').hidden=!user;
  $('accountEmail').textContent=user?.email||'';
  $('accountTitle').textContent=user?'내 학습 계정':'로그인';
  $('accountMessage').textContent='';
  if(user&&!store){drafts.clear();assessments.clear();overrides.clear();render();showStorageProblem();$('draft').disabled=true;$('editLearning').disabled=true;return;}
  $('draft').disabled=false;$('editLearning').disabled=false;
  refreshAccountRecords();render();
}
async function setupAccount(){
  $('accountButton').onclick=()=>{
    $('accountDialog').showModal();
    if(activeUser&&cloud){try{const n=cloud.guestCount();$('importGuest').hidden=!n;$('guestImportNote').textContent=n?`이 브라우저에서 로그인 없이 공부한 ${n}문항의 기록이 있어요. 계정에 이미 있는 내용은 유지합니다.`:'';}catch{$('importGuest').hidden=true;}}
  };
  $('closeAccount').onclick=()=>$('accountDialog').close();
  $('signInForm').onsubmit=async event=>{
    event.preventDefault();if(!cloud){$('accountMessage').textContent='로그인 연결을 확인 중이에요. 인터넷 연결을 확인하고 잠시 뒤 다시 시도해 주세요.';return;}
    const submit=$('signInSubmit');submit.disabled=true;$('accountMessage').textContent='로그인하고 있어요';
    try{await cloud.signIn($('loginEmail').value.trim(),$('loginPassword').value);$('loginPassword').value='';$('accountDialog').close();}
    catch(error){$('accountMessage').textContent=error.message;}finally{submit.disabled=false;}
  };
  $('signOut').onclick=async()=>{
    if(editBuffers.size){$('accountMessage').textContent='수정 중인 모범답안과 암기 팁을 먼저 저장하거나 취소해 주세요.';return;}
    if(cloud.pendingCount()){$('accountMessage').textContent='아직 동기화하지 못한 기록이 있어요. 동기화 완료 후 로그아웃해 주세요.';return;}
    $('signOut').disabled=true;
    try{await cloud.signOut();$('accountDialog').close();}catch(error){$('accountMessage').textContent=error.message;}finally{$('signOut').disabled=false;}
  };
  $('syncNow').onclick=()=>cloud?.sync();
  $('importGuest').onclick=()=>{$('importConfirmation').hidden=false;};
  $('cancelImport').onclick=()=>{$('importConfirmation').hidden=true;};
  $('confirmImport').onclick=()=>{try{const count=cloud.importGuest();$('accountMessage').textContent=`${count}개 저장 항목을 계정으로 옮겼어요. 기존 계정 기록은 유지합니다.`;$('importConfirmation').hidden=true;}catch{$('accountMessage').textContent='기록을 옮기지 못했어요. 브라우저 저장 설정을 확인해 주세요.';}};
  try{cloud=await connectCloud({ids:validIds,onAccount:switchAccount,onRecords:refreshAccountRecords,onStatus:text=>setText('saveStatus',text)});}
  catch(error){const pending=error.message==='SETUP_PENDING';setText('saveStatus',pending?'계정 연결을 준비 중이에요. 지금 기록은 이 브라우저에 저장됩니다.':'로그인 서버에 연결하지 못했어요. 지금 기록은 이 브라우저에 저장됩니다.');$('accountMessage').textContent=pending?'관리자가 계정 연결을 준비하고 있어요. 준비되면 로그인할 수 있습니다.':'인터넷 연결을 확인하고 앱을 다시 열어 주세요.';}
}
async function setupInstall(){
  let installPrompt=null;
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('installApp').textContent='홈 화면에 앱 설치';});
  $('installApp').onclick=async()=>{
    if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;}
    else $('installGuide').hidden=!$('installGuide').hidden;
  };
  const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  if(standalone){$('installApp').hidden=true;$('installGuide').hidden=true;}
  if('serviceWorker' in navigator){
    try{const registration=await navigator.serviceWorker.register('./sw.js');
      const showUpdate=()=>{if(registration.waiting)$('appUpdate').hidden=false;};
      showUpdate();registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdate();});});
      $('updateApp').onclick=()=>{if(editBuffers.size){setText('saveStatus','수정 중인 내용을 저장하거나 취소한 뒤 업데이트해 주세요.');return;}$('updateApp').disabled=true;registration.waiting?.postMessage('SKIP_WAITING');};
      let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing&&$('updateApp').disabled){refreshing=true;location.reload();}});
    }catch{setText('installNotice','앱 설치용 파일을 준비하지 못했어요. 인터넷에 연결한 뒤 다시 열어 주세요.');}
  }
}

function init(){
  validIds=new Set(data.questions.map(q=>q.id));restoreProgress();restoreLearningContent();
  setText('totalCount',`${data.questions.length}문항`);setText('reviewCount',data.review.length);
  for(const l of data.lectures){const button=document.createElement('button');button.type='button';button.className='lecture-button';button.dataset.lecture=l.number;button.setAttribute('aria-label',`${l.title} ${l.subtitle}, ${l.count}문항`);
    const left=document.createElement('span'),name=document.createElement('span'),desc=document.createElement('span'),count=document.createElement('span');name.className='lecture-name';name.textContent=l.title;desc.className='lecture-description';desc.textContent=l.subtitle;count.className='lecture-total';count.textContent=`${l.count}문항`;left.append(name,desc);button.append(left,count);button.onclick=()=>selectLecture(l.number);$('lectures').append(button);
    const choice=document.createElement('label'),input=document.createElement('input'),label=document.createElement('span');choice.className='lecture-choice';input.type='checkbox';input.name='reviewLecture';input.value=l.number;input.checked=true;label.textContent=l.title;choice.append(input,label);$('reviewLectureChoices').append(choice);}
  for(const r of data.review){const item=document.createElement('article'),meta=document.createElement('small'),title=document.createElement('strong'),reason=document.createElement('p');item.className='review-item';meta.textContent=`${String(r.lecture).padStart(2,'0')}강 · 보류 ${r.id.slice(1)}`;title.textContent=r.title;reason.textContent=r.reason;item.append(meta,title,reason);$('reviewList').append(item);}
  setText('exclusionNote',`계산·계산공식 문항 ${data.excluded.length}개는 제외했습니다. 타임스탬프는 사용하지 않으며, 학습 문항 번호는 새로 부여했습니다.`);
  $('reviewButton').onclick=()=>$('reviewDialog').showModal();$('closeReview').onclick=()=>$('reviewDialog').close();
  $('questionSelect').onchange=e=>selectQuestion(e.target.value);
  $('draft').oninput=()=>writeAnswer($('draft').value);
  $('reveal').onclick=()=>revealAnswer();for(const value of MEMORY_VALUES)$(value).onclick=()=>assess(value);
  $('previous').onclick=()=>navigate(-1);$('next').onclick=()=>navigate(1);
  $('reviewAllLectures').onchange=()=>{for(const input of document.querySelectorAll('input[name="reviewLecture"]'))input.checked=$('reviewAllLectures').checked;updateReviewBuilder();};
  for(const input of document.querySelectorAll('input[name="reviewStatus"],input[name="reviewLecture"],input[name="reviewOrder"]'))input.onchange=updateReviewBuilder;
  $('startMemoryReview').onclick=()=>{const {statuses,scope,order}=reviewChoices();startReview(statuses,scope,order);};
  $('endMemoryReview').onclick=endReview;
  $('openMemoryReview').onclick=()=>{$('reviewLecturePicker').open=false;$('reviewSetup').showModal();};
  $('closeMemoryReview').onclick=()=>$('reviewSetup').close();
  $('editLearning').onclick=beginLearningEdit;
  $('editModelAnswer').oninput=captureLearningEdit;$('editMemoryTip').oninput=captureLearningEdit;
  $('learningEditor').onsubmit=saveLearningEdit;
  $('cancelLearning').onclick=()=>{editBuffers.delete(currentId);renderLearning();$('editLearning').focus();};
  $('viewOriginal').onclick=showOriginal;$('closeOriginal').onclick=()=>$('originalDialog').close();
  $('restoreOriginal').onclick=()=>{$('restoreConfirmation').hidden=false;$('confirmRestore').focus();};
  $('cancelRestore').onclick=()=>{$('restoreConfirmation').hidden=true;$('restoreOriginal').focus();};
  $('confirmRestore').onclick=restoreOriginal;
  window.addEventListener('beforeunload',event=>{if(editBuffers.size){event.preventDefault();event.returnValue='';}});
  window.addEventListener('storage',event=>{
    if(activeUser)return;
    if(event.key===LEARNING_KEY||event.key===null){
      try{const saved=loadLearning(learningStorage,validIds);overrides.clear();for(const [id,content] of Object.entries(saved.overrides))overrides.set(id,content);renderLearning();}
      catch{learningMessage('다른 화면의 수정 내용을 불러올 수 없어요. 현재 내용은 유지합니다.');}
    }
    if(event.key!==STORAGE_KEY&&event.key!==null)return;
    try{
      const saved=loadProgress(storage,validIds);drafts.clear();assessments.clear();
      for(const [id,text] of Object.entries(saved.drafts))drafts.set(id,text);
      for(const [id,status] of Object.entries(saved.assessments))assessments.set(id,status);
      if(document.activeElement!==$('draft')){$('draft').value=drafts.get(currentId)||'';updateCharacterCount();}
      updateAssessment();updateReviewBuilder();
    }catch{showStorageProblem();}
  });
  currentId=data.questions[0].id;render();$('loading').hidden=true;$('practice').hidden=false;registerTools();setupAccount();setupInstall();
}
function state(){const q=getQuestion();return {questionId:q.id,lecture:q.lecture,number:q.number,prompt:q.prompt,answer:drafts.get(q.id)||'',modelAnswerVisible:revealed.has(q.id),assessment:assessments.get(q.id)||null,mode:reviewSession?'memoryReview':'lecture',reviewQuestionIds:reviewSession?.questionIds||null,reviewScope:reviewSession?.scope??null,reviewOrder:reviewSession?.order??null,browserStorageAvailable:storageReady&&$('storageNotice').hidden};}
function registerTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const schema=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
  const validate=(input,keys,required=[])=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k))||required.some(k=>!(k in input)))throw new Error('입력 형식이 올바르지 않습니다.');return input;};
  const definitions=[
    ['read_practice_state','현재 문항 읽기','현재 화면의 문항, 내 답안과 확인 상태를 읽습니다.',schema({}),true,input=>{validate(input,[]);return state();}],
    ['list_practice_questions','문항 목록 읽기','풀 수 있는 문항의 번호와 문제를 강의별로 읽습니다. 보류 문항은 포함하지 않습니다.',schema({lecture:{type:'integer',minimum:1,maximum:12}}),true,input=>{validate(input,['lecture']);if(input.lecture!==undefined&&(!Number.isInteger(input.lecture)||input.lecture<1||input.lecture>12))throw new Error('강의 번호는 1~12입니다.');return data.questions.filter(q=>!input.lecture||q.lecture===input.lecture).map(({id,number,lecture,prompt})=>({id,number,lecture,prompt}));}],
    ['select_practice_question','문항 이동','지정한 문항을 화면에 엽니다. 복습 목록 밖의 문항이면 일반 문제풀이로 전환합니다.',schema({questionId:{type:'string'}},['questionId']),false,input=>{validate(input,['questionId'],['questionId']);selectQuestion(input.questionId);return state();}],
    ['write_practice_answer','내 답안 작성','현재 문항의 답안을 기기에 저장하고 로그인 상태이면 계정과 동기화합니다.',schema({answer:{type:'string',maxLength:50000}},['answer']),false,input=>{validate(input,['answer'],['answer']);writeAnswer(input.answer);return state();}],
    ['reveal_practice_answer','모범답안 보기','현재 문항의 모범답안과 암기 팁을 화면에 표시합니다. 수정한 내용이 있으면 수정 내용을 반환합니다.',schema({}),false,input=>{validate(input,[]);revealAnswer(true);const q=getQuestion(),custom=overrides.get(q.id),content=custom||originalContent(q);return {...state(),modelAnswer:custom?[custom.answerText]:q.answers,modelAnswerText:content.answerText,memoryTip:content.tipText,isModified:!!custom,expectedCount:q.expectedCount,answerSelectionNote:q.answerSelectionNote||null,answerGroups:custom?null:q.answerGroups||null};}],
    ['assess_practice_answer','기억 정도 표시','모범답안 확인 후 기억 정도를 기기에 저장하고 로그인 상태이면 계정과 동기화합니다. 공식 채점은 하지 않습니다.',schema({assessment:{type:'string',enum:MEMORY_VALUES}},['assessment']),false,input=>{validate(input,['assessment'],['assessment']);assess(input.assessment);return state();}],
    ['start_memory_review','기억 정도별 복습 시작','선택한 강의와 기억 정도의 문항으로 복습을 시작합니다. 여러 강의 및 랜덤 순서를 선택할 수 있고, 복습 중 표시를 바꿔도 목록과 순서는 유지됩니다.',schema({statuses:{type:'array',items:{type:'string',enum:Object.keys(MEMORY_LABELS)},minItems:1,uniqueItems:true},lecture:{type:'integer',minimum:1,maximum:12},lectures:{type:'array',items:{type:'integer',minimum:1,maximum:12},minItems:1,uniqueItems:true},order:{type:'string',enum:['sequential','random']}},['statuses']),false,input=>{validate(input,['statuses','lecture','lectures','order'],['statuses']);if(!Array.isArray(input.statuses)||!input.statuses.length)throw new Error('기억 정도를 선택하세요.');if(input.lecture!==undefined&&input.lectures!==undefined)throw new Error('강의 범위는 한 가지 방식으로 지정하세요.');if(input.lectures!==undefined&&(!Array.isArray(input.lectures)||!input.lectures.length))throw new Error('강의를 하나 이상 선택하세요.');startReview(input.statuses,input.lectures??input.lecture??'all',input.order??'sequential');return state();}],
    ['end_memory_review','일반 문제풀이로 돌아가기','복습을 마치고 현재 문항의 강의로 돌아갑니다.',schema({}),false,input=>{validate(input,[]);endReview();return state();}]
  ];
  for(const [name,title,description,inputSchema,readOnlyHint,execute] of definitions){try{Promise.resolve(context.registerTool({name,title,description,inputSchema,annotations:{readOnlyHint,untrustedContentHint:true},execute},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
try{const response=await fetch('./data.json');if(!response.ok)throw new Error('HTTP '+response.status);data=await response.json();if(!data.questions?.length)throw new Error('문항 없음');init();}catch{const error=$('loading');error.className='load-error';error.replaceChildren();const text=document.createElement('p');text.textContent='문항을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';const button=document.createElement('button');button.className='primary';button.textContent='다시 불러오기';button.onclick=()=>location.reload();error.append(text,button);$('reviewButton').disabled=true;}
