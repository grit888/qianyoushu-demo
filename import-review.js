(function(root) {
  'use strict';
  function pending(items) {
    return (items || []).filter(item => item.state === 'pending');
  }

  function refundOffsets(items) {
    const totals = new Map();
    for (const item of items || []) {
      if (item.state !== 'applied') continue;
      totals.set(item.expenseId, (totals.get(item.expenseId) || 0) + item.cents);
    }
    return totals;
  }

  function canRefund(item, row) {
    return item.kind === 'refund' && row?.source?.name === item.source
      && row.kind === 'expense' && row.category !== '转账' && row.date <= item.date.slice(0,10);
  }

  function normalize(payload) {
    const items = payload.importReviews;
    if (!Array.isArray(items) || items.length > 10000) throw Error('待核对记录超出范围。');
    const rows = new Map(payload.demo.data.map(row => [row.id,row]));
    const allocated = root.QYSTransferPurpose.amountsByExpense(payload.transferPurposes || []);
    const ids = new Set();
    const allowed = ['id','source','row','kind','date','cents','merchant','order','message','state','expenseId'];
    const length = (text,max) => typeof text === 'string' && text.length <= max;
    function check(item) {
      if (!item || Object.keys(item).some(key => !allowed.includes(key))
          || !/^[a-f0-9]{64}$/.test(item.id) || ids.has(item.id)
          || !length(item.source,80) || !item.source.trim()
          || !Number.isInteger(item.row) || item.row < 2 || item.row > 100000
          || !['refund','inspect'].includes(item.kind) || !['pending','applied','excluded'].includes(item.state)
          || !length(item.merchant,200) || !length(item.order,120) || !length(item.message,250)
          || !length(item.date,19) || (item.date && !/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)?$/.test(item.date))
          || (item.cents !== null && (!Number.isSafeInteger(item.cents) || item.cents <= 0))
          || (item.kind === 'refund' && (!item.date || !item.cents))) {
        throw Error('待核对记录无效或重复。');
      }
      ids.add(item.id);
      if (item.state !== 'applied') {
        if (Object.hasOwn(item,'expenseId')) throw Error('待核对记录含有无效关联。');
        return {...item};
      }
      const original = rows.get(item.expenseId);
      if (!canRefund(item,original)) throw Error('请选择同一来源且日期不晚于退款的原消费。');
      const used = allocated.get(original.id) || 0;
      if (item.cents > original.cents - used) throw Error('退款与回款合计不能超过原消费金额。');
      allocated.set(original.id,used + item.cents);
      return {...item};
    }
    return items.map(check);
  }

  function resolve(snapshot,id,state,expenseId) {
    const items = snapshot.importReviews;
    if (!items?.some(item => item.id === id)) throw Error('找不到这条待核对记录。');
    const next = {...snapshot, importReviews:items.map(item => {
      if (item.id !== id) return item;
      const {expenseId: previous, ...record} = item;
      return {...record,state,...(state==='applied'?{expenseId}:{})};
    })};
    next.importReviews = normalize(next);
    return next;
  }

  root.QYSImportReview = Object.freeze({pending,refundOffsets,canRefund,normalize,resolve});
})(globalThis);
