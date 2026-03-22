'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const API = (localStorage.getItem('ot_server') || 'http://localhost:8000').replace(/\/$/, '');

// ── State ─────────────────────────────────────────────────────────────────────
let token       = localStorage.getItem('ot_token') || null;
let currentUser = null;
let lists       = [];
let selectedList = null;
let selectedUserId = null;   // admin panel

// ── Auth guard ─────────────────────────────────────────────────────────────────
if (!token) { window.location.href = 'index.html'; }

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(method, path, body = null) {
  const headers = { Authorization: `Bearer ${token}` };
  const init = { method, headers };

  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API}${path}`, init);
  } catch {
    throw new Error(`Cannot connect to server at ${API}`);
  }

  if (res.status === 401) {
    localStorage.removeItem('ot_token');
    window.location.href = 'index.html';
    return;
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') detail = j.detail;
      else if (Array.isArray(j.detail))
        detail = j.detail.map(e => e.msg || String(e)).join('; ');
    } catch {}
    throw new Error(detail);
  }

  if (res.status === 204) return null;
  return res.json();
}

const api = {
  me:           ()             => apiFetch('GET',    '/auth/me'),
  // lists
  getLists:     ()             => apiFetch('GET',    '/lists'),
  createList:   body          => apiFetch('POST',   '/lists', body),
  updateList:   (id, body)    => apiFetch('PATCH',  `/lists/${id}`, body),
  deleteList:   id            => apiFetch('DELETE', `/lists/${id}`),
  // tasks
  getTasks:     lid           => apiFetch('GET',    `/lists/${lid}/tasks`),
  createTask:   (lid, body)   => apiFetch('POST',   `/lists/${lid}/tasks`, body),
  updateTask:   (lid, tid, b) => apiFetch('PATCH',  `/lists/${lid}/tasks/${tid}`, b),
  deleteTask:   (lid, tid)    => apiFetch('DELETE', `/lists/${lid}/tasks/${tid}`),
  // admin
  getUsers:     ()            => apiFetch('GET',    '/users'),
  createUser:   body          => apiFetch('POST',   '/users', body),
  updateUser:   (id, body)    => apiFetch('PATCH',  `/users/${id}`, body),
  deleteUser:   id            => apiFetch('DELETE', `/users/${id}`),
};

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('toast-error', isError);
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 280);
  }, 2800);
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const listsUl      = document.getElementById('lists-ul');
const tasksUl      = document.getElementById('tasks-ul');
const tasksHeading = document.getElementById('tasks-heading');
const taskActions  = document.getElementById('task-actions');
const tasksEmpty   = document.getElementById('tasks-empty');
const topbarUser   = document.getElementById('topbar-user');
const btnAdmin     = document.getElementById('btn-admin');

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    currentUser = await api.me();
    topbarUser.textContent = currentUser.is_admin
      ? `★ ${currentUser.username}` : currentUser.username;
    if (currentUser.is_admin) btnAdmin.classList.remove('hidden');
    await loadLists();
  } catch (e) {
    toast(e.message, true);
  }
})();

// ── Lists ─────────────────────────────────────────────────────────────────────
async function loadLists() {
  lists = await api.getLists();
  renderLists();
}

function renderLists() {
  listsUl.innerHTML = '';
  lists.forEach(lst => {
    const li = document.createElement('li');
    li.textContent = lst.title;
    li.title       = lst.title;
    li.dataset.id  = lst.id;
    if (selectedList && selectedList.id === lst.id) li.classList.add('active');
    li.addEventListener('click', () => selectList(lst));
    listsUl.appendChild(li);
  });
}

async function selectList(lst) {
  selectedList = lst;
  tasksHeading.textContent = lst.title;
  taskActions.classList.remove('hidden');
  renderLists();  // refresh active highlight
  await loadTasks();
}

document.getElementById('btn-new-list').addEventListener('click', () => {
  openFormModal('New List', [
    { label: 'Title *',      key: 'title',       type: 'text',     required: true  },
    { label: 'Description',  key: 'description', type: 'textarea', required: false },
  ], async data => {
    await api.createList({ title: data.title, description: data.description || null });
    await loadLists();
    toast('List created');
  });
});

document.getElementById('btn-edit-list').addEventListener('click', () => {
  if (!selectedList) return;
  openFormModal('Edit List', [
    { label: 'Title *',     key: 'title',       type: 'text',     required: true,  value: selectedList.title },
    { label: 'Description', key: 'description', type: 'textarea', required: false, value: selectedList.description || '' },
  ], async data => {
    const updated = await api.updateList(selectedList.id, {
      title:       data.title       || undefined,
      description: data.description || undefined,
    });
    selectedList = updated;
    tasksHeading.textContent = updated.title;
    await loadLists();
    toast('List updated');
  });
});

document.getElementById('btn-delete-list').addEventListener('click', async () => {
  if (!selectedList) return;
  if (!confirm(`Delete list "${selectedList.title}" and all its tasks?`)) return;
  try {
    await api.deleteList(selectedList.id);
    selectedList = null;
    tasksHeading.textContent = '← Select a list';
    taskActions.classList.add('hidden');
    tasksUl.innerHTML = '';
    tasksEmpty.classList.add('hidden');
    await loadLists();
    toast('List deleted');
  } catch (e) { toast(e.message, true); }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
async function loadTasks() {
  const tasks = await api.getTasks(selectedList.id);
  renderTasks(tasks);
}

function renderTasks(tasks) {
  tasksUl.innerHTML = '';
  tasksEmpty.classList.toggle('hidden', tasks.length > 0);

  tasks.forEach(task => {
    const li = document.createElement('li');
    li.className = `task-item${task.completed ? ' done' : ''}`;
    li.innerHTML = `
      <input type="checkbox" class="task-check" ${task.completed ? 'checked' : ''}
             title="Toggle done" />
      <div class="task-body">
        <div class="task-title">${escHtml(task.title)}</div>
        ${task.description
          ? `<div class="task-desc">${escHtml(task.description)}</div>` : ''}
      </div>
      <div class="task-btns">
        <button class="btn btn-ghost btn-sm btn-edit-task">Edit</button>
        <button class="btn btn-danger btn-sm btn-del-task">Delete</button>
      </div>`;

    li.querySelector('.task-check').addEventListener('change', async () => {
      try {
        await api.updateTask(selectedList.id, task.id, { completed: !task.completed });
        await loadTasks();
      } catch (e) { toast(e.message, true); }
    });

    li.querySelector('.btn-edit-task').addEventListener('click', () => {
      openFormModal('Edit Task', [
        { label: 'Title *',     key: 'title',       type: 'text',     required: true,  value: task.title },
        { label: 'Description', key: 'description', type: 'textarea', required: false, value: task.description || '' },
      ], async data => {
        await api.updateTask(selectedList.id, task.id, {
          title:       data.title       || undefined,
          description: data.description || undefined,
        });
        await loadTasks();
        toast('Task updated');
      });
    });

    li.querySelector('.btn-del-task').addEventListener('click', async () => {
      if (!confirm(`Delete task "${task.title}"?`)) return;
      try {
        await api.deleteTask(selectedList.id, task.id);
        await loadTasks();
        toast('Task deleted');
      } catch (e) { toast(e.message, true); }
    });

    tasksUl.appendChild(li);
  });
}

document.getElementById('btn-new-task').addEventListener('click', () => {
  if (!selectedList) return;
  openFormModal('New Task', [
    { label: 'Title *',     key: 'title',       type: 'text',     required: true  },
    { label: 'Description', key: 'description', type: 'textarea', required: false },
  ], async data => {
    await api.createTask(selectedList.id, {
      title:       data.title,
      description: data.description || null,
    });
    await loadTasks();
    toast('Task created');
  });
});

// ── Generic form modal ────────────────────────────────────────────────────────
function openFormModal(title, fields, onSave) {
  const overlay   = document.getElementById('modal-form');
  const titleEl   = document.getElementById('modal-title');
  const fieldsEl  = document.getElementById('modal-fields');
  const errEl     = document.getElementById('modal-error');
  const saveBtn   = document.getElementById('modal-save');
  const cancelBtn = document.getElementById('modal-cancel');

  titleEl.textContent = title;
  errEl.classList.add('hidden');
  fieldsEl.innerHTML = '';

  const inputRefs = {};
  fields.forEach(f => {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lbl = document.createElement('label');
    lbl.textContent = f.label;
    lbl.setAttribute('for', `mf-${f.key}`);
    wrap.appendChild(lbl);
    let el;
    if (f.type === 'textarea') {
      el = document.createElement('textarea');
      el.rows = 3;
      el.style.resize = 'vertical';
    } else {
      el = document.createElement('input');
      el.type = f.type || 'text';
    }
    el.id = `mf-${f.key}`;
    el.value = f.value ?? '';
    wrap.appendChild(el);
    fieldsEl.appendChild(wrap);
    inputRefs[f.key] = { el, required: f.required };
  });

  overlay.classList.remove('hidden');
  Object.values(inputRefs)[0]?.el.focus();

  const close = () => {
    overlay.classList.add('hidden');
    saveBtn.removeEventListener('click', submit);
    cancelBtn.removeEventListener('click', close);
    overlay.removeEventListener('keydown', keyHandler);
  };

  const submit = async () => {
    errEl.classList.add('hidden');
    const data = {};
    for (const [key, { el, required }] of Object.entries(inputRefs)) {
      const val = el.value.trim();
      if (required && !val) {
        errEl.textContent = `${key} is required.`;
        errEl.classList.remove('hidden');
        el.focus();
        return;
      }
      data[key] = val;
    }
    saveBtn.disabled = true;
    try {
      await onSave(data);
      close();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    } finally {
      saveBtn.disabled = false;
    }
  };

  const keyHandler = e => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') submit();
  };

  saveBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('keydown', keyHandler);
}

// ── Admin panel ───────────────────────────────────────────────────────────────
document.getElementById('btn-admin').addEventListener('click', openAdminPanel);
document.getElementById('admin-close').addEventListener('click', () => {
  document.getElementById('modal-admin').classList.add('hidden');
});

async function openAdminPanel() {
  document.getElementById('modal-admin').classList.remove('hidden');
  document.getElementById('admin-error').classList.add('hidden');
  selectedUserId = null;
  await loadUsers();
}

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  try {
    const users = await api.getUsers();
    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.dataset.id = u.id;
      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${escHtml(u.username)}</td>
        <td><span class="badge ${u.is_admin ? 'badge-admin' : 'badge-user'}">
          ${u.is_admin ? 'Admin' : 'User'}</span></td>
        <td>${new Date(u.created_at).toLocaleDateString()}</td>`;
      tr.addEventListener('click', () => {
        document.querySelectorAll('#users-tbody tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
        selectedUserId = u.id;
      });
      tbody.appendChild(tr);
    });
  } catch (e) {
    const el = document.getElementById('admin-error');
    el.textContent = e.message;
    el.classList.remove('hidden');
  }
}

