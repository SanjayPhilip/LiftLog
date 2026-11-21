/* Calendar assignments keep the plan indexes used by drafts and workout history. */
const scheduleWeekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let swappingDays = false;
let swapSource = null;
let scheduleNotice = '';
let scheduleIgnoreClick = false;

function weeklySchedule(week = weekStart(localDateKey())) {
  const base = [0, 1, 2, -1, 3, 4, -1].map(day => day < PLAN.length ? day : -1);
  const saved = state.weekSchedules?.[week];
  const days = saved?.days;
  if (saved?.plan === JSON.stringify(PLAN) && Array.isArray(days) && days.length === base.length &&
      days.every(Number.isInteger) && [...days].sort().join() === [...base].sort().join()) {
    return [...days];
  }
  return base;
}

function progressScheduleHTML(week) {
  const currentWeek = week === weekStart(localDateKey());
  if (!currentWeek && !state.weekSchedules?.[week]) return '';
  const days = weeklySchedule(week);
  return `<h3>Planned schedule</h3><ul class="progress-schedule">${days.map((day, index) =>
    `<li><strong>${scheduleWeekdays[index]}</strong><span>${day < 0 ? 'Recovery' : esc(PLAN[day].name)}</span></li>`
  ).join('')}</ul>`;
}

function scheduleTilesHTML() {
  const today = (new Date().getDay() + 6) % 7;
  return weeklySchedule().map((workoutId, weekday) => {
    const rest = workoutId < 0;
    const day = PLAN[workoutId];
    const chosen = workoutId === state.day;
    return `<button type="button" class="schedule-tile ${rest ? 'rest-tile' : ''} ${chosen ? 'chosen' : ''} ${weekday === today ? 'today-tile' : ''}"
      data-schedule-day="${weekday}" ${rest && !swappingDays ? 'aria-disabled="true" tabindex="-1"' : ''}
      aria-label="${scheduleWeekdays[weekday]}, ${esc(rest ? 'Recovery, rest day' : day.name)}"
      onclick="scheduleClick(${weekday})">
      <span class="schedule-weekday">${scheduleWeekdays[weekday].slice(0, 3).toUpperCase()} ${weekday === today ? '<i>NOW</i>' : ''}</span>
      <span class="schedule-grip" aria-hidden="true">⠿</span>
      <span class="schedule-number">${rest ? '✳' : String(workoutId + 1).padStart(2, '0')}</span>
      <span class="schedule-name">${rest ? 'Recovery' : esc(day.name)}</span>
      <span class="schedule-meta">${rest ? 'REST DAY' : `${day.items.length} EXERCISES`}</span>
      <span class="schedule-arrow" aria-hidden="true">${swappingDays ? '↔' : rest ? '—' : '↗'}</span>
    </button>`;
  }).join('');
}

function scheduleHTML() {
  return `<div id="weeklySchedule"><div class="section-head elevated schedule-heading">
    <div><div class="eyebrow">WEEKLY SPLIT</div><h2>Your schedule<span class="wordmark-dot">.</span></h2></div>
    <button type="button" id="scheduleSwap" class="btn secondary" aria-pressed="${swappingDays}" onclick="toggleDaySwap()">${swappingDays ? 'Done swapping' : 'Swap days'}</button>
  </div>
  <p class="schedule-intro" id="scheduleStatus" role="status">${scheduleNotice || (swappingDays ? 'Drag a card onto another day, or tap two cards to swap.' : 'Drag a card to swap days, or tap a training day to open its workout.')}</p>
  <div class="schedule-grid ${swappingDays ? 'swapping-days' : ''}">${scheduleTilesHTML()}</div>
  <button type="button" class="text-action" onclick="switchTab('profile');openPlanEditor()">Customize plan ↗</button></div>`;
}

function toggleDaySwap() {
  swappingDays = !swappingDays;
  swapSource = null;
  scheduleNotice = '';
  const schedule = $('weeklySchedule');
  schedule.outerHTML = scheduleHTML();
  bindScheduleDrag();
  $('scheduleSwap').focus({preventScroll: true});
}

