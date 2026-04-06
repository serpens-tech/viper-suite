'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const API = (localStorage.getItem('ot_server') || '').replace(/\/$/, '');
const IS_LOCAL_MODE = localStorage.getItem('ot_auth_mode') === 'local';

// Capacitor (Android) serves files from https://localhost — detect it so that
// internal redirects use relative paths instead of /crossed-viper/…
const _CAP      = globalThis.Capacitor !== undefined ||
                  globalThis.location.origin === 'https://localhost' ||
                  globalThis.location.origin === 'capacitor://localhost';
const _DESKTOP   = globalThis.location.hostname === '127.0.0.1';
const _LOCAL_CLIENT = _CAP || _DESKTOP;
const PATH_INDEX = _LOCAL_CLIENT ? 'index.html' : '/crossed-viper/';
const SHOW_CHANGE_SERVER =
  globalThis._SHOW_CHANGE_SERVER !== false &&
  localStorage.getItem('ot_show_change_server') !== '0';
let BUDGET_APP_URL = '/leaf-viper/';
if (_LOCAL_CLIENT && !IS_LOCAL_MODE) {
  BUDGET_APP_URL = `${API}/leaf-viper/`;
}
const LEAF_VIPER_PACKAGE = 'com.leafviper.app';

async function switchAppTarget(target, androidPackage, fallbackUrl) {
  const launcher = globalThis.Capacitor?.Plugins?.AppLauncher;
  if (_CAP && launcher && typeof launcher.canOpenUrl === 'function' && typeof launcher.openUrl === 'function') {
    try {
      const canOpen = await launcher.canOpenUrl({ url: androidPackage });
      if (canOpen?.value) {
        await launcher.openUrl({ url: androidPackage });
        return;
      }
    } catch {}
  }

  const desktopApi = globalThis.pywebview?.api;
  if (desktopApi && typeof desktopApi.switch_app === 'function') {
    try {
      const opened = await desktopApi.switch_app(target);
      if (opened) return;
    } catch {}
  }
  globalThis.location.href = fallbackUrl;
}

// ── State ─────────────────────────────────────────────────────────────────────
let token       = localStorage.getItem('ot_token') || null;
let currentUser = null;
let lists       = [];
let selectedList = null;
let selectedUserId = null;   // admin panel

// ── Auth guard ─────────────────────────────────────────────────────────────────
if (!token) { globalThis.location.href = PATH_INDEX; }

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
    globalThis.location.href = PATH_INDEX;
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

function getLocalJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function setLocalJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getLocalCurrentUserId() {
  const tokenUserId = String(token || '').startsWith('local:')
    ? Number.parseInt(String(token).slice(6), 10)
    : Number.parseInt(localStorage.getItem('ot_local_current_user') || '', 10);
  return Number.isNaN(tokenUserId) ? null : tokenUserId;
}

function requireLocalUser() {
  const userId = getLocalCurrentUserId();
  if (!userId) {
    localStorage.removeItem('ot_token');
    globalThis.location.href = PATH_INDEX;
    throw new Error('Not authenticated');
  }
  const users = getLocalJson('ot_local_users', []);
  const user = users.find(u => u.id === userId);
  if (!user) {
    localStorage.removeItem('ot_token');
    globalThis.location.href = PATH_INDEX;
    throw new Error('User not found');
  }
  return { user, users };
}

function localPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    is_admin: !!user.is_admin,
    created_at: user.created_at,
  };
}

function isValidPin(pin) {
  return /^\d{4,8}$/.test(pin);
}

function nextId(items) {
  return items.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;
}

function localApiNotSupported() {
  throw new Error('Admin features are not available in local account mode.');
}

