  // ─── RSRC Dashboard — Todos Page ─────────────────────────────────────────────

let allTasks = [], taskFilter = 'all', memberFilter = null;

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

// ── Firestore listener ────────────────────────────────────────────────────

function loadTasks() {
  db.collection('tasks').orderBy('deadline').onSnapshot(snapshot => {
    allTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTasks();
    renderStats();
  }, () => {
    db.collection('tasks').onSnapshot(snapshot => {
      allTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderTasks();
      renderStats();
    });
  });
}

// ── Filtering & sorting ───────────────────────────────────────────────────

function getFilteredTasks() {
  const user = getCurrentUser();
  let tasks  = [...allTasks];

  if (taskFilter === 'mine')       tasks = tasks.filter(t => t.assignees?.includes(user));
  else if (taskFilter === 'todo')       tasks = tasks.filter(t => t.status === 'todo');
  else if (taskFilter === 'inprogress') tasks = tasks.filter(t => t.status === 'inprogress');
  else if (taskFilter === 'done')       tasks = tasks.filter(t => t.status === 'done');

  if (memberFilter) tasks = tasks.filter(t => t.assignees?.includes(memberFilter));

  tasks.sort((a, b) => {
    const aDone = a.status === 'done', bDone = b.status === 'done';
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aOver = isOverdue(a.deadline) && !aDone;
    const bOver = isOverdue(b.deadline) && !bDone;
    if (aOver !== bOver) return aOver ? -1 : 1;
    return (a.deadline || '9999').localeCompare(b.deadline || '9999');
  });

  return tasks;
}

// ── Render ────────────────────────────────────────────────────────────────

function renderTasks() {
  const tasks = getFilteredTasks();
  const list  = document.getElementById('task-list');
  const empty = document.getElementById('task-empty');

  if (!tasks.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = tasks.map(renderTaskCard).join('');
}

function renderTaskCard(task) {
  const priorityColors = { high: '#b81c1c', medium: '#d97706', low: '#ccc' };
  const stripeColor    = priorityColors[task.priority] || priorityColors.low;
  const overdue        = isOverdue(task.deadline) && task.status !== 'done';
  const isDone         = task.status === 'done';

  const assigneeAvatars = (task.assignees || []).map(k => memberAvatar(k, 7)).join('');

  const sClass = task.status === 'inprogress' ? 's-inprogress' : task.status === 'done' ? 's-done' : 's-todo';
  const statusOptions = [
    { v: 'todo',       l: 'To Do' },
    { v: 'inprogress', l: 'In Progress' },
    { v: 'done',       l: 'Done' },
  ].map(o => `<option value="${o.v}" ${task.status === o.v ? 'selected' : ''}>${o.l}</option>`).join('');

  return `
    <div class="task-card ${isDone ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''} fade-in">
      <div class="task-stripe" style="background:${stripeColor}"></div>
      <div class="task-body">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:3px">
              <span class="task-title ${isDone ? 'done' : ''}">${task.title}</span>
              ${overdue ? '<span class="overdue-tag">Overdue</span>' : ''}
              ${priorityBadge(task.priority)}
            </div>
            ${task.description ? `<div class="task-desc">${task.description}</div>` : ''}
            <div class="task-meta">
              ${task.deadline ? `<span class="task-date">${formatDate(task.deadline)}</span>` : ''}
              <div style="display:flex;gap:3px">${assigneeAvatars}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="task-actions">
        <select class="status-select ${sClass}"
          onchange="updateTaskStatus('${task.id}', this.value); this.className='status-select s-'+this.value">
          ${statusOptions}
        </select>
        <button class="del-btn" onclick="deleteTask('${task.id}')">
          <svg style="width:15px;height:15px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </div>`;
}

function renderStats() {
  const total      = allTasks.length;
  const done       = allTasks.filter(t => t.status === 'done').length;
  const inprogress = allTasks.filter(t => t.status === 'inprogress').length;

  document.getElementById('stats-row').innerHTML = `
    <div class="stat-card">
      <div class="stat-num" style="color:#111">${total}</div>
      <div class="stat-label">Total</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:#2563eb">${inprogress}</div>
      <div class="stat-label">In Progress</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:#2a5c23">${done}</div>
      <div class="stat-label">Done</div>
    </div>`;
}

function renderMemberFilterBar() {
  const bar = document.getElementById('member-filter-bar');
  bar.innerHTML = Object.entries(MEMBERS).filter(([k]) => k !== 'master').map(([key, m]) => `
    <button data-member="${key}"
      class="filter-pill ${memberFilter === key ? 'active' : ''}"
      onclick="setMemberFilter('${key}')">
      <span style="width:7px;height:7px;border-radius:50%;background:${m.color};display:inline-block;margin-right:4px"></span>${m.name}
    </button>`).join('');
}

// ── Actions ───────────────────────────────────────────────────────────────

function setMemberFilter(key) {
  memberFilter = memberFilter === key ? null : key;
  renderMemberFilterBar();
  renderTasks();
}

function updateTaskStatus(id, status) {
  db.collection('tasks').doc(id).update({ status })
    .catch(() => showToast('Failed to update status.', 'error'));
}

function deleteTask(id) {
  confirmAction('Delete this task?', () => {
    db.collection('tasks').doc(id).delete()
      .then(() => showToast('Task deleted.', 'info'))
      .catch(() => showToast('Failed to delete task.', 'error'));
  });
}

// ── Create task modal ─────────────────────────────────────────────────────

function openCreateTaskModal() {
  document.getElementById('task-title').value    = '';
  document.getElementById('task-desc').value     = '';
  document.getElementById('task-priority').value = 'medium';
  document.getElementById('task-deadline').value = '';
  document.getElementById('task-status').value   = 'todo';

  const boxes = document.getElementById('assignee-checkboxes');
  boxes.innerHTML = Object.entries(MEMBERS).filter(([k]) => k !== 'master').map(([key, m]) => `
    <label class="assignee-label">
      <input type="checkbox" value="${key}" style="accent-color:#2a5c23;width:14px;height:14px;cursor:pointer">
      ${memberAvatar(key, 6)}
      <span>${m.name}</span>
    </label>`).join('');

  const user = getCurrentUser();
  if (user) {
    const box = boxes.querySelector(`input[value="${user}"]`);
    if (box) box.checked = true;
  }

  document.getElementById('task-modal').classList.remove('hidden');
}

function saveTask() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) { showToast('Task title is required.', 'error'); return; }

  const assignees = Array.from(
    document.querySelectorAll('#assignee-checkboxes input:checked')
  ).map(el => el.value);

  const task = {
    title,
    description: document.getElementById('task-desc').value.trim()  || null,
    priority:    document.getElementById('task-priority').value,
    deadline:    document.getElementById('task-deadline').value      || null,
    status:      document.getElementById('task-status').value,
    assignees,
    createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
  };

  db.collection('tasks').add(task).then(() => {
    closeModal('task-modal');
    showToast('Task created!');
  }).catch(() => showToast('Failed to create task.', 'error'));
}

// ── Filter buttons ─────────────────────────────────────────────────────────

document.querySelectorAll('[data-task-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    taskFilter = btn.dataset.taskFilter;
    document.querySelectorAll('[data-task-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTasks();
  });
});

document.getElementById('task-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('task-modal')) closeModal('task-modal');
});

// ── Init ──────────────────────────────────────────────────────────────────

initApp('todos');
renderMemberFilterBar();
loadTasks();