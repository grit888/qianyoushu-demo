(function(root){
 'use strict';const $=id=>document.getElementById(id),app=root.QYSDemoData,money=n=>'¥'+(Math.abs(n)/100).toFixed(2);let undo=null,signature=null,removing=null;
 function status(s){$('budget-status').textContent=s}
 function commit(next,before,message){next.demo.audit.unshift({time:new Date().toLocaleTimeString('zh-CN',{hour12:false}),text:message});app.restore(next,JSON.stringify(before));undo=before;signature=app.signature();refresh();status(message)}
 const consumption=root.QYSConsumption;
 let scopeChoice;
 function options(select,list,wanted) {
   select.replaceChildren();
   for (const [value,label] of list) {
     const option=document.createElement('option');
     option.value=value;
     option.textContent=label;
     select.append(option);
   }
   select.value=list.some(([value])=>value===wanted)?wanted:list[0]?.[0] || '';
 }
 function refresh() {
   if(app.isLocked()){
     status('本机数据处于保护状态。');
     $('budget-form').inert=true;
     return;
   }
   const p=app.capture(), scope=$('budget-scope'), month=$('budget-month'), category=$('budget-category');
   options(scope,consumption.scopes(p),scopeChoice);
   const {rows,pending}=consumption.selectScope(p,scope.value);
   const months=[...new Set([...consumption.months(rows,pending),...(p.budgets || []).map(b=>b.month)])].sort().reverse();
   options(month,months.map(m=>[m,m]),month.value);
   const cats=new Set(rows.filter(row=>root.QYSTransferPurpose.isPurchase(row)).map(row=>row.category));
   for (const budget of p.budgets || []) {
     if (budget.category!=='转账') cats.add(budget.category);
   }
   options(category,[...cats].map(c=>[c,c]),category.value);
   $('budget-scope-note').textContent='额度按月份和类别共用。切换范围可查看不同账单的实际支出。';
   $('budget-queue-link').hidden=!pending.length;
   $('budget-queue-link').textContent='所选账单有 '+pending.length+' 笔待核对，暂未计入 · 前往核对';
   $('budget-empty').textContent=rows.length ? '本月尚未设置分类预算。' : '所选范围暂无账单，可先导入账单或设置额度。';
   draw(p);
 }
 function draw(p){$('budget-rows').replaceChildren();const month=$('budget-month').value,report=root.QYSBudget.report(p,month,$('budget-scope').value);$('budget-empty').hidden=report.length>0;$('budget-undo').hidden=!undo;for(const b of report){const tr=document.createElement('tr');for(const v of [b.category,money(b.cents),money(b.actual)+(b.offset?'（原额 '+money(b.gross)+'，已抵扣 '+money(b.offset)+'）':''),(b.remaining<0?'超支 '+money(b.remaining):'剩余 '+money(b.remaining)),b.coverage]){const td=document.createElement('td');td.textContent=v;tr.append(td)}const td=document.createElement('td'),del=document.createElement('button');del.type='button';del.textContent=removing===b.category?'确认删除':'删除额度';del.onclick=()=>{if(removing!==b.category){removing=b.category;draw(p);status('将删除 '+b.category+' 的额度，再点一次确认；账单不受影响。');return}try{commit(root.QYSBudget.remove(p,month,b.category),p,'已删除分类预算：'+month+' '+b.category);removing=null}catch(e){status(e.message)}};td.append(del);tr.append(td);$('budget-rows').append(tr)}}
 $('budget-form').onsubmit=e=>{e.preventDefault();try{const raw=$('budget-amount').value;if(!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(raw)||Number(raw)<=0)throw Error('预算请输入正金额，最多两位小数。');const p=app.capture(),entry={month:$('budget-month').value,category:$('budget-category').value,cents:Math.round(Number(raw)*100)};commit(root.QYSBudget.put(p,entry),p,'已保存分类预算：'+entry.month+' '+entry.category);$('budget-amount').value=''}catch(e){status(e.message)}};
 $('budget-queue-link').onclick=()=>{$('csv-queue').open=true;};
 $('budget-scope').onchange=()=>{scopeChoice=$('budget-scope').value;removing=null;refresh();};
 $('budget-month').onchange=()=>{removing=null;refresh()};$('budget-undo').onclick=()=>{try{if(!undo)return;app.restore(undo,signature);undo=null;refresh();status('已撤销本次预算操作。')}catch(e){status(e.message)}};
 root.addEventListener('storage',e=>{if(e.key===root.QYSBackup.KEY||e.key===null){undo=null;$('budget-form').inert=true;status('其他页面已修改数据，请刷新。')}});root.QYSBudgetUI=Object.freeze({refresh});refresh();
})(globalThis);
