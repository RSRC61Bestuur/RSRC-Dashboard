// ─── RSRC Dashboard — Shared App Utilities ──────────────────────────────────

const MEMBERS = {
  boris:  { name: 'Boris',  role: 'President',             color: '#8b3535', colorLight: '#fff0f0' },
  sjef:   { name: 'Sjef',   role: 'Wedstrijd Sec.',        color: '#2a4a6e', colorLight: '#eef4ff' },
  oliver: { name: 'Oliver', role: 'Treasurer',             color: '#2a5c23', colorLight: '#edfff4' },
  ewan:   { name: 'Ewan',   role: 'Secretary',             color: '#4a3570', colorLight: '#f5f0ff' },
  casper: { name: 'Casper', role: 'Clubhuis Bestuurder',   color: '#7a5220', colorLight: '#fffbea' },
  master: { name: 'All',    role: 'All Members',           color: '#555555', colorLight: '#f5f4f0' },
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ── User identity ──────────────────────────────────────────────────────────

function getCurrentUser() { return localStorage.getItem('rsrc_user') || null; }
function setCurrentUser(key) { localStorage.setItem('rsrc_user', key); }

// ── Utilities ──────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d} ${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
}

function isOverdue(deadlineStr) {
  if (!deadlineStr) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const dl = new Date(deadlineStr); dl.setHours(0,0,0,0);
  return dl < today;
}

// ── Avatar ─────────────────────────────────────────────────────────────────

function memberAvatar(key, size = 8) {
  const m = MEMBERS[key];
  if (!m) return '';
  return `<span title="${m.name} — ${m.role}"
    style="display:inline-flex;align-items:center;justify-content:center;
           width:${size*4}px;height:${size*4}px;
           background:${m.color};color:#fff;
           font-weight:700;font-size:${Math.max(9, size*1.8)}px;
           border-radius:5px;flex-shrink:0;
           font-family:'DM Sans',sans-serif;letter-spacing:-.01em">
    ${m.name[0]}
  </span>`;
}

// ── Priority badge ─────────────────────────────────────────────────────────

function priorityBadge(priority) {
  const map = {
    high:   'priority-high',
    medium: 'priority-medium',
    low:    'priority-low',
  };
  const cls = map[priority] || map.low;
  return `<span class="px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${cls}">${priority || 'low'}</span>`;
}

// ── Toast ──────────────────────────────────────────────────────────────────

function showToast(message, type = 'success') {
  document.getElementById('rsrc-toast')?.remove();
  const colors = { success: '#2a5c23', error: '#b81c1c', info: '#2a4a6e' };
  const t = document.createElement('div');
  t.id = 'rsrc-toast';
  t.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    padding:10px 18px;border-radius:7px;
    background:${colors[type]||colors.info};color:#fff;
    font-size:13.5px;font-weight:500;
    box-shadow:0 4px 16px rgba(0,0,0,.15);
    font-family:'Inter',sans-serif;
    animation:fadeIn .2s ease;
  `;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Confirm modal ──────────────────────────────────────────────────────────

function confirmAction(message, onConfirm) {
  document.getElementById('rsrc-confirm')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rsrc-confirm';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9998;
    display:flex;align-items:center;justify-content:center;
    background:rgba(17,17,17,.35);backdrop-filter:blur(6px);padding:16px;
  `;
  overlay.innerHTML = `
    <div style="background:#fff;border:1px solid #e2e1dd;border-radius:10px;
                padding:24px;width:100%;max-width:340px;
                box-shadow:0 12px 32px rgba(0,0,0,.12);
                animation:scaleModal .18s cubic-bezier(.34,1.56,.64,1)">
      <p style="color:#111;font-size:14.5px;font-weight:500;margin-bottom:20px;
                font-family:'DM Sans',sans-serif">${message}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="confirm-cancel"
          style="padding:7px 16px;border-radius:5px;border:1px solid #e2e1dd;
                 background:#f7f6f2;color:#333;font-size:13px;cursor:pointer;
                 font-family:inherit;transition:background .15s">Cancel</button>
        <button id="confirm-ok"
          style="padding:7px 16px;border-radius:5px;border:none;
                 background:#b81c1c;color:#fff;font-size:13px;font-weight:600;
                 cursor:pointer;font-family:inherit;transition:background .15s">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('confirm-cancel').onclick = () => overlay.remove();
  document.getElementById('confirm-ok').onclick = () => { overlay.remove(); onConfirm(); };
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
}

// ── User modal ─────────────────────────────────────────────────────────────

function showUserModal(onSelect) {
  document.getElementById('user-modal')?.remove();

  const cards = Object.entries(MEMBERS).filter(([k]) => k !== 'master').map(([key, m]) => `
    <button onclick="selectUser('${key}')"
      style="display:flex;align-items:center;gap:12px;width:100%;
             padding:10px 12px;border-radius:7px;
             border:1px solid #e2e1dd;background:#f7f6f2;
             cursor:pointer;text-align:left;
             transition:all .15s;font-family:inherit"
      onmouseover="this.style.background='#f0efeb';this.style.borderColor='#d0cfc9'"
      onmouseout="this.style.background='#f7f6f2';this.style.borderColor='#e2e1dd'">
      ${memberAvatar(key, 10)}
      <div>
        <div style="font-weight:600;color:#111;font-size:14px;font-family:'DM Sans',sans-serif">${m.name}</div>
        <div style="font-size:12px;color:#999;margin-top:1px">${m.role}</div>
      </div>
    </button>`).join('');

  const overlay = document.createElement('div');
  overlay.id = 'user-modal';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9997;
    display:flex;align-items:center;justify-content:center;
    background:rgba(17,17,17,.35);backdrop-filter:blur(8px);padding:16px;
  `;
  overlay.innerHTML = `
    <div style="background:#fff;border:1px solid #e2e1dd;border-radius:12px;
                padding:28px 24px;width:100%;max-width:320px;
                box-shadow:0 16px 48px rgba(0,0,0,.12);
                animation:scaleModal .2s cubic-bezier(.34,1.56,.64,1)">
      <div style="text-align:center;margin-bottom:20px">
        <img src="img/logo.png" alt="RSRC"
          style="width:56px;height:56px;object-fit:contain;margin:0 auto 12px;display:block"
          onerror="this.style.display='none'">
        <div style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:700;color:#111;margin-bottom:3px">
          Welcome back
        </div>
        <div style="font-size:13px;color:#999">Who are you today?</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px">${cards}</div>
    </div>`;
  document.body.appendChild(overlay);
  window._onUserSelect = onSelect;
}

