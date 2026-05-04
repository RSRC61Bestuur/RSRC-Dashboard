// ─── RSRC Dashboard — Calendar Page ─────────────────────────────────────────

let currentYear, currentMonth;
let allEvents    = {};
let vacations    = {};
let sharedGcal   = {};  // { memberKey: [events] } saved in Firebase
let activeFilter = 'all';
let currentView  = 'board';
let editingEventId = null;

// Google Calendar state
let googleEvents = [];
let gisInited = false, gapiInited = false;
let tokenClient;
const GAPI_CLIENT_ID     = '168392677616-hac8fi72088cp6drtf4l2sdeo42nv1d9.apps.googleusercontent.com';
const GCAL_SCOPE         = 'https://www.googleapis.com/auth/calendar.readonly';
const GCAL_CONNECTED_KEY = 'rsrc_gcal_connected';

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

// ── Date helpers ──────────────────────────────────────────────────────────

function getDateRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate + 'T12:00:00');
  const end   = new Date((endDate || startDate) + 'T12:00:00');
  const cur   = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ── Firestore: RSRC events ────────────────────────────────────────────────

function loadEvents() {
  db.collection('events').onSnapshot(snapshot => {
    allEvents = {};
    snapshot.forEach(doc => {
      const d = { id: doc.id, ...doc.data() };
      const dates = (d.allDay && d.endDate) ? getDateRange(d.date, d.endDate) : [d.date];
      dates.forEach(dateKey => {
        if (!allEvents[dateKey]) allEvents[dateKey] = [];
        if (!allEvents[dateKey].find(e => e.id === d.id)) allEvents[dateKey].push(d);
      });
    });
    renderCalendar();
    renderUpcoming();
  });
}

// ── Firestore: Shared Google Calendar events ──────────────────────────────

function loadSharedGcal() {
  db.collection('gcal_shared').onSnapshot(snapshot => {
    sharedGcal = {};
    snapshot.forEach(doc => {
      sharedGcal[doc.id] = doc.data().events || [];
    });
    renderCalendar();
    renderUpcoming();
  });
}

// Save current user's Google events to Firebase so everyone can see them
async function saveGcalToFirebase(events) {
  const user = getCurrentUser();
  if (!user) return;
  await db.collection('gcal_shared').doc(user).set({ events, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

// Get all shared Google events as a flat array with ownerKey attached
function getAllSharedGcalEvents() {
  const all = [];
  Object.entries(sharedGcal).forEach(([memberKey, events]) => {
    events.forEach(ev => all.push({ ...ev, sharedBy: memberKey }));
  });
  return all;
}

// ── Firestore: Vacations ──────────────────────────────────────────────────

function loadVacations() {
  db.collection('vacations').onSnapshot(snapshot => {
    vacations = {};
    snapshot.forEach(doc => {
      vacations[doc.id] = doc.data().periods || [];
    });
    renderCalendar();
    renderVacationList();
  });
}

function getMemberVacationsForDate(dateKey) {
  const away = [];
  Object.entries(vacations).forEach(([memberKey, periods]) => {
    periods.forEach(p => {
      if (dateKey >= p.start && dateKey <= (p.end || p.start)) {
        away.push({ memberKey, label: p.label || 'Away' });
      }
    });
  });
  return away;
}

function renderVacationList() {
  const list = document.getElementById('vacation-list');
  if (!list) return;

  const today = todayStr();
  const upcoming = [];

  Object.entries(vacations).forEach(([memberKey, periods]) => {
    const m = MEMBERS[memberKey];
    if (!m) return;
    periods.forEach((p, idx) => {
      if ((p.end || p.start) >= today) upcoming.push({ memberKey, m, p, idx });
    });
  });

  upcoming.sort((a,b) => a.p.start.localeCompare(b.p.start));

  if (!upcoming.length) {
    list.innerHTML = '<p style="font-size:13px;color:#bbb;padding:4px 0">No upcoming absences.</p>';
    return;
  }

  list.innerHTML = upcoming.map(({ memberKey, m, p, idx }) => {
    const color = { boris:'#8b3535', sjef:'#2a4a6e', oliver:'#2a5c23', ewan:'#4a3570', casper:'#7a5220' }[memberKey] || '#555';
    const dateStr = p.end && p.end !== p.start
      ? `${formatDate(p.start)} – ${formatDate(p.end)}`
      : formatDate(p.start);
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:#f7f6f2;border:1px solid #e2e1dd;border-radius:6px;">
        <div style="width:3px;border-radius:2px;background:${color};align-self:stretch;flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:#111">${m.name} — ${p.label || 'Away'}</div>
          <div style="font-size:11.5px;color:#999;margin-top:1px">${dateStr}</div>
        </div>
        <button onclick="deleteVacation('${memberKey}',${idx})"
          style="background:none;border:none;cursor:pointer;color:#ddd;padding:2px;transition:color .15s"
          onmouseover="this.style.color='#b81c1c'" onmouseout="this.style.color='#ddd'">
          <svg style="width:13px;height:13px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>`;
  }).join('');
}

function toggleVacationSection() {
  const body    = document.getElementById('vacation-body');
  const chevron = document.getElementById('vacation-chevron');
  const isOpen  = body.style.display !== 'none';
  body.style.display    = isOpen ? 'none' : 'flex';
  chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
}

function saveVacation() {
  const member = document.getElementById('vac-member').value;
  const start  = document.getElementById('vac-start').value;
  const end    = document.getElementById('vac-end').value;
  const label  = document.getElementById('vac-label').value.trim() || 'Away';

  if (!member || !start) { showToast('Member and start date required.', 'error'); return; }
  if (end && end < start) { showToast('End date cannot be before start.', 'error'); return; }

  const current = vacations[member] || [];
  const updated = [...current, { start, end: end || start, label }];

  db.collection('vacations').doc(member).set({ periods: updated }).then(() => {
    closeModal('vacation-modal');
    showToast('Absence saved!');
  }).catch(() => showToast('Failed to save.', 'error'));
}

function deleteVacation(memberKey, idx) {
  const current = vacations[memberKey] || [];
  const updated = current.filter((_, i) => i !== idx);
  db.collection('vacations').doc(memberKey).set({ periods: updated })
    .catch(() => showToast('Failed to delete.', 'error'));
}

// ── Google Calendar ───────────────────────────────────────────────────────

function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
    });
    gapiInited = true;
    maybeAutoConnect();
  });
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GAPI_CLIENT_ID,
    scope: GCAL_SCOPE,
    callback: async (resp) => {
      if (resp.error) { showToast('Google auth failed.', 'error'); return; }
      localStorage.setItem(GCAL_CONNECTED_KEY, '1');
      await fetchAndSaveGoogleEvents();
      updateGoogleBtn(true);
    },
  });
  gisInited = true;
  maybeAutoConnect();
}

