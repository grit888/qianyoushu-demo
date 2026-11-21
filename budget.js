(function(root){
 'use strict';
 function put(payload,entry){if(entry.category==='转账')throw Error('转账不计入消费预算。');const next=root.QYSBackup.normalize(payload);next.budgets=next.budgets||[];const i=next.budgets.findIndex(b=>b.month===entry.month&&b.category===entry.category);if(i<0)next.budgets.push(entry);else next.budgets[i]=entry;return root.QYSBackup.normalize(next)}
 function remove(payload,month,category){const next=root.QYSBackup.normalize(payload);next.budgets=(next.budgets||[]).filter(b=>b.month!==month||b.category!==category);return root.QYSBackup.normalize(next)}
 function report(payload,month,scope=root.QYSConsumption.scopes(payload)[0][0]){
   const consumption=root.QYSConsumption;
   const {rows}=consumption.selectScope(payload,scope);
   const result=consumption.report(rows,month,consumption.offsets(payload));
   const coverage=result.first?result.first+' 至 '+result.last:'本月无账单记录';
   return (payload.budgets || []).filter(b=>b.month===month).map(b=>{
     const amounts=result.byCategory.get(b.category) || {gross:0,offset:0,net:0};
     return {...b,actual:amounts.net,gross:amounts.gross,offset:amounts.offset,remaining:b.cents-amounts.net,coverage};
   });
 }
 root.QYSBudget=Object.freeze({put,remove,report});
})(globalThis);
