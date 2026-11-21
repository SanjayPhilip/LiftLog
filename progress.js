function renderProgressRoute(){let p=state.profile;let bmi=p.weight&&p.height?p.weight/(p.height/100)**2:0;let data=state.body.slice(-8);let max=Math.max(1,...data.map(x=>x.weight));$('progressPage').innerHTML=`<div class="row"><h2>Progress & history</h2><button class="btn secondary small" onclick="exportData()">Export backup</button></div><div class="card"><h3>Body metrics</h3><div class="grid" style="margin-top:12px"><div class="metric"><span class="muted">Weight</span><strong>${p.weight||'—'} kg</strong></div><div class="metric"><span class="muted">BMI</span><strong>${bmi?bmi.toFixed(1):'—'}</strong></div></div><p class="notice">BMI categories for adults: below 18.5 underweight; 18.5–24.9 standard range; 25–29.9 overweight; 30+ obesity. BMI may misclassify muscular individuals.</p><div class="row"><div class="field" style="flex:1"><label>New weigh-in (kg)</label><input id="weighIn" type="number" inputmode="decimal" min="1" step="0.1" placeholder="e.g. 82.0"></div><button class="btn" style="align-self:end" onclick="addWeighIn()">Add</button></div>${data.length?`<div class="chart" style="margin-bottom:25px">${data.map(x=>`<div class="bar" style="height:${Math.max(10,100*x.weight/max)}%" title="${esc(x.weight)} kg"><span>${dateLabel(x.date)}</span></div>`).join('')}</div><p class="notice">Recent weigh-ins (bar height relative to zero)</p>`:''}</div>${historyHTML()}${performanceHTML()}`;renderHistoryResults();renderPerformance()}

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
  el.onscroll=null;
  el.innerHTML='<p class="muted">'+sessions.length+' sessions</p>';
  if(!sessions.length){
    el.innerHTML+= '<p class="empty">'+(state.sessions.length?'No sessions match these filters.':'No workouts yet. Save your first workout to start your history.')+'</p>';
    return;
  }
  if(sessions.length<=24){el.insertAdjacentHTML('beforeend',sessions.map(historyCard).join(''));return;}
  const list=document.createElement('div'),space=document.createElement('div'),windowRows=document.createElement('div'),detail=document.createElement('div');
  list.className='history-window';list.setAttribute('aria-label','Saved sessions');list.tabIndex=0;
  space.style.height=(sessions.length*64)+'px';space.className='history-space';
  space.append(windowRows);list.append(space);el.append(list,detail);
  let lastStart=-1;
  function paint(){
    const start=Math.max(0,Math.floor(list.scrollTop/64)-3);
    if(start===lastStart)return;
    lastStart=start;
    windowRows.style.transform='translateY('+start*64+'px)';
    windowRows.innerHTML=sessions.slice(start,start+14).map((s,i)=>
      '<button type="button" data-index="'+(start+i)+'">'+esc(s.date)+' · '+esc(sessionPlan(s).name)+'</button>').join('');
  }
  list.onscroll=paint;
  list.onclick=event=>{
    const button=event.target.closest('[data-index]');if(!button)return;
    detail.innerHTML=historyCard(sessions[Number(button.dataset.index)]);
    detail.firstElementChild.open=true;detail.querySelector('summary').focus();
  };
  list.onkeydown=event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();
    const current=Number(event.target.dataset.index||0);
    const target=event.key==='Home'?0:event.key==='End'?sessions.length-1:Math.max(0,Math.min(sessions.length-1,current+(event.key==='ArrowDown'?1:-1)));
    list.scrollTop=target*64;paint();list.querySelector('[data-index="'+target+'"]')?.focus();
  };
  paint();
}
function historyCard(s){
    const p=sessionPlan(s),sets=Object.values(s.sets||{}).flat().filter(validTrainingSet),volume=sets.reduce((sum,r)=>sum+Number(r.weight)*Number(r.reps),0);
    return `<details class="history-session"><summary><strong>${esc(s.date)} · ${esc(p.name)}</strong><span class="muted">${sets.length} logged sets · ${round(volume).toLocaleString()} kg volume</span></summary>${p.items.map(([name,,range],i)=>{
      const rows=(s.sets?.[i]||[]).filter(validTrainingSet);
      return `<div class="exercise"><h3>${esc(name)}</h3>${rows.length?`<ol>${rows.map(r=>`<li>${r.type==='warmup'?'Warm-up · ':''}${esc(r.weight)} kg × ${esc(r.reps)} ${/sec/i.test(range)?'sec':'reps'}</li>`).join('')}</ol>`:'<p class="muted">No sets recorded.</p>'}</div>`;
    }).join('')}<div class="session-actions"><button type="button" class="btn secondary small" data-session-action="repeat" data-session-id="${esc(s.id)}">Repeat this workout</button><button type="button" class="btn secondary small" data-session-action="edit" data-session-id="${esc(s.id)}">Edit saved workout</button></div>${s.notes?`<h3>Session notes</h3><p class="session-notes">${esc(s.notes)}</p>`:''}</details>`;
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

