// ─── RSRC Dashboard — Calendar Page ─────────────────────────────────────────

let currentYear, currentMonth, allEvents = {}, activeFilter = 'all';
let editingEventId = null;
let googleEvents = [];
let gisInited = false, gapiInited = false;
let tokenClient;

const GAPI_CLIENT_ID = '168392677616-hac8fi72088cp6drtf4l2sdeo42nv1d9.apps.googleusercontent.com';
const GCAL_SCOPE     = 'https://www.googleapis.com/auth/calendar.readonly';

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

// ── Helpers ───────────────────────────────────────────────────────────────

// Returns all dates between startDate and endDate inclusive (YYYY-MM-DD strings)
function getDateRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate + 'T00:00:00');
  const end   = new Date((endDate || startDate) + 'T00:00:00');
  const cur   = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ── Firestore listener ────────────────────────────────────────────────────

function loadEvents() {
  db.collection('events').onSnapshot(snapshot => {
    allEvents = {};
    snapshot.forEach(doc => {
      const d = { id: doc.id, ...doc.data() };
      // For multi-day events, register event on every date in the range
      const dates = (d.allDay && d.endDate)
        ? getDateRange(d.date, d.endDate)
        : [d.date];

      dates.forEach(dateKey => {
        if (!allEvents[dateKey]) allEvents[dateKey] = [];
        // Avoid duplicate if already added (same event on same date)
        if (!allEvents[dateKey].find(e => e.id === d.id)) {
          allEvents[dateKey].push(d);
        }
      });
    });
    renderCalendar();
    renderUpcoming();
  });
}

// ── Google Calendar init ──────────────────────────────────────────────────

function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
    });
    gapiInited = true;
    maybeEnableGoogleBtn();
  });
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GAPI_CLIENT_ID,
    scope: GCAL_SCOPE,
    callback: async (resp) => {
      if (resp.error) { showToast('Google auth failed.', 'error'); return; }
      await fetchGoogleEvents();
      updateGoogleBtn(true);
    },
  });
  gisInited = true;
  maybeEnableGoogleBtn();
}

function maybeEnableGoogleBtn() {
  if (gapiInited && gisInited) {
    const btn = document.getElementById('google-sync-btn');
    if (btn) btn.disabled = false;
  }
}

function handleGoogleSignIn() {
  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

function handleGoogleSignOut() {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
  }
  googleEvents = [];
  renderCalendar();
  renderUpcoming();
  updateGoogleBtn(false);
  showToast('Disconnected from Google Calendar.', 'info');
}

function updateGoogleBtn(connected) {
  const btn     = document.getElementById('google-sync-btn');
  const signout = document.getElementById('google-signout-btn');
  const status  = document.getElementById('google-sync-status');
  if (!btn) return;
  if (connected) {
    btn.style.display     = 'none';
    signout.style.display = 'inline-flex';
    if (status) status.style.display = 'flex';
  } else {
    btn.style.display     = 'inline-flex';
    signout.style.display = 'none';
    if (status) status.style.display = 'none';
  }
}

async function fetchGoogleEvents() {
  try {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const end   = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

    const resp = await gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: start, timeMax: end,
      singleEvents: true, orderBy: 'startTime', maxResults: 200,
    });

    googleEvents = (resp.result.items || []).map(ev => {
      const isAllDay = !!ev.start.date;
      const date     = isAllDay ? ev.start.date : ev.start.dateTime?.slice(0,10);
      // Google all-day end date is exclusive, so subtract 1 day
      let endDate = null;
      if (isAllDay && ev.end?.date) {
        const d = new Date(ev.end.date + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        endDate = d.toISOString().slice(0,10);
        if (endDate === date) endDate = null; // single day
      }
      const startT = isAllDay ? null : ev.start.dateTime?.slice(11,16);
      const endT   = isAllDay ? null : ev.end?.dateTime?.slice(11,16);
      return {
        id: 'gcal-' + ev.id, title: ev.summary || '(No title)',
        date, endDate, startTime: startT, endTime: endT,
        allDay: isAllDay, source: 'google', owner: 'gcal'
      };
    }).filter(ev => ev.date);

    renderCalendar();
    renderUpcoming();
    showToast(`Synced ${googleEvents.length} Google Calendar events!`);
  } catch (e) {
    showToast('Failed to fetch Google Calendar events.', 'error');
  }
}

// ── Merge RSRC + Google events for a date ────────────────────────────────

function getAllEventsForDate(dateKey, user) {
  const rsrc = filterEvents(allEvents[dateKey] || [], user);
  const gcal = googleEvents.filter(ev => {
    const dates = getDateRange(ev.date, ev.endDate || ev.date);
    return dates.includes(dateKey);
  });
  return [...rsrc, ...gcal];
}

