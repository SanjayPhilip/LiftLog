/* Session reuse, corrections and summaries use the existing account payload. */
const localDateKey=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function shiftDate(key,days){const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+days);return localDateKey(d);}
function weekStart(key){const d=new Date(key+'T12:00:00');return shiftDate(key,-((d.getDay()+6)%7));}
function validSessionDate(key){return /^\d{4}-\d{2}-\d{2}$/.test(key)&&localDateKey(new Date(key+'T12:00:00'))===key&&key<=localDateKey();}
function sessionStats(session){
  const result=new Map();
  sessionPlan(session).items.forEach(([name,,range],i)=>{
    const rows=(session.sets?.[i]||[]).filter(row=>row.type!=='warmup'&&validTrainingSet(row)),timed=/sec/i.test(range);
    if(!rows.length)return;
    const key=JSON.stringify([name,timed]),stat=result.get(key)||{name,timed,sets:0,weight:0,reps:0,volume:0,e1rm:0};
    rows.forEach(r=>{
      const weight=Number(r.weight),reps=Number(r.reps);
      stat.sets++;stat.weight=Math.max(stat.weight,weight);stat.reps=Math.max(stat.reps,reps);
      if(!timed){stat.volume+=weight*reps;if(weight>0&&reps<=12)stat.e1rm=Math.max(stat.e1rm,weight*(1+reps/30));}
    });result.set(key,stat);
  });return result;
}
function recordsForSession(entry,sessions=state.sessions){
  const position=sessions.findIndex(s=>s.id===entry.id),earlier=sessions.filter((s,i)=>s.id!==entry.id&&(s.date<entry.date||(s.date===entry.date&&(position<0||i<position))));
  const previous=new Map();earlier.forEach(s=>sessionStats(s).forEach((stat,key)=>{
    const p=previous.get(key)||{weight:0,reps:0,volume:0,e1rm:0};
    for(const metric of ['weight','reps','volume','e1rm'])p[metric]=Math.max(p[metric],stat[metric]);previous.set(key,p);
  }));
  const records=[];
  sessionStats(entry).forEach((now,key)=>{
    const before=previous.get(key);if(!before)return; // The first log establishes a baseline.
    const metrics=now.timed?[['reps','Longest hold','sec']]:[['weight','Heaviest set','kg'],['reps','Most reps in a set','reps'],['volume','Session volume','kg'],['e1rm','Estimated 1RM','kg']];
    metrics.forEach(([metric,label,unit])=>{if(now[metric]>before[metric]+1e-7)records.push({name:now.name,metric,label,unit,value:now[metric],previous:before[metric]});});
  });return records;
}
let sessionNotice=null,studioEdit=null,studioOwner=null,summaryWeek=weekStart(localDateKey());
function sessionNoticeHTML(){
  if(!sessionNotice)return '';
  return `<div class="card session-celebration" role="status"><div class="row wrap"><h3>${sessionNotice.records.length?'★ Personal record':'✓ Workout saved'}</h3><button type="button" class="btn secondary small" onclick="sessionNotice=null;render()">Dismiss</button></div><p>${esc(sessionNotice.message)} · ${esc(sessionNotice.date)}</p>${sessionNotice.records.length?`<p>${sessionNotice.records.length} record${sessionNotice.records.length===1?'':'s'} improved compared with earlier sessions.</p><ul>${sessionNotice.records.map(r=>`<li><strong>${esc(r.name)}</strong> · ${esc(r.label)}: ${round(r.value)} ${r.unit} <span class="muted">(previous ${round(r.previous)} ${r.unit})</span></li>`).join('')}</ul>`:''}</div>`;
}
function commitTrainingSession(entry,replaceId=null){
  state.sessions=replaceId?state.sessions.map(s=>s.id===replaceId?entry:s):[...state.sessions,entry];
  state.sessions.sort((a,b)=>a.date.localeCompare(b.date));
  sessionNotice={message:replaceId?'Workout updated':'Workout saved',date:entry.date,records:recordsForSession(entry)};
}
function validateSessionSets(sets){
  const entered=Object.values(sets||{}).flat().filter(r=>String(r.weight??'').trim()!==''||String(r.reps??'').trim()!=='');
  if(entered.some(r=>!validTrainingSet(r)||!Number.isInteger(Number(r.reps))))return 'Complete each entered set with a non-negative weight and positive whole-number reps or seconds, or clear/remove the set.';
  if(!entered.length)return 'Record at least one complete set before saving.';
  return '';
}
// New sessions have stable unique IDs, allowing multiple workouts on one day.
finishWorkout=function(){
  const d=draft(),sets=completedWorkoutSets(d.sets),error=validateSessionSets(sets);
  if(error)return alert(error);
  if(!validSessionDate(currentDate))return alert('Choose a valid workout date on or before today.');
  const entry={...structuredClone(d),sets,id:crypto.randomUUID(),date:currentDate,day:state.day,planSnapshot:structuredClone(PLAN[state.day]),createdAt:new Date().toISOString()};
  commitTrainingSession(entry);delete state.drafts[draftKey()];state.day=(state.day+1)%PLAN.length;save();switchTab('progressPage');
};
function startRepeatSession(id){
  const source=state.sessions.find(s=>s.id===id);if(!source)return;
  if(studioEdit&&!confirm('Discard the unsaved edits before repeating another workout?'))return;
  if(state.repeatedWorkout&&!confirm('Replace your unfinished repeated workout? Your regular workout drafts will stay saved.'))return;
  const plan=structuredClone(sessionPlan(source));
  if(!plan.items.length)return alert('This session has no exercise snapshot to repeat.');
  const sets={};plan.items.forEach(([,count],i)=>{
    const rows=(source.sets?.[i]||[]).filter(validTrainingSet);
    sets[i]=rows.length?rows.map(r=>({weight:String(r.weight),reps:String(r.reps),...(r.type==='warmup'?{type:r.type}:{})})):Array.from({length:Math.max(1,count)},()=>({weight:'',reps:''}));
  });
  studioEdit=null;state.repeatedWorkout={date:localDateKey(),day:source.day,planSnapshot:plan,sets,notes:'',sourceId:source.id,sourceDate:source.date};
  save();switchTab('sessionStudio');
}
function startEditSession(id){
  const source=state.sessions.find(s=>s.id===id);if(!source)return;
  if(studioEdit&&!confirm('Discard the unsaved changes to the workout you are editing?'))return;
  studioEdit={original:structuredClone(source),draft:{...structuredClone(source),planSnapshot:structuredClone(sessionPlan(source))}};
  switchTab('sessionStudio');
}
function studioDraft(){return studioEdit?.draft||state.repeatedWorkout;}
function updateStudio(field,value,i,j){
  const d=studioDraft();if(!d)return;
  if(field==='weight'||field==='reps'||field==='type')d.sets[i][j][field]=value;else d[field]=value;
  if(!studioEdit)save();
}
function studioSetCount(i,removeIndex=null){
  const d=studioDraft();if(!d)return;
  d.sets??={};d.sets[i]??=[];
  if(removeIndex===null)d.sets[i].push({weight:'',reps:''});else d.sets[i].splice(removeIndex,1);
  if(!studioEdit)save();renderSessionStudio();
}
function cancelSessionStudio(){
  if(studioEdit){if(!confirm('Discard unsaved edits to this workout?'))return;studioEdit=null;}
  // A repeated draft stays available until it is saved or explicitly discarded.
  switchTab('progressPage');
}
function discardRepeatSession(){
  if(!confirm('Discard this repeated workout draft? Saved workouts and regular drafts will stay saved.'))return;
  delete state.repeatedWorkout;save();switchTab('progressPage');
}
function saveSessionStudio(){
  const d=studioDraft();if(!d)return;
  const error=validateSessionSets(d.sets);if(error)return alert(error);
  if(!validSessionDate(d.date))return alert('Choose a valid workout date on or before today.');
  if(studioEdit){
    const index=state.sessions.findIndex(s=>s.id===studioEdit.original.id);
    if(index<0)return alert('This workout is no longer in your history. Close the editor and reload.');
    if(JSON.stringify(state.sessions[index])!==JSON.stringify(studioEdit.original))return alert('This workout changed while you were editing. Close the editor and reopen it to avoid losing newer changes.');
    const entry={...structuredClone(d),updatedAt:new Date().toISOString()};
    commitTrainingSession(entry,studioEdit.original.id);studioEdit=null;
  }else{
    const entry={id:crypto.randomUUID(),date:d.date,day:d.day,planSnapshot:structuredClone(d.planSnapshot),sets:structuredClone(d.sets),notes:d.notes,done:{},ranges:{},repeatedFrom:d.sourceId,createdAt:new Date().toISOString()};
    commitTrainingSession(entry);delete state.repeatedWorkout;
  }
  save();switchTab('progressPage');
}
function renderSessionStudio(){
  const el=$('sessionStudio'),d=studioDraft();if(!el)return;
  updateStudioNav();
  if(!d){el.innerHTML='<div class="card"><h2>No session draft</h2><p>Open a saved workout in Progress to repeat it or make a correction.</p><button class="btn" onclick="switchTab(\'progressPage\')">Open history</button></div>';return;}
  const editing=!!studioEdit;
  el.innerHTML=`<div class="row wrap"><div><div class="eyebrow">${editing?'CORRECT YOUR LOG':'REPEAT A WORKOUT'}</div><h2>${esc(d.planSnapshot.name)}</h2></div><button class="btn secondary small" onclick="cancelSessionStudio()">${editing?'Cancel edits':'Back to history'}</button></div><div class="card"><p>${editing?'Changes are applied only when you save. Your exercise snapshot stays attached to this session.':`Copied from ${esc(d.sourceDate)}. Adjust the prefilled values to what you actually complete. Your routine and regular drafts stay saved.`}</p><label for="studioDate">Workout date</label><input id="studioDate" type="date" max="${localDateKey()}" value="${esc(d.date)}" onchange="updateStudio('date',this.value)">${d.planSnapshot.items.map(([name,,range],i)=>{
    const rows=d.sets?.[i]||[];
    return `<div class="exercise"><h3>${esc(name)}</h3><p class="muted"><strong>Weight guide:</strong> ${esc(weightGuidance(name,range))}</p><p class="muted">${esc(range)} ${/sec/i.test(range)?'':'reps'}</p><div class="studio-set-labels"><span>Set</span><span>${esc(weightConvention(name)[0])}</span><span>${/sec/i.test(range)?'Seconds':'Reps'}</span><span></span></div>${rows.map((r,j)=>`<div class="studio-set-row"><span>${j+1}</span><input type="number" min="0" step="any" inputmode="decimal" aria-label="${esc(name)} set ${j+1} weight" value="${esc(r.weight)}" oninput="updateStudio('weight',this.value,${i},${j})"><input type="number" min="1" step="1" inputmode="numeric" aria-label="${esc(name)} set ${j+1} ${/sec/i.test(range)?'seconds':'reps'}" value="${esc(r.reps)}" oninput="updateStudio('reps',this.value,${i},${j})"><button type="button" class="btn secondary small" aria-label="Remove ${esc(name)} set ${j+1}" onclick="studioSetCount(${i},${j})">−</button><label class="studio-set-type">Set type <select aria-label="Set ${j+1} type for ${esc(name)}" onchange="updateStudio('type',this.value,${i},${j})"><option value="working">Working</option><option value="warmup" ${r.type==='warmup'?'selected':''}>Warm-up</option></select></label></div>`).join('')}<button type="button" class="btn secondary small" onclick="studioSetCount(${i})">Add set to ${esc(name)}</button></div>`;
  }).join('')}<label for="studioNotes">Session notes</label><textarea id="studioNotes" rows="3" oninput="updateStudio('notes',this.value)">${esc(d.notes||'')}</textarea><div class="session-actions"><button type="button" class="btn" onclick="saveSessionStudio()">${editing?'Save changes':'Save repeated workout'}</button>${!editing?'<button type="button" class="btn secondary" onclick="discardRepeatSession()">Discard draft</button>':''}</div></div>`;
}
function updateStudioNav(){
  let button=$('studioNav');if(!button){button=document.createElement('button');button.id='studioNav';button.dataset.tab='sessionStudio';button.textContent='Draft';button.onclick=()=>switchTab('sessionStudio');document.querySelector('.tabs').append(button);}
  button.classList.toggle('hidden',!studioDraft());button.classList.toggle('active',tab==='sessionStudio');
}
function pendingSessionHTML(){return studioDraft()?`<div class="card"><div class="row wrap"><div><h3>${studioEdit?'Unsaved workout edits':'Repeated workout in progress'}</h3><p class="muted">${esc(studioDraft().planSnapshot.name)} · ${esc(studioDraft().date)}</p></div><button class="btn secondary" onclick="switchTab('sessionStudio')">Continue ${studioEdit?'editing':'workout'}</button></div></div>`:'';}

