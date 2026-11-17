"""Session module regression checks. All cloud traffic is mocked; no account writes."""
import json
from playwright.sync_api import sync_playwright, expect

MOCK='''window.supabase={createClient(){return {
 auth:{async getSession(){await new Promise(r=>setTimeout(r,100));return {data:{session:{user:{id:'fixture-user'}}}}},onAuthStateChange(){}},
 from(){return {select(){return {eq(){return {async maybeSingle(){return {data:{payload:JSON.parse(localStorage.getItem('testFixture')||'null')||window.fixture},error:null}}}}}},async upsert(data){window.savedPayload=data.payload;window.writes=(window.writes||0)+1;return {error:null}}}}
}}};'''
plan={'name':'Current plan','items':[['New exercise',2,'8–10']]}
old_plan={'name':'Archived push','items':[['Bench Press',2,'8–10'],['Plank',1,'30–60 sec']]}
def session(key,date,weight=40,reps=8,hold=40):
 return {'id':key,'date':date,'day':0,'planSnapshot':old_plan,'sets':{'0':[{'weight':weight,'reps':reps},{'weight':weight,'reps':reps}],'1':[{'weight':0,'reps':hold}]},'notes':'Keep <script>literal</script> notes','done':{},'ranges':{}}
fixture={'profile':{'name':'Test','height':180,'weight':80,'age':25,'goal':'gain','sleep':8},'plan':[plan],
 'sessions':[session('baseline','2026-11-08',35,8,35),session('last-week','2026-11-15',40,8,40),session('this-week','2026-11-16',42.5,9,50),session('future','2027-01-01',200,10,90)],
 'drafts':{'2026-11-17|0':{'sets':{'0':[{'weight':'15','reps':'8'}]},'done':{},'ranges':{},'notes':'Unrelated draft'}},'body':[],'day':0}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
 # Fix only the calendar for reproducible Sunday/Monday checks. Timers still run normally.
 context.add_init_script("""const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-17T12:00:00Z']))}static now(){return new NativeDate('2026-11-17T12:00:00Z').getTime()}};window.fixture="""+json.dumps(fixture))
 page=context.new_page();errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.route('**/supabase.min.js',lambda route:route.fulfill(body=MOCK,content_type='application/javascript'))
 page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
 page.goto('http://127.0.0.1:4173');expect(page.locator('#authGate')).to_be_hidden()
 expect(page.locator('#weeklySummary')).to_contain_text('2026-11-16 – 2026-11-22')
 stats=page.evaluate("weeklySummary('2026-11-16','2026-11-17')")
 assert stats['current']=={'sessions':1,'sets':3,'volume':765},stats
 assert stats['previous']=={'sessions':1,'sets':3,'volume':640},stats
 assert len(stats['improved'])==2 and stats['records']>0
 assert page.evaluate("recordsForSession(state.sessions.find(s=>s.id==='baseline')).length")==0
 assert page.evaluate("recordsForSession({...state.sessions[1],id:'tie'},state.sessions.slice(0,2)).length")==0
 assert page.evaluate("weekStart('2026-11-15')")=='2026-11-09'
 assert page.evaluate("weekStart('2026-11-16')")=='2026-11-16'
 assert page.evaluate("weekStart('2027-01-01')")=='2026-12-28'
 page.get_by_role('button',name='Previous summary week',exact=True).click()
 expect(page.locator('#weeklySummary')).to_contain_text('2026-11-09 – 2026-11-15')
 page.get_by_role('button',name='Next summary week',exact=True).click()
 expect(page.get_by_role('button',name='Next summary week',exact=True)).to_be_disabled()
 page.evaluate("switchTab('progressPage')")
 old=page.locator('.history-session').filter(has=page.locator('[data-session-id="last-week"]')).first
 old.locator('summary').click()
 old.get_by_role('button',name='Repeat this workout',exact=True).click()
 expect(page.locator('#sessionStudio')).to_be_visible()
 expect(page.locator('#studioDate')).to_have_value('2026-11-17')
 page.screenshot(path='/tmp/liftlog-repeat-mobile.png',full_page=True)
 expect(page.get_by_role('spinbutton',name='Bench Press set 1 weight',exact=True)).to_have_value('40')
 assert page.evaluate('PLAN[0].items[0][0]')=='New exercise'
 assert page.evaluate("state.drafts['2026-11-17|0'].notes")=='Unrelated draft'
 page.get_by_role('spinbutton',name='Bench Press set 1 weight',exact=True).fill('45')
 page.locator('#studioNotes').fill('Today’s session')
 page.wait_for_function("window.savedPayload?.repeatedWorkout?.sets[0][0].weight==='45'")
 # Restore through the account payload and resume the repeated draft.
 page.evaluate("localStorage.setItem('testFixture',JSON.stringify(window.savedPayload))")
 page.reload();expect(page.locator('#authGate')).to_be_hidden()
 page.get_by_role('button',name='Continue workout',exact=True).click()
 expect(page.get_by_role('spinbutton',name='Bench Press set 1 weight',exact=True)).to_have_value('45')
 page.get_by_role('button',name='Add set to Bench Press',exact=True).click()
 page.get_by_role('spinbutton',name='Bench Press set 3 weight',exact=True).fill('-5')
 page.get_by_role('spinbutton',name='Bench Press set 3 reps',exact=True).fill('8')
 page.once('dialog',lambda dialog:dialog.accept())
 page.get_by_role('button',name='Save repeated workout',exact=True).click()
 expect(page.locator('#sessionStudio')).to_be_visible()
 page.get_by_role('button',name='Remove Bench Press set 3',exact=True).click()
 page.get_by_role('button',name='Save repeated workout',exact=True).click()
 expect(page.locator('.session-celebration')).to_contain_text('Personal record')
 assert page.evaluate('state.sessions.length')==5
 assert page.evaluate("state.sessions.find(s=>s.id==='last-week').sets[0][0].weight")==40
 assert page.evaluate('state.repeatedWorkout===undefined')
 new_id=page.evaluate("state.sessions.find(s=>s.repeatedFrom==='last-week').id")
 # Editing is isolated; cancelling never changes history.
 page.evaluate('startEditSession('+json.dumps(new_id)+')')
 page.get_by_role('spinbutton',name='Bench Press set 1 weight',exact=True).fill('10')
 assert page.evaluate("state.sessions.find(s=>s.repeatedFrom==='last-week').sets[0][0].weight")=='45'
 page.once('dialog',lambda dialog:dialog.accept())
 page.get_by_role('button',name='Cancel edits',exact=True).click()
 assert page.evaluate("state.sessions.find(s=>s.repeatedFrom==='last-week').sets[0][0].weight")=='45'
 # Save a correction with a changed date. Keep its identity and snapshot.
 page.evaluate('startEditSession('+json.dumps(new_id)+')')
 page.locator('#studioDate').fill('2026-11-16')
 page.get_by_role('spinbutton',name='Bench Press set 1 weight',exact=True).fill('30')
 page.locator('#studioNotes').fill('Corrected <img src=x onerror=alert(1)>')
 page.get_by_role('button',name='Save changes',exact=True).click()
 assert page.evaluate('state.sessions.length')==5
 corrected=page.evaluate('state.sessions.find(s=>s.id==='+json.dumps(new_id)+')')
 assert corrected['date']=='2026-11-16' and corrected['sets']['0'][0]['weight']=='30'
 assert corrected['planSnapshot']==old_plan
 assert page.evaluate('recordsForSession(state.sessions.find(s=>s.id==='+json.dumps(new_id)+')).length')==0
 assert page.evaluate("weeklySummary('2026-11-16','2026-11-17').current.volume")==1325
 assert page.evaluate("weeklySummary('2026-11-16','2026-11-17').current.sessions")==2
 # Back-to-back repeats on the same date do not overwrite either session or drafts.
 page.evaluate("startRepeatSession('last-week')")
 page.get_by_role('button',name='Save repeated workout',exact=True).click()
 assert page.evaluate('state.sessions.length')==6
 assert len(page.evaluate('state.sessions.map(s=>s.id)'))==len(set(page.evaluate('state.sessions.map(s=>s.id)')))
 assert page.evaluate("state.drafts['2026-11-17|0'].notes")=='Unrelated draft'
 assert page.evaluate("weeklySummary('2026-11-16','2026-11-17').current.sessions")==3
 # Edits to a session invalidate an in-flight editor rather than silently overwriting.
 page.evaluate("startEditSession('last-week');state.sessions.find(s=>s.id==='last-week').notes='Changed elsewhere'")
 page.once('dialog',lambda dialog:dialog.accept())
 page.get_by_role('button',name='Save changes',exact=True).click()
 expect(page.locator('#sessionStudio')).to_be_visible()
 assert page.evaluate("state.sessions.find(s=>s.id==='last-week').notes")=='Changed elsewhere'
 # No mobile overflow in forms, summary, or long history data.
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.evaluate("studioEdit=null;switchTab('progressPage')")
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.set_viewport_size({'width':1280,'height':900})
 page.evaluate("switchTab('dashboard')")
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.wait_for_function('!!window.savedPayload')
 page.screenshot(path='/tmp/liftlog-weekly-desktop.png',full_page=True)
 assert not errors,errors
 print('PASS: repeat snapshot/prefill, draft sync/reload, isolation/cancel, corrections/date/notes, duplicate dates, input validation, records/ties/baselines, weekly boundaries/comparisons, stale editor, mobile/desktop.')
 browser.close()