function createLocalApi() {
  const byId = (id) => Number.parseInt(String(id), 10);
  return {
    me: async () => {
      const { user } = requireLocalUser();
      return localPublicUser(user);
    },
    updateMe: async (body) => {
      const { user, users } = requireLocalUser();
      if (body.username) {
        const conflict = users.find(u => u.username === body.username && u.id !== user.id);
        if (conflict) throw new Error('Username already taken');
        user.username = body.username;
      }
      if (body.password) user.password = body.password;
      if (body.pin !== undefined) {
        if (body.pin === '') {
          delete user.pin;
        } else if (isValidPin(body.pin)) {
          user.pin = body.pin;
        } else {
          throw new Error('PIN must be 4 to 8 digits.');
        }
      }
      setLocalJson('ot_local_users', users);
      return localPublicUser(user);
    },
    deleteMe: async () => {
      const { user, users } = requireLocalUser();
      const nextUsers = users.filter(u => u.id !== user.id);
      const listsStore = getLocalJson('ot_local_lists', []);
      const tasksStore = getLocalJson('ot_local_tasks', []);
      const ownedLists = new Set(listsStore.filter(l => l.owner_id === user.id).map(l => l.id));
      setLocalJson('ot_local_users', nextUsers);
      setLocalJson('ot_local_lists', listsStore.filter(l => l.owner_id !== user.id));
      setLocalJson('ot_local_tasks', tasksStore.filter(t => !ownedLists.has(t.list_id)));
      localStorage.removeItem('ot_token');
      localStorage.removeItem('ot_local_current_user');
      return null;
    },
    getLists: async () => {
      const { user } = requireLocalUser();
      const store = getLocalJson('ot_local_lists', []);
      return store.filter(l => l.owner_id === user.id).sort((a, b) => a.id - b.id);
    },
    createList: async (body) => {
      const { user } = requireLocalUser();
      const store = getLocalJson('ot_local_lists', []);
      const item = {
        id: nextId(store),
        title: body.title,
        description: body.description ?? null,
        owner_id: user.id,
      };
      store.push(item);
      setLocalJson('ot_local_lists', store);
      return item;
    },
    updateList: async (id, body) => {
      const { user } = requireLocalUser();
      const listId = byId(id);
      const store = getLocalJson('ot_local_lists', []);
      const item = store.find(l => l.id === listId && l.owner_id === user.id);
      if (!item) throw new Error('List not found');
      if (body.title !== undefined) item.title = body.title;
      if (body.description !== undefined) item.description = body.description;
      setLocalJson('ot_local_lists', store);
      return item;
    },
    deleteList: async (id) => {
      const { user } = requireLocalUser();
      const listId = byId(id);
      const store = getLocalJson('ot_local_lists', []);
      const exists = store.some(l => l.id === listId && l.owner_id === user.id);
      if (!exists) throw new Error('List not found');
      setLocalJson('ot_local_lists', store.filter(l => !(l.id === listId && l.owner_id === user.id)));
      const tasksStore = getLocalJson('ot_local_tasks', []);
      setLocalJson('ot_local_tasks', tasksStore.filter(t => t.list_id !== listId));
      return null;
    },
    getTasks: async (lid) => {
      const { user } = requireLocalUser();
      const listId = byId(lid);
      const listsStore = getLocalJson('ot_local_lists', []);
      const owned = listsStore.some(l => l.id === listId && l.owner_id === user.id);
      if (!owned) throw new Error('List not found');
      const tasksStore = getLocalJson('ot_local_tasks', []);
      return tasksStore.filter(t => t.list_id === listId).sort((a, b) => a.id - b.id);
    },
    createTask: async (lid, body) => {
      const { user } = requireLocalUser();
      const listId = byId(lid);
      const listsStore = getLocalJson('ot_local_lists', []);
      const owned = listsStore.some(l => l.id === listId && l.owner_id === user.id);
      if (!owned) throw new Error('List not found');
      const tasksStore = getLocalJson('ot_local_tasks', []);
      const task = {
        id: nextId(tasksStore),
        list_id: listId,
        title: body.title,
        description: body.description ?? null,
        completed: !!body.completed,
        finance_type: body.finance_type ?? null,
        finance_amount: body.finance_amount ?? null,
      };
      tasksStore.push(task);
      setLocalJson('ot_local_tasks', tasksStore);
      return task;
    },
    updateTask: async (lid, tid, body) => {
      const { user } = requireLocalUser();
      const listId = byId(lid);
      const taskId = byId(tid);
      const listsStore = getLocalJson('ot_local_lists', []);
      const owned = listsStore.some(l => l.id === listId && l.owner_id === user.id);
      if (!owned) throw new Error('List not found');
      const tasksStore = getLocalJson('ot_local_tasks', []);
      const task = tasksStore.find(t => t.id === taskId && t.list_id === listId);
      if (!task) throw new Error('Task not found');
      if (body.title !== undefined) task.title = body.title;
      if (body.description !== undefined) task.description = body.description;
      if (body.completed !== undefined) task.completed = !!body.completed;
      if (body.finance_type !== undefined) task.finance_type = body.finance_type;
      if (body.finance_amount !== undefined) task.finance_amount = body.finance_amount;
      setLocalJson('ot_local_tasks', tasksStore);
      return task;
    },
    deleteTask: async (lid, tid) => {
      const { user } = requireLocalUser();
      const listId = byId(lid);
      const taskId = byId(tid);
      const listsStore = getLocalJson('ot_local_lists', []);
      const owned = listsStore.some(l => l.id === listId && l.owner_id === user.id);
      if (!owned) throw new Error('List not found');
      const tasksStore = getLocalJson('ot_local_tasks', []);
      const exists = tasksStore.some(t => t.id === taskId && t.list_id === listId);
      if (!exists) throw new Error('Task not found');
      setLocalJson('ot_local_tasks', tasksStore.filter(t => !(t.id === taskId && t.list_id === listId)));
      return null;
    },
    getUsers: async () => localApiNotSupported(),
    createUser: async () => localApiNotSupported(),
    updateUser: async () => localApiNotSupported(),
    deleteUser: async () => localApiNotSupported(),
  };
}

