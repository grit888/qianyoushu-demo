(function(root) {
  'use strict';
  const app=root.QYSDemoData, model=root.QYSImportReview;
  const $=id=>document.getElementById(id);
  const picker=$('queue-item'), expense=$('queue-expense');
  const labels={pending:'待核对',applied:'已抵扣',excluded:'已排除'};
  const money=c=>'¥'+(c/100).toFixed(2);
  let snapshot, signature;

  function fill(select, choices, selected) {
    select.replaceChildren();
    for (const [value,text] of choices) {
      const option=document.createElement('option');
      option.value=value;
      option.textContent=text;
      select.append(option);
    }
    if (choices.some(([value])=>value===selected)) select.value=selected;
  }
  function draw() {
    const item=snapshot.importReviews?.find(row=>row.id===picker.value);
    if (!item) return;
    const original=snapshot.demo.data.find(row=>row.id===item.expenseId);
    $('queue-info').textContent=item.source+' · 原文件第 '+item.row+' 行'
      +(item.order?' · 订单 '+item.order:'')+'。'+item.message
      +(original?' 已关联 '+original.date+' · '+original.merchant+'。':'');
    const waiting=item.state==='pending', refundable=waiting&&item.kind==='refund';
    $('queue-apply').hidden=!refundable;
    $('queue-expense-field').hidden=!refundable;
    $('queue-exclude').hidden=!waiting;
    $('queue-reopen').hidden=waiting;
    if (!refundable) return;
    const returns=model.refundOffsets(snapshot.importReviews);
    const repayments=root.QYSTransferPurpose.amountsByExpense(snapshot.transferPurposes || []);
    const matches=snapshot.demo.data.filter(row=>model.canRefund(item,row)
      && item.cents<=row.cents-(returns.get(row.id)||0)-(repayments.get(row.id)||0));
    matches.sort((a,b)=>Number(b.source.id===item.order)-Number(a.source.id===item.order) || b.date.localeCompare(a.date));
    const options=matches.map(row=>[row.id,row.date+' · '+row.merchant+' · '+money(row.cents)+' · 第 '+row.source.row+' 行']);
    fill(expense,[['','请选择原消费'],...options],'');
    $('queue-apply').disabled=true;
    if (!matches.length) $('queue-info').textContent+=' 请先导入原消费，或核对剩余可抵扣金额。';
  }
  function refresh() {
    if (app.isLocked()) {
      $('queue-form').hidden=true;
      $('queue-empty').hidden=false;
      $('queue-empty').textContent='本机账本处于保护状态。';
      $('queue-count').textContent='';
      return;
    }
    snapshot=app.capture();
    signature=app.signature();
    const items=snapshot.importReviews || [], open=model.pending(items).length;
    $('queue-count').textContent=items.length?'· 待核对 '+open+' 笔 · 已处理 '+(items.length-open)+' 笔':'';
    $('queue-form').hidden=!items.length;
    $('queue-empty').hidden=Boolean(items.length);
    $('queue-empty').textContent='暂无待核对项。';
    const ordered=[...items].sort((a,b)=>Number(b.state==='pending')-Number(a.state==='pending') || b.date.localeCompare(a.date));
    fill(picker,ordered.map(item=>[item.id,[labels[item.state],item.date || '日期待核对',item.merchant || '交易对方待核对',item.cents?money(item.cents):'金额待核对'].join(' · ')]),picker.value);
    draw();
  }
  function save(state,linked) {
    if (!app.canImport()) {
      $('queue-status').textContent='请先处理待确认操作或解除本机数据保护。';
      return;
    }
    try {
      const next=model.resolve(app.capture(),picker.value,state,linked);
      next.demo.audit.unshift({time:new Date().toLocaleTimeString('zh-CN',{hour12:false}),text:'导入核对 · '+labels[state]});
      app.restore(next,signature);
      root.QYSCSVUI?.refresh();
      root.QYSDataUI?.refresh();
      $('queue-status').textContent=state==='applied'?'已确认抵扣。消费复盘按原消费月份显示。':'已保存为「'+labels[state]+'」。';
    } catch(error) {
      $('queue-status').textContent=error.message || '核对状态保存失败，请刷新后重试。';
    }
  }
  picker.onchange=()=>{$('queue-status').textContent='';draw();};
  expense.onchange=()=>{$('queue-apply').disabled=!expense.value;};
  $('queue-apply').onclick=()=>{if(expense.value) save('applied',expense.value);};
  $('queue-exclude').onclick=()=>save('excluded');
  $('queue-reopen').onclick=()=>save('pending');
  $('review-queue-link').onclick=()=>{$('csv-queue').open=true;};
  root.QYSImportReviewUI=Object.freeze({refresh});
})(globalThis);