function maybeAutoConnect() {
  if (!gapiInited || !gisInited) return;
  const btn = document.getElementById('google-sync-btn');
  if (btn) btn.disabled = false;
  if (localStorage.getItem(GCAL_CONNECTED_KEY) === '1') {
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

function handleGoogleSignIn() {
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleGoogleSignOut() {
  const token = gapi.client.getToken();
  if (token) { google.accounts.oauth2.revoke(token.access_token); gapi.client.setToken(''); }
  googleEvents = [];
  localStorage.removeItem(GCAL_CONNECTED_KEY);
  renderCalendar(); renderUpcoming();
  updateGoogleBtn(false);
  showToast('Disconnected from Google Calendar.', 'info');
}

function updateGoogleBtn(connected) {
  const btn     = document.getElementById('google-sync-btn');
  const signout = document.getElementById('google-signout-btn');
  const status  = document.getElementById('google-sync-status');
  if (!btn) return;
  btn.style.display     = connected ? 'none'        : 'inline-flex';
  signout.style.display = connected ? 'inline-flex' : 'none';
  if (status) status.style.display = connected ? 'flex' : 'none';
}

async function fetchAndSaveGoogleEvents() {
  try {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const end   = new Date(now.getFullYear(), now.getMonth() + 4, 0).toISOString();

    const resp = await gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: start, timeMax: end,
      singleEvents: true, orderBy: 'startTime', maxResults: 250,
    });

    // Parse events
    googleEvents = parseGcalEvents(resp.result.items || []);

    // Save to Firebase so everyone can see them (replace all)
    await saveGcalToFirebase(googleEvents);

    renderCalendar(); renderUpcoming();
    showToast(`Synced ${googleEvents.length} Google events — shared with board!`);
  } catch (e) {
    showToast('Failed to fetch Google Calendar.', 'error');
  }
}

function parseGcalEvents(items) {
  return items.map(ev => {
    const isAllDay = !!ev.start.date;
    const date = isAllDay ? ev.start.date : ev.start.dateTime?.slice(0, 10);

    let endDate = null;
    if (isAllDay && ev.end?.date) {
      const parts = ev.end.date.split('-');
      const d = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
      d.setUTCDate(d.getUTCDate() - 1);
      endDate = d.toISOString().slice(0, 10);
      if (endDate === date) endDate = null;
    }

    return {
      id: 'gcal-' + ev.id,
      title: ev.summary || '(No title)',
      date, endDate,
      startTime: isAllDay ? null : ev.start.dateTime?.slice(11, 16),
      endTime:   isAllDay ? null : ev.end?.dateTime?.slice(11, 16),
      allDay: isAllDay,
      source: 'google',
    };
  }).filter(ev => ev.date);
}

// ── View switching ────────────────────────────────────────────────────────

function switchView(view) {
  currentView = view;
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  const vacSection = document.getElementById('vacation-section');
  if (vacSection) vacSection.style.display = view === 'board' ? 'block' : 'none';

  const gSection = document.getElementById('google-section');
  if (gSection) gSection.style.display = view === 'mine' ? 'flex' : 'none';

  const addBtn = document.getElementById('add-event-btn');
  if (addBtn) addBtn.style.display = view === 'board' ? 'inline-flex' : 'none';

  const subtitles = {
    board:   'Shared board events, matches & training sessions',
    overlap: 'Everyone\'s Google Calendars overlaid — spot conflicts & free slots',
    mine:    'Your personal Google Calendar (synced & shared with the board)',
  };
  const sub = document.getElementById('page-sub');
  if (sub) sub.textContent = subtitles[view];

  renderCalendar();
  renderUpcoming();
}

// ── Get events for date based on view ─────────────────────────────────────

function getEventsForDate(dateKey) {
  const user = getCurrentUser();

  if (currentView === 'board') {
    return filterEvents(allEvents[dateKey] || [], user);
  }

  if (currentView === 'mine') {
    // My own Google events (from Firebase shared collection)
    const myShared = sharedGcal[user] || [];
    return myShared.filter(ev => {
      const dates = getDateRange(ev.date, ev.endDate || ev.date);
      return dates.includes(dateKey);
    });
  }

  if (currentView === 'overlap') {
    // RSRC events + ALL members' shared Google Calendar events
    const rsrc = allEvents[dateKey] || [];
    const allGcal = getAllSharedGcalEvents().filter(ev => {
      const dates = getDateRange(ev.date, ev.endDate || ev.date);
      return dates.includes(dateKey);
    });
    return [...rsrc, ...allGcal];
  }

  return [];
}

function filterEvents(events, user) {
  if (activeFilter === 'mine')   return events.filter(e => e.owner === user || e.owner === 'master');
  if (activeFilter === 'master') return events.filter(e => e.owner === 'master');
  return events;
}

// ── Calendar rendering ────────────────────────────────────────────────────

function renderCalendar() {
  document.getElementById('month-label').textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

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

  const avatarColors = { boris:'#8b3535', sjef:'#2a4a6e', oliver:'#2a5c23', ewan:'#4a3570', casper:'#7a5220' };

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

    const dots = document.createElement('div');
    dots.className = 'event-dots';

    // Vacation bars (board view only)
    if (currentView === 'board') {
      getMemberVacationsForDate(dateKey).forEach(({ memberKey }) => {
        const color = avatarColors[memberKey] || '#888';
        const m = MEMBERS[memberKey];
        dots.innerHTML += `
          <div class="event-bar" style="background:${color};opacity:0.7">
            <span class="event-bar-label">✈ ${m?.name}</span>
          </div>`;
      });
    }

    const events = getEventsForDate(dateKey);
    const seen = new Set();
    events.slice(0, 3).forEach(ev => {
      if (seen.has(ev.id)) return;
      seen.add(ev.id);

      const isGcal = ev.source === 'google';
      let color;
      if (isGcal) {
        // In overlap view, color by sharedBy member; in mine view use blue
        color = currentView === 'overlap' && ev.sharedBy
          ? (avatarColors[ev.sharedBy] || '#4285f4')
          : '#4285f4';
      } else {
        color = (MEMBERS[ev.owner] || MEMBERS.master).color;
      }
      const isStart = ev.date === dateKey;

      if (ev.allDay) {
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

    if (dots.innerHTML) cell.appendChild(dots);
    cell.addEventListener('click', () => openDayModal(dateKey, day, month));
    grid.appendChild(cell);
  }
}

// ── Upcoming strip ────────────────────────────────────────────────────────

function renderUpcoming() {
  const user  = getCurrentUser();
  const today = todayStr();
  const list  = document.getElementById('upcoming-list');
  const avatarColors = { boris:'#8b3535', sjef:'#2a4a6e', oliver:'#2a5c23', ewan:'#4a3570', casper:'#7a5220' };

  let upcoming = [];

  if (currentView === 'board') {
    const rsrc = Object.entries(allEvents)
      .filter(([d]) => d >= today)
      .flatMap(([_, evs]) => filterEvents(evs, user).map(ev => ({ ...ev, dateKey: ev.date })));
    const seen = new Set();
    upcoming = rsrc.filter(ev => { if (seen.has(ev.id)) return false; seen.add(ev.id); return true; });
  } else if (currentView === 'mine') {
    const myShared = sharedGcal[user] || [];
    upcoming = myShared.filter(ev => ev.date >= today).map(ev => ({ ...ev, dateKey: ev.date }));
  } else if (currentView === 'overlap') {
    const rsrc = Object.entries(allEvents)
      .filter(([d]) => d >= today)
      .flatMap(([_, evs]) => evs.map(ev => ({ ...ev, dateKey: ev.date })));
    const gcal = getAllSharedGcalEvents().filter(ev => ev.date >= today).map(ev => ({ ...ev, dateKey: ev.date }));
    const seen = new Set();
    upcoming = [...rsrc, ...gcal].filter(ev => { if (seen.has(ev.id)) return false; seen.add(ev.id); return true; });
  }

  upcoming.sort((a,b) => a.dateKey.localeCompare(b.dateKey));

  if (!upcoming.length) {
    list.innerHTML = '<p style="font-size:13px;color:#bbb;padding:8px 0">No upcoming events.</p>';
    return;
  }

  list.innerHTML = upcoming.slice(0, 8).map(ev => {
    const isGcal = ev.source === 'google';
    let color;
    if (isGcal) {
      color = currentView === 'overlap' && ev.sharedBy ? (avatarColors[ev.sharedBy] || '#4285f4') : '#4285f4';
    } else {
      color = (MEMBERS[ev.owner] || MEMBERS.master).color;
    }

    const allDayTag = ev.allDay ? '<span style="font-size:11px;background:#edf5eb;color:#2a5c23;padding:1px 6px;border-radius:3px;font-weight:600;margin-left:6px">All day</span>' : '';

    // In overlap view, show whose Google calendar it's from
    let sourceTag = '';
    if (isGcal && ev.sharedBy && currentView === 'overlap') {
      const m = MEMBERS[ev.sharedBy];
      sourceTag = `<span style="font-size:11px;background:#f0efeb;color:#555;padding:1px 6px;border-radius:3px;font-weight:600;margin-left:6px">📅 ${m?.name}</span>`;
    } else if (isGcal) {
      sourceTag = '<span style="font-size:11px;background:#e8f0fe;color:#4285f4;padding:1px 6px;border-radius:3px;font-weight:600;margin-left:6px">Google</span>';
    }

    const dateRange = (ev.allDay && ev.endDate && ev.endDate !== ev.date)
      ? `${formatDate(ev.dateKey)} – ${formatDate(ev.endDate)}`
      : formatDate(ev.dateKey);

    return `
      <div class="upcoming-card">
        <div style="width:3px;border-radius:2px;background:${color};align-self:stretch;flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div class="upcoming-title">${ev.title}${allDayTag}${sourceTag}</div>
          <div class="upcoming-meta">${dateRange}${ev.startTime ? ' · ' + ev.startTime : ''}${ev.location ? ' · ' + ev.location : ''}</div>
        </div>
        ${isGcal ? '<span style="font-size:15px">📅</span>' : memberAvatar(ev.owner || 'master', 7)}
      </div>`;
  }).join('');
}

// ── Day modal ─────────────────────────────────────────────────────────────

function openDayModal(dateKey, day, month) {
  const label = `${day} ${MONTH_NAMES[month]}`;
  document.getElementById('day-modal-title').textContent = label;

  const events = getEventsForDate(dateKey);
  const away   = currentView === 'board' ? getMemberVacationsForDate(dateKey) : [];
  const avatarColors = { boris:'#8b3535', sjef:'#2a4a6e', oliver:'#2a5c23', ewan:'#4a3570', casper:'#7a5220' };

  let html = '';

  away.forEach(({ memberKey, label: awayLabel }) => {
    const m = MEMBERS[memberKey];
    const color = avatarColors[memberKey] || '#888';
    html += `
      <div class="day-event-row" style="background:#fffbf5;border-color:#f0e8d5">
        <div style="width:3px;border-radius:2px;background:${color};align-self:stretch;flex-shrink:0"></div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="day-event-title">✈ ${m?.name}</span>
            <span style="font-size:11px;background:#fff3cd;color:#856404;padding:1px 6px;border-radius:3px;font-weight:600">Away</span>
          </div>
          <div class="day-event-meta">${awayLabel}</div>
        </div>
      </div>`;
  });

  if (!events.length && !away.length) {
    html = '<p style="font-size:13px;color:#bbb">No events this day.</p>';
  } else {
    const seen = new Set();
    events.forEach(ev => {
      if (seen.has(ev.id)) return;
      seen.add(ev.id);

      const isGcal = ev.source === 'google';
      let color;
      if (isGcal) {
        color = currentView === 'overlap' && ev.sharedBy ? (avatarColors[ev.sharedBy] || '#4285f4') : '#4285f4';
      } else {
        color = (MEMBERS[ev.owner] || MEMBERS.master).color;
      }

      const allDayTag = ev.allDay ? '<span style="font-size:11px;background:#edf5eb;color:#2a5c23;padding:1px 6px;border-radius:3px;font-weight:600">All day</span>' : '';
      let sourceTag = '';
      if (isGcal && ev.sharedBy) {
        const m = MEMBERS[ev.sharedBy];
        sourceTag = `<span style="font-size:11px;background:#e8f0fe;color:#4285f4;padding:1px 6px;border-radius:3px;font-weight:600">📅 ${m?.name || 'Google'}</span>`;
      } else if (isGcal) {
        sourceTag = '<span style="font-size:11px;background:#e8f0fe;color:#4285f4;padding:1px 6px;border-radius:3px;font-weight:600">Google Cal</span>';
      }
      const dateRange = (ev.allDay && ev.endDate && ev.endDate !== ev.date)
        ? `${formatDate(ev.date)} – ${formatDate(ev.endDate)}` : '';

      const actions = isGcal ? '' : `
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          <button class="edit-btn" onclick="closeModal('day-modal');openEditEventModal('${ev.id}')" title="Edit">
            <svg style="width:15px;height:15px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button class="delete-btn" onclick="deleteEvent('${ev.id}')">
            <svg style="width:15px;height:15px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>`;

      html += `
        <div class="day-event-row">
          <div style="width:3px;border-radius:2px;background:${color};align-self:stretch;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span class="day-event-title">${ev.title}</span>${allDayTag}${sourceTag}
            </div>
            ${dateRange ? `<div class="day-event-meta">${dateRange}</div>` : ''}
            ${ev.startTime ? `<div class="day-event-meta">${ev.startTime}${ev.endTime ? ' – ' + ev.endTime : ''}</div>` : ''}
            ${ev.location   ? `<div class="day-event-meta">${ev.location}</div>` : ''}
            ${ev.description ? `<div class="day-event-meta" style="margin-top:4px">${ev.description}</div>` : ''}
          </div>
          ${actions}
        </div>`;
    });
  }

  list.innerHTML = html;

  const addBtn = document.getElementById('day-add-btn');
  addBtn.style.display = currentView === 'board' ? 'block' : 'none';
  addBtn.onclick = () => { closeModal('day-modal'); openCreateEventModal(dateKey); };

  document.getElementById('day-modal').classList.remove('hidden');
}

// ── Create / Edit event ───────────────────────────────────────────────────

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
  document.getElementById('ev-time-fields').style.display = isAllDay ? 'none' : 'grid';
  document.getElementById('ev-enddate-row').style.display = isAllDay ? 'block' : 'none';
}

function saveEvent() {
  const title = document.getElementById('ev-title').value.trim();
  const date  = document.getElementById('ev-date').value;
  if (!title || !date) { showToast('Title and date are required.', 'error'); return; }

  const allDay  = document.getElementById('ev-allday').checked;
  const endDate = document.getElementById('ev-enddate').value || null;
  if (allDay && endDate && endDate < date) { showToast('End date cannot be before start date.', 'error'); return; }

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
      closeModal('event-modal'); showToast('Event updated!');
    }).catch(() => showToast('Failed to update event.', 'error'));
  } else {
    eventData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection('events').add(eventData).then(() => {
      closeModal('event-modal'); showToast('Event saved!');
    }).catch(() => showToast('Failed to save event.', 'error'));
  }
}

function deleteEvent(id) {
  confirmAction('Delete this event?', () => {
    db.collection('events').doc(id).delete().then(() => {
      closeModal('day-modal'); showToast('Event deleted.', 'info');
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

['day-modal','event-modal','vacation-modal'].forEach(id => {
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
  loadVacations();
  loadSharedGcal();
})();