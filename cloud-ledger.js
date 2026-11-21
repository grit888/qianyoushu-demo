(function (root) {
  'use strict';
  function createController({getClient, onChange = () => {}}) {
    let generation = 0;
    const empty = () => ({user:null,status:'signed_out',ledgers:[],rows:[],ledgerId:'',page:0,hasMore:false,expense:0,income:0,message:'先登录，再读取当前账号自己的云端账单。'});
    let state = empty();
    function emit() { onChange({...state}); }
    function clearRows() { state.rows=[]; state.expense=0; state.income=0; state.hasMore=false; }
    function fail(ticket) {
      if (ticket !== generation) return;
      clearRows(); state.status='error';
      state.message='读取未完成，请重新登录或重试；也请检查该账号的表权限和账单数据格式。本机演示账本不受影响。'; emit();
    }
    async function identity(ticket) {
      const client = getClient();
      if (!client || !state.user) throw new Error('NO_USER');
      const {data,error} = await client.auth.getUser();
      if (ticket !== generation) return null;
      if (error || !data?.user || data.user.id !== state.user.id) throw new Error('IDENTITY_CHANGED');
      return client;
    }
    function normalize(rows) {
      if (!Array.isArray(rows)) throw new Error('INVALID_ROWS');
      return rows.map(row => {
        const cents = typeof row.amount_cents === 'string' && /^[1-9]\d*$/.test(row.amount_cents) ? Number(row.amount_cents) : row.amount_cents;
        const date = String(row.occurred_at || '');
        if (row.user_id !== state.user.id || row.ledger_id !== state.ledgerId || !Number.isSafeInteger(cents) || cents <= 0 || row.currency !== 'CNY' || !['income','expense'].includes(row.direction) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('INVALID_ROW');
        return {...row, amount_cents:cents};
      });
    }
    async function pageRequest(ticket, verifiedClient) {
      try {
        const client = verifiedClient || await identity(ticket);
        if (!client || ticket !== generation) return;
        const start = state.page * 20;
        const {data,error} = await client.from('transactions').select('id,user_id,ledger_id,occurred_at,merchant,category,direction,amount_cents,currency')
          .eq('user_id',state.user.id).eq('ledger_id',state.ledgerId)
          .order('occurred_at',{ascending:false}).order('id',{ascending:false}).range(start,start+20);
        if (ticket !== generation) return;
        if (error) throw error;
        const rows = normalize(data);
        let expense=0,income=0;
        for (const row of rows.slice(0,20)) {
          if (row.direction === 'income') income += row.amount_cents; else expense += row.amount_cents;
          if (!Number.isSafeInteger(expense) || !Number.isSafeInteger(income)) throw new Error('UNSAFE_TOTAL');
        }
        state.rows=rows.slice(0,20); state.expense=expense; state.income=income; state.hasMore=rows.length>20;
        state.status='ready'; state.message=state.rows.length ? '数据来自当前账号的云端账本；合计仅统计本页。' : '该账本暂时没有当前账号可读取的交易。'; emit();
      } catch { fail(ticket); }
    }
    async function refresh() {
      const ticket=++generation;
      clearRows(); state.ledgers=[]; state.ledgerId=''; state.page=0;
      if (!state.user) { emit(); return; }
      state.status='loading'; state.message='正在确认身份并读取云端账本…'; emit();
      try {
        const client=await identity(ticket);
        if (!client || ticket!==generation) return;
        const {data,error}=await client.from('ledgers').select('id,user_id,name,source_type').eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(100);
        if (ticket!==generation) return;
        if (error || !Array.isArray(data) || data.some(row=>row.user_id!==state.user.id)) throw new Error('INVALID_LEDGER');
        state.ledgers=data;
        if (!data.length) { state.status='ready'; state.message='当前账号没有可读取的云端账本。演示数据不会自动上传。'; emit(); return; }
        state.ledgerId=data[0].id; emit(); await pageRequest(ticket,client);
      } catch { fail(ticket); }
    }
    async function setUser(user, authStatus='ready') {
      if (authStatus==='ready' && user?.id && user.id===state.user?.id) return;
      ++generation; state=empty();
      if (authStatus==='ready' && user?.id) { state.user={id:user.id}; emit(); await refresh(); }
      else { if(authStatus==='unavailable')state.message='云端登录暂不可用，请查看账号页面提示；本机演示仍可使用。'; emit(); }
    }
    async function selectLedger(id) {
      if (!state.user || !state.ledgers.some(row=>row.id===id)) return;
      const ticket=++generation; clearRows(); state.ledgerId=id; state.page=0; state.status='loading'; state.message='正在读取所选账本…'; emit(); await pageRequest(ticket);
    }
    async function movePage(delta) {
      if (state.status!=='ready' || !state.ledgerId || ![-1,1].includes(delta) || (delta===1&&!state.hasMore) || state.page+delta<0) return;
      const ticket=++generation; state.page+=delta; clearRows(); state.status='loading'; state.message='正在读取下一页…'; emit(); await pageRequest(ticket);
    }
    return Object.freeze({setUser,refresh,selectLedger,movePage,getState:()=>({...state})});
  }
  root.QYSCloudLedger=Object.freeze({createController});
  if (typeof document==='undefined') return;
  const byId=id=>document.getElementById(id), panel=byId('cloud-view');
  if (!panel || !root.QYSAuth) return;
  const money=c=>'¥'+(c/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  function render(state) {
    byId('cloud-status').textContent=state.message;
    byId('cloud-refresh').disabled=!state.user||state.status==='loading';
    const picker=byId('cloud-ledger'); picker.replaceChildren();
    if (!state.ledgers.length) { const option=document.createElement('option');option.textContent=state.user?'暂无可读账本':'请先登录';option.value='';picker.append(option); }
    for(const ledger of state.ledgers){const option=document.createElement('option');option.value=ledger.id;option.textContent=String(ledger.name||'未命名账本').slice(0,100)+(ledger.source_type==='demo'?'（云端演示数据）':'');picker.append(option)}
    picker.value=state.ledgerId; picker.disabled=!state.ledgers.length||state.status==='loading';
    byId('cloud-page').textContent=state.ledgerId?'第 '+(state.page+1)+' 页 · 本页 '+state.rows.length+' 笔':'尚未读取账单';
    byId('cloud-expense').textContent=money(state.expense);byId('cloud-income').textContent=money(state.income);
    byId('cloud-prev').disabled=state.status!=='ready'||state.page===0;
    byId('cloud-next').disabled=state.status!=='ready'||!state.hasMore;
    const tbody=byId('cloud-rows');tbody.replaceChildren();
    for(const row of state.rows){const tr=document.createElement('tr');for(const text of [row.occurred_at,String(row.merchant||'').slice(0,160),String(row.category||'其他').slice(0,50),(row.direction==='income'?'+':'−')+money(row.amount_cents)]){const td=document.createElement('td');td.textContent=text;tr.append(td)}tbody.append(tr)}
  }
  const controller=createController({getClient:()=>root.QYSAuth.getClient(),onChange:render});
  byId('cloud-refresh').onclick=()=>void controller.refresh();
  byId('cloud-ledger').onchange=event=>void controller.selectLedger(event.target.value);
  byId('cloud-prev').onclick=()=>void controller.movePage(-1);
  byId('cloud-next').onclick=()=>void controller.movePage(1);
  root.QYSAuth.subscribe(({user,status})=>{void Promise.resolve().then(()=>controller.setUser(user,status));});
})(globalThis);
