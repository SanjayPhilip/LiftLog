"""Weekly swaps with mocked account data; no real account writes."""
import json
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

mock = Path('tests/sessions_browser.py').read_text().split("MOCK='''",1)[1].split("'''",1)[0]
fixture={'plan':[{'name':name,'items':[['Exercise '+name,2,'8–10']]} for name in ['Chest + Triceps','Back Width + Biceps','Legs + Abs','Shoulders + Arms','Back Thickness + Chest']], 'sessions':[], 'drafts':{'2026-11-19|2':{'sets':{},'done':{},'ranges':{},'notes':'Leg draft'}},'day':2}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':1000},service_workers='block',has_touch=True,timezone_id='UTC')
    context.add_init_script('window.fixture='+json.dumps(fixture))
    page=context.new_page(); errors=[]
    page.clock.set_fixed_time(datetime(2026,11,19,12,tzinfo=timezone.utc))
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.route('**/supabase.min.js',lambda route:route.fulfill(body=mock,content_type='application/javascript'))
    page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
    page.goto('http://127.0.0.1:4173');expect(page.locator('#authGate')).to_be_hidden()
    tile=lambda i:page.locator(f'[data-schedule-day="{i}"]')
    # The grip itself does not open the workout when tapped.
    tile(2).locator('.schedule-grip').tap()
    expect(page.locator('#dashboard')).to_be_visible()
    # Direct card handles work without entering swap mode.
    page.evaluate("window.dashboardHero = document.querySelector('.hero')")
    # Actual pointer drag from Wednesday legs to Thursday rest.
    tile(2).scroll_into_view_if_needed()
    a=tile(2).locator('.schedule-grip').bounding_box(); b=tile(3).bounding_box()
    page.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2);page.mouse.down()
    page.mouse.move(b['x']+30,b['y']+30,steps=15);page.mouse.up()
    expect(tile(3)).to_contain_text('Legs');expect(tile(2)).to_contain_text('Recovery')
    expect(page.locator('#scheduleStatus')).to_contain_text('Wednesday and Thursday swapped')
    assert page.evaluate("state.drafts['2026-11-19|2'].notes")=='Leg draft'
    assert page.evaluate('PLAN[2].name')=='Legs + Abs'
    assert page.evaluate("document.querySelector('.hero') === window.dashboardHero")
    page.locator('[data-tab="progressPage"]').click()
    planned = page.locator('#weeklySummary .progress-schedule li')
    expect(planned.nth(2)).to_have_text('WednesdayRecovery')
    expect(planned.nth(3)).to_have_text('ThursdayLegs + Abs')
    page.wait_for_function('window.savedPayload?.weekSchedules')
    page.evaluate("localStorage.setItem('testFixture',JSON.stringify(window.savedPayload))")
    page.reload();expect(page.locator('#authGate')).to_be_hidden()
    expect(tile(3)).to_contain_text('Legs');expect(tile(2)).to_contain_text('Recovery')
    page.locator('[data-tab="progressPage"]').click()
    expect(planned.nth(3)).to_have_text('ThursdayLegs + Abs')
    page.locator('[data-tab="dashboard"]').click()
    tile(3).click();assert page.evaluate('state.day')==2
    expect(page.locator('#workout h2')).to_contain_text('Legs + Abs')
    expect(page.locator('#workout textarea')).to_have_value('Leg draft')
    page.evaluate("switchTab('dashboard')")
    page.set_viewport_size({'width':390,'height':844})
    # Tap and keyboard fallback, including rest as the source, on mobile.
    page.get_by_role('button',name='Swap days',exact=True).click()
    tile(2).scroll_into_view_if_needed()
    tile(2).tap()
    expect(tile(2)).to_have_attribute('aria-pressed', 'true')
    tile(3).tap()
    expect(tile(2)).to_contain_text('Legs');expect(tile(3)).to_contain_text('Recovery')
    tile(0).focus();page.keyboard.press('Enter');tile(1).focus();page.keyboard.press('Enter')
    expect(tile(0)).to_contain_text('Back Width + Biceps');expect(tile(1)).to_contain_text('Chest + Triceps')
    expect(tile(1)).to_be_focused()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    # Drag from the body of a card with a real touch pointer.
    tile(0).scroll_into_view_if_needed()
    a = tile(0).bounding_box()
    b = tile(1).bounding_box()
    cdp = context.new_cdp_session(page)
    x, y = a['x'] + a['width']/2, a['y'] + a['height']/2
    dx = b['x'] + b['width']/2 - x
    cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    for step in range(1, 9):
        cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x+dx*step/8,'y':y}]})
    cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
    expect(tile(0)).to_contain_text('Chest + Triceps')
    expect(tile(1)).to_contain_text('Back Width + Biceps')
    # A changed plan invalidates the saved layout, and next Monday gets the default split.
    assert page.evaluate("(()=>{const name=PLAN[2].name;PLAN[2].name='New legs';const days=weeklySchedule();PLAN[2].name=name;return days})()") == [0,1,2,-1,3,4,-1]
    page.clock.set_fixed_time(datetime(2026,11,23,12,tzinfo=timezone.utc))
    page.get_by_role('button',name='Done swapping',exact=True).tap()
    expect(tile(0)).to_contain_text('Chest + Triceps')
    expect(tile(1)).to_contain_text('Back Width + Biceps')
    expect(tile(2)).to_contain_text('Legs + Abs')
    expect(tile(3)).to_contain_text('Recovery')
    assert not errors, errors
    browser.close()
print('Schedule drag, taps, keyboard, persistence, isolation and week reset passed')
