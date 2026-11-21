(function (root) {
  'use strict';
  // Identify the bundled CSV examples even if imported under a different source name.
  const examples = new Set([
    '2026-11-01 12:30:00|示例食堂|expense|1850',
    '2026-11-01 18:30:00|示例食堂|expense|1850',
    '2026-11-02|示例生活费|income|300000',
    '2026-11-03|示例公交|expense|200'
  ]);

  function sourceKey(row) {
    if (!row?.source || examples.has([row.source.occurredAt,row.merchant,row.kind,row.cents].join('|'))) return 'sample';
    return 'file:'+row.source.name;
  }
  function scopes(snapshot) {
    const names = new Set();
    for (const row of snapshot.demo.data) {
      if (sourceKey(row) !== 'sample') names.add(row.source.name);
    }
    for (const item of root.QYSImportReview.pending(snapshot.importReviews)) names.add(item.source);
    const options = names.size ? [['imports','全部导入账单'], ...[...names].map(name=>['file:'+name,name])] : [];
    options.push(['sample','演示账本']);
    return options;
  }
  function selectScope(snapshot, scope) {
    const includes = key => scope === 'imports' ? key !== 'sample' : key === scope;
    return {
      rows:snapshot.demo.data.filter(row=>includes(sourceKey(row))),
      pending:root.QYSImportReview.pending(snapshot.importReviews).filter(item=>includes('file:'+item.source))
    };
  }
  function months(rows,pending) {
    return [...new Set([...rows,...pending].filter(row=>row.date).map(row=>row.date.slice(0,7)))].sort().reverse();
  }
  function sameLedgerKind(a,b) {
    return (sourceKey(a)==='sample')===(sourceKey(b)==='sample');
  }
  function offsets(snapshot) {
    const rows = new Map(snapshot.demo.data.map(row=>[row.id,row]));
    const returns = (snapshot.transferPurposes || []).filter(entry=>entry.purpose==='reimbursement'
      && sameLedgerKind(rows.get(entry.transferId),rows.get(entry.expenseId)));
    const amounts = root.QYSTransferPurpose.amountsByExpense(returns);
    for (const [id,cents] of root.QYSImportReview.refundOffsets(snapshot.importReviews)) {
      amounts.set(id,(amounts.get(id) || 0)+cents);
    }
    return amounts;
  }
  function report(rows, month, offsets = new Map()) {
    const scoped = rows.filter(r => r.date.slice(0,7) === month);
    const byCategory = new Map(), merchants = new Map();
    let spent = 0, gross = 0, reimbursed = 0, count = 0;
    for (const r of scoped) {
      if (r.kind !== 'expense' || r.category === '转账' || r.id.startsWith('SIM-')) continue;
      const returned = offsets.get(r.id) || 0;
      const net = r.cents - returned;
      gross += r.cents;
      reimbursed += returned;
      spent += net;
      count++;
      const category = byCategory.get(r.category) || {gross:0,offset:0,net:0};
      category.gross += r.cents;
      category.offset += returned;
      category.net += net;
      byCategory.set(r.category,category);
      if (net === 0) continue;
      merchants.set(r.merchant,(merchants.get(r.merchant) || 0) + net);
    }
    const rank = map => [...map].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0],'zh'));
    const dates = scoped.map(r => r.date).sort();
    return {spent,gross,reimbursed,count,byCategory,categories:rank([...byCategory].filter(([,value])=>value.net>0).map(([key,value])=>[key,value.net])),merchants:rank(merchants),first:dates[0],last:dates.at(-1)};
  }

  root.QYSConsumption = Object.freeze({sourceKey,sameLedgerKind,scopes,selectScope,months,offsets,report});
})(globalThis);
