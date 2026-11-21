(function(root){
 'use strict';
 const $=id=>document.getElementById(id),app=root.QYSDemoData,money=c=>'¥'+(c/100).toFixed(2);
 let undo=null,signature=null,editing=null,removing=null;
 function status(text){$('recurring-status').textContent=text;}
 function commit(next,before,message){
   next.demo.audit.unshift({time:new Date().toLocaleTimeString('zh-CN',{hour12:false}),text:message});
   app.restore(next,JSON.stringify(before));undo=before;signature=app.signature();refresh();status(message+'；账单金额未改变。');
 }
 function refresh(){
   $('recurring-form').inert=app.isLocked();$('recurring-rows').replaceChildren();
   $('recurring-undo').hidden=!undo;
   if(app.isLocked()){status('本机数据处于保护状态，请先处理存储问题。');return;}
   const payload=app.capture(),plans=payload.recurring||[];
   $('recurring-empty').hidden=plans.length>0;
   for(const plan of plans){
     const row=document.createElement('tr'),actual=payload.demo.data.find(r=>r.id===plan.transactionId);
     for(const value of [plan.name,plan.due,money(plan.cents),actual?money(actual.cents):'未关联',actual?(actual.cents>plan.cents?'+':'')+money(actual.cents-plan.cents):'待核对']){const td=document.createElement('td');td.textContent=value;row.append(td);}
     const td=document.createElement('td'),select=document.createElement('select');select.setAttribute('aria-label',plan.name+'的实际交易');
     const empty=document.createElement('option');empty.value='';empty.textContent='选择本月实际支出';select.append(empty);
     for(const r of payload.demo.data.filter(r=>r.kind==='expense'&&r.category!=='转账'&&!r.id.startsWith('SIM-')&&r.date.slice(0,7)===plan.due.slice(0,7)&&!plans.some(p=>p.id!==plan.id&&p.transactionId===r.id))){const o=document.createElement('option');o.value=r.id;o.textContent=r.date+' · '+r.merchant+' · '+money(r.cents)+' · '+r.id;select.append(o);}
     select.value=plan.transactionId||'';
     const button=document.createElement('button');button.type='button';button.textContent='确认关联';button.disabled=true;
     select.onchange=()=>button.disabled=!select.value||select.value===plan.transactionId;
     button.onclick=()=>{try{commit(root.QYSRecurring.link(payload,plan.id,select.value),payload,'已核对周期支出：'+plan.name)}catch(e){status(e.message)}};
     td.append(select,button);
     if(actual){const unlink=document.createElement('button');unlink.type='button';unlink.textContent='解除关联';unlink.onclick=()=>{try{commit(root.QYSRecurring.link(payload,plan.id,null),payload,'已解除关联：'+plan.name)}catch(e){status(e.message)}};td.append(unlink);}
     const edit=document.createElement('button');edit.type='button';edit.textContent='修改计划';edit.onclick=()=>{editing=plan.id;removing=null;$('recurring-name').value=plan.name;$('recurring-amount').value=(plan.cents/100).toFixed(2);$('recurring-due').value=plan.due;$('recurring-save').textContent='保存修改';$('recurring-cancel-edit').hidden=false;status('正在修改 '+plan.name+'。修改到其他月份会解除旧交易关联。');$('recurring-name').focus();};td.append(edit);
     const del=document.createElement('button');del.type='button';del.textContent=removing===plan.id?'确认删除计划':'删除计划';del.onclick=()=>{if(removing!==plan.id){removing=plan.id;refresh();status('将删除 '+plan.name+' 的计划与关联；原始账单不会删除。再次点击确认。');return}try{commit(root.QYSRecurring.remove(payload,plan.id),payload,'已删除周期计划：'+plan.name);removing=null;editing=null;$('recurring-save').textContent='保存月度计划';$('recurring-cancel-edit').hidden=true;$('recurring-form').reset()}catch(e){status(e.message)}};td.append(del);
     const next=document.createElement('small');next.textContent='下期参考日期：'+root.QYSRecurring.following(plan)+'（未创建）';td.append(next);row.append(td);$('recurring-rows').append(row);
   }
 }
 $('recurring-form').onsubmit=e=>{e.preventDefault();try{
   const amount=$('recurring-amount').value;
   if(!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(amount))throw Error('金额请输入正数，最多两位小数。');
   const before=app.capture(),fields={name:$('recurring-name').value.trim(),cents:Math.round(Number(amount)*100),due:$('recurring-due').value};
   const next=editing?root.QYSRecurring.revise(before,editing,fields):root.QYSRecurring.add(before,{id:'PLAN-'+crypto.randomUUID(),...fields});
   commit(next,before,editing?'已修改月度扣费计划':'已保存月度扣费计划');editing=null;removing=null;$('recurring-save').textContent='保存月度计划';$('recurring-cancel-edit').hidden=true;$('recurring-form').reset();
 }catch(e){status(e.message)}};
 $('recurring-cancel-edit').onclick=()=>{editing=null;removing=null;$('recurring-save').textContent='保存月度计划';$('recurring-cancel-edit').hidden=true;$('recurring-form').reset();status('已取消修改。')};
 $('recurring-undo').onclick=()=>{try{if(!undo)return;app.restore(undo,signature);undo=null;refresh();status('已撤销上次周期核对操作。')}catch(e){status(e.message)}};
 root.addEventListener('storage',e=>{if(e.key===root.QYSBackup.KEY||e.key===null){undo=null;status('其他页面已修改数据，请刷新后再操作。');$('recurring-form').inert=true;$('recurring-rows').replaceChildren();$('recurring-undo').hidden=true;}});
 root.QYSRecurringUI=Object.freeze({refresh});refresh();
})(globalThis);
