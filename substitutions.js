function swapStudioExercise(index){
  const d=studioDraft();if(!d||studioEdit)return;
  const original=d.planSnapshot.items[index],name=prompt('Replacement exercise name (this workout only)',original[0]);
  if(name===null||!name.trim()||name.trim()===original[0])return;
  if(name.trim().length>100)return alert('Keep exercise names under 100 characters.');
  if(!confirm('Replace '+original[0]+' with '+name.trim()+'? Its entered sets will be cleared so you can choose an appropriate load.'))return;
  d.planSnapshot.items[index]=[name.trim(),original[1],original[2]];
  d.sets[index]=Array.from({length:Math.max(1,original[1])},()=>({weight:'',reps:''}));
  save();renderSessionStudio();
}
function swapWorkoutExercise(index){
  if(state.repeatedWorkout&&!confirm('Replace the existing repeated draft with this workout?'))return;
  const original=PLAN[state.day].items[index],name=prompt('Replacement exercise name (this workout only)',original[0]);
  if(name===null||!name.trim()||name.trim()===original[0])return;
  if(name.trim().length>100)return alert('Keep exercise names under 100 characters.');
  if(!confirm('Swap this exercise and clear its entered sets? Your routine will stay the same.'))return;
  const d=structuredClone(draft()),snapshot=structuredClone(PLAN[state.day]);
  snapshot.items[index][0]=name.trim();
  d.sets[index]=Array.from({length:Math.max(1,original[1])},()=>({weight:'',reps:''}));
  snapshot.items.forEach(([,count],i)=>{d.sets[i]??=Array.from({length:count},()=>({weight:'',reps:''}));});
  state.repeatedWorkout={...d,date:currentDate,day:state.day,planSnapshot:snapshot,sourceDate:currentDate,sourceId:null};
  delete state.drafts[draftKey()];studioEdit=null;save();switchTab('sessionStudio');
}
const workoutBeforeSwaps=workout;workout=function(){workoutBeforeSwaps();document.querySelectorAll('#workout .exercise').forEach((el,i)=>{
  const button=document.createElement('button');button.className='btn secondary small';button.textContent='Swap exercise';button.onclick=()=>swapWorkoutExercise(i);el.append(button);
});};
const studioBeforeSwaps=renderSessionStudio;renderSessionStudio=function(){studioBeforeSwaps();if(studioEdit)return;document.querySelectorAll('#sessionStudio .exercise').forEach((el,i)=>{
  const button=document.createElement('button');button.className='btn secondary small';button.textContent='Swap exercise';button.onclick=()=>swapStudioExercise(i);el.append(button);
});};
