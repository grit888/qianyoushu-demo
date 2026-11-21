(function (root) {
  'use strict';
  const titles = {ledger:'账单与对话', subscriptions:'订阅与代扣', forecast:'收支情景估算', anomalies:'异常候选', task:'组合任务', activity:'操作记录', cloud:'我的云端账单', data:'数据管理', classify:'批量分类',budget:'分类预算',review:'消费复盘'};
  const dataPanels = {
    import: 'csv-section',
    reconcile: 'data-panel-reconcile',
    backup: 'data-panel-backup'
  };
  const legacyDataLinks = {
    '#csv-section': 'import',
    '#reconcile-heading': 'reconcile',
    '#data-current-heading': 'backup'
  };
  function parse(hash) {
    if (Object.hasOwn(legacyDataLinks, hash)) return {page:'workspace', view:'data', section:legacyDataLinks[hash]};
    if (hash === '#workspace/data' || hash.startsWith('#workspace/data/')) {
      const section = hash.slice('#workspace/data/'.length);
      return {page:'workspace', view:'data', section:Object.hasOwn(dataPanels, section) ? section : 'import'};
    }
    if (hash === '#account') return {page:'account'};
    if (hash === '#experience') return {page:'workspace', view:'ledger'};
    if (hash.startsWith('#workspace/')) {
      const view = hash.slice(11);
      return {page:'workspace', view:Object.hasOwn(titles, view) ? view : 'ledger'};
    }
    return {page:'home', anchor:['#features','#principle'].includes(hash) ? hash.slice(1) : ''};
  }
  if (typeof document === 'undefined') { root.QYSRoutes = {parse}; return; }
  const byId = id => document.getElementById(id);
  let applying = false, current = null, submitting = false, previousUser = null;
  function apply() {
    const route = parse(root.location.hash);
    applying = true;
    byId('home-page').hidden = route.page !== 'home';
    byId('experience').hidden = route.page !== 'workspace';
    byId('account-page').hidden = route.page !== 'account';
    byId('site-footer').hidden = route.page !== 'home';
    document.body.dataset.page = route.page;
    for (const link of document.querySelectorAll('[data-route]')) {
      if (link.dataset.route === route.page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (route.page === 'workspace') root.switchView(route.view);
    if (route.view === 'data') {
      for (const [section, panel] of Object.entries(dataPanels)) {
        const selected = section === route.section;
        byId(panel).hidden = !selected;
        const link = byId('data-link-' + section);
        if (selected) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    }
    if (route.page !== 'account') { byId('auth-password').value = ''; submitting = false; }
    document.title = (route.page === 'home' ? '每一步，都有据可查' : route.page === 'account' ? '账号登录' : titles[route.view]) + ' · 钱有数';
    const focusTarget = route.anchor ? byId(route.anchor) : route.page === 'account' ? byId('account-heading') : route.page === 'workspace' ? byId('workspace-heading') : byId('home-heading');
    const dataLink = route.view === 'data' && current?.view === 'data' ? byId('data-link-' + route.section) : null;
    if (current !== null) (dataLink || focusTarget)?.focus({preventScroll:true});
    if (route.anchor) focusTarget?.scrollIntoView({block:'start', behavior:'instant'});
    else root.scrollTo({top:0, left:0, behavior:'instant'});
    current = route;
    applying = false;
  }
  root.QYSRouter = Object.freeze({
    parse,
    syncView(view) {
      if (!applying && Object.hasOwn(titles, view)) root.location.hash = '#workspace/' + view;
    }
  });
  byId('auth-panel').addEventListener('submit', () => { submitting = true; });
  root.QYSAuth?.subscribe(({user,status}) => {
    byId('cloud-login-link').hidden = Boolean(user);
    byId('account-nav-state').textContent = user ? '云端账号已连接' : status === 'loading' ? '正在读取登录状态' : '未登录云端';
    if (user && !previousUser && submitting && parse(root.location.hash).page === 'account') {
      submitting = false;
      root.location.hash = '#workspace/cloud';
    }
    previousUser = user;
  });
  root.addEventListener('hashchange', apply);
  apply();
})(globalThis);
