/* A draft update and its pending flag commit in the same IndexedDB transaction. */
const localDB = new Promise(resolve => {
  try {
    const request = indexedDB.open('liftlog-device',1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('accounts');
      request.result.createObjectStore('edits');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => resolve(null);
  } catch { resolve(null); }
});
const writerId=crypto.randomUUID();
const draftJournal = id => 'liftlog_active_draft_'+id;
let diskWrites = Promise.resolve();
function deviceTransaction(db,mode,body){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['accounts','edits'],mode);
    tx.oncomplete=()=>resolve();
    tx.onerror=tx.onabort=()=>reject(tx.error || Error('Device storage unavailable'));
    body(tx.objectStore('accounts'),tx.objectStore('edits'));
  });
}
async function deviceRead(id){
  await diskWrites;
  const db=await localDB;
  let record, patch;
  if(db)await deviceTransaction(db,'readonly',(accounts,edits)=>{
    accounts.get(id).onsuccess=e=>{record=e.target.result};
    edits.get(id).onsuccess=e=>{patch=e.target.result};
  }).catch(()=>{});
  const legacy=readSyncCache(id);
  if(legacy && (!record || (legacy.stamp||0)>(record.stamp||0))){record=legacy;patch=null;}
  if(!record)return null;
  deviceStamp=Math.max(deviceStamp,record.stamp||0,patch?.stamp||0);
  let journal;
  try{journal=JSON.parse(localStorage.getItem(draftJournal(id)))}catch{}
  for(const edit of [patch,journal]){
    if(edit && edit.stamp>= (record.stamp||0)){
      record.state.drafts??={};
      record.state.drafts[edit.key]=edit.value;
      record.pending=true;
    }
  }
  return record;
}
let deviceStamp=Date.now();
function deviceWrite(id,pending,onlyDraft=false){
  const stamp=deviceStamp=Math.max(Date.now(),deviceStamp+1);
  const patch=onlyDraft?{stamp,writer:writerId,key:draftKey(),value:structuredClone(draft())}:null;
  const record=patch?null:{stamp,writer:writerId,base:syncBase,state:structuredClone(state),pending};
  const key=draftJournal(id);
  if(patch){try{localStorage.setItem(key,JSON.stringify(patch));}catch{}}
  diskWrites=diskWrites.then(async()=>{
    const db=await localDB;
    try{
      if(!db)throw Error('IndexedDB unavailable');
      await deviceTransaction(db,'readwrite',(accounts,edits)=>{
        const prior=accounts.get(id),editing=edits.get(id);
        editing.onsuccess=()=>{
          const other=prior.result,oldPatch=editing.result;
          const owner=oldPatch?.writer || other?.writer;
          if(other && owner && owner!==writerId && (oldPatch || other.pending)){
            if(oldPatch){other.state.drafts??={};other.state.drafts[oldPatch.key]=oldPatch.value;}
            accounts.put(other,'recovery:'+id+':'+owner);
          }
          if(patch && other && owner && owner!==writerId && cloudUser?.id===id){
            accounts.put({stamp,writer:writerId,base:syncBase,state,pending:true},id);edits.delete(id);
          }else if(patch)edits.put(patch,id);
          else{accounts.put(record,id);edits.delete(id);}
        };
      });
      if(!patch)localStorage.removeItem(syncKey(id));
    }catch{
      const fallback=patch?readSyncCache(id):record;
      if(!fallback || (patch&&!fallback.state))throw Error('Storage full');
      if(patch){fallback.state.drafts[patch.key]=patch.value;fallback.pending=true;fallback.stamp=stamp;}
      localStorage.setItem(syncKey(id),JSON.stringify(fallback));
    }
    if(cloudUser?.id===id)syncStorageFailed=false;
    const journal=JSON.parse(localStorage.getItem(key)||'null');
    if(journal && journal.stamp<=stamp)localStorage.removeItem(key);
  }).catch(()=>{
    if(cloudUser?.id===id){syncStorageFailed=true;badge().textContent='Device save failed · export a backup';}
  });
  return diskWrites;
}

async function exportTabRecovery(){
  if(!cloudUser)return;
  await diskWrites;
  const db=await localDB;if(!db)return alert('IndexedDB is unavailable.');
  const entries=[], prefix='recovery:'+cloudUser.id+':';
  await deviceTransaction(db,'readonly',accounts=>{
    const cursor=accounts.openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
    cursor.onsuccess=()=>{
      const row=cursor.result;if(!row)return;
      entries.push(row.value);row.continue();
    };
  });
  if(!entries.length)return alert('No other-tab recovery copies on this device.');
  const link=document.createElement('a');
  link.href=URL.createObjectURL(new Blob([JSON.stringify(entries)],{type:'application/json'}));
  link.download='liftlog-tab-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
