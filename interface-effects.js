/* Interaction references: https://prismic.io/blog/css-hover-effects */
function workoutImageHTML() {
  const movements = [
    [/incline barbell press|barbell incline bench/i,'Incline barbell press','Barbell_Incline_Bench_Press_-_Medium_Grip'],
    [/barbell squat|^squats?$/i,'Barbell squat','Barbell_Squat'],
    [/pull.?ups?/i,'Pull-up','Pullups'],
    [/dumbbell shoulder press/i,'Dumbbell shoulder press','Dumbbell_Shoulder_Press'],
    [/flat dumbbell press|dumbbell bench press/i,'Dumbbell bench press','Dumbbell_Bench_Press']
  ];
  const day = PLAN[state.day];
  const match = day.items.map(([name]) => movements.find(([pattern]) => pattern.test(name))).find(Boolean);
  const [,label,folder] = match || [null,'Bench press','Barbell_Bench_Press_-_Medium_Grip'];
  const base = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/'+folder+'/';
  return `<details class="card workout-photos"><summary>${label} photo study</summary>
    <div class="dual-stage">
      <img src="${base}0.jpg" loading="lazy" alt="${label} starting position">
      <img src="${base}1.jpg" loading="lazy" alt="${label} finishing position">
    </div><label>Compare positions <input class="dual-range" type="range" min="25" max="75" value="50"></label></details>`;
}
function profileVisual(p) {
  return `<details class="card athlete-card"><summary><span class="athlete-front">${esc(p.name || 'Athlete profile')}</span></summary>
    <p>${esc(p.height || '—')} cm · ${esc(p.weight || '—')} kg · ${esc(p.goal || 'Training')}</p></details>
    <details class="card scan-card"><summary>Profile X-ray</summary><div class="scan-stage" role="img" aria-label="Illustrated body and skeleton with adjustable scan window">
    <svg viewBox="0 0 120 200" aria-hidden="true">
      <ellipse cx="60" cy="22" rx="13" ry="17" fill="#c7a3a3"/>
      <path d="M47 41 Q60 46 73 41 L83 47 98 95 92 101 76 67 73 100 78 119 72 182 76 192 64 192 60 128 56 192 44 192 48 181 42 119 47 99 44 67 28 101 22 95 37 47Z" fill="#996773"/>
      <g class="scan-bones" fill="none" stroke="#e7f7ff" stroke-width="3" stroke-linecap="round">
      <ellipse cx="60" cy="21" rx="10" ry="13" fill="#9eb8c6"/><path d="M54 20h2m8 0h2" stroke="#354454"/>
      <path d="M60 35v71m-18-56 18-6 18 6m-36 2-8 23-7 19m51-42 8 23 7 19m-45 8 12 9 12-9m-24 0 3 12 9 5 9-5 3-12m-20 16 1 35-3 31m18-66-1 35 3 31"/>
      ${[0,1,2,3,4].map(i=>`<path d="M46 ${51+i*6} Q60 ${61+i*6} 74 ${51+i*6}"/>`).join('')}</g>
    </svg></div><label>Scan position <input class="scan-range" type="range" min="0" max="100" value="50"></label>
    <button type="button" class="btn small secondary" data-scan="body">Body</button>
    <button type="button" class="btn small secondary" data-scan="full">Full X-ray</button></details>`;
}

document.addEventListener('input', event => {
  if(event.target.matches('.dual-range')) event.target.closest('.workout-photos').style.setProperty('--split',event.target.value+'%');
  if(event.target.matches('.scan-range')){
    const card=event.target.closest('.scan-card');
    card.dataset.mode='scan';
    card.style.setProperty('--scan',event.target.value+'%');
  }
});
document.addEventListener('click', event => {
  const mode=event.target.closest('[data-scan]');
  if(mode) mode.closest('.scan-card').dataset.mode=mode.dataset.scan;
});
document.addEventListener('pointermove', event => {
  if(event.pointerType!=='mouse')return;
  const stage=event.target.closest('.scan-stage,.dual-stage');
  if(!stage)return;
  const rect=stage.getBoundingClientRect();
  if(stage.matches('.scan-stage')){
    const card=stage.closest('.scan-card');
    if(['body','full'].includes(card.dataset.mode))return;
    const value=Math.round(100*(event.clientY-rect.top)/rect.height);
    card.style.setProperty('--scan',value+'%');
    card.querySelector('input').value=value;
  }else{
    const value=event.clientX<rect.left+rect.width/2?75:25;
    stage.parentElement.style.setProperty('--split',value+'%');
    stage.parentElement.querySelector('input').value=value;
  }
});
// Let the same disclosure work with a pointer, tap, or keyboard.
document.addEventListener('pointerover',e=>{
  const card=e.target.closest('.hard-card,.athlete-card');
  if(e.pointerType==='mouse' && card && !card.open && !card.contains(e.relatedTarget)){
    card.open=true;
    card.dataset.hoverOpen='true';
  }
});
document.addEventListener('pointerout',e=>{
  const card=e.target.closest('[data-hover-open]');
  if(card && !card.contains(e.relatedTarget) && !card.contains(document.activeElement)){
    card.open=false;
    delete card.dataset.hoverOpen;
  }
});
const dock=document.querySelector('.nav-dock');
const menuButton=dock.querySelector('.desktop-menu');
const menu=dock.querySelector('.tabs');
const desktop=matchMedia('(min-width:900px)');
function openDesktopMenu(open){
  dock.classList.toggle('menu-open',open);
  menuButton.setAttribute('aria-expanded',String(open));
  menuButton.setAttribute('aria-label',open?'Close navigation':'Open navigation');
  menu.inert=desktop.matches&&!open;
}
openDesktopMenu(false);
desktop.addEventListener('change',()=>openDesktopMenu(false));
menuButton.addEventListener('click',event=>{
  const openedByMouse = event.detail > 0 && menuButton.matches(':hover') && matchMedia('(hover:hover) and (pointer:fine)').matches;
  openDesktopMenu(openedByMouse || !dock.classList.contains('menu-open'));
  if (dock.classList.contains('menu-open')) menu.querySelector('button.active')?.focus();
});
dock.addEventListener('pointerenter',e=>{if(desktop.matches&&e.pointerType==='mouse')openDesktopMenu(true)});
dock.addEventListener('pointerleave',()=>{if(!dock.contains(document.activeElement))openDesktopMenu(false)});
document.addEventListener('pointerdown',e=>{if(!dock.contains(e.target))openDesktopMenu(false)});
dock.addEventListener('focusout',e=>{if(!dock.contains(e.relatedTarget))openDesktopMenu(false)});
dock.addEventListener('keydown',e=>{if(e.key==='Escape'){menuButton.focus();openDesktopMenu(false)}});
const indicator=document.createElement('i');
indicator.className='nav-marker';
menu.append(indicator);
function markTab(button=menu.querySelector('button.active')){
  if(!button)return;
  indicator.style.width=button.offsetWidth+'px';
  indicator.style.transform='translate('+button.offsetLeft+'px,'+(button.offsetTop+button.offsetHeight-2)+'px)';
}
menu.addEventListener('pointerover',e=>markTab(e.target.closest('button')||undefined));
menu.addEventListener('pointerleave',()=>markTab());
menu.addEventListener('focusin',e=>markTab(e.target.closest('button')||undefined));
menu.addEventListener('click',()=>{markTab();if(desktop.matches){menuButton.focus();openDesktopMenu(false)}});
new ResizeObserver(()=>markTab()).observe(menu);
new MutationObserver(()=>markTab()).observe(menu,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
