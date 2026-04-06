'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const API = (localStorage.getItem('ob_server') || '').replace(/\/$/, '');
const IS_LOCAL_MODE = localStorage.getItem('ob_auth_mode') === 'local';

// Capacitor (Android) serves files from https://localhost — detect it so that
// internal redirects use relative paths instead of /leaf-viper/…
const _CAP       = globalThis.Capacitor !== undefined ||
                   globalThis.location.origin === 'https://localhost' ||
                   globalThis.location.origin === 'capacitor://localhost';
const _DESKTOP    = globalThis.location.hostname === '127.0.0.1';
const _LOCAL_CLIENT = _CAP || _DESKTOP;
const PATH_INDEX  = _LOCAL_CLIENT ? 'index.html' : '/leaf-viper/';
const SHOW_CHANGE_SERVER =
  globalThis._SHOW_CHANGE_SERVER !== false &&
  localStorage.getItem('ob_show_change_server') !== '0';
let TASKS_APP_URL = '/crossed-viper/';
if (_LOCAL_CLIENT && !IS_LOCAL_MODE) {
  TASKS_APP_URL = `${API}/crossed-viper/`;
}
const CROSSED_VIPER_PACKAGE = 'com.crossedviper.app';

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
let token          = localStorage.getItem('ob_token') || null;
let currentUser    = null;
let incomes        = [];
let expenses       = [];
let summary        = null;
let selectedUserId = null;

// ── Auth guard ─────────────────────────────────────────────────────────────────
if (!token) { globalThis.location.href = PATH_INDEX; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function fmtMonth(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}

function fmtAmt(n) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

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
    throw new Error(`Cannot connect to server (${API})`);
  }

  if (res.status === 401) {
    localStorage.removeItem('ob_token');
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
    : Number.parseInt(localStorage.getItem('ob_local_current_user') || '', 10);
  return Number.isNaN(tokenUserId) ? null : tokenUserId;
}

