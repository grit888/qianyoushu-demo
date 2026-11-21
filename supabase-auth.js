(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const state = byId('auth-state'), open = byId('auth-open'), panel = byId('auth-panel');
  const email = byId('auth-email'), password = byId('auth-password');
  const submit = byId('auth-submit'), cancel = byId('auth-cancel'), logout = byId('auth-logout'), message = byId('auth-message');
  if (!state) return;
  let client = null, user = null, busy = false, version = 0, status = 'loading';
  const listeners = new Set();
  window.QYSAuth = Object.freeze({
    getClient: () => client,
    subscribe(listener) { listeners.add(listener); listener({user, status}); return () => listeners.delete(listener); }
  });
  function notify() { for (const listener of listeners) listener({user, status}); }
  function setMessage(text) { message.textContent = text || ''; }
  function setBusy(value) { busy = value; submit.disabled = value; logout.disabled = value; submit.textContent = value ? '处理中…' : '登录并查看云端账单'; }
  function render(session) {
    user = session?.user ? {id:session.user.id, email:session.user.email || ''} : null;
    status = 'ready';
    state.textContent = user ? '已登录 · ' + user.email : '未登录 · 云端未连接';
    open.hidden = false; open.textContent = user ? '我的账号' : '账号登录'; panel.hidden = false;
    for (const field of [email, password, submit, byId('auth-fields')]) if (field) field.hidden = Boolean(user);
    if (byId('account-heading')) byId('account-heading').textContent = user ? '账号已连接' : '登录云端账号';
    if (byId('account-connected')) byId('account-connected').hidden = !user;
    logout.hidden = !user;
    submit.disabled = busy;
    cancel.textContent = user ? '返回演示工作台' : '暂不登录，进入演示工作台';
    if (user) { password.value = ''; setMessage('云端身份已确认；演示账本仍保存在本机，不会自动上传。'); }
    else setMessage('');
    notify();
  }
  function unavailable(reason, label) {
    status = 'unavailable'; user = null;
    state.textContent = '本地演示 · ' + label;
    open.hidden = false; panel.hidden = false;
    for (const field of [email, password, submit, logout, byId('auth-fields')]) if (field) field.hidden = true;
    setMessage(reason); notify();
  }
  function showLogin(text) { panel.hidden = false; setMessage(text); }
  async function signIn(event) {
    event?.preventDefault();
    if (busy || !client) return;
    if (!email.value.trim() || !password.value) { setMessage('请输入邮箱和密码。'); return; }
    setBusy(true); setMessage('登录中…');
    const captured = version;
    try {
      const result = await client.auth.signInWithPassword({email:email.value.trim(), password:password.value});
      if (captured !== version) return;
      if (result.error) {
        const network = /fetch|network/i.test(String(result.error.message || ''));
        setMessage(network ? '云端连接失败，请检查网络后重试；本机演示数据保留。' : '登录失败，请核对邮箱、密码和账号状态。');
      } else if (result.data?.session?.user) { version++; render(result.data.session); }
      else setMessage('未获得登录会话，请重试。');
    } catch { if(captured === version) setMessage('登录请求未完成，请检查连接后重试。'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    if (busy || !client) return;
    const previous = user;
    const captured = version;
    setBusy(true); status = 'signing_out'; user = null; notify(); setMessage('退出中…');
    try {
      const {error} = await client.auth.signOut();
      if (captured !== version) return;
      if (error) throw error;
      version++; render(null); setMessage('已退出。');
    } catch {
      if (captured !== version) return;
      render(previous ? {user:previous} : null);
      setMessage('退出失败，登录状态仍保留，请检查网络后重试。');
    } finally { setBusy(false); }
  }
  async function init() {
    const cfg = window.QYS_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.publishableKey) { unavailable('尚未配置云端连接，可继续使用本机演示。', '云端未配置'); return; }
    if (!window.supabase) { unavailable('云端登录组件未加载，请检查网络并刷新页面。', '登录组件未加载'); return; }
    try {
      const url = new URL(cfg.url);
      if (url.protocol !== 'https:' || !cfg.publishableKey.startsWith('sb_publishable_')) throw new Error();
      client = window.supabase.createClient(cfg.url, cfg.publishableKey);
    } catch { unavailable('云端配置无效，请核对项目配置后刷新。', '配置无效'); return; }
    panel.onsubmit = signIn; logout.onclick = signOut;
    client.auth.onAuthStateChange((_event, session) => { version++; render(session); });
    const captured = version;
    try {
      const {data, error} = await client.auth.getSession();
      if (error) throw error;
      if (captured === version) render(data.session);
    } catch {
      if (captured === version) { render(null); showLogin('读取登录会话失败，请检查连接后重新登录。'); }
    }
  }
  open.onclick = () => { window.location.hash = '#account'; };
  cancel.onclick = () => { password.value = ''; window.location.hash = '#workspace/ledger'; };
  window.addEventListener('load', init);
})();