document.getElementById('btn-new-user').addEventListener('click', () => {
  openUserForm(null);
});

document.getElementById('btn-edit-user').addEventListener('click', async () => {
  if (!selectedUserId) { toast('Select a user first.', true); return; }
  const tbody = document.getElementById('users-tbody');
  const row   = tbody.querySelector(`tr[data-id="${selectedUserId}"]`);
  const cells = row ? row.querySelectorAll('td') : [];
  const username = cells[1]?.textContent || '';
  const isAdmin  = cells[2]?.querySelector('.badge-admin') !== null;
  openUserForm({ id: selectedUserId, username, is_admin: isAdmin });
});

document.getElementById('btn-delete-user').addEventListener('click', async () => {
  if (!selectedUserId) { toast('Select a user first.', true); return; }
  if (selectedUserId === currentUser.id) {
    toast('You cannot delete your own account.', true); return;
  }
  if (!confirm('Delete this user?')) return;
  try {
    await api.deleteUser(selectedUserId);
    selectedUserId = null;
    await loadUsers();
    toast('User deleted');
  } catch (e) { toast(e.message, true); }
});

function openUserForm(existing) {
  const overlay  = document.getElementById('modal-user-form');
  const titleEl  = document.getElementById('user-form-title');
  const unameEl  = document.getElementById('uf-username');
  const pwdEl    = document.getElementById('uf-password');
  const pwdLbl   = document.getElementById('uf-pwd-label');
  const adminEl  = document.getElementById('uf-is-admin');
  const errEl    = document.getElementById('user-form-error');
  const saveBtn  = document.getElementById('user-form-save');
  const cancelBtn = document.getElementById('user-form-cancel');

  titleEl.textContent = existing ? 'Edit User' : 'New User';
  unameEl.value  = existing?.username ?? '';
  pwdEl.value    = '';
  adminEl.checked = existing?.is_admin ?? false;
  pwdLbl.textContent = existing ? 'New Password (blank = keep current)' : 'Password *';
  errEl.classList.add('hidden');
  overlay.classList.remove('hidden');
  unameEl.focus();

  const close = () => {
    overlay.classList.add('hidden');
    saveBtn.removeEventListener('click', submit);
    cancelBtn.removeEventListener('click', close);
    overlay.removeEventListener('keydown', keyHandler);
  };

  const submit = async () => {
    errEl.classList.add('hidden');
    const username = unameEl.value.trim();
    const password = pwdEl.value;
    const is_admin = adminEl.checked;

    if (!username) {
      errEl.textContent = 'Username is required.'; errEl.classList.remove('hidden'); return;
    }
    if (!existing && !password) {
      errEl.textContent = 'Password is required.'; errEl.classList.remove('hidden'); return;
    }

    saveBtn.disabled = true;
    try {
      if (existing) {
        const body = { username, is_admin };
        if (password) body.password = password;
        await api.updateUser(existing.id, body);
        toast('User updated');
      } else {
        await api.createUser({ username, password, is_admin });
        toast('User created');
      }
      close();
      await loadUsers();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    } finally {
      saveBtn.disabled = false;
    }
  };

  const keyHandler = e => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') submit();
  };

  saveBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('keydown', keyHandler);
}

// ── Logout ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.removeItem('ot_token');
  window.location.href = 'index.html';
});

// ── Change server ──────────────────────────────────────────────────────────────
document.getElementById('btn-server').addEventListener('click', () => {
  localStorage.removeItem('ot_token');
  localStorage.removeItem('ot_server');
  window.location.href = 'index.html';
});

// ── Utility ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
