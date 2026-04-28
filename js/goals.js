// ─── RSRC Dashboard — Goals Page ─────────────────────────────────────────────

let allGoals = [];

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

// ── Firestore listener ────────────────────────────────────────────────────

function loadGoals() {
  db.collection('goals').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    allGoals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderGoals();
  }, () => {
    db.collection('goals').onSnapshot(snapshot => {
      allGoals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderGoals();
    });
  });
}

// ── Progress ──────────────────────────────────────────────────────────────

function calculateProgress(goal) {
  const subs = goal.subgoals || [];
  if (!subs.length) return goal.completed ? 100 : 0;
  return Math.round((subs.filter(s => s.done).length / subs.length) * 100);
}

function progressColor(pct) {
  if (pct >= 100) return '#2a5c23';
  if (pct >= 50)  return '#3a7a30';
  return '#7a5220';
}

// ── Render ────────────────────────────────────────────────────────────────

function renderGoals() {
  const active    = allGoals.filter(g => !g.completed);
  const completed = allGoals.filter(g =>  g.completed);

  const activeEl      = document.getElementById('active-goals');
  const emptyEl       = document.getElementById('goals-empty');
  const completedSec  = document.getElementById('completed-section');
  const completedEl   = document.getElementById('completed-goals');

  if (!active.length) {
    activeEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');
    activeEl.innerHTML = active.map(g => renderGoalCard(g, false)).join('');
  }

  if (completed.length) {
    completedSec.classList.remove('hidden');
    completedEl.innerHTML = completed.map(g => renderGoalCard(g, true)).join('');
  } else {
    completedSec.classList.add('hidden');
  }
}

function renderGoalCard(goal, isCompleted) {
  const pct   = calculateProgress(goal);
  const color = progressColor(pct);
  const subs  = goal.subgoals || [];

  const subgoalItems = subs.map((s, idx) => `
    <div class="subgoal-item">
      <input type="checkbox" class="subgoal-check" ${s.done ? 'checked' : ''}
        onchange="toggleSubgoal('${goal.id}', ${idx}, this.checked)">
      <span class="subgoal-text ${s.done ? 'done' : ''}">${s.text}</span>
      <button class="subgoal-del" onclick="deleteSubgoal('${goal.id}', ${idx})">
        <svg style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>`).join('');

  const completeBtn = !isCompleted
    ? `<button class="action-btn action-btn-done" onclick="markGoalComplete('${goal.id}')">Mark complete</button>`
    : `<button class="action-btn action-btn-reopen" onclick="markGoalIncomplete('${goal.id}')">Reopen</button>`;

  return `
    <div class="goal-card ${isCompleted ? 'is-completed' : ''} fade-in">
      <div class="goal-header">
        ${memberAvatar(goal.owner || 'master', 9)}
        <div style="flex:1;min-width:0">
          <div class="goal-title">${goal.title}</div>
          ${goal.description ? `<div class="goal-desc">${goal.description}</div>` : ''}
        </div>
        <button class="action-btn-del" onclick="deleteGoal('${goal.id}')">
          <svg style="width:15px;height:15px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>

      <div class="progress-row">
        <div class="progress-track" style="flex:1">
          <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="progress-pct">${pct}%</span>
      </div>

      ${subs.length ? `<div style="margin-bottom:4px">${subgoalItems}</div>` : ''}

      <div class="goal-actions">
        <button class="action-btn action-btn-sub" onclick="openAddSubgoalModal('${goal.id}')">
          + Sub-goal
        </button>
        ${completeBtn}
      </div>
    </div>`;
}

// ── Actions ───────────────────────────────────────────────────────────────

function toggleSubgoal(goalId, idx, checked) {
  const goal = allGoals.find(g => g.id === goalId);
  if (!goal) return;
  const subs = [...(goal.subgoals || [])];
  subs[idx] = { ...subs[idx], done: checked };
  const allDone = subs.length > 0 && subs.every(s => s.done);
  db.collection('goals').doc(goalId).update({ subgoals: subs, completed: allDone })
    .catch(() => showToast('Failed to update sub-goal.', 'error'));
}