function getAllUpcomingEvents(user, today) {
  const rsrcDates = Object.entries(allEvents)
    .filter(([d]) => d >= today)
    .flatMap(([dateKey, evs]) => filterEvents(evs, user).map(ev => ({ ...ev, dateKey })));

  // For upcoming, only show start date of multi-day events
  const gcalDates = googleEvents
    .filter(ev => ev.date >= today)
    .map(ev => ({ ...ev, dateKey: ev.date }));

  // Deduplicate RSRC multi-day events (show once at start date)
  const seen = new Set();
  const deduped = rsrcDates.filter(ev => {
    if (seen.has(ev.id)) return false;
    seen.add(ev.id);
    return true;
  });

  return [...deduped, ...gcalDates].sort((a,b) => a.dateKey.localeCompare(b.dateKey));
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

    const events = getAllEventsForDate(dateKey, user);
    if (events.length) {
      const dots = document.createElement('div');
      dots.className = 'event-dots';
      const seen = new Set();

      events.slice(0, 3).forEach(ev => {
        if (seen.has(ev.id)) return;
        seen.add(ev.id);

        const isGcal = ev.source === 'google';
        const color  = isGcal ? '#4285f4' : (MEMBERS[ev.owner] || MEMBERS.master).color;
        const isStart = ev.date === dateKey;

        if (ev.allDay) {
          // Show label only on start date, just color bar on continuation days
          dots.innerHTML += `
            <div class="event-bar" style="background:${color}">
              <span class="event-bar-label">${isStart ? ev.title : '↔ ' + ev.title}</span>
            </div>`;
        } else {
          dots.innerHTML += `
            <div class="event-dot">
              <span class="event-dot-indicator" style="background:${color}"></span>
              <span class="event-dot-label">${ev.title}</span>
            </div>`;
        }
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
  const upcoming = getAllUpcomingEvents(user, today);

  if (!upcoming.length) {
    list.innerHTML = '<p style="font-size:13px;color:#bbb;padding:8px 0">No upcoming events.</p>';
    return;
  }

  list.innerHTML = upcoming.slice(0, 8).map(ev => {
    const isGcal    = ev.source === 'google';
    const color     = isGcal ? '#4285f4' : (MEMBERS[ev.owner] || MEMBERS.master).color;
    const allDayTag = ev.allDay ? '<span style="font-size:11px;background:#edf5eb;color:#2a5c23;padding:1px 6px;border-radius:3px;font-weight:600;margin-left:6px">All day</span>' : '';
    const gcalTag   = isGcal   ? '<span style="font-size:11px;background:#e8f0fe;color:#4285f4;padding:1px 6px;border-radius:3px;font-weight:600;margin-left:6px">Google</span>' : '';
    const dateRange = (ev.allDay && ev.endDate && ev.endDate !== ev.date)
      ? `${formatDate(ev.dateKey)} – ${formatDate(ev.endDate)}`
      : formatDate(ev.dateKey);

    return `
      <div class="upcoming-card">
        <div style="width:3px;border-radius:2px;background:${color};align-self:stretch;flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div class="upcoming-title">${ev.title}${allDayTag}${gcalTag}</div>
          <div class="upcoming-meta">${dateRange}${ev.startTime ? ' · ' + ev.startTime : ''}${ev.location ? ' · ' + ev.location : ''}</div>
        </div>
        ${isGcal ? '<span style="font-size:18px">📅</span>' : memberAvatar(ev.owner || 'master', 7)}
      </div>`;
  }).join('');
}

// ── Day modal ─────────────────────────────────────────────────────────────

function openDayModal(dateKey, day, month) {
  const user   = getCurrentUser();
  const events = getAllEventsForDate(dateKey, user);
  const label  = `${day} ${MONTH_NAMES[month]}`;

  document.getElementById('day-modal-title').textContent = label;

  const list = document.getElementById('day-events-list');
  if (!events.length) {
    list.innerHTML = '<p style="font-size:13px;color:#bbb">No events this day.</p>';
  } else {
    const seen = new Set();
    list.innerHTML = events.map(ev => {
      if (seen.has(ev.id)) return '';
      seen.add(ev.id);

      const isGcal    = ev.source === 'google';
      const color     = isGcal ? '#4285f4' : (MEMBERS[ev.owner] || MEMBERS.master).color;
      const allDayTag = ev.allDay ? '<span style="font-size:11px;background:#edf5eb;color:#2a5c23;padding:1px 6px;border-radius:3px;font-weight:600">All day</span>' : '';
      const gcalTag   = isGcal   ? '<span style="font-size:11px;background:#e8f0fe;color:#4285f4;padding:1px 6px;border-radius:3px;font-weight:600">Google Cal</span>' : '';
      const dateRange = (ev.allDay && ev.endDate && ev.endDate !== ev.date)
        ? `${formatDate(ev.date)} – ${formatDate(ev.endDate)}`
        : '';

      const actions = isGcal ? '' : `
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          <button class="edit-btn" onclick="closeModal('day-modal');openEditEventModal('${ev.id}')" title="Edit">
            <svg style="width:15px;height:15px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button class="delete-btn" onclick="deleteEvent('${ev.id}')">
            <svg style="width:15px;height:15px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>`;

      return `
        <div class="day-event-row">
          <div style="width:3px;border-radius:2px;background:${color};align-self:stretch;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span class="day-event-title">${ev.title}</span>
              ${allDayTag}${gcalTag}
            </div>
            ${dateRange ? `<div class="day-event-meta">${dateRange}</div>` : ''}
            ${ev.startTime ? `<div class="day-event-meta">${ev.startTime}${ev.endTime ? ' – ' + ev.endTime : ''}</div>` : ''}
            ${ev.location ? `<div class="day-event-meta">${ev.location}</div>` : ''}
            ${ev.description ? `<div class="day-event-meta" style="margin-top:4px">${ev.description}</div>` : ''}
          </div>
          ${actions}
        </div>`;
    }).join('');
  }

  document.getElementById('day-add-btn').onclick = () => {
    closeModal('day-modal');
    openCreateEventModal(dateKey);
  };

  document.getElementById('day-modal').classList.remove('hidden');
}

// ── Create / Edit event modals ────────────────────────────────────────────

function openCreateEventModal(dateKey) {
  editingEventId = null;
  document.getElementById('event-modal-title').textContent = 'New Event';
  document.getElementById('ev-title').value    = '';
  document.getElementById('ev-date').value     = dateKey || todayStr();
  document.getElementById('ev-enddate').value  = '';
  document.getElementById('ev-start').value    = '';
  document.getElementById('ev-end').value      = '';
  document.getElementById('ev-location').value = '';
  document.getElementById('ev-desc').value     = '';
  document.getElementById('ev-allday').checked = false;
  toggleAllDay();

  const ownerSel = document.getElementById('ev-owner');
  ownerSel.innerHTML = '<option value="">— Select member —</option>';
  Object.entries(MEMBERS).forEach(([key, m]) => {
    ownerSel.innerHTML += `<option value="${key}">${m.name} — ${m.role}</option>`;
  });
  const user = getCurrentUser();
  if (user) ownerSel.value = user;

  document.getElementById('event-modal').classList.remove('hidden');
}

function openEditEventModal(eventId) {
  let ev = null;
  Object.values(allEvents).forEach(evs => {
    const found = evs.find(e => e.id === eventId);
    if (found) ev = found;
  });
  if (!ev) return;

  editingEventId = eventId;
  document.getElementById('event-modal-title').textContent = 'Edit Event';
  document.getElementById('ev-title').value    = ev.title || '';
  document.getElementById('ev-date').value     = ev.date  || '';
  document.getElementById('ev-enddate').value  = ev.endDate || '';
  document.getElementById('ev-start').value    = ev.startTime || '';
  document.getElementById('ev-end').value      = ev.endTime   || '';
  document.getElementById('ev-location').value = ev.location  || '';
  document.getElementById('ev-desc').value     = ev.description || '';
  document.getElementById('ev-allday').checked = ev.allDay || false;
  toggleAllDay();

  const ownerSel = document.getElementById('ev-owner');
  ownerSel.innerHTML = '<option value="">— Select member —</option>';
  Object.entries(MEMBERS).forEach(([key, m]) => {
    ownerSel.innerHTML += `<option value="${key}">${m.name} — ${m.role}</option>`;
  });
  ownerSel.value = ev.owner || '';

  document.getElementById('event-modal').classList.remove('hidden');
}

function toggleAllDay() {
  const isAllDay = document.getElementById('ev-allday').checked;
  document.getElementById('ev-time-fields').style.display  = isAllDay ? 'none' : 'grid';
  document.getElementById('ev-enddate-row').style.display  = isAllDay ? 'block' : 'none';
}

function saveEvent() {
  const title = document.getElementById('ev-title').value.trim();
  const date  = document.getElementById('ev-date').value;
  if (!title || !date) { showToast('Title and date are required.', 'error'); return; }

  const allDay  = document.getElementById('ev-allday').checked;
  const endDate = document.getElementById('ev-enddate').value || null;

  // Validate end date is not before start date
  if (allDay && endDate && endDate < date) {
    showToast('End date cannot be before start date.', 'error'); return;
  }

  const eventData = {
    title, date, allDay,
    endDate:     allDay ? (endDate || null) : null,
    startTime:   allDay ? null : (document.getElementById('ev-start').value || null),
    endTime:     allDay ? null : (document.getElementById('ev-end').value   || null),
    location:    document.getElementById('ev-location').value.trim() || null,
    description: document.getElementById('ev-desc').value.trim()     || null,
    owner:       document.getElementById('ev-owner').value           || 'master',
  };

  if (editingEventId) {
    db.collection('events').doc(editingEventId).update(eventData).then(() => {
      closeModal('event-modal');
      showToast('Event updated!');
    }).catch(() => showToast('Failed to update event.', 'error'));
  } else {
    eventData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection('events').add(eventData).then(() => {
      closeModal('event-modal');
      showToast('Event saved!');
    }).catch(() => showToast('Failed to save event.', 'error'));
  }
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
  renderCalendar(); renderUpcoming();
}

function nextMonth() {
  currentMonth++;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  renderCalendar(); renderUpcoming();
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
    renderCalendar(); renderUpcoming();
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