(function(root){
  'use strict';
  function normalizeRule(input){
    const keyword=typeof input.keyword==='string'?input.keyword.trim():'',category=typeof input.category==='string'?input.category.trim():'';
    if(!keyword||keyword.length>80||!category||category.length>50||/[\u0000-\u001f]/.test(keyword+category))throw Error('请填写商户关键词（最多80字）与目标类别（最多50字）。');
    if(category==='转账')throw Error('批量分类不能改变交易是否属于转账；请核对原始账单。');
    if(!['all','income','expense'].includes(input.direction)||typeof input.month!=='string'||(input.month!==''&&!/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(input.month)))throw Error('月份或收支方向无效。');
    return {keyword,category,month:input.month,direction:input.direction};
  }
  function preview(payload,input){
    root.QYSBackup.normalize(payload);
    const rule=normalizeRule(input),items=[];let unchanged=0,amount=0;
    for(const row of payload.demo.data){
      if(row.id.startsWith('SIM-')||row.category==='转账'||!row.merchant.toLowerCase().includes(rule.keyword.toLowerCase())||(rule.month&&!row.date.startsWith(rule.month))||(rule.direction!=='all'&&row.kind!==rule.direction))continue;
      if(row.category===rule.category){unchanged++;continue;}
      items.push({id:row.id,date:row.date,merchant:row.merchant,kind:row.kind,cents:row.cents,oldCategory:row.category,newCategory:rule.category});amount+=row.cents;
    }
    return {rule,items,unchanged,amount,base:JSON.stringify(payload)};
  }
  function apply(payload,plan){
    if(JSON.stringify(payload)!==plan.base)throw Error('账本已变化，请重新预览。');
    const verified=preview(payload,plan.rule);
    if(JSON.stringify(verified.items)!==JSON.stringify(plan.items))throw Error('分类预览已变化，请重新生成。');
    const result=root.QYSBackup.normalize(payload),ids=new Set(verified.items.map(item=>item.id));
    for(const row of result.demo.data)if(ids.has(row.id))row.category=verified.rule.category;
    return result;
  }
  root.QYSClassification=Object.freeze({preview,apply});
})(globalThis);