function selectUser(key) {
  setCurrentUser(key);
  document.getElementById('user-modal')?.remove();
  if (typeof window._onUserSelect === 'function') window._onUserSelect(key);
}

// ── Navigation ─────────────────────────────────────────────────────────────

function injectNav(activePage) {
  const header = document.getElementById('app-nav');
  if (!header) return;

  const user = getCurrentUser();
  const m    = user ? MEMBERS[user] : null;

  const links = [
    { page: 'home',     href: 'index.html',   label: 'Home' },
    { page: 'calendar', href: 'calendar.html', label: 'Calendar' },
    { page: 'todos',    href: 'todos.html',    label: 'To Do' },
    { page: 'goals',    href: 'goals.html',    label: 'Goals' },
    { page: 'docs',     href: 'https://drive.google.com/drive/folders/1NUJ9doeGd2wctHIDreJeYYNK2roE2tmO?usp=drive_link', label: 'Documents' },
  ];

  const desktopLinks = links.map(l =>
    `<a href="${l.href}" ${l.page === 'docs' ? 'target="_blank"' : ''} class="${l.page === activePage ? 'nav-active' : 'nav-link'}">${l.label}</a>`
  ).join('');

  const mobileLinks = links.map(l =>
    `<a href="${l.href}" ${l.page === 'docs' ? 'target="_blank"' : ''} class="${l.page === activePage ? 'mobile-nav-active' : 'mobile-nav-link'}">${l.label}</a>`
  ).join('');

  const userEl = m
    ? `<button onclick="showUserModal(()=>location.reload())"
        style="display:flex;align-items:center;gap:8px;
               padding:5px 10px;border-radius:6px;
               border:1px solid #e2e1dd;background:#f7f6f2;
               cursor:pointer;transition:all .15s;font-family:inherit"
        onmouseover="this.style.background='#f0efeb'"
        onmouseout="this.style.background='#f7f6f2'">
        ${memberAvatar(user, 6)}
        <span style="font-size:13px;font-weight:600;color:#111">${m.name}</span>
       </button>`
    : `<button onclick="showUserModal(()=>location.reload())"
        style="padding:6px 14px;border-radius:6px;
               border:1px solid #e2e1dd;background:#f7f6f2;
               color:#555;font-size:13px;font-weight:500;
               cursor:pointer;font-family:inherit">Sign in</button>`;

  header.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding:0 20px;
                height:52px;display:flex;align-items:center;justify-content:space-between;gap:16px">
      <a href="index.html" style="display:flex;align-items:center;gap:10px;text-decoration:none;flex-shrink:0">
        <img src="img/logo.png" alt="RSRC"
          style="width:32px;height:32px;object-fit:contain"
          onerror="this.outerHTML='<div style=width:32px;height:32px;background:#b81c1c;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:13px;font-family:DM+Sans,sans-serif>R</div>'">
        <span style="font-family:'DM Sans',sans-serif;font-weight:700;color:#111;font-size:14.5px;letter-spacing:-.02em"
              class="hidden sm:block">RSRC Board</span>
      </a>
      <nav style="display:flex;align-items:center;gap:2px" class="hidden md:flex">${desktopLinks}</nav>
      <div style="display:flex;align-items:center;gap:8px">
        ${userEl}
        <button id="mobile-menu-btn" class="md:hidden"
          style="background:none;border:1px solid #e2e1dd;border-radius:6px;
                 padding:5px;cursor:pointer;color:#555;display:flex;align-items:center">
          <svg style="width:18px;height:18px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
      </div>
    </div>
    <div id="mobile-menu" class="md:hidden hidden" style="border-top:1px solid #e2e1dd;padding:8px 20px 12px">
      <div style="display:flex;flex-direction:column;gap:2px">${mobileLinks}</div>
    </div>`;

  document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    document.getElementById('mobile-menu')?.classList.toggle('hidden');
  });
}

// ── Init ───────────────────────────────────────────────────────────────────

function initApp(activePage) {
  injectNav(activePage);
  if (!getCurrentUser()) {
    showUserModal(() => injectNav(activePage));
  }
}
