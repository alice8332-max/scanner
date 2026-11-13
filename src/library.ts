import type { Session } from '@supabase/supabase-js';
import { CONFIG_ERROR, isSupabaseConfigured } from './lib/config';
import { getSession, onAuthChange, signIn, signOut } from './lib/auth';
import {
  deleteScan,
  downloadScan,
  formatBytes,
  listScans,
  type ScanRecord
} from './lib/scans';

const boot = document.getElementById('boot') as HTMLDivElement;
const loginView = document.getElementById('login-view') as HTMLElement;
const libraryView = document.getElementById('library-view') as HTMLElement;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const email = document.getElementById('email') as HTMLInputElement;
const password = document.getElementById('password') as HTMLInputElement;
const loginError = document.getElementById('login-error') as HTMLDivElement;
const loginSubmit = document.getElementById('login-submit') as HTMLButtonElement;
const configError = document.getElementById('config-error') as HTMLParagraphElement;
const list = document.getElementById('list') as HTMLDivElement;
const listError = document.getElementById('list-error') as HTMLDivElement;
const empty = document.getElementById('empty') as HTMLDivElement;
const usage = document.getElementById('usage') as HTMLDivElement;
const libraryMeta = document.getElementById('library-meta') as HTMLParagraphElement;
const refresh = document.getElementById('refresh') as HTMLButtonElement;
const signout = document.getElementById('signout') as HTMLButtonElement;
const toast = document.getElementById('toast') as HTMLDivElement;

let toastTimer = -1;
let currentUserId: string | null = null;
let loadRequest = 0;

const showToast = (message: string) => {
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
  }, 2600) as unknown as number;
};

const showView = (view: 'boot' | 'login' | 'library') => {
  boot.classList.toggle('hidden', view !== 'boot');
  loginView.classList.toggle('hidden', view !== 'login');
  libraryView.classList.toggle('hidden', view !== 'library');
  refresh.classList.toggle('hidden', view !== 'library');
  signout.classList.toggle('hidden', view !== 'library');
};

const renderUsage = (records: ScanRecord[]) => {
  const total = records.reduce((sum, record) => sum + Number(record.size || 0), 0);
  usage.textContent = `已用 ${formatBytes(total)}`;
  libraryMeta.textContent = `共 ${records.length} 份扫描`;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const createItem = (record: ScanRecord) => {
  const item = document.createElement('div');
  item.className = 'item';

  const icon = document.createElement('div');
  icon.className = 'pdf-icon';
  icon.textContent = 'PDF';

  const main = document.createElement('div');
  main.className = 'item-main';
  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = record.name;
  name.title = record.name;
  const meta = document.createElement('div');
  meta.className = 'item-meta';
  meta.textContent = `${formatDate(record.created_at)} · ${formatBytes(Number(record.size || 0))}`;
  main.append(name, meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'btn small';
  downloadButton.textContent = '下载';
  downloadButton.onclick = async () => {
    downloadButton.disabled = true;
    downloadButton.textContent = '下载中…';
    try {
      const blob = await downloadScan(record);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = record.name;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '下载失败');
    } finally {
      downloadButton.disabled = false;
      downloadButton.textContent = '下载';
    }
  };

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'btn small danger';
  deleteButton.textContent = '删除';
  deleteButton.onclick = async () => {
    if (!window.confirm(`确定删除「${record.name}」？此操作不可恢复。`)) return;
    deleteButton.disabled = true;
    deleteButton.textContent = '删除中…';
    try {
      await deleteScan(record.id);
      showToast('已删除');
      item.remove();
      await loadLibrary();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败');
      deleteButton.disabled = false;
      deleteButton.textContent = '删除';
    }
  };

  actions.append(downloadButton, deleteButton);
  item.append(icon, main, actions);
  return item;
};

const renderList = (records: ScanRecord[]) => {
  list.replaceChildren();
  if (!records.length) {
    empty.classList.remove('hidden');
    usage.textContent = '已用 0 B';
    libraryMeta.textContent = '共 0 份扫描';
    return;
  }
  empty.classList.add('hidden');
  for (const record of records) {
    list.appendChild(createItem(record));
  }
  renderUsage(records);
};

const loadLibrary = async () => {
  const request = ++loadRequest;
  listError.classList.add('hidden');
  refresh.disabled = true;
  try {
    const records = await listScans();
    if (request === loadRequest) renderList(records);
  } catch (err) {
    if (request === loadRequest) {
      listError.textContent = err instanceof Error ? err.message : '加载失败';
      listError.classList.remove('hidden');
      list.replaceChildren();
      empty.classList.add('hidden');
      libraryMeta.textContent = '';
      usage.textContent = '资料库';
    }
  } finally {
    if (request === loadRequest) refresh.disabled = false;
  }
};

const handleSession = (session: Session | null) => {
  const nextUserId = session?.user.id ?? null;
  if (nextUserId === currentUserId) {
    showView(session ? 'library' : 'login');
    return;
  }
  currentUserId = nextUserId;
  if (session) {
    showView('library');
    loadLibrary();
  } else {
    showView('login');
    usage.textContent = '资料库';
    list.replaceChildren();
    empty.classList.add('hidden');
  }
};

loginForm.onsubmit = async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  if (!isSupabaseConfigured) {
    loginError.textContent = CONFIG_ERROR;
    return;
  }
  loginSubmit.disabled = true;
  loginSubmit.textContent = '登录中…';
  try {
    const session = await signIn(email.value.trim(), password.value);
    localStorage.setItem('lastEmail', email.value.trim());
    password.value = '';
    handleSession(session);
    showToast('登录成功');
  } catch (err) {
    loginError.textContent = err instanceof Error ? err.message : '登录失败';
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = '登录';
  }
};

refresh.onclick = () => {
  loadLibrary();
};

signout.onclick = async () => {
  signout.disabled = true;
  try {
    await signOut();
    handleSession(null);
    showToast('已退出登录');
  } catch (err) {
    showToast(err instanceof Error ? err.message : '退出失败');
  } finally {
    signout.disabled = false;
  }
};

email.value = localStorage.getItem('lastEmail') || '';

if (!isSupabaseConfigured) {
  configError.textContent = CONFIG_ERROR;
  configError.classList.remove('hidden');
  loginSubmit.disabled = true;
  showView('login');
} else {
  onAuthChange(handleSession);
  getSession()
    .then(handleSession)
    .catch((err) => {
      showToast(err instanceof Error ? err.message : '读取登录状态失败');
      handleSession(null);
    });
}

if (process.env.NODE_ENV == 'production' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('./service.ts', import.meta.url), {
    type: 'module',
    scope: './'
  }).catch((err) => {
    console.error('Service worker registration failed', err);
  });
}
