/* Calendar assignments are separate from workout IDs, drafts and saved sessions. */
let swappingDays=false,swapSource=null,scheduleNotice='',scheduleIgnoreClick=false;
const scheduleWeekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function weeklySchedule(){
  const base=[0,1,2,-1,3,4,-1].map(day=>day<PLAN.length?day:-1);
  const saved=state.weekSchedules?.[weekStart(localDateKey())];
  const days=saved?.days;
  return saved?.plan===JSON.stringify(PLAN)&&Array.isArray(days)&&days.length===7&&
    [...days].sort((a,b)=>a-b).join() === [...base].sort((a,b)=>a-b).join() ? [...days]:base;
}
function toggleDaySwap(){swappingDays=!swappingDays;swapSource=null;scheduleNotice='';render();}
function paintSwapSource(){
  document.querySelectorAll('[data-schedule-day]').forEach(el=>{
    const selected=Number(el.dataset.scheduleDay)===swapSource;
    el.classList.toggle('swap-source',selected);
    if(swappingDays)el.setAttribute('aria-pressed',String(selected));
  });
}
function swapScheduleDays(from,to){
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>6||to>6||from===to)return;
  const days=weeklySchedule();[days[from],days[to]]=[days[to],days[from]];
  state.weekSchedules={...state.weekSchedules,[weekStart(localDateKey())]:{plan:JSON.stringify(PLAN),days}};
  swapSource=null;scheduleNotice=`${scheduleWeekdays[from]} and ${scheduleWeekdays[to]} swapped for this week.`;
  save();render();
}
function scheduleClick(index){
  if(scheduleIgnoreClick){scheduleIgnoreClick=false;return;}
  if(swappingDays){
    if(swapSource===null){swapSource=index;paintSwapSource();$('scheduleStatus').textContent=`${scheduleWeekdays[index]} selected. Choose another day to swap.`;}
    else if(swapSource===index){swapSource=null;paintSwapSource();$('scheduleStatus').textContent='Choose two days to swap.';}
    else swapScheduleDays(swapSource,index);
    return;
  }
  const day=weeklySchedule()[index];if(day<0)return;
  changeDay(day);switchTab('workout');
}
function bindScheduleDrag(){
  paintSwapSource();
  document.querySelectorAll('[data-schedule-day]').forEach(tile=>{
    let drag=null;
    tile.querySelector('.schedule-grip')?.addEventListener('click',event=>event.stopPropagation());
    tile.addEventListener('pointerdown',event=>{
      if(!event.isPrimary||event.button!==0||(!swappingDays&&!event.target.closest('.schedule-grip')))return;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
      tile.setPointerCapture(event.pointerId);
    });
    tile.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.id)return;
      if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>8)drag.moved=true;
      if(!drag.moved)return;
      tile.classList.add('swap-source');
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-schedule-day]');
      document.querySelectorAll('[data-schedule-day]').forEach(el=>el.classList.toggle('swap-target',el===target&&el!==tile));
    });
    tile.addEventListener('pointerup',event=>{
      if(!drag||event.pointerId!==drag.id)return;
      const moved=drag.moved;drag=null;
      if(!moved)return;
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-schedule-day]');
      scheduleIgnoreClick=true;setTimeout(()=>{scheduleIgnoreClick=false;},0);
      document.querySelectorAll('.swap-target').forEach(el=>el.classList.remove('swap-target'));
      if(target&&target!==tile)swapScheduleDays(Number(tile.dataset.scheduleDay),Number(target.dataset.scheduleDay));
      else paintSwapSource();
    });
    tile.addEventListener('pointercancel',()=>{drag=null;document.querySelectorAll('.swap-target').forEach(el=>el.classList.remove('swap-target'));paintSwapSource();});
  });
}
