(function(root){
 'use strict';
 function put(payload,entry){if(entry.category==='转账')throw Error('转账不计入消费预算。');const next=root.QYSBackup.normalize(payload);next.budgets=next.budgets||[];const i=next.budgets.findIndex(b=>b.month===entry.month&&b.category===entry.category);if(i<0)next.budgets.push(entry);else next.budgets[i]=entry;return root.QYSBackup.normalize(next)}
 function remove(payload,month,category){const next=root.QYSBackup.normalize(payload);next.budgets=(next.budgets||[]).filter(b=>b.month!==month||b.category!==category);return root.QYSBackup.normalize(next)}
 function report(payload,month){const rows=payload.demo.data.filter(r=>r.kind==='expense'&&r.category!=='转账'&&r.date.startsWith(month));const dates=rows.map(r=>r.date).sort();return (payload.budgets||[]).filter(b=>b.month===month).map(b=>{const actual=rows.filter(r=>r.category===b.category).reduce((n,r)=>n+r.cents,0);return {...b,actual,remaining:b.cents-actual,coverage:dates.length?dates[0]+' 至 '+dates.at(-1):'本月无消费记录'}})}
 root.QYSBudget=Object.freeze({put,remove,report});
})(globalThis);
