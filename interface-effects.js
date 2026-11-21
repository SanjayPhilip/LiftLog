/* Interaction references: https://prismic.io/blog/css-hover-effects */
function profileVisual(p) {
  return `<details class="card athlete-card"><summary><span class="athlete-front">${esc(p.name || 'Athlete profile')}</span></summary>
    <p>${esc(p.height || '—')} cm · ${esc(p.weight || '—')} kg · ${esc(p.goal || 'Training')}</p></details>
    <section class="card scan-card" data-mode="auto"><h3>Profile X-ray</h3><div class="scan-stage" role="img" aria-label="Illustrated body and skeleton with adjustable scan window">
    <svg viewBox="0 0 120 200" aria-hidden="true">
      <ellipse cx="60" cy="22" rx="13" ry="17" fill="#c7a3a3"/>
      <path d="M47 41 Q60 46 73 41 L83 47 98 95 92 101 76 67 73 100 78 119 72 182 76 192 64 192 60 128 56 192 44 192 48 181 42 119 47 99 44 67 28 101 22 95 37 47Z" fill="#996773"/>
      <defs><clipPath id="profileScanClip" clipPathUnits="userSpaceOnUse"><rect class="scan-window" width="120" height="48" y="76"/></clipPath></defs>
      <g clip-path="url(#profileScanClip)"><rect width="120" height="200" fill="#111c29"/><g class="scan-bones" fill="none" stroke="#e7f7ff" stroke-width="3" stroke-linecap="round">
      <path d="M50 24Q45 7 59 7Q74 7 71 23L66 28L65 34H55L54 28Z" fill="#bdd5dd"/>
      <path d="M52 20q3-4 6 0m4 0q3-4 6 0m-8 3-2 4h4" stroke="#233345"/>
      <path d="M52 100q-8 0-5 8l9 7h8l9-7q3-8-5-8l-8 4z" fill="#9eb8c6"/>
      <path d="M32 76l-4 17m60-17 4 17m-41 59 1 29m16-29-1 29" stroke-width="1.5"/><path d="M54 20h2m8 0h2" stroke="#354454"/>
      <path d="M60 35v71m-18-56 18-6 18 6m-36 2-8 23-7 19m51-42 8 23 7 19m-45 8 12 9 12-9m-24 0 3 12 9 5 9-5 3-12m-20 16 1 35-3 31m18-66-1 35 3 31"/>
      ${[0,1,2,3,4].map(i=>`<path d="M46 ${51+i*6} Q60 ${61+i*6} 74 ${51+i*6}"/>`).join('')}</g>
      </g><g class="scan-lines" aria-hidden="true" stroke="#86d6e7" stroke-width=".65"><path d="M0 0h120M0 48h120"/></g>
    </svg></div><label>Scan position <input class="scan-range" type="range" min="0" max="100" value="50"></label>
    <button type="button" class="btn small secondary" data-scan="auto" aria-pressed="true">Auto scan</button>
    <button type="button" class="btn small secondary" data-scan="body" aria-pressed="false">Body</button>
    <button type="button" class="btn small secondary" data-scan="full" aria-pressed="false">Full X-ray</button></section>`;
}

function setScanMode(card,mode){
  card.dataset.mode=mode;
  card.querySelectorAll('[data-scan]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.scan===mode));
  });
}
document.addEventListener('input', event => {
  if(event.target.matches('.dual-range')) event.target.closest('.workout-photos').style.setProperty('--split',event.target.value+'%');
  if(event.target.matches('.scan-range')){
    const card=event.target.closest('.scan-card');
    setScanMode(card,'manual');
    card.style.setProperty('--scan-y',(Number(event.target.value)*1.52-76)+'px');
  }
});
document.addEventListener('click', event => {
  const mode=event.target.closest('[data-scan]');
  if(mode) setScanMode(mode.closest('.scan-card'),mode.dataset.scan);
});
document.addEventListener('pointermove', event => {
  if(event.pointerType!=='mouse')return;
  const stage=event.target.closest('.scan-stage,.dual-stage');
  if(!stage)return;
  const rect=stage.getBoundingClientRect();
  if(stage.matches('.scan-stage')){
    const card=stage.closest('.scan-card');
    if(card.dataset.mode!=='manual')return;
    const value=Math.round(100*(event.clientY-rect.top)/rect.height);
    card.style.setProperty('--scan-y',(value*1.52-76)+'px');
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
menu.addEventListener('focusout',e=>{if(!menu.contains(e.relatedTarget))markTab()});
menu.addEventListener('click',()=>{markTab();if(desktop.matches){menuButton.focus();openDesktopMenu(false)}});
new ResizeObserver(()=>markTab()).observe(menu);
new MutationObserver(()=>markTab()).observe(menu,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
