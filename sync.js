/* Persist pending work before network I/O. The RPC checks the last acknowledged payload atomically. */
let syncBase=null,syncBusy=false,syncAgain=false,syncConflict=false,syncOwner=null,syncStorageFailed=false;
const syncKey=id=>'liftlog_sync_v2_'+id;
function readSyncCache(id){try{return JSON.parse(localStorage.getItem(syncKey(id))||'null');}catch{return null;}}
let editRevision=0, offlineIdentity=false, loadSequence=0;
function persistPending(onlyDraft=false){
  if(!cloudUser)return false;
  deviceWrite(cloudUser.id,true,onlyDraft);
  return true;
}
function paintSyncPanel(){
  let panel=$('syncRecovery');if(!panel){panel=document.createElement('div');panel.id='syncRecovery';panel.className='card';document.querySelector('main').prepend(panel);}
  panel.classList.toggle('hidden',!syncConflict);
  panel.innerHTML='<h3>Another device has newer changes</h3><p>Your edits are safe on this device. Download them before loading the newer cloud version. No changes have been overwritten.</p><div class="session-actions"><button class="btn secondary" onclick="exportData()">Download my pending edits</button><button class="btn" onclick="acceptCloudVersion()">Load newer cloud version</button></div>';
}
syncCloud=function(onlyDraft=false){
  editRevision++;
  if(!cloudReady||!cloudUser)return;
  if(tab==='workout'&&state.drafts?.[draftKey()])localStorage.setItem('liftlog_resume_'+cloudUser.id,draftKey());
  if(!persistPending(onlyDraft))return;clearTimeout(syncTimer);
  badge().textContent=syncConflict?'Sync paused · review changes':!navigator.onLine?'Offline · saved on device':'Unsaved changes…';
  if(navigator.onLine&&!syncConflict)syncTimer=setTimeout(flushSync,500);
};
async function flushSync(){
  if(!cloudReady||!cloudUser||offlineIdentity||syncConflict||!navigator.onLine)return;
  if(syncBusy){syncAgain=true;return;}
  syncBusy=true;const userId=cloudUser.id,payload=structuredClone(state),expected=structuredClone(syncBase);
  try{
    const {data,error}=await cloudClient.rpc('liftlog_save',{expected_payload:expected,next_payload:payload});
    if(error)throw error;
    if(cloudUser?.id!==userId)return;
    if(!data?.saved){syncConflict=true;badge().textContent='Sync paused · review changes';persistPending();paintSyncPanel();return;}
    syncBase=payload;
    const pending=JSON.stringify(state)!==JSON.stringify(payload);
    deviceWrite(userId,pending);
    badge().textContent=pending?'Unsaved changes…':'✓ Synced to cloud';
    syncAgain=pending;
  }catch{if(cloudUser?.id===userId){persistPending();badge().textContent='Saved on device · retry sync';clearTimeout(syncTimer);syncTimer=setTimeout(flushSync,15000);}}
  finally{syncBusy=false;if(syncAgain){syncAgain=false;syncCloud();}}
}
loadCloud=async function(user){
  const loadId=++loadSequence;
  const cloudReadyOnEntry=cloudReady&&cloudUser?.id===user.id;
  cloudReady=false;clearTimeout(syncTimer);syncConflict=false;syncOwner=user.id;
  const cached=await deviceRead(user.id);
  if(loadId!==loadSequence||syncOwner!==user.id)return;
  cloudUser=user;
  function display(payload){
    state={...structuredClone(defaults),...structuredClone(payload||{})};
    if(!Array.isArray(state.plan)||!state.plan.length)state.plan=structuredClone(ORIGINAL_PLAN);
    PLAN.splice(0,PLAN.length,...structuredClone(state.plan));
    state.day=Math.min(Math.max(0,state.day||0),PLAN.length-1);
    cloudReady=true;$('authGate').classList.add('hidden');$('signOutBtn').style.display='inline-flex';
    const resume=localStorage.getItem('liftlog_resume_'+user.id);
    if(resume && state.drafts?.[resume] && !cloudReadyOnEntry){const [date,day]=resume.split('|');if(PLAN[Number(day)] && validSessionDate(date)){currentDate=date;state.day=Number(day);switchTab('workout');}}
    render();paintSyncPanel();
  }
  const revision=editRevision;
  if(cached){
    syncBase=cached.base;
    // Establish the baseline before accepting incremental draft writes, including migrated accounts.
    state=cached.state;localStorage.setItem('liftlog_device_owner',user.id);
    deviceWrite(user.id,Boolean(cached.pending));
    display(cached.state);
    badge().textContent=navigator.onLine?'Saved on device':'Offline · saved on device';
    if(offlineIdentity || !navigator.onLine)return;
    if(cached.pending){syncCloud();return;}
  }
  if(offlineIdentity)return;
  try{
    const {data,error}=await cloudClient.from('user_data').select('payload').eq('user_id',user.id).maybeSingle();
    if(error)throw error;
    if(loadId!==loadSequence||syncOwner!==user.id||editRevision!==revision)return;
    const remote=data?.payload??null;
    let legacy=null;
    if(!cached && localStorage.getItem('liftlog_offline_pending_'+user.id)==='1'){
      legacy=JSON.parse(localStorage.getItem('liftlog_offline_'+user.id)||'null');
    }
    syncBase=structuredClone(remote);
    syncConflict=Boolean(legacy);
    if(!cached || JSON.stringify(remote)!==JSON.stringify(cached.base))display(legacy||remote);
    deviceWrite(user.id,Boolean(legacy)||editRevision!==revision);
    localStorage.setItem('liftlog_device_owner',user.id);
    badge().textContent=legacy?'Sync paused · review changes':'✓ Synced to cloud';
  }catch{
    if(loadId!==loadSequence||syncOwner!==user.id)return;
    if(cached)badge().textContent='Saved on device · connection unavailable';
    else $('authMessage').textContent='Connect once to load this account on this device.';
  }
};
async function acceptCloudVersion(){
  if(!cloudUser||!confirm('Keep a recovery copy of your pending edits on this device and load the cloud version?'))return;
  try{
    const {data,error}=await cloudClient.from('user_data').select('payload').eq('user_id',cloudUser.id).maybeSingle();if(error||!data?.payload)throw Error();
    localStorage.setItem('liftlog_recovery_'+cloudUser.id,JSON.stringify({app:'LiftLog',version:1,state}));
    syncBase=structuredClone(data.payload);state={...structuredClone(defaults),...structuredClone(syncBase)};
    PLAN.splice(0,PLAN.length,...structuredClone(state.plan||ORIGINAL_PLAN));state.day=Math.min(state.day||0,PLAN.length-1);
    syncConflict=false;deviceWrite(cloudUser.id,false);
    localStorage.removeItem('liftlog_offline_pending_'+cloudUser.id);render();paintSyncPanel();badge().textContent='✓ Synced to cloud';
  }catch{badge().textContent='Could not load cloud version · pending edits kept';}
}
function downloadRecovery(){const raw=cloudUser&&localStorage.getItem('liftlog_recovery_'+cloudUser.id);if(!raw)return alert('No recovery backup on this device.');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([raw],{type:'application/json'}));a.download='liftlog-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
const profileBeforeSync=profile;profile=function(){profileBeforeSync();$('profile').insertAdjacentHTML('beforeend','<div class="card"><h3>Sync recovery</h3><button class="btn secondary" onclick="flushSync()">Retry sync</button> <button class="btn secondary" onclick="downloadRecovery()">Download recovery backup</button> <button class="btn secondary" onclick="exportTabRecovery()">Export other-tab recovery</button></div>');};
const signOutBeforeSync=signOut;signOut=async function(){if(syncStorageFailed||(cloudUser&&(await deviceRead(cloudUser.id))?.pending)){alert('Your pending edits are still on this device. Reconnect and sync or resolve the conflict before signing out.');return;}await signOutBeforeSync();localStorage.removeItem('liftlog_device_owner');syncOwner=null;syncBase=null;syncConflict=false;$('syncRecovery')?.classList.add('hidden');};
window.addEventListener('online',()=>{if(offlineIdentity){initCloud();}else if(cloudReady)flushSync();});
window.addEventListener('offline',()=>{if(cloudReady){badge().textContent='Offline · saved on device';}});