function weeklySummary(start=summaryWeek,today=localDateKey()){
  const end=shiftDate(start,6),previousStart=shiftDate(start,-7),previousEnd=shiftDate(start,-1);
  const inRange=(from,to)=>state.sessions.filter(s=>s.date>=from&&s.date<=to&&s.date<=today);
  const current=inRange(start,end),previous=inRange(previousStart,previousEnd);
  const totals=sessions=>sessions.reduce((sum,s)=>{sessionStats(s).forEach(v=>{sum.sets+=v.sets;sum.volume+=v.volume;});sum.sessions++;return sum;},{sessions:0,sets:0,volume:0});
  const bests=sessions=>{const map=new Map();sessions.forEach(s=>sessionStats(s).forEach((stat,key)=>{
    const prior=map.get(key)||{...stat,weight:0,reps:0,e1rm:0};for(const k of ['weight','reps','e1rm'])prior[k]=Math.max(prior[k],stat[k]);map.set(key,prior);
  }));return map;};
  const now=bests(current),before=bests(previous),improved=[];
  now.forEach((stat,key)=>{
    const p=before.get(key);if(!p)return;
    const metric=stat.timed?'reps':stat.e1rm>0&&p.e1rm>0?'e1rm':stat.weight>0||p.weight>0?'weight':'reps';
    if(stat[metric]>p[metric]+1e-7)improved.push({name:stat.name,delta:stat[metric]-p[metric],value:stat[metric],previous:p[metric],unit:stat.timed?'sec':metric==='reps'?'reps':'kg',label:stat.timed?'longest hold':metric==='e1rm'?'estimated 1RM':metric==='weight'?'heaviest set':'most reps'});
  });
  return {start,end,current:totals(current),previous:totals(previous),improved,records:current.reduce((n,s)=>n+recordsForSession(s).length,0)};
}
function moveSummaryWeek(direction){const next=shiftDate(summaryWeek,direction*7);if(next<=weekStart(localDateKey()))summaryWeek=next;render();}
function weeklySummaryHTML(){
  const summary=weeklySummary(),change=(value,old,unit='')=>`${value-old>0?'+':''}${round(value-old).toLocaleString()}${unit?' '+unit:''} vs previous week`;
  return `<div class="card" id="weeklySummary"><div class="row wrap"><div><div class="eyebrow">YOUR WEEK IN TRAINING</div><h3>Weekly summary</h3><p class="muted">${esc(summary.start)} – ${esc(summary.end)} · Monday to Sunday</p></div><div class="session-actions"><button class="btn secondary small" aria-label="Previous summary week" onclick="moveSummaryWeek(-1)">←</button><button class="btn secondary small" aria-label="Next summary week" onclick="moveSummaryWeek(1)" ${summaryWeek>=weekStart(localDateKey())?'disabled':''}>→</button></div></div><div class="grid training-records"><div class="metric"><span>Sessions completed</span><strong>${summary.current.sessions}</strong><small>${change(summary.current.sessions,summary.previous.sessions)}</small></div><div class="metric"><span>Logged sets</span><strong>${summary.current.sets}</strong><small>${change(summary.current.sets,summary.previous.sets)}</small></div><div class="metric"><span>External load volume</span><strong>${round(summary.current.volume).toLocaleString()} kg</strong><small>${change(summary.current.volume,summary.previous.volume,'kg')}</small></div><div class="metric"><span>Personal records</span><strong>${summary.records}</strong><small>Improvements over earlier sessions</small></div></div>${!summary.current.sessions?'<p class="empty">No sessions saved for this week yet.</p>':''}<h3>Lifts that improved</h3>${summary.improved.length?`<ul>${summary.improved.map(r=>`<li><strong>${esc(r.name)}</strong> · +${round(r.delta)} ${r.unit} ${r.label} <span class="muted">(${round(r.previous)} → ${round(r.value)} ${r.unit})</span></li>`).join('')}</ul>`:'<p class="muted">No comparable improvements yet. Log the same exercise in consecutive weeks to compare.</p>'}<p class="notice">Current week includes logs through today; comparisons use the previous full week. Volume excludes timed holds. First logs establish a baseline; ties do not count as records.</p></div>`;
}
const renderBeforeSessions=render;
render=function(){
  const owner=cloudUser?.id||null;if(studioOwner!==owner){studioEdit=null;sessionNotice=null;studioOwner=owner;}
  if(!$('sessionStudio')){const section=document.createElement('section');section.id='sessionStudio';section.className='hidden';document.querySelector('main').append(section);}
  updateStudioNav();
  if(tab==='sessionStudio'){renderSessionStudio();return;}
  renderBeforeSessions();
  if(tab==='dashboard'){
    $('dashboard').insertAdjacentHTML('afterbegin',pendingSessionHTML()+weeklySummaryHTML());
    const weekMetric=$('dashboard').querySelector('.stat-card:last-child strong');
    if(weekMetric)weekMetric.innerHTML=weeklySummary(weekStart(localDateKey())).current.sessions+'<sub>sessions</sub>';
  }
  if(tab==='workout')$('workout').insertAdjacentHTML('afterbegin',pendingSessionHTML());
  if(tab==='progressPage')$('progressPage').insertAdjacentHTML('afterbegin',sessionNoticeHTML()+weeklySummaryHTML());
};
document.addEventListener('click',event=>{
  const button=event.target.closest('button[data-session-action]');if(!button)return;
  if(button.dataset.sessionAction==='repeat')startRepeatSession(button.dataset.sessionId);
  if(button.dataset.sessionAction==='edit')startEditSession(button.dataset.sessionId);
});
if(cloudReady)render();
