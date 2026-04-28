// ─── RSRC Dashboard — Calendar Page ─────────────────────────────────────────

let currentYear, currentMonth, allEvents = {}, activeFilter = 'all';

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

// ── Firestore listener ────────────────────────────────────────────────────

function loadEvents() {
  db.collection('events').onSnapshot(snapshot => {
    allEvents = {};
    snapshot.forEach(doc => {
      const d = { id: doc.id, ...doc.data() };
      if (!allEvents[d.date]) allEvents[d.date] = [];
      allEvents[d.date].push(d);
    });
    renderCalendar();
    renderUpcoming();
  });
}

// ── Calendar rendering ────────────────────────────────────────────────────

function renderCalendar() {
  const user = getCurrentUser();
  document.getElementById('month-label').textContent =
    `${MONTH_NAMES[currentMonth]} ${currentYear}`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  DAY_NAMES.forEach(d => {
    const cell = document.createElement('div');
    cell.className = 'cal-header-cell';
    cell.textContent = d;
    grid.appendChild(cell);
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const offset   = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth     = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
  const today = todayStr();
  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day-cell';

    let day, month, year, dateKey, isOther = false;

    if (i < offset) {
      day = daysInPrevMonth - offset + i + 1;
      month = currentMonth === 0 ? 11 : currentMonth - 1;
      year  = currentMonth === 0 ? currentYear - 1 : currentYear;
      isOther = true;
    } else if (i >= offset + daysInMonth) {
      day = i - offset - daysInMonth + 1;
      month = currentMonth === 11 ? 0 : currentMonth + 1;
      year  = currentMonth === 11 ? currentYear + 1 : currentYear;
      isOther = true;
    } else {
      day = i - offset + 1;
      month = currentMonth;
      year  = currentYear;
    }

    dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if (isOther) cell.classList.add('other-month');
    if (dateKey === today) cell.classList.add('today');

    const numEl = document.createElement('div');
    numEl.className = 'day-num';
    numEl.textContent = day;
    cell.appendChild(numEl);

    const events = filterEvents(allEvents[dateKey] || [], user);
    if (events.length) {
      const dots = document.createElement('div');
      dots.className = 'event-dots';
      events.slice(0, 3).forEach(ev => {
        const m = MEMBERS[ev.owner] || MEMBERS.master;
        dots.innerHTML += `
          <div class="event-dot">
            <span class="event-dot-indicator" style="background:${m.color}"></span>
            <span class="event-dot-label">${ev.title}</span>
          </div>`;
      });
      if (events.length > 3) {
        dots.innerHTML += `<div class="event-dot"><span class="event-dot-label" style="color:#bbb">+${events.length - 3} more</span></div>`;
      }
      cell.appendChild(dots);
    }

    cell.addEventListener('click', () => openDayModal(dateKey, day, month));
    grid.appendChild(cell);
  }
}

function filterEvents(events, user) {
  if (activeFilter === 'mine')   return events.filter(e => e.owner === user || e.owner === 'master');
  if (activeFilter === 'master') return events.filter(e => e.owner === 'master');
  return events;
}

// ── Upcoming strip ────────────────────────────────────────────────────────

function renderUpcoming() {
  const user  = getCurrentUser();
  const today = todayStr();
  const list  = document.getElementById('upcoming-list');

  const upcoming = [];
  Object.entries(allEvents).forEach(([dateKey, evs]) => {
    if (dateKey >= today) {
      filterEvents(evs, user).forEach(ev => upcoming.push({ ...ev, dateKey }));
    }
  });
  upcoming.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  if (!upcoming.length) {
    list.innerHTML = '<p style="font-size:13px;color:#bbb;padding:8px 0">No upcoming events.</p>';
    return;
  }

  list.innerHTML = upcoming.slice(0, 6).map(ev => {
    const m = MEMBERS[ev.owner] || MEMBERS.master;
    return `
      <div class="upcoming-card">
        <div style="width:3px;border-radius:2px;background:${m.color};align-self:stretch;flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div class="upcoming-title">${ev.title}</div>
          <div class="upcoming-meta">${formatDate(ev.dateKey)}${ev.startTime ? ' · ' + ev.startTime : ''}${ev.location ? ' · ' + ev.location : ''}</div>
        </div>
        ${memberAvatar(ev.owner || 'master', 7)}
      </div>`;
  }).join('');
}

// ── Day modal ─────────────────────────────────────────────────────────────

function openDayModal(dateKey, day, month) {
  const user   = getCurrentUser();
  const events = filterEvents(allEvents[dateKey] || [], user);
  const label  = `${day} ${MONTH_NAMES[month]}`;

  document.getElementById('day-modal-title').textContent = label;

  const list = document.getElementById('day-events-list');
  if (!events.length) {
    list.innerHTML = '<p style="font-size:13px;color:#bbb">No events this day.</p>';
  } else {
    list.innerHTML = events.map(ev => {
      const m = MEMBERS[ev.owner] || MEMBERS.master;
      return `
        <div class="day-event-row">
          <div style="width:3px;border-radius:2px;background:${m.color};align-self:stretch;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div class="day-event-title">${ev.title}</div>
            ${ev.startTime ? `<div class="day-event-meta">${ev.startTime}${ev.endTime ? ' – ' + ev.endTime : ''}</div>` : ''}
            ${ev.location ? `<div class="day-event-meta">${ev.location}</div>` : ''}
            ${ev.description ? `<div class="day-event-meta" style="margin-top:4px">${ev.description}</div>` : ''}
          </div>
          <button class="delete-btn" onclick="deleteEvent('${ev.id}')">
            <svg style="width:15px;height:15px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>`;
    }).join('');
  }

  document.getElementById('day-add-btn').onclick = () => {
    closeModal('day-modal');
    openCreateEventModal(dateKey);
  };

  document.getElementById('day-modal').classList.remove('hidden');
}

// ── Create event modal ────────────────────────────────────────────────────

function openCreateEventModal(dateKey) {
  document.getElementById('ev-title').value    = '';
  document.getElementById('ev-date').value     = dateKey || todayStr();
  document.getElementById('ev-start').value    = '';
  document.getElementById('ev-end').value      = '';
  document.getElementById('ev-location').value = '';
  document.getElementById('ev-desc').value     = '';

  const ownerSel = document.getElementById('ev-owner');
  ownerSel.innerHTML = '<option value="">— Select member —</option>';
  Object.entries(MEMBERS).forEach(([key, m]) => {
    ownerSel.innerHTML += `<option value="${key}">${m.name} — ${m.role}</option>`;
  });
  const user = getCurrentUser();
  if (user) ownerSel.value = user;

  document.getElementById('event-modal').classList.remove('hidden');
}

function saveEvent() {
  const title = document.getElementById('ev-title').value.trim();
  const date  = document.getElementById('ev-date').value;
  if (!title || !date) { showToast('Title and date are required.', 'error'); return; }

  const event = {
    title,
    date,
    startTime:   document.getElementById('ev-start').value    || null,
    endTime:     document.getElementById('ev-end').value      || null,
    location:    document.getElementById('ev-location').value.trim() || null,
    description: document.getElementById('ev-desc').value.trim()     || null,
    owner:       document.getElementById('ev-owner').value    || 'master',
    createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
  };

  db.collection('events').add(event).then(() => {
    closeModal('event-modal');
    showToast('Event saved!');
  }).catch(() => showToast('Failed to save event.', 'error'));
}

function deleteEvent(id) {
  confirmAction('Delete this event?', () => {
    db.collection('events').doc(id).delete().then(() => {
      closeModal('day-modal');
      showToast('Event deleted.', 'info');
    });
  });
}

// ── Month navigation ──────────────────────────────────────────────────────

function prevMonth() {
  currentMonth--;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderCalendar();
  renderUpcoming();
}

function nextMonth() {
  currentMonth++;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  renderCalendar();
  renderUpcoming();
}

// ── Overlay close ─────────────────────────────────────────────────────────

['day-modal','event-modal'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', e => {
    if (e.target === document.getElementById(id)) closeModal(id);
  });
});

// ── Filter buttons ────────────────────────────────────────────────────────

document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderCalendar();
    renderUpcoming();
  });
});

// ── Init ──────────────────────────────────────────────────────────────────

(function init() {
  const now    = new Date();
  currentYear  = now.getFullYear();
  currentMonth = now.getMonth();
  initApp('calendar');
  loadEvents();
})();