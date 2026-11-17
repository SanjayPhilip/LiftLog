"""Weekly swaps with mocked account data; no real account writes."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

mock = Path('tests/sessions_browser.py').read_text().split("MOCK='''",1)[1].split("'''",1)[0]
fixture={'plan':[{'name':name,'items':[['Exercise '+name,2,'8–10']]} for name in ['Push','Pull','Legs','Shoulders','Arms']], 'sessions':[], 'drafts':{'2026-11-17|2':{'sets':{},'done':{},'ranges':{},'notes':'Leg draft'}},'day':2}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':1000},service_workers='block')
    context.add_init_script('window.fixture='+json.dumps(fixture))
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.route('**/supabase.min.js',lambda route:route.fulfill(body=mock,content_type='application/javascript'))
    page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
    page.goto('http://127.0.0.1:4173');expect(page.locator('#authGate')).to_be_hidden()
    tile=lambda i:page.locator(f'[data-schedule-day="{i}"]')
    # Direct card handles work without entering swap mode.
    # Actual pointer drag from Wednesday legs to Thursday rest.
    tile(2).scroll_into_view_if_needed()
    a=tile(2).locator('.schedule-grip').bounding_box(); b=tile(3).bounding_box()
    page.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2);page.mouse.down()
    page.mouse.move(b['x']+30,b['y']+30,steps=15);page.mouse.up()
    expect(tile(3)).to_contain_text('Legs');expect(tile(2)).to_contain_text('Recovery')
    expect(page.locator('#scheduleStatus')).to_contain_text('Wednesday and Thursday swapped')
    assert page.evaluate("state.drafts['2026-11-17|2'].notes")=='Leg draft'
    assert page.evaluate('PLAN[2].name')=='Legs'
    page.wait_for_function('window.savedPayload?.weekSchedules')
    page.evaluate("localStorage.setItem('testFixture',JSON.stringify(window.savedPayload))")
    page.reload();expect(page.locator('#authGate')).to_be_hidden()
    expect(tile(3)).to_contain_text('Legs');expect(tile(2)).to_contain_text('Recovery')
    tile(3).click();assert page.evaluate('state.day')==2
    page.evaluate("switchTab('dashboard')")
    # Tap and keyboard fallback, including rest as the source, on mobile.
    page.set_viewport_size({'width':390,'height':844})
    page.get_by_role('button',name='Swap days',exact=True).click()
    tile(2).click();tile(3).click()
    expect(tile(2)).to_contain_text('Legs');expect(tile(3)).to_contain_text('Recovery')
    tile(0).focus();page.keyboard.press('Enter');tile(1).focus();page.keyboard.press('Enter')
    expect(tile(0)).to_contain_text('Pull');expect(tile(1)).to_contain_text('Push')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    # A different week and a changed plan both return to the default split.
    assert page.evaluate("(()=>{const key=weekStart(localDateKey());state.weekSchedules['2000-01-03']=state.weekSchedules[key];delete state.weekSchedules[key];return weeklySchedule()})()") == [0,1,2,-1,3,4,-1]
    page.evaluate("swapScheduleDays(2,3);PLAN[2].name='New legs'")
    assert page.evaluate('weeklySchedule()')==[0,1,2,-1,3,4,-1]
    assert not errors, errors
    browser.close()
print('Schedule drag, taps, keyboard, persistence, isolation and week reset passed')
