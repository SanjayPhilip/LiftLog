"""Simulate offline recovery, concurrent device saves and workout substitutions."""
import json
from playwright.sync_api import sync_playwright, expect
fixture={'profile':{'name':'Test','height':180,'weight':80,'age':25,'goal':'gain','sleep':8},'plan':[{'name':'Push','items':[['Bench',2,'8–10'],['Row',1,'8–12']]}],'sessions':[],'drafts':{},'body':[],'day':0}
mock='''window.remotePayload=structuredClone(window.fixture);window.supabase={createClient(){return {
auth:{async getSession(){return {data:{session:{user:{id:'test'}}}}},onAuthStateChange(){}},
from(){return {select(){return {eq(){return {async maybeSingle(){if(window.failRead)return {error:{message:'offline'}};return {data:{payload:window.remotePayload}}}}}}}}},
async rpc(name,args){window.rpcCalls=(window.rpcCalls||0)+1;if(window.failWrite)return {error:{message:'network'}};if(JSON.stringify(args.expected_payload)!==JSON.stringify(window.remotePayload))return {data:{saved:false,payload:window.remotePayload}};window.remotePayload=structuredClone(args.next_payload);return {data:{saved:true}}}
}}};'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844},service_workers='block');errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('window.fixture='+json.dumps(fixture))
 page.route('**/supabase.min.js',lambda r:r.fulfill(body=mock,content_type='application/javascript'))
 page.route('https://fonts.googleapis.com/**',lambda r:r.abort())
 page.goto('http://127.0.0.1:4173');expect(page.locator('#authGate')).to_be_hidden()
 page.evaluate("Object.defineProperty(navigator,'onLine',{value:false,configurable:true});state.notes='offline edits';save()")
 assert page.evaluate("readSyncCache('test').pending")
 # An independent device updates cloud while this device is disconnected.
 page.evaluate("remotePayload.profile.name='Other device';Object.defineProperty(navigator,'onLine',{value:true,configurable:true});flushSync()")
 expect(page.locator('#syncRecovery')).to_be_visible()
 assert page.evaluate('remotePayload.profile.name')=='Other device'
 assert page.evaluate('state.notes')=='offline edits'
 # Conflict persists safely across account reload rather than replaying an upsert.
 page.evaluate("loadCloud({id:'test'})")
 expect(page.locator('#syncRecovery')).to_be_visible()
 assert page.evaluate('state.notes')=='offline edits'
 page.once('dialog',lambda d:d.accept())
 page.get_by_role('button',name='Load newer cloud version',exact=True).click()
 expect(page.locator('#syncRecovery')).to_be_hidden()
 assert page.evaluate('state.profile.name')=='Other device'
 assert page.evaluate("JSON.parse(localStorage.getItem('liftlog_recovery_test')).state.notes")=='offline edits'
 # Network failures retain pending state, then successful retry acknowledges it.
 page.evaluate("window.failWrite=true;state.notes='retry me';save();flushSync()")
 page.wait_for_function("document.querySelector('#syncBadge').textContent.includes('retry sync')")
 assert page.evaluate("readSyncCache('test').pending")
 page.evaluate('window.failWrite=false;flushSync()')
 page.wait_for_function("!readSyncCache('test').pending")
 # Failed reads can restore authenticated device cache.
 page.evaluate("window.failRead=true;loadCloud({id:'test'})")
 expect(page.locator('#authGate')).to_be_hidden()
 assert page.evaluate('state.notes')=='retry me'
 page.evaluate("window.failRead=false;switchTab('workout');setValue(0,0,'weight','50');setValue(0,0,'reps','8')")
 dialogs=iter(['Dumbbell Press',None])
 page.on('dialog',lambda d:d.accept(next(dialogs)) if d.type=='prompt' else d.accept())
 page.locator('#workout .exercise').first.get_by_role('button',name='Swap exercise',exact=True).click()
 expect(page.locator('#sessionStudio')).to_be_visible()
 assert page.evaluate('PLAN[0].items[0][0]')=='Bench'
 assert page.evaluate('studioDraft().planSnapshot.items[0][0]')=='Dumbbell Press'
 expect(page.get_by_role('spinbutton',name='Dumbbell Press set 1 weight',exact=True)).to_have_value('')
 page.get_by_role('spinbutton',name='Dumbbell Press set 1 weight',exact=True).fill('15')
 page.get_by_role('spinbutton',name='Dumbbell Press set 1 reps',exact=True).fill('8')
 page.get_by_role('button',name='Save repeated workout',exact=True).click()
 assert page.evaluate('state.sessions[0].planSnapshot.items[0][0]')=='Dumbbell Press'
 assert page.evaluate('PLAN[0].items[0][0]')=='Bench'
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 print('PASS: stale writes blocked, conflict recovery backup, offline cache, network retry, substitutions reset loads and preserve routine/snapshots.')
 b.close()