function paintSwapSource() {
  document.querySelectorAll('[data-schedule-day]').forEach(tile => {
    const selected = Number(tile.dataset.scheduleDay) === swapSource;
    tile.classList.toggle('swap-source', selected);
    if (swappingDays) tile.setAttribute('aria-pressed', String(selected));
  });
}

function swapScheduleDays(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 ||
      from >= scheduleWeekdays.length || to >= scheduleWeekdays.length || from === to) return;
  const week = weekStart(localDateKey());
  const days = weeklySchedule(week);
  swapSource = null;
  if (days[from] === days[to]) {
    scheduleNotice = 'Both days are rest days. Choose a training day to swap.';
    paintSwapSource();
    $('scheduleStatus').textContent = scheduleNotice;
  } else {
    [days[from], days[to]] = [days[to], days[from]];
    state.weekSchedules = {...state.weekSchedules, [week]: {plan: JSON.stringify(PLAN), days}};
    scheduleNotice = `${scheduleWeekdays[from]} and ${scheduleWeekdays[to]} swapped for this week.`;
    $('weeklySchedule').querySelector('.schedule-grid').innerHTML = scheduleTilesHTML();
    $('scheduleStatus').textContent = scheduleNotice;
    bindScheduleDrag();
    save();
  }
  if (swappingDays) document.querySelector(`[data-schedule-day="${to}"]`).focus({preventScroll: true});
}

function scheduleClick(index) {
  if (scheduleIgnoreClick) return;
  if (swappingDays) {
    if (swapSource !== null && swapSource !== index) {
      swapScheduleDays(swapSource, index);
      return;
    }
    swapSource = swapSource === index ? null : index;
    scheduleNotice = swapSource === null ? 'Choose two days to swap for this week.' :
      `${scheduleWeekdays[index]} selected. Choose another day to swap.`;
    paintSwapSource();
    $('scheduleStatus').textContent = scheduleNotice;
    return;
  }
  const day = weeklySchedule()[index];
  if (day < 0) return;
  changeDay(day);
  switchTab('workout');
}

function bindScheduleDrag() {
  paintSwapSource();
  const tiles = document.querySelectorAll('[data-schedule-day]');
  const targetAt = event => document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-schedule-day]');
  tiles.forEach(tile => {
    let drag = null;
    let target = null;
    let frame = null;
    const clearDrag = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      drag = null;
      target?.classList.remove('swap-target');
      target = null;
      paintSwapSource();
    };
    tile.querySelector('.schedule-grip').addEventListener('click', event => {
      if (!swappingDays) event.stopPropagation();
    });
    tile.addEventListener('pointerdown', event => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY, moved: false};
      if (event.pointerType === 'touch') tile.setPointerCapture(event.pointerId);
    });
    tile.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 8) return;
        drag.moved = true;
        tile.classList.add('swap-source');
        if (!tile.hasPointerCapture(event.pointerId)) tile.setPointerCapture(event.pointerId);
      }
      drag.event = event;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const hovered = targetAt(drag.event);
        const next = hovered === tile ? null : hovered;
        if (next === target) return;
        target?.classList.remove('swap-target');
        next?.classList.add('swap-target');
        target = next;
      });
    });
    tile.addEventListener('pointerup', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const moved = drag.moved;
      const dropTarget = moved ? targetAt(event) : null;
      clearDrag();
      if (!moved) return;
      scheduleIgnoreClick = true;
      setTimeout(() => { scheduleIgnoreClick = false; }, 0);
      if (dropTarget && dropTarget !== tile) {
        swapScheduleDays(Number(tile.dataset.scheduleDay), Number(dropTarget.dataset.scheduleDay));
      }
    });
    tile.addEventListener('pointerleave', event => {
      if (drag && event.pointerType === 'mouse' && !drag.moved) drag = null;
    });
    tile.addEventListener('lostpointercapture', event => {
      if (drag?.id === event.pointerId) clearDrag();
    });
    tile.addEventListener('pointercancel', event => {
      if (drag?.id === event.pointerId) clearDrag();
    });
  });
}
