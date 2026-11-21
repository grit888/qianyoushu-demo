(function(root){
 'use strict';
 function groups(payload){
   const map=new Map();
   for(const row of payload.demo.data){
     const type=row.source?'csv':row.id.startsWith('SIM-')?'simulation':'sample',source=row.source?.name|| (type==='simulation'?'模拟转账':'合成样例'),month=row.date.slice(0,7),key=JSON.stringify([type,source,month]);
     if(!map.has(key))map.set(key,{key,type,source,month,count:0,income:0,expense:0,transferIn:0,transferOut:0,start:row.date,end:row.date,missingIds:0});
     const g=map.get(key);g.count++;g[row.kind]+=row.cents;if(row.category==='转账')g[row.kind==='income'?'transferIn':'transferOut']+=row.cents;g.start=g.start<row.date?g.start:row.date;g.end=g.end>row.date?g.end:row.date;if(row.source&&!row.source.id)g.missingIds++;
   }
   return [...map.values()].sort((a,b)=>b.month.localeCompare(a.month)||a.source.localeCompare(b.source));
 }
 function compare(group,input){
   if(!/^\d{1,7}$/.test(input.count))throw Error('记录数请输入非负整数。');
   function cents(v){if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(v))throw Error('收入与支出请输入非负元金额，最多两位小数。');return Math.round(Number(v)*100)}
   return {count:group.count-Number(input.count),income:group.income-cents(input.income),expense:group.expense-cents(input.expense)};
 }
 root.QYSReconciliation=Object.freeze({groups,compare});
})(globalThis);
