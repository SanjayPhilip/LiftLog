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
    const rows=plan.items.flatMap(([n],i)=>n===name?(s.sets?.[i]||[]):[]).filter(validTrainingSet);
    return rows.length?[{session:s,rows}]:[];
  }).sort((a,b)=>a.session.date.localeCompare(b.session.date)||a.session.day-b.session.day);
}
function lastExercise(name) { return exerciseHistory(name,currentDate).at(-1); }
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
  d.sets[i]=Array.from({length:count},(_,j)=>{
    const r=last.rows[j];return r?{weight:String(r.weight),reps:String(r.reps)}:{weight:'',reps:''};
  });
  return true;
}
function copyPrevious(i) {
  if(draft().sets[i]?.some(r=>r.weight!==''||r.reps!=='')&&!confirm('Replace entered values for this exercise with the last workout?'))return;
  if(prefillExercise(i,true)){save();render();}
}
previous=function(i,j){
  const last=lastExercise(PLAN[state.day]?.items[i]?.[0]),row=last?.rows[j];
  return row?`${esc(row.weight)}×${esc(row.reps)}`:'—';
};
const workoutWithTimer=workout;
workout=function(){
  let changed=false;
  PLAN[state.day].items.forEach((_,i)=>{changed=prefillExercise(i)||changed;});
  if(changed)save();
  workoutWithTimer();
  document.querySelectorAll('#workout .exercise').forEach((el,i)=>{
    const [name,count,range]=PLAN[state.day].items[i],last=lastExercise(name);
    const hint=document.createElement('div');hint.className='hint';
    const target=targetAdvice(name,draft().ranges[i]??range,count);
    const override=draft().targets?.[i]??'';
    const repUnit=/sec/i.test(range)?' sec':' reps';
    hint.innerHTML=`<label for="workoutTarget${i}"><strong>Today’s target</strong></label>
      <p id="workoutTargetAdvice${i}">${esc(target)}</p>
      <input type="text" id="workoutTarget${i}" aria-label="Custom target for ${esc(name)}" aria-describedby="workoutTargetAdvice${i}" maxlength="180" value="${esc(override)}" placeholder="Set a custom target" oninput="setWorkoutTarget(${i},this.value)">
      ${last?`<p class="muted">Last workout · ${esc(last.session.date)} · ${last.rows.map(r=>`${esc(r.weight)} kg × ${esc(r.reps)}${repUnit}`).join(' / ')}</p><button class="btn secondary small" onclick="copyPrevious(${i})">Copy last workout</button><p class="notice">Previous values are prefilled for convenience. Adjust them to what you complete before saving.</p>`:''}`;
    el.querySelector('.exercise-head').after(hint);
  });
};

