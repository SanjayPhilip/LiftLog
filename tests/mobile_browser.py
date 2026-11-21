"""Mobile regression checks. Serve a temporary copy with a local mock identity provider."""
import functools
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
fixture = {
    'profile': {'name': 'Test', 'height': 180, 'weight': 80, 'sleep': 8},
    'plan': [{'name': 'Push', 'items': [['Bench Press', 2, '8–10']]}],
    'sessions': [{'id': 'old', 'day': 0, 'date': '2020-01-01',
                  'sets': {'0': [{'weight': '40', 'reps': '8'}]}}],
    'drafts': {}, 'body': [], 'day': 0,
}
mock = """
window.supabase={createClient(){return {
  auth:{async getSession(){return {data:{session:{user:{id:'test-user'}}}}},onAuthStateChange(){}},
  from(){return {select(){return {eq(){return {async maybeSingle(){return {data:{payload:JSON.parse(localStorage.remote)}}}}}}}}},
  async rpc(name,{expected_payload,next_payload}){
    if(JSON.stringify(expected_payload)!==localStorage.remote)return {data:{saved:false}};
    localStorage.remote=JSON.stringify(next_payload);return {data:{saved:true}};
  }
}}};
"""
with tempfile.TemporaryDirectory() as directory, sync_playwright() as playwright:
    root = Path(directory)
    for source in ROOT.iterdir():
        if source.is_file() and source.suffix in {'.html','.css','.js','.webmanifest','.svg'}:
            shutil.copy(source, root / source.name)
    shutil.copytree(ROOT / 'icons', root / 'icons')
    for name in ['index.html','sw.js']:
        file = root / name
        file.write_text(file.read_text().replace(SDK,'/sdk-fixture.js'))
    (root / 'sdk-fixture.js').write_text(mock)
    server = ThreadingHTTPServer(('127.0.0.1',0), functools.partial(SimpleHTTPRequestHandler,directory=directory))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None)
    context = browser.new_context(viewport={'width':360,'height':800},has_touch=True,is_mobile=True)
    context.add_init_script('localStorage.remote ||= '+json.dumps(json.dumps(fixture, separators=(',',':'))))
    page = context.new_page()
    errors = []
    page.on('pageerror',lambda err: errors.append(str(err)))
    page.goto('http://127.0.0.1:'+str(server.server_port))
    expect(page.locator('#authGate')).to_be_hidden()
    page.wait_for_function('!!navigator.serviceWorker.controller')
    page.locator('[data-tab="workout"]').click()
    weight = page.get_by_role('spinbutton',name='Set 1 weight for Bench Press',exact=True)
    expect(weight).to_have_value('40')
    page.locator('.unit-picker select').select_option('lb')
    expect(weight).to_have_value('88.18')
    context.set_offline(True)
    weight.fill('100')
    page.locator('#completeSet-0-0').click()
    expect(page.locator('#quickUndo')).to_be_enabled()
    deadline = page.evaluate('timerEnd')
    page.reload()
    expect(page.locator('#workout')).to_be_visible()
    expect(weight).to_have_value('100')
    assert page.evaluate('timerEnd') == deadline
    assert abs(page.evaluate('Number(draft().sets[0][0].weight)')-45.359237)<0.00001
    page.locator('#quickUndo').click()
    expect(page.locator('#completeSet-0-0')).to_have_text('Done')
    page.locator('#completeSet-0-0').click()
    page.locator('.logger-bar button',has_text='Finish workout').click()
    expect(page.locator('#weeklySummary:visible')).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    context.set_offline(False)
    page.wait_for_function("JSON.parse(localStorage.remote).sessions.length===2")
    assert not errors, errors
    browser.close()
    server.shutdown()
print('Mobile logging, offline reload, timer, units, undo, finish and reconnection passed')
