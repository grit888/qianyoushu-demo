(function(root){
  'use strict';
  const $=id=>document.getElementById(id), backup=root.QYSBackup, app=root.QYSDemoData;
  if(!app||!$('data-view'))return;
  const purposeLabel = '转账用途标注';
  let preview=null,undo=null,ticket=0;
  const money=c=>'¥'+(c/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  function status(text){$('data-status').textContent=text;}
  function clearPreview(){++ticket;preview=null;$('import-preview').hidden=true;$('import-ack').checked=false;$('import-confirm').disabled=true;$('import-file').value='';}
  function appendMetric(parent,label,value){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);parent.append(row);}
  function summaryMetrics(payload) {
    const s = backup.summary(payload);
    return [
      ['账单记录', s.rows + ' 笔'], ['收入合计', money(s.earned)],
      ['消费合计', money(s.consumption)], ['转账流入', money(s.transferIn)],
      ['转账流出', money(s.transferOut)], ['订阅', s.active + ' 项有效 / 共 ' + s.subscriptions + ' 项'],
      ['周期计划', s.plans + ' 项'], ['分类预算', s.budgets + ' 项'],
      [purposeLabel, s.transferPurposes + ' 条'], ['导入待核对',s.importReviews+' 条'], ['月结', payload.monthlyClose ? payload.monthlyClose.month : '未保存'], ['异常标注', s.feedback + ' 条'], ['已完成组合任务', s.tasks + ' 个'],
      ['操作记录', s.audit + ' 条'], ['记录日期', s.start + ' 至 ' + s.end]
    ];
  }
  function drawComparison(current, incoming) {
    const changes = backup.compareRecords(current.demo.data, incoming.demo.data);
    $('restore-records').textContent = changes.added || changes.removed || changes.changed
      ? '按记录编号核对，恢复后新增 ' + changes.added + ' 笔，移除 ' + changes.removed + ' 笔，修改 ' + changes.changed + ' 笔。'
      : '按记录编号核对，账单明细相同。订阅、操作记录和标注仍按备份恢复。';
    const hasPurposes = current.transferPurposes?.length || incoming.transferPurposes?.length;
    const purposesChanged = hasPurposes && !root.QYSTransferPurpose.sameEntries(current.transferPurposes,incoming.transferPurposes);
    const before = new Map(summaryMetrics(current));
    const body = $('restore-comparison-rows');
    body.replaceChildren();
    let differences = 0;
    for (const [label, after] of summaryMetrics(incoming)) {
      const row = document.createElement('tr');
      const changed = before.get(label) !== after || (label === purposeLabel && purposesChanged);
      if (changed) differences++;
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = label + (label === purposeLabel && purposesChanged ? '（用途或回款关联有变化）' : changed ? '（有变化）' : '');
      const left = document.createElement('td');
      const right = document.createElement('td');
      left.textContent = before.get(label);
      right.textContent = after;
      row.className = changed ? 'changed' : '';
      row.append(heading, left, right);
      body.append(row);
    }
    $('restore-differences').textContent = differences
      ? '有 ' + differences + ' 项汇总会变化，请核对标记行。'
      : '下表各项汇总相同。';
  }
  function refresh(){
    const locked=app.isLocked();$('export-state').disabled=locked;$('import-file').disabled=locked;
    if(locked){$('data-summary').replaceChildren();status('本机数据处于保护状态。请通过上方提示下载原始缓存，再处理恢复。');return;}
    const summary = $('data-summary');
    summary.replaceChildren();
    for (const [label, value] of summaryMetrics(app.capture())) appendMetric(summary, label, value);
    if(undo&&undo.signature!==app.signature()){undo=null;$('import-undo').hidden=true;}
  }
  $('export-state').onclick=()=>{
    try{
      const text=backup.exportText(app.capture()),url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),link=document.createElement('a');
      link.href=url;link.download='qianyoushu-demo-'+new Date().toISOString().slice(0,10)+'.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      status('已触发备份文件下载，请在浏览器确认保存。未完成任务和待确认操作不包含在文件中。');
    }catch{status('导出失败。请检查本机数据是否处于保护状态，或备份是否超过 2 MB。');}
  };
  $('import-file').onchange=async()=>{
    const file=$('import-file').files?.[0];clearPreview();const current=++ticket;
    if(!file)return;
    // Clear the value after retaining File so selecting the same file works again.
    if(!app.canImport()){status('请先处理待确认操作，或解除本机数据保护状态，再导入备份。');return;}
    if(file.size>backup.MAX_BYTES){status('文件超过 2 MB，未修改本机数据。');return;}
    status('正在本机读取并校验文件…');
    try{
      const signature=app.signature(),text=await file.text();
      if(current!==ticket)return;
      const payload=backup.parse(text);
      if(signature!==app.signature()||!app.canImport()){status('读取期间本机数据已变化，请重新选择文件。');return;}
      preview={payload,signature};drawComparison(app.capture(),payload);
      $('import-preview').hidden=false;$('import-ack').checked=false;$('import-confirm').disabled=true;
      status('校验通过，尚未导入。请核对下方数据与整体替换范围。');$('import-preview').focus();
    }catch{if(current!==ticket)return;clearPreview();status('读取或校验失败。请选择钱有数导出的版本 1 至 7 的完整 JSON 备份。');}
  };
  $('import-ack').onchange=()=>{$('import-confirm').disabled=!preview||!$('import-ack').checked;};
  $('import-cancel').onclick=()=>{clearPreview();status('已取消导入，本机数据未修改。');};
  $('import-confirm').onclick=()=>{
    if(!preview||!$('import-ack').checked)return;
    if(!app.canImport()||preview.signature!==app.signature()){clearPreview();status('数据或待确认状态已变化，请重新选择文件预览。本机数据未替换。');return;}
    try{
      const previous=app.capture();app.restore(preview.payload,preview.signature);
      clearPreview();undo={payload:previous,signature:app.signature()};$('import-undo').hidden=false;refresh();
      status('导入完成，已整体替换本机演示数据。当前页面会话可撤销一次；刷新页面后撤销入口失效。');
    }catch{clearPreview();status('导入失败：保存空间不足、其他标签页已修改数据或浏览器存储不可用。本机原数据未替换，请刷新后重试。');}
  };
  $('import-undo').onclick=()=>{
    if(!undo)return;
    if(!app.canImport()||undo.signature!==app.signature()){undo=null;$('import-undo').hidden=true;status('导入后数据已有变化，不能直接撤销覆盖。可重新选择之前的备份预览。');return;}
    try{app.restore(undo.payload,undo.signature);undo=null;$('import-undo').hidden=true;refresh();status('已撤销本次导入，恢复到导入前的数据。');}
    catch{status('撤销保存失败，当前数据保持不变。请检查存储空间或刷新后重试。');}
  };
  root.addEventListener('storage',event=>{if(event.key!==null&&event.key!==backup.KEY)return;clearPreview();undo=null;$('import-undo').hidden=true;status('其他标签页的数据已变化。请刷新本页后再备份或恢复。');});
  root.QYSDataUI=Object.freeze({refresh});refresh();
})(window);