function deleteSubgoal(goalId, idx) {
  const goal = allGoals.find(g => g.id === goalId);
  if (!goal) return;
  confirmAction('Remove this sub-goal?', () => {
    const subs = (goal.subgoals || []).filter((_, i) => i !== idx);
    db.collection('goals').doc(goalId).update({ subgoals: subs })
      .catch(() => showToast('Failed to remove sub-goal.', 'error'));
  });
}

function markGoalComplete(goalId) {
  db.collection('goals').doc(goalId).update({ completed: true })
    .then(() => showToast('Goal marked complete!'))
    .catch(() => showToast('Failed.', 'error'));
}

function markGoalIncomplete(goalId) {
  db.collection('goals').doc(goalId).update({ completed: false })
    .catch(() => showToast('Failed.', 'error'));
}

function deleteGoal(id) {
  confirmAction('Delete this goal? This cannot be undone.', () => {
    db.collection('goals').doc(id).delete()
      .then(() => showToast('Goal deleted.', 'info'))
      .catch(() => showToast('Failed to delete goal.', 'error'));
  });
}

// ── Create goal modal ─────────────────────────────────────────────────────

function openCreateGoalModal() {
  document.getElementById('goal-title').value = '';
  document.getElementById('goal-desc').value  = '';

  const ownerSel = document.getElementById('goal-owner');
  ownerSel.innerHTML = '<option value="master">All Members</option>';
  Object.entries(MEMBERS).filter(([k]) => k !== 'master').forEach(([key, m]) => {
    ownerSel.innerHTML += `<option value="${key}">${m.name}</option>`;
  });
  const user = getCurrentUser();
  if (user) ownerSel.value = user;

  document.getElementById('subgoal-inputs').innerHTML = '';
  addSubgoalInput();
  document.getElementById('goal-modal').classList.remove('hidden');
}

function addSubgoalInput() {
  const container = document.getElementById('subgoal-inputs');
  const idx = container.children.length;
  const row = document.createElement('div');
  row.className = 'subgoal-input-row';
  row.innerHTML = `
    <input class="form-input subgoal-input" style="flex:1" placeholder="Sub-goal ${idx + 1}…">
    <button type="button" class="remove-sub-btn" onclick="this.parentElement.remove()">
      <svg style="width:14px;height:14px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>`;
  container.appendChild(row);
}

function saveGoal() {
  const title = document.getElementById('goal-title').value.trim();
  if (!title) { showToast('Goal title is required.', 'error'); return; }

  const subgoalTexts = Array.from(document.querySelectorAll('.subgoal-input'))
    .map(el => el.value.trim()).filter(Boolean);

  const goal = {
    title,
    description: document.getElementById('goal-desc').value.trim() || null,
    owner:       document.getElementById('goal-owner').value || 'master',
    subgoals:    subgoalTexts.map(text => ({ text, done: false })),
    completed:   false,
    createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
  };

  db.collection('goals').add(goal).then(() => {
    closeModal('goal-modal');
    showToast('Goal created!');
  }).catch(() => showToast('Failed to create goal.', 'error'));
}

// ── Add sub-goal modal ────────────────────────────────────────────────────

function openAddSubgoalModal(goalId) {
  document.getElementById('new-subgoal-text').value = '';
  document.getElementById('subgoal-modal').classList.remove('hidden');
  document.getElementById('save-subgoal-btn').onclick = () => saveSubgoal(goalId);
}

function saveSubgoal(goalId) {
  const text = document.getElementById('new-subgoal-text').value.trim();
  if (!text) { showToast('Enter a sub-goal description.', 'error'); return; }
  const goal = allGoals.find(g => g.id === goalId);
  const subs = [...(goal?.subgoals || []), { text, done: false }];
  db.collection('goals').doc(goalId).update({ subgoals: subs }).then(() => {
    closeModal('subgoal-modal');
    showToast('Sub-goal added!');
  }).catch(() => showToast('Failed to add sub-goal.', 'error'));
}

// ── Overlay close ─────────────────────────────────────────────────────────

['goal-modal','subgoal-modal'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', e => {
    if (e.target === document.getElementById(id)) closeModal(id);
  });
});

// ── Init ──────────────────────────────────────────────────────────────────

initApp('goals');
loadGoals();