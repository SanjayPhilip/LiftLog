"""Run against a local static server. Cloud responses are fixtures; no real account writes."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

MOCK = '''window.supabase={createClient(){return {
 auth:{async getSession(){await new Promise(r=>setTimeout(r,100));return {data:{session:{user:{id:'fixture-user'}}}}},onAuthStateChange(){}},
 from(){return {select(){return {eq(){return {async maybeSingle(){return {data:{payload:window.fixture},error:null}}}}}},async upsert(data){window.savedPayload=data.payload;return {error:null}}}}
}}};'''
fixture = {
 'profile':{'name':'Test lifter','height':180,'weight':80,'age':25,'goal':'gain','sleep':8},
 'plan':[{'name':'Push','items':[['Bench Press',3,'8–10'],['Pull-Ups',2,'6–8'],['Plank',2,'45–60 sec']]}],
 'sessions':[
  {'id':'new','date':'2026-11-12','day':0,'planSnapshot':{'name':'Old push','items':[['Pull-Ups',2,'6–8'],['Bench Press',3,'8–10'],['Plank',2,'45–60 sec']]},'sets':{'0':[{'weight':0,'reps':7}],'1':[{'weight':40,'reps':8},{'weight':40,'reps':8},{'weight':40,'reps':8}],'2':[{'weight':0,'reps':50}]},'notes':'Good form <script>alert(1)</script>'},
  {'id':'old','date':'2026-11-01','day':0,'planSnapshot':{'name':'Archived','items':[['Bench Press',3,'8–10'],['Retired Lift',1,'5']]},'sets':{'0':[{'weight':35,'reps':10}],'1':[{'weight':20,'reps':5}]},'notes':''},
  {'id':'future','date':'2027-01-01','day':0,'planSnapshot':{'name':'Future','items':[['Bench Press',1,'8']]},'sets':{'0':[{'weight':90,'reps':8}]},'notes':''}
 ],'drafts':{},'body':[],'day':0
}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844},service_workers='block')
 errors=[]
 page.on('pageerror',lambda error: errors.append(str(error)))
 page.route('**/supabase.min.js',lambda route:route.fulfill(body=MOCK,content_type='application/javascript'))
 page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
 page.add_init_script('window.fixture='+json.dumps(fixture))
 page.goto('http://127.0.0.1:4173')
 expect(page.locator('#authGate')).to_be_hidden()
 page.evaluate("currentDate='2026-11-16';switchTab('workout')")
 expect(page.get_by_role('spinbutton',name='Set 1 weight for Bench Press',exact=True)).to_have_value('40')
 expect(page.get_by_role('spinbutton',name='Set 1 reps for Bench Press',exact=True)).to_have_value('8')
 expect(page.get_by_text('Last workout · 2026-11-12',exact=False).first).to_be_visible()
 assert page.evaluate("targetAdvice('Bench Press','8–10',3)").startswith('At the same weight')
 assert 'seconds' in page.evaluate("targetAdvice('Plank','45–60 sec',2)")
 page.get_by_role('spinbutton',name='Set 1 weight for Bench Press',exact=True).fill('42.5')
 page.evaluate('render()')
 expect(page.get_by_role('spinbutton',name='Set 1 weight for Bench Press',exact=True)).to_have_value('42.5')
 assert page.evaluate("lastExercise('Bench Press').session.id")=='new'
 assert page.evaluate("validTrainingSet({weight:'',reps:8})") is False
 assert page.evaluate("validTrainingSet({weight:-1,reps:8})") is False
 assert page.evaluate("validTrainingSet({weight:0,reps:8})") is True
 page.evaluate("switchTab('progressPage')")
 expect(page.locator('#historyResults .history-session')).to_have_count(3)
 page.locator('#historyExercise').fill('retired')
 expect(page.locator('#historyResults .history-session')).to_have_count(1)
 page.locator('#historyExercise').fill('')
 page.locator('#historyFrom').fill('2026-11-10')
 page.locator('#historyTo').fill('2026-11-15')
 expect(page.locator('#historyResults .history-session')).to_have_count(1)
 page.locator('#historyResults summary').click()
 expect(page.locator('.session-notes')).to_have_text('Good form <script>alert(1)</script>')
 page.select_option('#performanceExercise','Bench Press')
 assert page.evaluate("performanceSeries('Bench Press')[0].weight")==35
 assert page.evaluate("performanceSeries('Bench Press')[1].volume")==960
 expect(page.locator('#performanceResults svg')).to_be_visible()
 page.select_option('#performanceMetric','e1rm')
 expect(page.locator('#performanceResults svg')).to_be_visible()
 page.select_option('#performanceExercise','Plank')
 expect(page.locator('#performanceResults')).to_contain_text('Longest hold')
 expect(page.locator('#performanceResults')).to_contain_text('50 sec')
 assert page.locator('#performanceMetric option').count()==1
 page.select_option('#performanceExercise','Pull-Ups')
 expect(page.locator('#performanceResults')).to_contain_text('7 reps')
 page.evaluate("state.sessions=[];progress()")
 expect(page.locator('#historyResults')).to_contain_text('No workouts yet')
 expect(page.locator('#performanceResults')).to_contain_text('No logged sets')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Mobile overflow'
 page.set_viewport_size({'width':1280,'height':900})
 page.evaluate('progress()')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Desktop overflow'
 # Save and restore a real UI draft through the existing payload API contract.
 page.evaluate("state.sessions=fixture.sessions;state.day=0;currentDate='2026-11-16';switchTab('workout')")
 page.once('dialog',lambda dialog:dialog.accept())
 page.get_by_role('button',name='Save completed workout',exact=False).click()
 page.wait_for_function("window.savedPayload?.sessions.some(s=>s.date==='2026-11-16')")
 assert page.evaluate("savedPayload.sessions.find(s=>s.date==='2026-11-16').planSnapshot.items[0][0]")=='Bench Press'
 page.evaluate('window.fixture=window.savedPayload;state=structuredClone(defaults);loadCloud({id:"fixture-user"})')
 page.wait_for_function("state.sessions.some(s=>s.date==='2026-11-16')")
 assert not errors, errors
 print('PASS: mobile/desktop logging, preserved edits, date/name matching, history filters/details, escaped notes, records, charts, timed/bodyweight sets, empty states, save/reload payload contract.')
 browser.close()