let historyFilters={day:'',exercise:'',from:'',to:''};
function historyHTML() {
  const days=[...new Set(state.sessions.map(s=>sessionPlan(s).name))].sort();
  return `<div class="card" id="trainingHistory"><h3>Workout history</h3><p class="muted">Find a session and expand it to see every set and your notes.</p><div class="training-filters"><label>Workout<select id="historyDay" onchange="setHistoryFilter('day',this.value)"><option value="">All workouts</option>${days.map(n=>`<option value="${esc(n)}" ${historyFilters.day===n?'selected':''}>${esc(n)}</option>`).join('')}</select></label><label>Exercise<input id="historyExercise" type="search" placeholder="Search exercise" value="${esc(historyFilters.exercise)}" oninput="setHistoryFilter('exercise',this.value)"></label><label>From<input id="historyFrom" type="date" value="${esc(historyFilters.from)}" onchange="setHistoryFilter('from',this.value)"></label><label>To<input id="historyTo" type="date" value="${esc(historyFilters.to)}" onchange="setHistoryFilter('to',this.value)"></label></div><div id="historyResults" aria-live="polite"></div></div>`;
}
function setHistoryFilter(key,value){historyFilters[key]=value;renderHistoryResults();}
function renderHistoryResults(){
  const el=$('historyResults');if(!el)return;
  if(historyFilters.from&&historyFilters.to&&historyFilters.from>historyFilters.to){el.innerHTML='<p role="alert">Choose a From date on or before the To date.</p>';return;}
  const sessions=[...state.sessions].filter(s=>{
    const p=sessionPlan(s);
    return (!historyFilters.day||p.name===historyFilters.day)&&(!historyFilters.from||s.date>=historyFilters.from)&&(!historyFilters.to||s.date<=historyFilters.to)&&(!historyFilters.exercise||p.items.some(([n],i)=>n.toLowerCase().includes(historyFilters.exercise.toLowerCase())&&(s.sets?.[i]||[]).some(validTrainingSet)));
  }).sort((a,b)=>b.date.localeCompare(a.date)||b.day-a.day);
  el.innerHTML=`<p class="muted">${sessions.length} session${sessions.length===1?'':'s'}</p>`+(sessions.length?sessions.map(s=>{
    const p=sessionPlan(s),sets=Object.values(s.sets||{}).flat().filter(validTrainingSet),volume=sets.reduce((sum,r)=>sum+Number(r.weight)*Number(r.reps),0);
    return `<details class="history-session"><summary><strong>${esc(s.date)} · ${esc(p.name)}</strong><span class="muted">${sets.length} logged sets · ${round(volume).toLocaleString()} kg volume</span></summary>${p.items.map(([name,,range],i)=>{
      const rows=(s.sets?.[i]||[]).filter(validTrainingSet);
      return `<div class="exercise"><h3>${esc(name)}</h3>${rows.length?`<ol>${rows.map(r=>`<li>${esc(r.weight)} kg × ${esc(r.reps)} ${/sec/i.test(range)?'sec':'reps'}</li>`).join('')}</ol>`:'<p class="muted">No sets recorded.</p>'}</div>`;
    }).join('')}<div class="session-actions"><button type="button" class="btn secondary small" data-session-action="repeat" data-session-id="${esc(s.id)}">Repeat this workout</button><button type="button" class="btn secondary small" data-session-action="edit" data-session-id="${esc(s.id)}">Edit saved workout</button></div>${s.notes?`<h3>Session notes</h3><p class="session-notes">${esc(s.notes)}</p>`:''}</details>`;
  }).join(''):'<p class="empty">'+(state.sessions.length?'No sessions match these filters.':'No workouts yet. Save your first workout to start your history.')+'</p>');
}
let performanceExercise='',performanceMetric='weight';
function performanceHTML(){
  const names=[...new Set([...PLAN.flatMap(d=>d.items.map(([n])=>n)),...state.sessions.flatMap(s=>sessionPlan(s).items.map(([n])=>n))])].sort();
  if(!names.includes(performanceExercise))performanceExercise=names.find(n=>exerciseHistory(n).length)||names[0]||'';
  return `<div class="card" id="performance"><h3>Personal records & progress</h3><p class="muted">Compare each session for an exercise. Only complete, valid sets contribute to records.</p><label for="performanceExercise">Exercise</label><select id="performanceExercise" onchange="performanceExercise=this.value;renderPerformance()">${names.map(n=>`<option value="${esc(n)}" ${n===performanceExercise?'selected':''}>${esc(n)}</option>`).join('')}</select><div id="performanceResults" aria-live="polite"></div></div>`;
}
function performanceSeries(name){
  return exerciseHistory(name).map(({session,rows})=>{
    const ranges=sessionPlan(session).items.filter(([n])=>n===name).map(x=>x[2]);
    const timed=ranges.some(r=>/sec/i.test(r));
    return {date:session.date,day:session.day,weight:Math.max(...rows.map(r=>Number(r.weight))),reps:Math.max(...rows.map(r=>Number(r.reps))),volume:timed?null:rows.reduce((v,r)=>v+Number(r.weight)*Number(r.reps),0),e1rm:timed?null:Math.max(0,...rows.filter(r=>Number(r.weight)>0&&Number(r.reps)<=12).map(r=>Number(r.weight)*(1+Number(r.reps)/30))),timed};
  });
}
function progressChart(points,metric,label,unit){
  const values=points.map(p=>p[metric]),max=Math.max(...values),top=max>0?max*1.15:1;
  const xy=points.map((p,i)=>({x:58+i*540/Math.max(1,points.length-1),y:158-p[metric]/top*130}));
  return `<svg class="training-chart" role="img" aria-label="${esc(label)} by session. Values are listed in the table below." viewBox="0 0 640 200"><title>${esc(label)} (${esc(unit)})</title>${[0,.5,1].map(t=>`<line x1="58" x2="610" y1="${158-t*130}" y2="${158-t*130}" stroke="currentColor" opacity=".15"/><text x="50" y="${162-t*130}" text-anchor="end" fill="currentColor" font-size="11">${round(top*t)}</text>`).join('')}<polyline points="${xy.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="3"/>${xy.map((p,i)=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--accent)"><title>${esc(points[i].date)} · ${round(values[i])} ${esc(unit)}</title></circle>`).join('')}<text x="58" y="185" fill="currentColor" font-size="11">${esc(points[0].date)}</text><text x="610" y="185" text-anchor="end" fill="currentColor" font-size="11">${esc(points.at(-1).date)}</text></svg>`;
}
function renderPerformance(){
  const el=$('performanceResults');if(!el)return;
  const series=performanceSeries(performanceExercise);
  if(!series.length){el.innerHTML='<p class="empty">No logged sets for this exercise yet. Records and charts appear after your first saved workout.</p>';return;}
  const timed=series.some(p=>p.timed),weighted=series.some(p=>p.weight>0),metrics=timed?[['reps','Longest hold','sec']]:[['weight','Heaviest set','kg'],['reps','Most reps in a set','reps'],['volume','Session volume','kg'],...(series.some(p=>p.e1rm>0)?[['e1rm','Estimated 1RM','kg']]:[])];
  if(!metrics.some(([key])=>key===performanceMetric))performanceMetric=timed?'reps':weighted?'weight':'reps';
  const records=metrics.map(([key,label,unit])=>{
    const best=series.reduce((a,b)=>(b[key]??0)>(a[key]??0)?b:a);
    return `<div class="metric"><span class="muted">${esc(label)}</span><strong>${round(best[key]||0)} ${unit}</strong><small>${esc(best.date)}</small></div>`;
  }).join('');
  const [key,label,unit]=metrics.find(([key])=>key===performanceMetric);
  const points=series.filter(p=>Number.isFinite(p[key])&&(key!=='e1rm'||p.e1rm>0)).slice(-24);
  el.innerHTML=`<div class="grid training-records">${records}</div><label for="performanceMetric">Chart metric</label><select id="performanceMetric" onchange="performanceMetric=this.value;renderPerformance()">${metrics.map(([k,l])=>`<option value="${k}" ${k===key?'selected':''}>${esc(l)}</option>`).join('')}</select>${points.length?progressChart(points,key,label,unit):'<p>No values for this metric.</p>'}<p class="notice">${timed?'Timed holds are measured in seconds and excluded from load volume and estimated 1RM.':'Volume is external weight × reps. Estimated 1RM uses Epley on weighted sets of 1–12 reps; it is an estimate, not a tested maximum.'} Showing up to 24 sessions, oldest to newest.</p><details><summary>View chart data</summary><div class="training-table"><table><caption>${esc(performanceExercise)} · ${esc(label)}</caption><thead><tr><th scope="col">Date</th><th scope="col">Workout day</th><th scope="col">${esc(label)} (${unit})</th></tr></thead><tbody>${points.map(p=>`<tr><td>${esc(p.date)}</td><td>${p.day+1}</td><td>${round(p[key])}</td></tr>`).join('')}</tbody></table></div></details>`;
}

const finishTrainingWorkout=finishWorkout;
finishWorkout=function(){
  const rows=Object.values(draft().sets).flat().filter(r=>r.weight!==''||r.reps!=='');
  if(rows.some(r=>!validTrainingSet(r)||!Number.isInteger(Number(r.reps)))){
    alert('Complete each entered set with a non-negative weight and a positive whole number of reps or seconds, or remove the set.');return;
  }
  if(state.sessions.some(s=>s.id===currentDate+'|'+state.day)&&!confirm('Replace the saved workout for this date and training day?'))return;
  finishTrainingWorkout();
};
