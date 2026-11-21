(function(root){
  'use strict';
  const $=id=>document.getElementById(id),app=root.QYSDemoData,core=root.QYSClassification;
  if(!app||!core||!$('classify-view'))return;
  let plan=null,undo=null,page=0;
  const money=c=>'¥'+(c/100).toFixed(2);
  function status(text){$('classify-status').textContent=text;}
  function invalidate(){plan=null;$('classify-preview').hidden=true;$('classify-ack').checked=false;$('classify-apply').disabled=true;}
  function refresh(){
    const locked=app.isLocked();$('classify-form').inert=locked;
    if(locked){status('本机账本处于保护状态，请先处理存储问题。');return;}
    const payload=app.capture(),picker=$('classify-month'),previous=picker.value;
    const months=[...new Set(payload.demo.data.map(r=>r.date.slice(0,7)))].sort().reverse();
    picker.replaceChildren();for(const value of ['',...months]){const option=document.createElement('option');option.value=value;option.textContent=value||'全部月份';picker.append(option)}
    const desired=picker.dataset.initialized?previous:$('month').value;
    picker.value=desired===''||months.includes(desired)?desired:months[0]||'';
    picker.dataset.initialized='true';
    $('classify-categories').replaceChildren();for(const value of [...new Set(payload.demo.data.map(r=>r.category))]){const option=document.createElement('option');option.value=value;$('classify-categories').append(option)}
    if(undo&&undo.signature!==app.signature()){undo=null;$('classify-undo').hidden=true;}
    if(plan&&plan.base!==app.signature()){invalidate();status('账本已变化，请重新生成分类预览。');}
  }
  function render(){
    const tbody=$('classify-rows');tbody.replaceChildren();
    for(const item of plan.items.slice(page*50,(page+1)*50)){const tr=document.createElement('tr');for(const text of [item.date,item.merchant,item.id,item.oldCategory,item.newCategory,(item.kind==='income'?'收入 ':'支出 ')+money(item.cents)]){const td=document.createElement('td');td.textContent=text;tr.append(td)}tbody.append(tr)}
    $('classify-summary').textContent='本次将修改 '+plan.items.length+' 笔类别；涉及金额 '+money(plan.amount)+'（金额不变）；已有 '+plan.unchanged+' 笔是目标类别，跳过。';
    $('classify-page').textContent='第 '+(page+1)+' / '+Math.max(1,Math.ceil(plan.items.length/50))+' 页，每页50笔';$('classify-prev').disabled=page===0;$('classify-next').disabled=(page+1)*50>=plan.items.length;
    $('classify-empty').hidden=plan.items.length>0;
    $('classify-apply').disabled=!plan.items.length||!$('classify-ack').checked;
  }
  for(const id of ['classify-keyword','classify-category'])$(id).oninput=invalidate;
  for(const id of ['classify-month','classify-direction'])$(id).onchange=invalidate;
  $('classify-form').onsubmit=event=>{
    event.preventDefault();invalidate();
    if(!app.canImport()){status('请先处理待确认操作或解除数据保护状态，再预览分类。');return;}
    try{plan=core.preview(app.capture(),{keyword:$('classify-keyword').value,category:$('classify-category').value,month:$('classify-month').value,direction:$('classify-direction').value});page=0;render();$('classify-preview').hidden=false;$('classify-preview').focus();status(plan.items.length?'已生成预览，尚未修改。请逐项核对旧/新类别。':'没有需要修改的记录。可调整关键词、月份或收支方向。');}
    catch(error){status(error.message||'分类预览失败，未修改账本。');}
  };
  $('classify-ack').onchange=()=>{if(plan)render()};
  $('classify-prev').onclick=()=>{if(plan&&page>0){page--;render()}};$('classify-next').onclick=()=>{if(plan&&(page+1)*50<plan.items.length){page++;render()}};
  $('classify-cancel').onclick=()=>{invalidate();status('已取消分类，本机数据未修改。');};
  $('classify-apply').onclick=()=>{
    if(!plan||!plan.items.length||!$('classify-ack').checked)return;
    if(!app.canImport()||plan.base!==app.signature()){invalidate();status('数据或待确认状态已变化，请重新预览。');return;}
    try{
      const previous=app.capture(),next=core.apply(previous,plan),count=plan.items.length;
      next.demo.audit.unshift({time:new Date().toLocaleTimeString('zh-CN',{hour12:false}),text:'批量分类 '+count+' 笔 → '+plan.rule.category+'；商户包含“'+plan.rule.keyword+'”；月份 '+(plan.rule.month||'全部')+'；方向 '+plan.rule.direction+'；金额、来源和凭证不变。'});
      app.restore(next,plan.base);invalidate();undo={payload:previous,signature:app.signature()};$('classify-undo').hidden=false;root.QYSDataUI?.refresh();root.QYSCSVUI?.refresh();status('已更新 '+count+' 笔类别，金额与来源未改变。本页会话可撤销一次。');
    }catch{status('保存失败，未替换原账本。请检查存储空间或其他标签页的数据变化后重试。');}
  };
  $('classify-undo').onclick=()=>{
    if(!undo)return;
    if(!app.canImport()||undo.signature!==app.signature()){undo=null;$('classify-undo').hidden=true;status('数据已变化，不能覆盖撤销。请使用修改前的备份恢复。');return;}
    try{app.restore(undo.payload,undo.signature);undo=null;$('classify-undo').hidden=true;invalidate();root.QYSDataUI?.refresh();root.QYSCSVUI?.refresh();status('已撤销本次分类，恢复到修改前的账本。');}catch{status('撤销保存失败，当前数据不变。请检查存储后重试。');}
  };
  root.addEventListener('storage',event=>{if(event.key!==null&&event.key!==root.QYSBackup.KEY)return;invalidate();undo=null;$('classify-undo').hidden=true;status('其他标签页数据已变化，请刷新后再预览。');});
  root.QYSClassifyUI=Object.freeze({refresh});refresh();
})(window);
