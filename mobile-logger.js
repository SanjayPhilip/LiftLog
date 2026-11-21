/* Display units are device preferences. Saved loads and exports use kilograms. */
const poundsPerKg=2.20462262185;
function entryUnit(){return localStorage.getItem('liftlog_entry_unit')==='lb'?'lb':'kg';}
function displayedWeight(kg){
  if(kg===''||kg==null)return '';
  return entryUnit()==='kg'?kg:Number((Number(kg)*poundsPerKg).toFixed(2));
}
function storedWeight(value){
  if(value==='')return '';
  return entryUnit()==='kg'?value:String(Number((Number(value)/poundsPerKg).toFixed(6)));
}
function setEntryUnit(unit){localStorage.setItem('liftlog_entry_unit',unit);render();}
function weightLabel(name){return weightConvention(name)[0].replace(/kg/ig,entryUnit());}
function setField(i,j,name,field,value){
  const weight=field==='weight',unit=weight?entryUnit():'reps or seconds';
  const label=esc(name)+' set '+(j+1)+' '+unit;
  const shown=weight?displayedWeight(value):value;
  return `<div class="number-step"><button type="button" aria-label="Decrease ${label}" onclick="stepField(this,-1)">−</button>
    <input type="number" inputmode="${weight?'decimal':'numeric'}" min="0" step="${weight?'any':'1'}" data-field="${field}" aria-label="Set ${j+1} ${weight?'weight':'reps'} for ${esc(name)}" value="${esc(shown)}"
      oninput="this.setCustomValidity(this.validity.rangeUnderflow || this.validity.stepMismatch ? 'Enter a valid non-negative number.' : '');setValue(${i},${j},'${field}',${weight?'storedWeight(this.value)':'this.value'})">
    <button type="button" aria-label="Increase ${label}" onclick="stepField(this,1)">+</button></div>`;
}
function stepField(button,direction){
  const input=button.parentElement.querySelector('input');
  const step=input.dataset.field==='weight'?(entryUnit()==='kg'?0.5:1):1;
  input.value=String(Math.max(0,Math.round(((Number(input.value)||0)+direction*step)*100)/100));
  input.dispatchEvent(new Event('input',{bubbles:true}));
}
function workoutBar(day){
  const last=draft().lastLogged;
  return `<div class="logger-bar" aria-label="Workout actions">
    <select aria-label="Exercise for Add set" id="quickExercise">${day.items.map(([name],i)=>`<option value="${i}">${esc(name)}</option>`).join('')}</select>
    <button class="btn secondary" onclick="quickAdd()">+ Set</button>
    <button class="btn secondary" id="quickUndo" ${last?'':'disabled'} onclick="undoLatest()">Undo</button>
    <button class="btn" onclick="finishWorkout()">Finish workout</button></div>`;
}
function quickAdd(){
  const i=Number($('quickExercise').value);
  const draftRows=draft().sets;
  draftRows[i]??=Array.from({length:PLAN[state.day].items[i][1]},()=>({weight:'',reps:''}));
  const previous=draftRows[i].filter(row=>row.type!=='warmup'&&validTrainingSet(row)).at(-1);
  draftRows[i].push(previous?{weight:previous.weight,reps:previous.reps,prefilled:true}:{weight:'',reps:''});
  save(true);render();
  $('quickExercise').value=String(i);
  const j=draft().sets[i].length-1;
  $('completeSet-'+i+'-'+j)?.closest('.setrow')?.querySelector('input')?.focus();
}
function undoLatest(){
  const last=draft().lastLogged;
  if(last && draft().sets[last.i]?.[last.j]?.completed)toggleWorkoutSet(last.i,last.j);
}
function trackExercise(event){
  const exercise=event.target.closest('#workout .exercise[data-exercise]');
  if(exercise && $('quickExercise'))$('quickExercise').value=exercise.dataset.exercise;
}
document.addEventListener('focusin',trackExercise);
document.addEventListener('pointerdown',trackExercise);
function requestDeviceStorage(){
  navigator.storage?.persist?.().catch(()=>{});
}
document.addEventListener('pointerdown',requestDeviceStorage,{once:true});
function labelFields(root){
  for(const input of root.querySelectorAll('input,textarea,select')){
    if(input.labels?.length||input.hasAttribute('aria-label')||input.hasAttribute('aria-labelledby'))continue;
    const label=input.previousElementSibling;
    if(label?.tagName==='LABEL'){
      input.id ||= 'field-'+crypto.randomUUID();label.htmlFor=input.id;
    }else if(input.placeholder){input.setAttribute('aria-label',input.placeholder);}
  }
}
