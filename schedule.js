/* Calendar assignments keep the plan indexes used by drafts and workout history. */
const scheduleWeekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let swappingDays = false;
let swapSource = null;
let scheduleNotice = '';


function weeklySchedule(week = weekStart(localDateKey())) {
  const base = [0, 1, 2, -1, 3, 4, -1].map(day => day < PLAN.length ? day : -1);
  const saved = state.weekSchedules?.[week];
  const days = saved?.days;
  let names = saved?.names;
  if (!names && typeof saved?.plan === 'string') {
    try {
      names = JSON.parse(saved.plan).map(day => day.name);
    } catch {
      // An unreadable legacy schedule falls back to the default order.
    }
  }
  const sameSplit = Array.isArray(names) && names.length === PLAN.length &&
    names.every((name, index) => name === PLAN[index].name);
  if (sameSplit && Array.isArray(days) && days.length === base.length &&
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
      data-schedule-day="${weekday}" ${swappingDays ? 'aria-pressed="false"' : rest ? 'tabindex="-1"' : ''}
      aria-label="${scheduleWeekdays[weekday]}, ${esc(rest ? 'Recovery, rest day' : day.name)}"
      onclick="scheduleClick(${weekday})">
      <span class="schedule-weekday">${scheduleWeekdays[weekday].slice(0, 3).toUpperCase()} ${weekday === today ? '<i>Today</i>' : ''}</span>
      <span class="schedule-grip" aria-hidden="true">⠿</span>
      <span class="schedule-name">${rest ? 'Recovery' : esc(day.name)}</span>
      <span class="schedule-meta">${rest ? 'Rest day' : `${day.items.length} exercises`}</span>
    </button>`;
  }).join('');
}

function scheduleHTML() {
  return `<div id="weeklySchedule"><div class="section-head elevated schedule-heading">
    <h2>Weekly schedule</h2>
    <button type="button" id="scheduleSwap" class="btn secondary" aria-pressed="${swappingDays}" onclick="toggleDaySwap()">${swappingDays ? 'Done swapping' : 'Swap days'}</button>
  </div>
  <p class="schedule-intro" id="scheduleStatus" role="status">${scheduleNotice || (swappingDays ? 'Drag a card onto another day, or tap two cards to swap.' : 'Drag a handle to swap days, or tap a training day to open its workout.')}</p>
  <div class="schedule-grid ${swappingDays ? 'swapping-days' : ''}">${scheduleTilesHTML()}</div>
  <button type="button" class="text-action" onclick="switchTab('profile');openPlanEditor()">Edit workout plan</button></div>`;
}

function toggleDaySwap() {
  swappingDays = !swappingDays;
  swapSource = null;
  scheduleNotice = '';
  const toggle = $('scheduleSwap');
  toggle.textContent = swappingDays ? 'Done swapping' : 'Swap days';
  toggle.setAttribute('aria-pressed', String(swappingDays));
  const grid = $('weeklySchedule').querySelector('.schedule-grid');
  grid.classList.toggle('swapping-days', swappingDays);
  grid.innerHTML = scheduleTilesHTML();
  $('scheduleStatus').textContent = swappingDays ? 'Drag a card onto another day, or tap two cards to swap.' :
    'Drag a handle to swap days, or tap a training day to open its workout.';
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
    state.weekSchedules = {...state.weekSchedules, [week]: {names: PLAN.map(day => day.name), days}};
    scheduleNotice = `${scheduleWeekdays[from]} and ${scheduleWeekdays[to]} swapped for this week.`;
    $('weeklySchedule').querySelector('.schedule-grid').innerHTML = scheduleTilesHTML();
    $('scheduleStatus').textContent = scheduleNotice;
    summaryWeek = week;
    save();
  }
  if (swappingDays) document.querySelector(`[data-schedule-day="${to}"]`).focus({preventScroll: true});
}

function scheduleClick(index) {
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
  const grid = $('weeklySchedule').querySelector('.schedule-grid');
  let drag = null;
  let ignoreClick = false;

  function dropTarget(x, y) {
    const tile = document.elementFromPoint(x, y)?.closest('[data-schedule-day]');
    return tile?.parentElement === grid && tile !== drag.tile ? tile : null;
  }

  function clearDrag() {
    if (drag.frame !== null) cancelAnimationFrame(drag.frame);
    drag.ghost?.remove();
    drag.tile.classList.remove('drag-origin');
    drag.target?.classList.remove('swap-target');
    drag = null;
  }

  grid.addEventListener('click', event => {
    if (ignoreClick || (!swappingDays && event.target.closest('.schedule-grip'))) {
      event.stopPropagation();
    }
  }, true);

  grid.addEventListener('pointerdown', event => {
    const tile = event.target.closest('[data-schedule-day]');
    if (!tile || drag || !event.isPrimary || event.button !== 0 ||
        (!swappingDays && !event.target.closest('.schedule-grip'))) return;
    drag = {tile, id: event.pointerId, startX: event.clientX, startY: event.clientY, frame: null};
    grid.setPointerCapture(event.pointerId);
  });

  grid.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.ghost) {
      if (Math.hypot(dx, dy) < 6) return;
      const bounds = drag.tile.getBoundingClientRect();
      const ghost = drag.tile.cloneNode(true);
      ghost.removeAttribute('data-schedule-day');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.tabIndex = -1;
      ghost.classList.add('schedule-ghost');
      Object.assign(ghost.style, {
        left: bounds.left + 'px', top: bounds.top + 'px',
        width: bounds.width + 'px', height: bounds.height + 'px'
      });
      document.body.append(ghost);
      drag.ghost = ghost;
      drag.tile.classList.add('drag-origin');
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.frame !== null) return;
    drag.frame = requestAnimationFrame(() => {
      drag.frame = null;
      drag.ghost.style.transform =
        `translate3d(${drag.x - drag.startX}px, ${drag.y - drag.startY}px, 0)`;
      const target = dropTarget(drag.x, drag.y);
      if (target === drag.target) return;
      drag.target?.classList.remove('swap-target');
      target?.classList.add('swap-target');
      drag.target = target;
    });
  });

  grid.addEventListener('pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    const source = drag.tile;
    const moved = Boolean(drag.ghost);
    const target = moved ? dropTarget(event.clientX, event.clientY) : null;
    clearDrag();
    ignoreClick = true;
    setTimeout(() => { ignoreClick = false; }, 0);
    if (target) {
      swapScheduleDays(Number(source.dataset.scheduleDay), Number(target.dataset.scheduleDay));
    } else if (!moved && swappingDays && source.contains(document.elementFromPoint(event.clientX, event.clientY))) {
      scheduleClick(Number(source.dataset.scheduleDay));
    }
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    grid.addEventListener(type, event => {
      if (drag?.id === event.pointerId) clearDrag();
    });
  }
}
