(function(root){
 'use strict';const $=id=>document.getElementById(id),app=root.QYSDemoData,money=n=>'¥'+(n/100).toFixed(2);let snapshot=null,groups=[];
 function refresh(){
   const previousGroup = $('reconcile-group').value;
   $('reconcile-rows').replaceChildren();$('reconcile-group').replaceChildren();$('reconcile-result').textContent='对照预览中纳入账本的同一来源、同一月份汇总；金额一致也不能证明逐笔完全一致。';
   $('reconcile-form').inert=app.isLocked();if(app.isLocked())return;
   const p=app.capture();snapshot=app.signature();groups=root.QYSReconciliation.groups(p);
   for(const g of groups){const tr=document.createElement('tr');for(const value of [g.source+'（'+({csv:'文件导入',sample:'样例',simulation:'模拟'})[g.type]+'）',g.month,g.count+' 笔',money(g.income),money(g.expense),money(g.transferIn),money(g.transferOut),g.start+' 至 '+g.end,g.missingIds?g.missingIds+' 笔缺少来源编号':'—']){const td=document.createElement('td');td.textContent=value;tr.append(td)}$('reconcile-rows').append(tr);if(g.type==='csv'){const o=document.createElement('option');o.value=g.key;o.textContent=g.source+' · '+g.month;$('reconcile-group').append(o)}}
   if (groups.some(g => g.type === 'csv' && g.key === previousGroup)) {
     $('reconcile-group').value = previousGroup;
   } else {
     clearAmounts();
   }
   $('reconcile-form').hidden=!groups.some(g=>g.type==='csv');$('reconcile-empty').hidden=groups.some(g=>g.type==='csv');
 }
 $('reconcile-form').onsubmit=e=>{e.preventDefault();try{if(app.signature()!==snapshot)throw Error('账单已变化，请点击刷新汇总后重新核对。');const g=groups.find(g=>g.key===$('reconcile-group').value);if(!g)throw Error('请先选择导入来源。');const d=root.QYSReconciliation.compare(g,{count:$('reconcile-count').value,income:$('reconcile-income').value,expense:$('reconcile-expense').value});$('reconcile-result').textContent=(d.count===0&&d.income===0&&d.expense===0?'三项汇总相符，仍需核对逐笔来源。':'汇总不符，请检查文件范围、漏导与重复。')+' 本机减原文件：记录数 '+d.count+'；收入 '+money(d.income)+'；支出 '+money(d.expense)+'。'}catch(e){$('reconcile-result').textContent=e.message}};
 function clearAmounts() {
   for (const id of ['reconcile-count', 'reconcile-income', 'reconcile-expense']) $(id).value = '';
 }
 $('reconcile-refresh').onclick = refresh;
 $('reconcile-group').onchange = () => {
   clearAmounts();
   $('reconcile-result').textContent = '已切换来源或月份，请填写对应文件中纳入账本的汇总。';
 };
 root.QYSReconciliationUI=Object.freeze({refresh});refresh();
})(globalThis);
