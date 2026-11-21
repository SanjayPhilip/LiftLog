/* Training features share the existing account payload; no schema migration. */
function sessionPlan(session) {
  return session.planSnapshot || PLAN[session.day] || {name:'Archived workout',items:[]};
}
function validTrainingSet(row) {
  return row && row.weight!=null && row.reps!=null && String(row.weight).trim()!=='' && String(row.reps).trim()!=='' &&
    Number.isFinite(Number(row.weight)) && Number(row.weight)>=0 &&
    Number.isFinite(Number(row.reps)) && Number(row.reps)>0;
}
function exerciseHistory(name, before='9999-12-31') {
  return state.sessions.filter(s=>s.date<before).flatMap(s=>{
    const plan=sessionPlan(s);
    const rows=plan.items.flatMap(([n],i)=>n===name?(s.sets?.[i]||[]):[]).filter(row=>row.type!=='warmup'&&validTrainingSet(row));
    return rows.length?[{session:s,rows}]:[];
  }).sort((a,b)=>a.session.date.localeCompare(b.session.date)||a.session.day-b.session.day);
}
let loggerHistory=null;
function lastExercise(name) {
  if(!loggerHistory)return exerciseHistory(name,currentDate).at(-1);
  if(!loggerHistory.has(name))loggerHistory.set(name,exerciseHistory(name,currentDate).at(-1));
  return loggerHistory.get(name);
}
function repBounds(range) {
  const match=String(range).match(/^\s*(\d+)(?:\s*[–—-]\s*(\d+))?(?:\s*(?:reps?|\/leg|sec(?:onds?)?))?\s*$/i);
  if(!match)return null;
  const low=Number(match[1]),high=Number(match[2]||match[1]);
  return low>0&&high>=low?{low,high,timed:/sec/i.test(range)}:null;
}
function targetAdvice(name,range,setCount) {
  const last=lastExercise(name),bounds=repBounds(range);
  if(!last)return 'First session: choose a manageable load and record your actual sets.';
  if(!bounds)return 'Repeat your previous performance with controlled technique; record what you actually complete.';
  const rows=last.rows.slice(0,setCount);
  const nextIndex=rows.findIndex(row=>Number(row.reps)<bounds.high);
  if(bounds.timed){
    if(nextIndex<0) return `Aim to complete all ${setCount} holds at ${bounds.high} seconds with good form.`;
    const seconds=Math.min(Math.floor(Number(rows[nextIndex].reps))+5,bounds.high);
    return `Try ${seconds} seconds on set ${nextIndex+1} with good form.`;
  }
  if(nextIndex<0){
    if(rows.length<setCount) return `Keep the same load and aim to complete all ${setCount} sets before increasing weight.`;
    return `All ${setCount} sets reached ${bounds.high} reps. Try the next available load and aim for ${bounds.low} reps per set.`;
  }
  const next=rows[nextIndex],reps=Math.min(Math.floor(Number(next.reps))+1,bounds.high);
  const unit=weightConvention(name)[0];
  const load=unit==='kg per dumbbell'?'kg per dumbbell':unit==='Added kg'?'kg added':'kg';
  return `At the same weight, try ${reps} reps on set ${nextIndex+1} at ${Number(next.weight)} ${load}. Keep the other sets steady.`;
}
function setWorkoutTarget(index,value){
  const d=draft();
  d.targets??={};
  if(value.trim()) d.targets[index]=value.trim();
  else delete d.targets[index];
  save();
}
function prefillExercise(i,overwrite=false) {
  const [name,count]=PLAN[state.day].items[i],last=lastExercise(name),d=draft();
  if(!last||(!overwrite&&Object.hasOwn(d.sets,i)))return false;
  const warmups=(d.sets[i]||[]).filter(row=>row.type==='warmup');
  d.sets[i]=warmups.concat(Array.from({length:count},(_,j)=>{
    const r=last.rows[j];return r?{weight:String(r.weight),reps:String(r.reps),prefilled:true}:{weight:'',reps:''};
  }));
  return true;
}
function copyPrevious(i) {
  if(draft().sets[i]?.some(r=>r.weight!==''||r.reps!=='')&&!confirm('Replace entered values for this exercise with the last workout?'))return;
  if(prefillExercise(i,true)){delete draft().lastLogged;draft().done[i]=false;save();render();}
}
function addWarmupSet(i){
  const d=draft(),count=PLAN[state.day].items[i][1];
  delete d.lastLogged;
  d.sets[i]??=Array.from({length:count},()=>({weight:'',reps:''}));
  const firstWorking=d.sets[i].findIndex(row=>row.type!=='warmup');
  const index=firstWorking<0?d.sets[i].length:firstWorking;
  d.sets[i].splice(index,0,{weight:'',reps:'',type:'warmup'});
  save();render();
  $('completeSet-'+i+'-'+index)?.closest('.setrow')?.querySelector('input')?.focus();
}
let setRest=null;
function toggleWorkoutSet(i,j){
  const d=draft(),row=d.sets[i]?.[j];
  if(!row)return;
  const undo=row.completed===true;
  if(!undo&&(!validTrainingSet(row)||!Number.isInteger(Number(row.reps)))){
    alert('Enter a weight and a positive whole number of reps or seconds.');
    return;
  }
  row.completed=!undo;
  const working=d.sets[i].filter(set=>set.type!=='warmup');
  d.done[i]=working.length>0&&working.every(set=>set.completed===true);
  if(undo && d.lastLogged?.i===i && d.lastLogged?.j===j)delete d.lastLogged;
  if(!undo)d.lastLogged={i,j};
  save(true);
  const action=$('completeSet-'+i+'-'+j);
  action.closest('.setrow').classList.toggle('set-completed',!undo);
  action.closest('.exercise').querySelector('input[type=checkbox]').checked=d.done[i];
  action.textContent=undo?'Done':'✓ Done · Undo';
  action.classList.toggle('secondary',!undo);
  action.setAttribute('aria-label',(undo?'Complete':'Undo')+' set '+(j+1)+' for '+PLAN[state.day].items[i][0]);
  const count=doneCount(d),pct=Math.round(100*count/Math.max(1,totalExercises()));
  const progress=document.querySelector('#workout .progress');
  progress.firstElementChild.style.width=pct+'%';
  progress.previousElementSibling.firstElementChild.textContent=count+'/'+totalExercises()+' exercises completed';
  progress.previousElementSibling.lastElementChild.textContent=pct+'%';
  $('quickUndo').disabled=!d.lastLogged;
  if(undo){
    $('setCompletionStatus').textContent='Set reopened for editing.';
    if(setRest?.row===row&&setRest.end===timerEnd)timerStop();
    $('completeSet-'+i+'-'+j)?.focus();
    return;
  }
  timerStart(90);
  setRest={row,end:timerEnd};
  const status=$('setCompletionStatus');
  if(status){
    status.textContent=`Set ${j+1} complete. 90-second rest started.`;
  }
  const buttons=[...document.querySelectorAll('#workout [id^="completeSet-"]')];
  const source=$('completeSet-'+i+'-'+j);
  const next=buttons.slice(buttons.indexOf(source)+1).find(button=>!button.closest('.set-completed'));
  (next||source)?.focus({preventScroll:true});
}
function completedWorkoutSets(sets){
  return Object.fromEntries(Object.entries(sets).map(([i,rows])=>[i,rows
    .filter(row=>row.completed===true||(row.completed!==false&&!row.prefilled&&(String(row.weight??'').trim()!==''||String(row.reps??'').trim()!=='')))
    .map(({weight,reps,type})=>type==='warmup'?{weight,reps,type}:{weight,reps})]));
}
previous=function(i,j){
  const last=lastExercise(PLAN[state.day]?.items[i]?.[0]),row=last?.rows[j];
  return row?`${esc(row.weight)}×${esc(row.reps)}`:'—';
};
const workoutWithTimer=workout;
workout=function(){
  loggerHistory=new Map();
  let changed=false;
  PLAN[state.day].items.forEach((_,i)=>{changed=prefillExercise(i)||changed;});
  if(changed)save();
  workoutWithTimer();
  $('restTime')?.closest('.card')?.insertAdjacentHTML('beforeend','<span id="setCompletionStatus" class="muted" role="status"></span>');
  document.querySelectorAll('#workout .exercise').forEach((el,i)=>{
    const [name,count,range]=PLAN[state.day].items[i],last=lastExercise(name);
    const hint=document.createElement('div');hint.className='hint';
    const target=targetAdvice(name,draft().ranges[i]??range,count);
    const override=draft().targets?.[i]??'';
    const repUnit=/sec/i.test(range)?' sec':' reps';
    hint.innerHTML=`<label for="workoutTarget${i}"><strong>Today’s target</strong></label>
      <p id="workoutTargetAdvice${i}">${esc(target)}</p>
      <input type="text" id="workoutTarget${i}" aria-label="Custom target for ${esc(name)}" aria-describedby="workoutTargetAdvice${i}" maxlength="180" value="${esc(override)}" placeholder="Set a custom target" oninput="setWorkoutTarget(${i},this.value)">
      ${last?`<p class="muted">Last workout · ${esc(last.session.date)} · ${last.rows.map(r=>`${esc(r.weight)} kg × ${esc(r.reps)}${repUnit}`).join(' / ')}</p><button class="btn secondary small" onclick="copyPrevious(${i})">Copy last workout</button><p class="notice">Adjust the prefilled values if needed, then tap Done to log the set.</p>`:''}`;
    el.querySelector('.exercise-head').after(hint);
  });
  loggerHistory=null;
};

const finishTrainingWorkout=finishWorkout;
finishWorkout=function(){
  const rows=Object.values(draft().sets).flat().filter(r=>r.weight!==''||r.reps!=='');
  if(rows.some(r=>!validTrainingSet(r)||!Number.isInteger(Number(r.reps)))){
    alert('Complete each entered set with a non-negative weight and a positive whole number of reps or seconds, or remove the set.');return;
  }
  if(state.sessions.some(s=>s.id===currentDate+'|'+state.day)&&!confirm('Replace the saved workout for this date and training day?'))return;
  finishTrainingWorkout();
};