const api = IS_LOCAL_MODE
  ? createLocalApi()
  : {
      me:           ()             => apiFetch('GET',    '/auth/me'),
      updateMe:     body          => apiFetch('PATCH',  '/users/me', body),
      deleteMe:     ()            => apiFetch('DELETE', '/users/me'),
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

function buildLocalBackup() {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    crossed: {
      users: getLocalJson('ot_local_users', []),
      lists: getLocalJson('ot_local_lists', []),
      tasks: getLocalJson('ot_local_tasks', []),
      current_user: localStorage.getItem('ot_local_current_user') || null,
    },
    leaf: {
      users: getLocalJson('ob_local_users', []),
      incomes: getLocalJson('ob_local_incomes', []),
      expenses: getLocalJson('ob_local_expenses', []),
      current_user: localStorage.getItem('ob_local_current_user') || null,
    },
  };
}

function exportLocalBackup() {
  const backup = buildLocalBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `opentask-local-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function applyImportedArray(payload, path, key) {
  if (payload[path] && Array.isArray(payload[path][key])) {
    setLocalJson(`${path === 'crossed' ? 'ot' : 'ob'}_local_${key}`, payload[path][key]);
  }
}

async function importLocalBackup(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file format.');

  applyImportedArray(data, 'crossed', 'users');
  applyImportedArray(data, 'crossed', 'lists');
  applyImportedArray(data, 'crossed', 'tasks');
  applyImportedArray(data, 'leaf', 'users');
  applyImportedArray(data, 'leaf', 'incomes');
  applyImportedArray(data, 'leaf', 'expenses');

  if (data.crossed && typeof data.crossed.current_user === 'string') {
    localStorage.setItem('ot_local_current_user', data.crossed.current_user);
  }
  if (data.leaf && typeof data.leaf.current_user === 'string') {
    localStorage.setItem('ob_local_current_user', data.leaf.current_user);
  }
}

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
const btnAdminSidebar  = document.getElementById('btn-admin-sidebar');
const sidebarUsername  = document.getElementById('sidebar-username');

function refreshUserLabel() {
  if (!currentUser) return;
  const label = currentUser.is_admin ? `★ ${currentUser.username}` : currentUser.username;
  topbarUser.textContent = label;
  sidebarUsername.textContent = label;
}

// ── Mobile sidebar toggle ─────────────────────────────────────────────────────
function openSidebar()  { document.body.classList.add('sidebar-open'); }
function closeSidebar() { document.body.classList.remove('sidebar-open'); }
function toggleSidebar(){ document.body.classList.toggle('sidebar-open'); }

document.getElementById('btn-hamburger').addEventListener('click', toggleSidebar);
document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);

// ── Swipe gesture for sidebar ─────────────────────────────────────────────────
(function () {
  let startX = null, startY = null;
  const EDGE = 28;      // px from left edge to trigger open swipe
  const THRESHOLD = 60; // min horizontal distance to register a swipe
  const MAX_VERT = 80;  // max vertical drift allowed

  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (startX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = Math.abs(t.clientY - startY);
    if (dy > MAX_VERT) { startX = null; return; }

    const isOpen = document.body.classList.contains('sidebar-open');

    // Swipe right from left edge → open
    if (!isOpen && dx > THRESHOLD && startX < EDGE) openSidebar();
    // Swipe left anywhere when open → close
    else if (isOpen && dx < -THRESHOLD) closeSidebar();

    startX = null;
  }, { passive: true });
})();

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    currentUser = await api.me();
    refreshUserLabel();
    if (currentUser.is_admin) {
      btnAdmin.classList.remove('hidden');
      btnAdminSidebar.classList.remove('hidden');
    }
    await loadLists();
  } catch (e) {
    toast(e.message, true);
  }
})();

// ── App switch ───────────────────────────────────────────────────────────────
if (IS_LOCAL_MODE) {
  document.getElementById('btn-switch-app').classList.add('hidden');
  document.getElementById('btn-switch-app-sidebar').classList.add('hidden');
} else {
  document.getElementById('btn-switch-app').addEventListener('click', () => {
    switchAppTarget('leaf-viper', LEAF_VIPER_PACKAGE, BUDGET_APP_URL);
  });
  document.getElementById('btn-switch-app-sidebar').addEventListener('click', () => {
    closeSidebar();
    switchAppTarget('leaf-viper', LEAF_VIPER_PACKAGE, BUDGET_APP_URL);
  });
}

// ── My account ───────────────────────────────────────────────────────────────
document.getElementById('btn-account').addEventListener('click', openAccountModal);
document.getElementById('btn-account-sidebar').addEventListener('click', () => {
  closeSidebar();
  openAccountModal();
});

document.getElementById('account-close').addEventListener('click', closeAccountModal);
document.getElementById('account-cancel').addEventListener('click', closeAccountModal);

function openAccountModal() {
  if (!currentUser) { toast('Loading user info, please try again.', true); return; }
  document.getElementById('acc-username').value = currentUser.username;
  document.getElementById('acc-password').value = '';
  const pinInput = document.getElementById('acc-pin');
  pinInput.value = '';
  pinInput.placeholder = IS_LOCAL_MODE ? 'Leave blank to keep, type OFF to remove' : 'Available in local mode only';
  pinInput.disabled = !IS_LOCAL_MODE;
  // Hide username/password fields in local mode (PIN only)
  document.getElementById('acc-username').closest('.field').style.display = IS_LOCAL_MODE ? 'none' : '';
  document.getElementById('acc-password').closest('.field').style.display = IS_LOCAL_MODE ? 'none' : '';
  document.getElementById('account-error').classList.add('hidden');
  document.getElementById('modal-account').classList.remove('hidden');
  if (IS_LOCAL_MODE) {
    document.getElementById('acc-pin').focus();
  } else {
    document.getElementById('acc-username').focus();
  }
}

function closeAccountModal() {
  document.getElementById('modal-account').classList.add('hidden');
}

document.getElementById('account-save').addEventListener('click', async () => {
  const errEl = document.getElementById('account-error');
  const saveBtn = document.getElementById('account-save');
  errEl.classList.add('hidden');

  const username = document.getElementById('acc-username').value.trim();
  const password = document.getElementById('acc-password').value;
  const pinRaw = document.getElementById('acc-pin').value.trim();
  if (!IS_LOCAL_MODE && !username) {
    errEl.textContent = 'Username is required.';
    errEl.classList.remove('hidden');
    return;
  }

  const body = {};
  if (!IS_LOCAL_MODE) {
    if (username !== currentUser.username) body.username = username;
    if (password) body.password = password;
  }
  if (IS_LOCAL_MODE && pinRaw) {
    if (pinRaw.toUpperCase() === 'OFF') body.pin = '';
    else if (isValidPin(pinRaw)) body.pin = pinRaw;
    else {
      errEl.textContent = 'PIN must be 4 to 8 digits (or OFF to remove).';
      errEl.classList.remove('hidden');
      return;
    }
  }
  if (Object.keys(body).length === 0) {
    closeAccountModal();
    return;
  }

  saveBtn.disabled = true;
  try {
    currentUser = await api.updateMe(body);
    refreshUserLabel();
    closeAccountModal();
    toast('Account updated');
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  } finally {
    saveBtn.disabled = false;
  }
});

document.getElementById('btn-export-local').addEventListener('click', () => {
  try {
    exportLocalBackup();
    toast('Local backup exported');
  } catch (e) {
    toast(e.message, true);
  }
});

document.getElementById('btn-import-local').addEventListener('click', () => {
  const input = document.getElementById('import-local-file');
  input.value = '';
  input.click();
});

document.getElementById('import-local-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!confirm('Replace local backup data with selected file contents?')) return;
  try {
    await importLocalBackup(file);
    if (IS_LOCAL_MODE) {
      currentUser = await api.me();
      refreshUserLabel();
      await loadLists();
    }
    toast('Local backup imported');
  } catch (e) {
    toast(e.message, true);
  }
});

document.getElementById('btn-delete-account').addEventListener('click', async () => {
  if (!confirm('Delete your account permanently?')) return;
  try {
    await api.deleteMe();
    localStorage.removeItem('ot_token');
    globalThis.location.href = PATH_INDEX;
  } catch (e) {
    const errEl = document.getElementById('account-error');
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  }
});

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
  closeSidebar();           // auto-close on mobile after selecting a list
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
        ${(task.finance_type && task.finance_amount != null)
          ? `<div style="margin-top:4px"><span class="badge ${task.finance_type === 'income' ? 'badge-income' : 'badge-expense'}">${task.finance_type === 'income' ? '💰 +' : '💸 -'}${Number.parseFloat(task.finance_amount).toFixed(2)}</span></div>`
          : ''}
      </div>
      <div class="task-btns">
        <button class="icon-only-btn btn-edit-task" title="Edit task" aria-label="Edit task">✏️</button>
        <button class="icon-only-btn btn-del-task" title="Delete task" aria-label="Delete task">🗑️</button>
      </div>`;

    li.querySelector('.task-check').addEventListener('change', async () => {
      try {
        await api.updateTask(selectedList.id, task.id, { completed: !task.completed });
        await loadTasks();
      } catch (e) { toast(e.message, true); }
    });

    li.querySelector('.btn-edit-task').addEventListener('click', () => {
      openFormModal('Edit Task', [
        { label: 'Title *',       key: 'title',          type: 'text',     required: true,  value: task.title },
        { label: 'Description',   key: 'description',    type: 'textarea', required: false, value: task.description || '' },
        { label: 'Finance type',  key: 'finance_type',   type: 'select',   required: false, value: task.finance_type || '',
          options: [
            { value: '',        label: '— None —' },
            { value: 'income',  label: '💰 Income (adds to balance)' },
            { value: 'expense', label: '💸 Expense (subtracts from balance)' },
          ]},
        { label: 'Amount',        key: 'finance_amount', type: 'number',   required: false, value: task.finance_amount == null ? '' : task.finance_amount },
      ], async data => {
        await api.updateTask(selectedList.id, task.id, {
          title:          data.title       || undefined,
          description:    data.description || undefined,
          finance_type:   data.finance_type   || null,
          finance_amount: data.finance_amount ? Number.parseFloat(data.finance_amount) : null,
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
    { label: 'Title *',       key: 'title',          type: 'text',     required: true  },
    { label: 'Description',   key: 'description',    type: 'textarea', required: false },
    { label: 'Finance type',  key: 'finance_type',   type: 'select',   required: false,
      options: [
        { value: '',        label: '— None —' },
        { value: 'income',  label: '💰 Income (adds to balance)' },
        { value: 'expense', label: '💸 Expense (subtracts from balance)' },
      ]},
    { label: 'Amount',        key: 'finance_amount', type: 'number',   required: false },
  ], async data => {
    await api.createTask(selectedList.id, {
      title:          data.title,
      description:    data.description    || null,
      finance_type:   data.finance_type   || null,
      finance_amount: data.finance_amount ? Number.parseFloat(data.finance_amount) : null,
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
    } else if (f.type === 'select') {
      el = document.createElement('select');
      (f.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        el.appendChild(o);
      });
    } else {
      el = document.createElement('input');
      el.type = f.type || 'text';
      if (f.type === 'number') { el.min = '0'; el.step = 'any'; }
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
document.getElementById('btn-admin-sidebar').addEventListener('click', () => {
  closeSidebar();
  openAdminPanel();
});
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
  localStorage.removeItem('ot_auth_mode');
  localStorage.removeItem('ot_local_current_user');
  globalThis.location.href = PATH_INDEX;
});
document.getElementById('btn-logout-sidebar').addEventListener('click', () => {
  localStorage.removeItem('ot_token');
  localStorage.removeItem('ot_auth_mode');
  localStorage.removeItem('ot_local_current_user');
  globalThis.location.href = PATH_INDEX;
});

// ── Change server ──────────────────────────────────────────────────────────────
function changeServer() {
  localStorage.removeItem('ot_token');
  localStorage.removeItem('ot_server');
  localStorage.setItem('ot_auth_mode', 'remote');
  globalThis.location.href = PATH_INDEX;
}
document.getElementById('btn-server').addEventListener('click', changeServer);
document.getElementById('btn-server-sidebar').addEventListener('click', changeServer);
if (!SHOW_CHANGE_SERVER) {
  document.getElementById('btn-server').classList.add('hidden');
  document.getElementById('btn-server-sidebar').classList.add('hidden');
}

// ── Theme toggle ──────────────────────────────────────────────────────────────
(function() {
  function syncBtns() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const t = document.getElementById('btn-theme');
    const s = document.getElementById('btn-theme-sidebar');
    if (t) t.textContent = isDark ? '☀️' : '🌙';
    if (s) s.textContent = isDark ? '☀️ Light mode' : '🌙 Dark mode';
  }
  function toggle() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ot_theme', next);
    syncBtns();
  }
  document.getElementById('btn-theme').addEventListener('click', toggle);
  document.getElementById('btn-theme-sidebar').addEventListener('click', toggle);
  syncBtns();
})();

// ── Utility ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
