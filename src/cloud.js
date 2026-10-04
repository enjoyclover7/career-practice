import {createClient} from '@supabase/supabase-js';
import {AccountStore} from './account-store.js';
import {loadProgress} from '../dist/progress.js';
import {loadLearning} from '../dist/learning.js';
export async function connectCloud({ids,onAccount,onRecords,onStatus}){
  const config=await fetch('./config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('설정 불러오기 실패');return r.json();});
  if(!config.url||!config.publishableKey)throw Error('SETUP_PENDING');
  const client=createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
  let active=null,user=null,epoch=0,busy=false,rerun=false,timer;
  const report=text=>onStatus(text);
  function schedule(){clearTimeout(timer);report(navigator.onLine?'기기에 저장했어요 · 동기화 중':'기기에 저장했어요 · 연결되면 동기화해요');timer=setTimeout(sync,700);}
  async function sync(){
    if(!active||!user)return;
    if(busy){rerun=true;return;}
    if(!navigator.onLine){report('오프라인 · 기기의 기록으로 공부하고 있어요');return;}
    busy=true;const own=active,owner=user.id,generation=epoch;
    try{
      for(const row of own.pending()){
        if(generation!==epoch)break;
        const {error}=await client.rpc('save_practice_record',{owner_id:owner,question:row.question_id,record_kind:row.kind,payload:row.value,mutation:row.mutation_id});
        if(error)throw error;
        // An older response must not erase a more recent local edit.
        own.acknowledge(row);
      }
      if(generation!==epoch)return;
      const {data,error}=await client.from('practice_records').select('question_id,kind,value,mutation_id,updated_at').eq('user_id',owner);
      if(error)throw error;
      if(generation!==epoch)return;
      if(own.merge(data))onRecords();
      report(own.pending().length?'기기에 저장했어요 · 동기화 중':'동기화 완료 · 휴대폰과 PC에서 이어서 공부해요');
      if(own.pending().length)rerun=true;
    }catch{if(generation===epoch)report('기기 기록은 유지돼요 · 동기화를 다시 시도해 주세요');}
    finally{busy=false;if(rerun){rerun=false;clearTimeout(timer);timer=setTimeout(sync,700);}}
  }
  function useSession(session){
    const next=session?.user||null;
    if(next?.id===user?.id)return;
    epoch++;clearTimeout(timer);user=next;active=null;
    try{if(user)active=new AccountStore(window.localStorage,user.id,ids,schedule);}
    catch{report('계정 기록을 읽을 수 없어 편집을 중단했어요. 저장 설정을 확인해 주세요.');onAccount(user,null);return;}
    onAccount(user,active);
    if(user){report('계정 기록을 동기화하고 있어요');setTimeout(sync,0);}
    else report('로그인하면 휴대폰과 PC의 기록이 연결돼요');
  }
  client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>useSession(session),0);});
  const {data,error}=await client.auth.getSession();if(error)throw error;useSession(data.session);
  window.addEventListener('online',sync);window.addEventListener('offline',()=>{if(user)report('오프라인 · 연결되면 기록을 동기화해요');});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
  window.addEventListener('storage',event=>{if(active&&event.key===active.key){onRecords();schedule();}});
  setInterval(()=>{if(document.visibilityState==='visible')sync();},15000);
  return {
    async signIn(email,password){const {error}=await client.auth.signInWithPassword({email,password});if(error)throw Error('이메일과 비밀번호를 확인해 주세요. 네트워크 연결도 확인해 주세요.');},
    async signOut(){const {error}=await client.auth.signOut({scope:'local'});if(error)throw Error('로그아웃하지 못했어요. 연결을 확인하고 다시 시도해 주세요.');},
    sync,
    importGuest(){if(!active)throw Error('먼저 로그인해 주세요.');const count=active.importMissing(loadProgress(window.localStorage,ids),loadLearning(window.localStorage,ids));onRecords();return count;},
    guestCount(){const p=loadProgress(window.localStorage,ids),l=loadLearning(window.localStorage,ids);return new Set([...Object.keys(p.drafts),...Object.keys(p.assessments),...Object.keys(l.overrides)]).size;},
    pendingCount(){return active?.pending().length||0;},
    get user(){return user;}
  };
}
