/* Persist pending work before network I/O. The RPC checks the last acknowledged payload atomically. */
let syncBase=null,syncBusy=false,syncAgain=false,syncConflict=false,syncOwner=null,syncStorageFailed=false;
const syncKey=id=>'liftlog_sync_v2_'+id;
function readSyncCache(id){try{return JSON.parse(localStorage.getItem(syncKey(id))||'null');}catch{return null;}}
function persistPending(){
  if(!cloudUser)return false;
  try{localStorage.setItem(syncKey(cloudUser.id),JSON.stringify({base:syncBase,state,pending:true}));syncStorageFailed=false;return true;}
  catch{syncStorageFailed=true;badge().textContent='Storage full · keep this tab open and export a backup';return false;}
}
function paintSyncPanel(){
  let panel=$('syncRecovery');if(!panel){panel=document.createElement('div');panel.id='syncRecovery';panel.className='card';document.querySelector('main').prepend(panel);}
  panel.classList.toggle('hidden',!syncConflict);
  panel.innerHTML='<h3>Another device has newer changes</h3><p>Your edits are safe on this device. Download them before loading the newer cloud version. No changes have been overwritten.</p><div class="session-actions"><button class="btn secondary" onclick="exportData()">Download my pending edits</button><button class="btn" onclick="acceptCloudVersion()">Load newer cloud version</button></div>';
}
syncCloud=function(){
  if(!cloudReady||!cloudUser)return;
  if(!persistPending())return;clearTimeout(syncTimer);
  badge().textContent=syncConflict?'Sync paused · review changes':!navigator.onLine?'Offline · saved on device':'Unsaved changes…';
  if(navigator.onLine&&!syncConflict)syncTimer=setTimeout(flushSync,500);
};
async function flushSync(){
  if(!cloudReady||!cloudUser||syncConflict||!navigator.onLine)return;
  if(syncBusy){syncAgain=true;return;}
  syncBusy=true;const userId=cloudUser.id,payload=structuredClone(state),expected=structuredClone(syncBase);
  try{
    const {data,error}=await cloudClient.rpc('liftlog_save',{expected_payload:expected,next_payload:payload});
    if(error)throw error;
    if(cloudUser?.id!==userId)return;
    if(!data?.saved){syncConflict=true;badge().textContent='Sync paused · review changes';persistPending();paintSyncPanel();return;}
    syncBase=payload;
    const pending=JSON.stringify(state)!==JSON.stringify(payload);
    localStorage.setItem(syncKey(userId),JSON.stringify({base:syncBase,state,pending}));
    badge().textContent=pending?'Unsaved changes…':'✓ Synced to cloud';
    syncAgain=pending;
  }catch{if(cloudUser?.id===userId){if(persistPending())badge().textContent='Saved on device · retry sync';}}
  finally{syncBusy=false;if(syncAgain){syncAgain=false;syncCloud();}}
}
loadCloud=async function(user){
  cloudReady=false;clearTimeout(syncTimer);syncConflict=false;syncOwner=user.id;
  const cached=readSyncCache(user.id);let remote,failed=false;
  try{const {data,error}=await cloudClient.from('user_data').select('payload').eq('user_id',user.id).maybeSingle();if(error)throw error;remote=data?.payload??null;}catch{failed=true;}
  if(syncOwner!==user.id)return;
  if(failed&&!cached){$('authMessage').textContent='Connect to the internet once to load your account on this device.';return;}
  cloudUser=user;
  // Preserve legacy pending edits, but never assume they were based on the latest cloud copy.
  let legacy=null;try{if(localStorage.getItem('liftlog_offline_pending_'+user.id)==='1')legacy=JSON.parse(localStorage.getItem('liftlog_offline_'+user.id)||'null');}catch{}
  if(cached){syncBase=cached.base;state=structuredClone(cached.pending?cached.state:failed?cached.state:remote||defaults);if(!cached.pending&&!failed)syncBase=structuredClone(remote);}
  else{syncBase=structuredClone(remote);state=structuredClone(legacy||remote||defaults);if(legacy)syncConflict=true;}
  state={...structuredClone(defaults),...state};
  if(!Array.isArray(state.plan)||!state.plan.length)state.plan=structuredClone(ORIGINAL_PLAN);
  PLAN.splice(0,PLAN.length,...structuredClone(state.plan));state.day=Math.min(Math.max(0,state.day||0),PLAN.length-1);
  cloudReady=true;$('authGate').classList.add('hidden');$('signOutBtn').style.display='inline-flex';render();paintSyncPanel();
  if(cached?.pending||legacy){persistPending();syncCloud();}
  else{localStorage.setItem(syncKey(user.id),JSON.stringify({base:syncBase,state,pending:false}));badge().textContent=failed?'Offline · saved on device':'✓ Synced to cloud';}
};
async function acceptCloudVersion(){
  if(!cloudUser||!confirm('Keep a recovery copy of your pending edits on this device and load the cloud version?'))return;
  try{
    const {data,error}=await cloudClient.from('user_data').select('payload').eq('user_id',cloudUser.id).maybeSingle();if(error||!data?.payload)throw Error();
    localStorage.setItem('liftlog_recovery_'+cloudUser.id,JSON.stringify({app:'LiftLog',version:1,state}));
    syncBase=structuredClone(data.payload);state={...structuredClone(defaults),...structuredClone(syncBase)};
    PLAN.splice(0,PLAN.length,...structuredClone(state.plan||ORIGINAL_PLAN));state.day=Math.min(state.day||0,PLAN.length-1);
    syncConflict=false;localStorage.setItem(syncKey(cloudUser.id),JSON.stringify({base:syncBase,state,pending:false}));
    localStorage.removeItem('liftlog_offline_pending_'+cloudUser.id);render();paintSyncPanel();badge().textContent='✓ Synced to cloud';
  }catch{badge().textContent='Could not load cloud version · pending edits kept';}
}
function downloadRecovery(){const raw=cloudUser&&localStorage.getItem('liftlog_recovery_'+cloudUser.id);if(!raw)return alert('No recovery backup on this device.');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([raw],{type:'application/json'}));a.download='liftlog-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
const profileBeforeSync=profile;profile=function(){profileBeforeSync();$('profile').insertAdjacentHTML('beforeend','<div class="card"><h3>Sync recovery</h3><button class="btn secondary" onclick="flushSync()">Retry sync</button> <button class="btn secondary" onclick="downloadRecovery()">Download recovery backup</button></div>');};
const signOutBeforeSync=signOut;signOut=async function(){if(syncStorageFailed||(cloudUser&&readSyncCache(cloudUser.id)?.pending)){alert('Your pending edits are still on this device. Reconnect and sync or resolve the conflict before signing out.');return;}await signOutBeforeSync();syncOwner=null;syncBase=null;syncConflict=false;$('syncRecovery')?.classList.add('hidden');};
window.addEventListener('online',()=>{if(cloudReady)flushSync();});
window.addEventListener('offline',()=>{if(cloudReady){if(persistPending())badge().textContent='Offline · saved on device';}});
