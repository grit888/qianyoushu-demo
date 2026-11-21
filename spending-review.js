(function(root) {
  'use strict';
  function report(rows, month, reimbursements = new Map()) {
    const scoped = rows.filter(r => r.date.slice(0,7) === month);
    const totals = new Map(), merchants = new Map();
    let spent = 0, gross = 0, reimbursed = 0, count = 0;
    for (const r of scoped) {
      if (r.kind !== 'expense' || r.category === '转账' || r.id.startsWith('SIM-')) continue;
      const returned = reimbursements.get(r.id) || 0;
      const net = r.cents - returned;
      gross += r.cents;
      reimbursed += returned;
      spent += net;
      count++;
      if (net === 0) continue;
      totals.set(r.category,(totals.get(r.category) || 0) + net);
      merchants.set(r.merchant,(merchants.get(r.merchant) || 0) + net);
    }
    const rank = map => [...map].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0],'zh'));
    const dates = scoped.map(r => r.date).sort();
    return {spent,gross,reimbursed,count,categories:rank(totals),merchants:rank(merchants),first:dates[0],last:dates.at(-1)};
  }
  function plan(funds, typical, target) {
    return {ceiling:funds-target, remaining:funds-typical, gap:funds-typical-target};
  }
  root.QYSSpending = Object.freeze({report,plan});
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  const money = c => '¥'+(c/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  let pendingSource = null, pendingMonth = null, current, lastMonth;
  const sourceKey = row => row.source ? 'file:'+row.source.name : 'sample';
  function fill(select, pairs, wanted) {
    select.replaceChildren();
    for (const [key,label] of pairs) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = label;
      select.append(option);
    }
    select.value = pairs.some(([key]) => key === wanted) ? wanted : pairs[0]?.[0] || '';
  }
  function drawPlan() {
    const inputs = ['review-funds','review-typical','review-goal'].map(id => $(id).value.trim());
    const result = $('review-plan');
    if (inputs.some(v => !v)) { result.textContent='填完三个金额即可核对本月计划。'; return; }
    if (!inputs.every(v => /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(v))) {
      result.textContent='请输入非负金额，最多两位小数。'; return;
    }
    const [funds,typical,goal] = inputs.map(v => Math.round(Number(v)*100));
    const p = plan(funds,typical,goal);
    if (p.ceiling < 0) {
      result.textContent='储蓄目标比本月可支配金额还高 '+money(-p.ceiling)+'。请先调整目标或可用资金。'; return;
    }
    let note = '为留出 '+money(goal)+'，整月消费需控制在 '+money(p.ceiling)+' 以内。';
    note += p.gap < 0 ? '按你填写的平常消费额，还需减少 '+money(-p.gap)+' 才能达到目标。' :
      '按你填写的平常消费额，可以达到目标，还余 '+money(p.gap)+'。';
    if (current?.spent > p.ceiling) note += '仅当前来源已记录的消费就高出这个上限 '+money(current.spent-p.ceiling)+'。';
    const keep = $('review-keep').value;
    if (p.gap < 0 && keep) {
      const candidate = current.categories.find(([name]) => name !== keep && name !== '未分类');
      if (candidate) note += '你选择保留「'+keep+'」。其余已分类开支中，「'+candidate[0]+'」金额最高（'+money(candidate[1])+'），可以先逐笔核对。';
      else note += '你选择保留「'+keep+'」。这个来源还没有其他已分类消费可供比较。';
    }
    result.textContent=note;
  }
  function ranking(id, entries, total) {
    const list=$(id);
    list.replaceChildren();
    for (const [name,cents] of entries.slice(0,3)) {
      const item=document.createElement('li');
      const label=document.createElement('span'), value=document.createElement('strong');
      label.textContent=name;
      value.textContent=money(cents)+' · '+Math.round(cents*100/total)+'%';
      item.append(label,value);
      list.append(item);
    }
  }
  function refresh() {
    const app=root.QYSDemoData;
    if (app.isLocked()) {
      $('review-content').hidden=true;
      $('review-status').textContent='账本处于保护状态。';return;
    }
    $('review-content').hidden=false;
    const snapshot = app.capture(), all = snapshot.demo.data, sources = new Map();
    const pending = root.QYSImportReview.pending(snapshot.importReviews);
    for (const item of pending) sources.set('file:'+item.source,item.source);
    for (const row of all) sources.set(sourceKey(row),row.source?.name || '演示账本');
    fill($('review-source'),[...sources],pendingSource || $('review-source').value);
    const rows=all.filter(r=>sourceKey(r)===$('review-source').value);
    const pendingForSource = pending.filter(item=>'file:'+item.source===$('review-source').value);
    const months = [...new Set([...rows,...pendingForSource].filter(row=>row.date).map(row=>row.date.slice(0,7)))].sort().reverse();
    fill($('review-month'),months.map(m=>[m,m]),pendingMonth || $('review-month').value);
    const month = $('review-month').value;
    if (lastMonth !== undefined && lastMonth !== month) {
      for (const id of ['review-funds','review-typical','review-goal']) $(id).value='';
    }
    lastMonth = month;
    pendingSource=null;pendingMonth=null;
    const entries = snapshot.transferPurposes || [];
    const repayments = root.QYSTransferPurpose.amountsByExpense(entries);
    const refunds = root.QYSImportReview.refundOffsets(snapshot.importReviews);
    for (const [id,cents] of refunds) repayments.set(id,(repayments.get(id) || 0)+cents);
    current = report(rows, month, repayments);
    root.QYSTransferPurposeUI.refresh(snapshot, rows.filter(row => row.date.startsWith(month)));
    $('review-status').textContent=current.first ? '记录范围 '+current.first+' 至 '+current.last+'。仅统计所选来源已记录的消费。' : '这个来源还没有记录。';
    const awaiting = pendingForSource.length;
    $('review-queue-link').hidden = !awaiting;
    $('review-queue-link').textContent = '同一来源另有 '+awaiting+' 笔待核对，暂未计入 · 前往核对';
    $('review-total').textContent=money(current.spent)+' · '+current.count+' 笔';
    const breakdown = $('review-repayment-totals');
    breakdown.hidden = !current.reimbursed;
    breakdown.textContent = '原消费 '+money(current.gross)+' · 已确认退款或回款 '+money(current.reimbursed);
    $('review-net-label').textContent = current.reimbursed ? '实际承担消费' : '已入账消费';
    $('review-ranks').hidden = !current.spent;
    ranking('review-categories',current.categories,current.spent);
    ranking('review-merchants',current.merchants,current.spent);
    const unassigned=current.categories.find(([name])=>name==='未分类');
    $('review-insight').textContent = !current.count ? '所选月份没有消费记录。' : !current.spent ? '这批消费已由确认退款或回款全额抵减。' :
      unassigned ? '有 '+money(unassigned[1])+' 尚未分类。可以先对照商户，再为这些记录补上用途。' :
      '金额最高的类别是'+current.categories[0][0]+'。回看其中的交易，哪些是你希望优先保留的开销？';
    $('review-classify').hidden = !unassigned;
    const keep = $('review-keep');
    fill(keep,[['','暂未指定'], ...current.categories.filter(([name])=>name!=='未分类').map(([name])=>[name,name])],keep.value);
    drawPlan();
  }
  $('review-source').onchange=refresh;
  $('review-month').onchange=refresh;
  $('review-keep').onchange=drawPlan;
  for(const id of ['review-funds','review-typical','review-goal']) $(id).oninput=drawPlan;
  root.QYSReviewUI=Object.freeze({refresh,
    selectImport(name,month){pendingSource='file:'+name;pendingMonth=month;},
    selectTransfer(row) {
      pendingSource = sourceKey(row);
      pendingMonth = row.date.slice(0,7);
      refresh();
      root.QYSTransferPurposeUI.open(row.id);
    }});
})(globalThis);