function requireLocalUser() {
  const userId = getLocalCurrentUserId();
  if (!userId) {
    localStorage.removeItem('ob_token');
    globalThis.location.href = PATH_INDEX;
    throw new Error('Not authenticated');
  }
  const users = getLocalJson('ob_local_users', []);
  const user = users.find(u => u.id === userId);
  if (!user) {
    localStorage.removeItem('ob_token');
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

function buildLocalSummary(incomeRows, expenseRows) {
  const monthlyMap = new Map();
  let totalIncome = 0;
  let totalExpense = 0;

  incomeRows.forEach(row => {
    totalIncome += Number(row.amount) || 0;
    const key = String(row.date || '').slice(0, 7);
    if (!monthlyMap.has(key)) monthlyMap.set(key, { income: 0, expense: 0 });
    monthlyMap.get(key).income += Number(row.amount) || 0;
  });

  expenseRows.forEach(row => {
    totalExpense += Number(row.amount) || 0;
    const key = String(row.date || '').slice(0, 7);
    if (!monthlyMap.has(key)) monthlyMap.set(key, { income: 0, expense: 0 });
    monthlyMap.get(key).expense += Number(row.amount) || 0;
  });

  const monthly = [...monthlyMap.entries()]
    .filter(([key]) => /^\d{4}-\d{2}$/.test(key))
    .map(([key, values]) => {
      const [yearStr, monthStr] = key.split('-');
      const year = Number.parseInt(yearStr, 10);
      const month = Number.parseInt(monthStr, 10);
      return {
        year,
        month,
        income: values.income,
        expense: values.expense,
        net: values.income - values.expense,
      };
    })
    .sort((a, b) => {
      const ka = a.year * 100 + a.month;
      const kb = b.year * 100 + b.month;
      return kb - ka;
    });

  return {
    total_income: totalIncome,
    total_expense: totalExpense,
    balance: totalIncome - totalExpense,
    monthly,
  };
}

function createLocalApi() {
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
      setLocalJson('ob_local_users', users);
      return localPublicUser(user);
    },
    deleteMe: async () => {
      const { user, users } = requireLocalUser();
      const incomesStore = getLocalJson('ob_local_incomes', []);
      const expensesStore = getLocalJson('ob_local_expenses', []);
      setLocalJson('ob_local_users', users.filter(u => u.id !== user.id));
      setLocalJson('ob_local_incomes', incomesStore.filter(e => e.user_id !== user.id));
      setLocalJson('ob_local_expenses', expensesStore.filter(e => e.user_id !== user.id));
      localStorage.removeItem('ob_token');
      localStorage.removeItem('ob_local_current_user');
      return null;
    },
    getSummary: async () => {
      const { user } = requireLocalUser();
      const incomesStore = getLocalJson('ob_local_incomes', []).filter(e => e.user_id === user.id);
      const expensesStore = getLocalJson('ob_local_expenses', []).filter(e => e.user_id === user.id);
      return buildLocalSummary(incomesStore, expensesStore);
    },
    getIncomes: async () => {
      const { user } = requireLocalUser();
      return getLocalJson('ob_local_incomes', [])
        .filter(e => e.user_id === user.id)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.id - a.id));
    },
    createIncome: async (body) => {
      const { user } = requireLocalUser();
      const store = getLocalJson('ob_local_incomes', []);
      const item = {
        id: nextId(store),
        user_id: user.id,
        name: body.name,
        description: body.description ?? null,
        amount: body.amount,
        date: body.date,
      };
      store.push(item);
      setLocalJson('ob_local_incomes', store);
      return item;
    },
    updateIncome: async (id, body) => {
      const { user } = requireLocalUser();
      const itemId = Number.parseInt(String(id), 10);
      const store = getLocalJson('ob_local_incomes', []);
      const item = store.find(e => e.id === itemId && e.user_id === user.id);
      if (!item) throw new Error('Income entry not found');
      if (body.name !== undefined) item.name = body.name;
      if (body.description !== undefined) item.description = body.description;
      if (body.amount !== undefined) item.amount = body.amount;
      if (body.date !== undefined) item.date = body.date;
      setLocalJson('ob_local_incomes', store);
      return item;
    },
    deleteIncome: async (id) => {
      const { user } = requireLocalUser();
      const itemId = Number.parseInt(String(id), 10);
      const store = getLocalJson('ob_local_incomes', []);
      const exists = store.some(e => e.id === itemId && e.user_id === user.id);
      if (!exists) throw new Error('Income entry not found');
      setLocalJson('ob_local_incomes', store.filter(e => !(e.id === itemId && e.user_id === user.id)));
      return null;
    },
    getExpenses: async () => {
      const { user } = requireLocalUser();
      return getLocalJson('ob_local_expenses', [])
        .filter(e => e.user_id === user.id)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.id - a.id));
    },
    createExpense: async (body) => {
      const { user } = requireLocalUser();
      const store = getLocalJson('ob_local_expenses', []);
      const item = {
        id: nextId(store),
        user_id: user.id,
        name: body.name,
        description: body.description ?? null,
        amount: body.amount,
        date: body.date,
      };
      store.push(item);
      setLocalJson('ob_local_expenses', store);
      return item;
    },
    updateExpense: async (id, body) => {
      const { user } = requireLocalUser();
      const itemId = Number.parseInt(String(id), 10);
      const store = getLocalJson('ob_local_expenses', []);
      const item = store.find(e => e.id === itemId && e.user_id === user.id);
      if (!item) throw new Error('Expense entry not found');
      if (body.name !== undefined) item.name = body.name;
      if (body.description !== undefined) item.description = body.description;
      if (body.amount !== undefined) item.amount = body.amount;
      if (body.date !== undefined) item.date = body.date;
      setLocalJson('ob_local_expenses', store);
      return item;
    },
    deleteExpense: async (id) => {
      const { user } = requireLocalUser();
      const itemId = Number.parseInt(String(id), 10);
      const store = getLocalJson('ob_local_expenses', []);
      const exists = store.some(e => e.id === itemId && e.user_id === user.id);
      if (!exists) throw new Error('Expense entry not found');
      setLocalJson('ob_local_expenses', store.filter(e => !(e.id === itemId && e.user_id === user.id)));
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
      me:             ()           => apiFetch('GET',    '/auth/me'),
      updateMe:       body         => apiFetch('PATCH',  '/users/me', body),
      deleteMe:       ()           => apiFetch('DELETE', '/users/me'),
      getSummary:     ()           => apiFetch('GET',    '/finance/summary'),
      getIncomes:     ()           => apiFetch('GET',    '/finance/incomes'),
      createIncome:   body         => apiFetch('POST',   '/finance/incomes', body),
      updateIncome:   (id, body)   => apiFetch('PATCH',  `/finance/incomes/${id}`, body),
      deleteIncome:   id           => apiFetch('DELETE', `/finance/incomes/${id}`),
      getExpenses:    ()           => apiFetch('GET',    '/finance/expenses'),
      createExpense:  body         => apiFetch('POST',   '/finance/expenses', body),
      updateExpense:  (id, body)   => apiFetch('PATCH',  `/finance/expenses/${id}`, body),
      deleteExpense:  id           => apiFetch('DELETE', `/finance/expenses/${id}`),
      // admin
      getUsers:       ()           => apiFetch('GET',    '/users'),
      createUser:     body         => apiFetch('POST',   '/users', body),
      updateUser:     (id, body)   => apiFetch('PATCH',  `/users/${id}`, body),
      deleteUser:     id           => apiFetch('DELETE', `/users/${id}`),
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

function refreshUserLabel() {
  if (!currentUser) return;
  const label = currentUser.is_admin ? `★ ${currentUser.username}` : currentUser.username;
  document.getElementById('topbar-user').textContent = label;
}

// ── Load all data ─────────────────────────────────────────────────────────────
async function loadAll() {
  [summary, incomes, expenses] = await Promise.all([
    api.getSummary(),
    api.getIncomes(),
    api.getExpenses(),
  ]);
  renderSummaryCards();
  rebuildMonthFilter();
  renderLists();
  renderMonthlyTable();
}

// ── Summary cards ─────────────────────────────────────────────────────────────
function renderSummaryCards() {
  const bal = summary.balance;
  const balEl = document.getElementById('card-balance');
  balEl.textContent = fmtAmt(bal);
  balEl.className = `s-value ${bal >= 0 ? 'positive' : 'negative'}`;
  document.getElementById('card-income').textContent  = fmtAmt(summary.total_income);
  document.getElementById('card-expense').textContent = fmtAmt(summary.total_expense);
}

// ── Month filter ──────────────────────────────────────────────────────────────
function rebuildMonthFilter() {
  const sel = document.getElementById('month-filter');
  const current = sel.value;
  // collect unique months from both lists
  const keys = new Set();
  [...incomes, ...expenses].forEach(e => {
    const [y, m] = e.date.split('-');
    keys.add(`${y}-${m}`);
  });
  const sorted = [...keys].sort((a, b) => b.localeCompare(a));

  sel.innerHTML = '<option value="">All months</option>';
  sorted.forEach(k => {
    const [y, m] = k.split('-');
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = fmtMonth(Number.parseInt(y, 10), Number.parseInt(m, 10));
    sel.appendChild(opt);
  });

  if ([...sel.options].some(o => o.value === current)) {
    sel.value = current;
  }
}

function selectedMonth() {
  return document.getElementById('month-filter').value; // "" or "YYYY-MM"
}

document.getElementById('month-filter').addEventListener('change', renderLists);

// ── Render income / expense lists ─────────────────────────────────────────────
function renderLists() {
  const filter = selectedMonth();
  const filtered = arr => filter
    ? arr.filter(e => e.date.startsWith(filter))
    : arr;

  renderEntries('incomes-ul',  'incomes-empty',  filtered(incomes),  'income');
  renderEntries('expenses-ul', 'expenses-empty', filtered(expenses), 'expense');
}

function renderEntries(ulId, emptyId, entries, type) {
  const ul    = document.getElementById(ulId);
  const empty = document.getElementById(emptyId);
  ul.innerHTML = '';

  if (entries.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  entries.forEach(entry => {
    const li = document.createElement('li');
    li.className = `entry-item ${type}`;
    li.innerHTML = `
      <div class="entry-main">
        <span class="entry-name">${escHtml(entry.name)}</span>
        <span class="entry-date">${entry.date}</span>
        ${entry.description ? `<span class="entry-desc">${escHtml(entry.description)}</span>` : ''}
      </div>
      <div class="entry-right">
        <span class="entry-amount ${type}-amt">${fmtAmt(entry.amount)}</span>
        <div class="entry-btns">
          <button class="icon-only-btn btn-edit" title="Edit entry" aria-label="Edit entry">✏️</button>
          <button class="icon-only-btn btn-delete" title="Delete entry" aria-label="Delete entry">🗑️</button>
        </div>
      </div>`;

    li.querySelector('.btn-edit').addEventListener('click', () => openEditModal(type, entry));
    li.querySelector('.btn-delete').addEventListener('click', () => deleteEntry(type, entry));
    ul.appendChild(li);
  });
}

// ── Monthly table ─────────────────────────────────────────────────────────────
function renderMonthlyTable() {
  const tbody    = document.getElementById('monthly-tbody');
  const emptyMsg = document.getElementById('monthly-empty');
  tbody.innerHTML = '';

  if (!summary.monthly || summary.monthly.length === 0) {
    emptyMsg.classList.remove('hidden');
    return;
  }
  emptyMsg.classList.add('hidden');

  // Compute cumulative balance (oldest → newest)
  const sorted = [...summary.monthly].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
  let running = 0;
  sorted.forEach(m => { running += m.net; m.cumulative = running; });
  // Display newest first
  [...sorted].reverse().forEach(m => {
    const netCls = m.net >= 0 ? 'td-net-pos' : 'td-net-neg';
    const balCls = m.cumulative >= 0 ? 'td-net-pos' : 'td-net-neg';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtMonth(m.year, m.month)}</td>
      <td class="td-income">${fmtAmt(m.income)}</td>
      <td class="td-expense">${fmtAmt(m.expense)}</td>
      <td class="${netCls}">${m.net >= 0 ? '+' : ''}${fmtAmt(m.net)}</td>
      <td class="${balCls}">${fmtAmt(m.cumulative)}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Add / Edit modals ─────────────────────────────────────────────────────────
document.getElementById('btn-add-income').addEventListener('click', () => {
  openFormModal('New Income', null, 'income');
});
document.getElementById('btn-add-expense').addEventListener('click', () => {
  openFormModal('New Expense', null, 'expense');
});

function openEditModal(type, entry) {
  const title = type === 'income' ? 'Edit Income' : 'Edit Expense';
  openFormModal(title, entry, type);
}

function openFormModal(title, entry, type) {
  const overlay  = document.getElementById('modal-form');
  const titleEl  = document.getElementById('modal-title');
  const fieldsEl = document.getElementById('modal-fields');
  const errEl    = document.getElementById('modal-error');
  const saveBtn  = document.getElementById('modal-save');
  const cancelBtn= document.getElementById('modal-cancel');
  const xBtn     = document.getElementById('modal-x');

  titleEl.textContent = title;
  errEl.classList.add('hidden');
  fieldsEl.innerHTML = '';

  // Build fields
  const fields = [
    { key: 'name',        label: 'Name *',        type: 'text',     required: true,  value: entry?.name        || '' },
    { key: 'description', label: 'Description',   type: 'textarea', required: false, value: entry?.description || '' },
    { key: 'amount',      label: 'Amount *',      type: 'number',   required: true,  value: entry?.amount == null ? '' : String(entry.amount) },
    { key: 'date',        label: 'Date *',        type: 'date',     required: true,  value: entry?.date        || today() },
  ];

  const refs = {};
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
      el.rows = 2;
      el.style.resize = 'vertical';
    } else {
      el = document.createElement('input');
      el.type = f.type;
      if (f.type === 'number') { el.min = '0.01'; el.step = '0.01'; }
    }
    el.id = `mf-${f.key}`;
    el.value = f.value;
    wrap.appendChild(el);
    fieldsEl.appendChild(wrap);
    refs[f.key] = { el, required: f.required };
  });

  // Save button accent matches type
  saveBtn.className = `btn ${type === 'income' ? 'btn-income' : 'btn-expense'}`;

  overlay.classList.remove('hidden');
  refs['name'].el.focus();

  const close = () => {
    overlay.classList.add('hidden');
    saveBtn.removeEventListener('click', submit);
    cancelBtn.removeEventListener('click', close);
    xBtn.removeEventListener('click', close);
    overlay.removeEventListener('keydown', keyHandler);
  };

  const submit = async () => {
    errEl.classList.add('hidden');
    const data = {};
    for (const [key, { el, required }] of Object.entries(refs)) {
      const val = el.value.trim();
      if (required && !val) {
        errEl.textContent = `"${key}" is required.`;
        errEl.classList.remove('hidden');
        el.focus();
        return;
      }
      data[key] = val;
    }
    const body = {
      name:        data.name,
      description: data.description || null,
      amount:      Number.parseFloat(data.amount),
      date:        data.date,
    };
    if (Number.isNaN(body.amount) || body.amount <= 0) {
      errEl.textContent = 'Amount must be a positive number.';
      errEl.classList.remove('hidden');
      refs['amount'].el.focus();
      return;
    }

    saveBtn.disabled = true;
    try {
      if (entry) {
        // edit
        if (type === 'income')  await api.updateIncome(entry.id, body);
        else                    await api.updateExpense(entry.id, body);
        toast('Changes saved');
      } else {
        // create
        if (type === 'income')  await api.createIncome(body);
        else                    await api.createExpense(body);
        toast(type === 'income' ? 'Income added' : 'Expense added');
      }
      close();
      await loadAll();
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
  xBtn.addEventListener('click', close);
  overlay.addEventListener('keydown', keyHandler);
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteEntry(type, entry) {
  const label = type === 'income' ? 'income' : 'expense';
  if (!confirm(`Delete ${label} "${entry.name}"?`)) return;
  try {
    if (type === 'income')  await api.deleteIncome(entry.id);
    else                    await api.deleteExpense(entry.id);
    toast(`${type === 'income' ? 'Income' : 'Expense'} deleted`);
    await loadAll();
  } catch (e) { toast(e.message, true); }
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

document.getElementById('btn-new-user').addEventListener('click', () => openUserForm(null));

document.getElementById('btn-edit-user').addEventListener('click', () => {
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
  if (selectedUserId === currentUser.id) { toast('You cannot delete your own account.', true); return; }
  if (!confirm('Delete this user?')) return;
  try {
    await api.deleteUser(selectedUserId);
    selectedUserId = null;
    await loadUsers();
    toast('User deleted');
  } catch (e) { toast(e.message, true); }
});

function openUserForm(existing) {
  const overlay   = document.getElementById('modal-user-form');
  const titleEl   = document.getElementById('user-form-title');
  const unameEl   = document.getElementById('uf-username');
  const pwdEl     = document.getElementById('uf-password');
  const pwdLbl    = document.getElementById('uf-pwd-label');
  const adminEl   = document.getElementById('uf-is-admin');
  const errEl     = document.getElementById('user-form-error');
  const saveBtn   = document.getElementById('user-form-save');
  const cancelBtn = document.getElementById('user-form-cancel');

  titleEl.textContent   = existing ? 'Edit User' : 'New User';
  unameEl.value         = existing?.username ?? '';
  pwdEl.value           = '';
  adminEl.checked       = existing?.is_admin ?? false;
  pwdLbl.textContent    = existing ? 'New Password (blank = keep current)' : 'Password *';
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
    if (!username) { errEl.textContent = 'Username is required.'; errEl.classList.remove('hidden'); return; }
    if (!existing && !password) { errEl.textContent = 'Password is required.'; errEl.classList.remove('hidden'); return; }
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

// ── Logout / Change server ────────────────────────────────────────────────────
if (IS_LOCAL_MODE) {
  document.getElementById('btn-switch-app').classList.add('hidden');
} else {
  document.getElementById('btn-switch-app').addEventListener('click', () => {
    switchAppTarget('crossed-viper', CROSSED_VIPER_PACKAGE, TASKS_APP_URL);
  });
}

document.getElementById('btn-account').addEventListener('click', openAccountModal);
document.getElementById('account-close').addEventListener('click', closeAccountModal);
document.getElementById('account-cancel').addEventListener('click', closeAccountModal);

function openAccountModal() {
  if (!currentUser) return;
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
      await loadAll();
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
    localStorage.removeItem('ob_token');
    globalThis.location.href = PATH_INDEX;
  } catch (e) {
    const errEl = document.getElementById('account-error');
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.removeItem('ob_token');
  localStorage.removeItem('ob_auth_mode');
  localStorage.removeItem('ob_local_current_user');
  localStorage.removeItem('ob_server');
  globalThis.location.href = PATH_INDEX;
});
document.getElementById('btn-server').addEventListener('click', () => {
  const url = prompt('Server URL:', localStorage.getItem('ob_server') || '');
  if (url !== null) {
    localStorage.setItem('ob_auth_mode', 'remote');
    localStorage.setItem('ob_server', url.trim().replace(/\/$/, ''));
    globalThis.location.reload();
  }
});
if (!SHOW_CHANGE_SERVER) {
  document.getElementById('btn-server').classList.add('hidden');
}

// ── Theme toggle ──────────────────────────────────────────────────────────────
(function() {
  function syncBtn() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const t = document.getElementById('btn-theme');
    if (t) t.textContent = isDark ? '☀️' : '🌙';
  }
  document.getElementById('btn-theme').addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ob_theme', next);
    syncBtn();
  });
  syncBtn();
})();

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    currentUser = await api.me();
    refreshUserLabel();
    if (currentUser.is_admin) {
      document.getElementById('btn-admin').classList.remove('hidden');
    }
    await loadAll();
  } catch (e) {
    toast(e.message, true);
  }
})();
