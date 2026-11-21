(function(root){
  'use strict';
  const $=id=>document.getElementById(id),csv=root.QYSCSV,app=root.QYSDemoData;
  if(!csv||!app||!$('csv-section'))return;
  const fields={date:'日期 / 时间',merchant:'商户',kind:'收支方向',amount:'金额（元）',category:'类别（可选）',sourceId:'交易编号（可选）'};
  const aliases={date:['日期','交易时间','交易日期','date'],merchant:['商户','交易对方','merchant'],kind:['收支','收/支','收支方向','direction'],amount:['金额','金额(元)','金额（元）','amount'],category:['类别','交易分类','category'],sourceId:['交易编号','交易号','订单号','transaction_id']};
  const sample='日期,商户,收支,金额,类别,交易编号\n2026-11-01 12:30:00,示例食堂,支出,18.50,餐饮,EX-001\n2026-11-01 18:30:00,示例食堂,支出,18.50,餐饮,EX-002\n2026-11-02,示例生活费,收入,3000.00,收入,EX-003\n2026-11-03,示例公交,支出,2.00,交通,EX-004';
  let buffer=null,selection=null,undo=null,generation=0,fileGeneration=0,page=0;
  let platformBill = null;
  const platformMapping = {date:0,merchant:1,kind:2,amount:3,category:4,sourceId:5};
  function showPlatform(bill) {
    platformBill = bill;
    $('platform-summary').hidden = !bill;
    $('csv-format').hidden = Boolean(bill);
    $('csv-map-controls').hidden = Boolean(bill);
    if (!bill) return;
    const skipped = [...bill.excluded].map(([label,count]) => label+' '+count+' 笔').join('、') || '无';
    if (bill.sourceName === '支付宝') {
      $('platform-summary').textContent='支付宝原单 '+bill.count+' 笔，可预览 '+(bill.rows.length-1)+' 笔，需核对 '+bill.issues.length+' 行。排除项：'+skipped+'。';
      return;
    }
    $('platform-summary').textContent = '微信原单 '+bill.count+' 笔，纳入预览 '+(bill.rows.length-1)+' 笔。商户净消费 '+money(bill.net)+'，转入 '+money(bill.transferIn)+'，转出 '+money(bill.transferOut)+'。排除项：'+skipped+'。退款合计 '+money(bill.refundTotal)+'，其中 '+bill.partial+' 笔原交易按部分退款扣减。退款仅核对金额与笔数，原交易与退款的对应关系请对照原单。';
  }
  const money=n=>'¥'+(n/100).toFixed(2);
  function status(text){$('csv-status').textContent=text;}
  function invalidate(){generation++;selection=null;$('csv-preview').hidden=true;$('csv-ack').checked=false;$('csv-confirm').disabled=true;}
  function decode(){return new TextDecoder($('csv-encoding').value||'utf-8',{fatal:true}).decode(buffer);}
  function delimiter(){return $('csv-delimiter').value==='tab'?'\t':$('csv-delimiter').value||',';}
  function mapping(){return Object.fromEntries(Object.keys(fields).map(key=>[key,Number($('csv-map-'+key).value)]));}
  function loadMapping(){
    invalidate();if(!buffer)return;
    try{
      const {rows}=csv.parse(decode(),delimiter()),header=rows[0];
      for(const key of Object.keys(fields)){
        const select=$('csv-map-'+key);select.replaceChildren();const blank=document.createElement('option');blank.value=-1;blank.textContent=['category','sourceId'].includes(key)?'不使用此字段':'请选择对应列';select.append(blank);
        header.forEach((text,index)=>{const option=document.createElement('option');option.value=index;option.textContent=(index+1)+'. '+text.slice(0,80);select.append(option)});
        select.value=String(header.findIndex(text=>aliases[key].includes(text.trim())));select.onchange=invalidate;
      }
      $('csv-mapping').hidden=false;status('文件已读取，仅在本机处理。请确认来源名称与字段映射，再生成预览。');
    }catch{ $('csv-mapping').hidden=true;status('无法解析文件。请检查编码、分隔符、引号和列数；本机数据未修改。'); }
  }
  function refresh(){root.QYSImportReviewUI?.refresh();const locked=app.isLocked();$('csv-file').disabled=locked;$('csv-sample').disabled=locked;if(undo&&undo.signature!==app.signature()){undo=null;$('csv-undo').hidden=true;$('review-import').hidden=true;}}
  $('csv-sample').onclick=()=>{fileGeneration++;$('review-import').hidden=true;showPlatform(null);buffer=new TextEncoder().encode(sample);$('csv-file').value='';$('csv-encoding').value='utf-8';$('csv-delimiter').value=',';$('csv-source').value='CSV示例账本';loadMapping();};
  $('csv-file').onchange=async()=>{
    const file=$('csv-file').files?.[0], ticket=++fileGeneration, previousBill=platformBill;
    invalidate();buffer=null;$('review-import').hidden=true;showPlatform(null);$('csv-mapping').hidden=true;
    if(!file){status('请选择账单文件。');return;}
    if(file.size>csv.MAX_BYTES){status('文件超过 2 MB。');return;}
    status('正在本机读取账单…');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if(ticket!==fileGeneration)return;
      let bill;
      if (/\.xlsx$/i.test(file.name || '')) {
        const sheet = await root.QYSWechatWorkbook.read(bytes);
        if(ticket!==fileGeneration)return;
        bill = root.QYSWechatBill.convert(sheet);
      } else if (root.QYSAlipayBill && /\.csv$/i.test(file.name || '')) {
        bill = root.QYSAlipayBill.read(bytes);
      }
      if (bill) {
        showPlatform(bill);
        if (previousBill?.sourceName !== bill.sourceName || !$('csv-source').value.trim()) $('csv-source').value=bill.sourceName;
        $('csv-mapping').hidden=false;
        await $('csv-build').onclick();
      } else {
        if (previousBill) $('csv-source').value='';
        buffer=bytes;loadMapping();
      }
    } catch(error) {
      if(ticket===fileGeneration)status(error.message || '文件读取失败，请核对格式。');
    }
  };
  $('csv-encoding').onchange=loadMapping;$('csv-delimiter').onchange=loadMapping;$('csv-source').oninput=invalidate;
  function updateSummary(){
    if(!selection)return;
    const items=selection.plan.rows.filter(item=>selection.selected.has(item.record.id)&&item.status!=='duplicate');
    const income=items.filter(r=>r.record.kind==='income'&&r.record.category!=='转账').reduce((sum,r)=>sum+r.record.cents,0),expense=items.filter(r=>r.record.kind==='expense'&&r.record.category!=='转账').reduce((sum,r)=>sum+r.record.cents,0),transferIn=items.filter(r=>r.record.kind==='income'&&r.record.category==='转账').reduce((sum,r)=>sum+r.record.cents,0),transferOut=items.filter(r=>r.record.kind==='expense'&&r.record.category==='转账').reduce((sum,r)=>sum+r.record.cents,0);
    const duplicates=selection.plan.rows.filter(r=>r.status==='duplicate').length,candidates=selection.plan.rows.filter(r=>r.status==='candidate').length;
    $('csv-totals').textContent='待追加 '+items.length+' 笔 · 收入 '+money(income)+' · 消费 '+money(expense)+' · 转账流入 '+money(transferIn)+' · 转账流出 '+money(transferOut)+' · 已有重复 '+duplicates+' 笔（自动跳过） · 疑似重复 '+candidates+' 笔 · 错误 '+selection.plan.errors.length+' 行';
    if (selection.plan.reviewRows.length || selection.plan.knownReviews) {
      $('csv-totals').textContent += ' · 新增待核对 '+selection.plan.reviewRows.length+' 笔 · 已记录待核对或已处理 '+selection.plan.knownReviews+' 笔';
    }
    $('csv-confirm').textContent = selection.plan.reviewRows.length ? '确认入账并保存待核对' : '确认追加到本机账本';
    $('csv-confirm').disabled=!$('csv-ack').checked||(!items.length&&!selection.plan.reviewRows.length)||Boolean(selection.plan.errors.length);
  }
  function renderPage(){
    const {plan}=selection,node=$('csv-rows');node.replaceChildren();
    plan.rows.slice(page*50,(page+1)*50).forEach(item=>{
      const row=document.createElement('tr'),cell=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.checked=item.status!=='duplicate'&&selection.selected.has(item.record.id);check.disabled=item.status==='duplicate';check.setAttribute('aria-label','保留第'+item.row+'行');check.onchange=()=>{if(check.checked)selection.selected.add(item.record.id);else selection.selected.delete(item.record.id);$('csv-ack').checked=false;updateSummary()};cell.append(check);row.append(cell);
      const reason=item.match?'同日、同商户、同金额、同收支；已有 '+item.match.sourceName+' '+item.match.occurredAt+'，编号 '+(item.match.sourceId||'无')+'；本笔 '+item.record.source.occurredAt+'，编号 '+(item.record.source.id||'无')+'。时间或编号不同不能证明重复，请对照原文件后决定保留或取消勾选。':'';
      for(const text of [String(item.row),item.record.source.occurredAt,item.record.merchant,item.record.category==='转账'?(item.record.kind==='income'?'转账流入':'转账流出'):(item.record.kind==='income'?'收入':'消费'),money(item.record.cents),item.record.source.id||'无编号',item.status==='candidate'?'疑似重复，请核查。'+reason:({new:'新增',duplicate:'已有记录，跳过'})[item.status]]){const td=document.createElement('td');td.textContent=text;row.append(td)}node.append(row);
    });
    $('csv-page').textContent='第 '+(page+1)+' / '+Math.max(1,Math.ceil(plan.rows.length/50))+' 页，每页最多50行';$('csv-prev').disabled=page===0;$('csv-next').disabled=(page+1)*50>=plan.rows.length;updateSummary();
  }
  $('csv-build').onclick=async()=>{
    invalidate();if(!buffer&&!platformBill)return;
    if(!app.canImport()){status('请先处理待确认操作或解除本机数据保护状态。');return;}
    const ticket=generation,signature=app.signature();$('csv-build').disabled=true;status('正在本机校验与核查重复记录…');
    try{
      const input=platformBill ? {parsed:platformBill,mapping:platformMapping} : {text:decode(),delimiter:delimiter(),mapping:mapping()};
      const snapshot=app.capture();
      const plan=await csv.preview({...input,source:$('csv-source').value,existing:snapshot.demo.data,reviews:snapshot.importReviews});
      if(ticket!==generation)return;if(signature!==app.signature()){status('预览期间本机数据变化，请重新生成预览。');return;}
      selection={plan,signature,selected:new Set(plan.rows.filter(r=>r.status!=='duplicate').map(r=>r.record.id))};page=0;
      const notices = [...plan.errors, ...plan.reviewRows.map(item=>({row:item.row,message:'待核对 · '+item.message}))];
      $('csv-errors').replaceChildren();for(const issue of notices.slice(0,50)){const li=document.createElement('li');li.textContent='第'+issue.row+'行：'+issue.message;$('csv-errors').append(li)}
      $('csv-errors-note').textContent=notices.length>50?'预览显示前 50 项。':'';
      const missingIds=plan.rows.filter(r=>!r.record.source.id).length;
      $('csv-id-note').textContent=missingIds?'有 '+missingIds+' 条记录缺少交易编号：这些记录仅在同一文件同一位置可自动防重。不同文件的相似记录只列为候选，请人工核查。':'交易编号与固定来源名称用于识别同一笔交易；疑似重复仍需要你核查。';
      $('csv-preview').hidden=false;renderPage();status(plan.errors.length?'存在错误行，本次禁止提交。修正文件后重新选择。':plan.reviewRows.length?'待核对的记录会随本次确认暂存。它们暂不计入收支。':'预览完成，尚未写入。取消勾选不需要的记录，再确认追加范围。');$('csv-preview').focus();
    }catch(error){if(ticket===generation)status(error.message||'文件预览失败，未修改本机数据。');}
    finally{$('csv-build').disabled=false;}
  };
  $('csv-prev').onclick=()=>{if(selection&&page>0){page--;renderPage()}};$('csv-next').onclick=()=>{if(selection&&(page+1)*50<selection.plan.rows.length){page++;renderPage()}};
  $('csv-ack').onchange=updateSummary;$('csv-cancel').onclick=()=>{invalidate();status('已取消本次导入，本机数据未修改。');};
  $('csv-confirm').onclick=()=>{
    if(!selection||!$('csv-ack').checked||selection.plan.errors.length)return;
    if(!app.canImport()||selection.signature!==app.signature()){invalidate();status('数据或待确认状态变化，请重新生成预览。');return;}
    const records=selection.plan.rows.filter(item=>item.status!=='duplicate'&&selection.selected.has(item.record.id)).map(item=>item.record);
    const queued = selection.plan.reviewRows;
    if(!records.length&&!queued.length)return;
    try{
      const month = records.map(r=>r.date.slice(0,7)).sort().at(-1);
      const previous=app.capture(),next=app.capture();
      next.demo.data.push(...records);
      if (queued.length) next.importReviews = [...(next.importReviews || []),...queued];
      next.demo.audit.unshift({time:new Date().toLocaleTimeString('zh-CN',{hour12:false}),text:'本机账单导入 '+records.length+' 笔，待核对 '+queued.length+' 笔 · '+selection.plan.source});
      app.restore(next,selection.signature);invalidate();undo={payload:previous,signature:app.signature()};$('csv-undo').hidden=false;$('review-import').hidden=!records.length;$('review-import').onclick=()=>root.QYSReviewUI?.selectImport(records[0],month);
      root.QYSDataUI?.refresh();root.QYSImportReviewUI?.refresh();
      if (queued.length) $('csv-queue').open=true;
      status('已入账 '+records.length+' 笔'+(queued.length?'，另有 '+queued.length+' 笔待核对':'')+'。当前页面会话可撤销一次。');
    }catch{status('账单保存失败，原数据未替换。请检查容量、记录上限或其他标签页是否修改数据后再试。');}
  };
  $('csv-undo').onclick=()=>{
    if(!undo)return;
    if(!app.canImport()||undo.signature!==app.signature()){undo=null;$('csv-undo').hidden=true;$('review-import').hidden=true;status('数据已变化，不能直接撤销覆盖。请使用之前的JSON备份恢复。');return;}
    try{app.restore(undo.payload,undo.signature);undo=null;$('csv-undo').hidden=true;$('review-import').hidden=true;invalidate();root.QYSDataUI?.refresh();root.QYSImportReviewUI?.refresh();status('已撤销本次导入，恢复导入前的数据。');}catch{status('撤销保存失败，当前数据不变。请检查存储后重试。');}
  };
  root.addEventListener('storage',event=>{if(event.key!==null&&event.key!==root.QYSBackup.KEY)return;invalidate();undo=null;$('csv-undo').hidden=true;$('review-import').hidden=true;status('其他标签页数据已变化，请刷新后重新预览。');});
  root.QYSCSVUI=Object.freeze({refresh});refresh();
})(window);
