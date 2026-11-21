(function (root) {
  'use strict';
  const labels = Object.freeze({
    reimbursement: '代付回款',
    own: '本人账户互转',
    personal: '亲友往来',
    other: '其他转账'
  });

  function isTransfer(row) {
    return row?.category === '转账' && !row.id.startsWith('SIM-');
  }
  function isPurchase(row) {
    return row?.kind === 'expense' && row.category !== '转账' && !row.id.startsWith('SIM-');
  }
  function canLink(transfer, purchase) {
    return isTransfer(transfer) && transfer.kind === 'income' && isPurchase(purchase)
      && Boolean(transfer.source) === Boolean(purchase.source) && purchase.date <= transfer.date;
  }
  function normalize(rows, entries) {
    if (!Array.isArray(entries) || entries.length > rows.length) throw Error('转账标注格式无效。');
    const byId = new Map(rows.map(row => [row.id, row]));
    const marked = new Set(), allocated = new Map();

    return entries.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)
          || !Object.hasOwn(labels, entry.purpose) || marked.has(entry.transferId)) {
        throw Error('转账标注无效或重复。');
      }
      const transfer = byId.get(entry.transferId);
      if (!isTransfer(transfer)) throw Error('只能为账本里的转账流水标注用途。');
      marked.add(entry.transferId);

      const reimbursement = entry.purpose === 'reimbursement';
      const allowed = reimbursement ? ['transferId','purpose','expenseId','cents'] : ['transferId','purpose'];
      if (Object.keys(entry).some(key => !allowed.includes(key))) throw Error('转账标注含有无效字段。');
      if (!reimbursement) return {...entry};

      const purchase = byId.get(entry.expenseId);
      if (!canLink(transfer, purchase)) throw Error('请选择日期不晚于这笔转入、且属于同一种账本数据的消费。');
      if (!Number.isSafeInteger(entry.cents) || entry.cents <= 0 || entry.cents > transfer.cents) {
        throw Error('回款金额须大于零，且不能超过这笔转入。');
      }
      const previous = allocated.get(purchase.id) || 0;
      if (entry.cents > purchase.cents - previous) throw Error('这笔消费累计收到的回款不能超过原金额。');
      allocated.set(purchase.id, previous + entry.cents);
      return {...entry};
    });
  }
  function amountsByExpense(entries, exceptTransferId) {
    const amounts = new Map();
    for (const entry of entries) {
      if (entry.purpose !== 'reimbursement' || entry.transferId === exceptTransferId) continue;
      amounts.set(entry.expenseId, (amounts.get(entry.expenseId) || 0) + entry.cents);
    }
    return amounts;
  }

  function sameEntries(before = [], after = []) {
    if (before.length !== after.length) return false;
    const byTransfer = new Map(before.map(entry => [entry.transferId,entry]));
    return after.every(entry => {
      const previous = byTransfer.get(entry.transferId);
      return previous?.purpose === entry.purpose
        && previous.expenseId === entry.expenseId && previous.cents === entry.cents;
    });
  }

  root.QYSTransferPurpose = Object.freeze({labels,isTransfer,isPurchase,canLink,normalize,amountsByExpense,sameEntries});
})(globalThis);
