(function(root){
  'use strict';
  const forbidden=/merchant|order|sourceId|raw|apiKey|password|token/i;
  function buildRequest(close){
    const categories=(close.categories||[]).slice(0,3).map(item=>[item[0],item[1]]);
    const coverage={first:typeof close.coverage?.first==='string'?close.coverage.first.slice(0,20):'',last:typeof close.coverage?.last==='string'?close.coverage.last.slice(0,20):''};
    const result={month:close.month,scope:close.scope,income:close.income,grossExpense:close.grossExpense,offsets:close.offsets,netExpense:close.netExpense,pending:close.pending,categories,coverage,budgetDifference:close.budgetDifference??null,difference:close.difference??null};
    if(Object.keys(result).some(key=>forbidden.test(key)))throw Error('AI请求含有禁止字段。');
    if(JSON.stringify(result).length>4000)throw Error('AI请求汇总过长。');
    return result;
  }
  function fallback(close){
    const parts=[];
    parts.push('本月已记录收入 '+((close.income||0)/100).toFixed(2)+' 元，实际承担消费 '+((close.netExpense||0)/100).toFixed(2)+' 元。');
    if(close.pending)parts.push('还有 '+close.pending+' 笔待核对，暂不计入消费。');
    if(close.difference===null||close.difference===undefined)parts.push('尚未完成期初和期末余额核对。');
    else if(close.difference===0)parts.push('理论余额与实际余额相符。');
    else parts.push('余额核对差额为 '+Math.abs(close.difference/100).toFixed(2)+' 元，建议优先检查退款、回款和未导入流水。');
    return {source:'rules',text:parts.join('')};
  }
  async function request(close,transport,timeoutMs=8000){
    const input=buildRequest(close);
    if(typeof transport!=='function')return fallback(input);
    try{const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Error('AI请求超时。')),Math.max(1,Math.min(90000,timeoutMs))));const response=await Promise.race([transport(input),timeout]);if(!response||typeof response.text!=='string'||!response.text.trim()||response.text.length>4000)throw Error('AI响应格式无效。');return{source:'ai',text:response.text.trim()};}
    catch{return fallback(input)}
  }
  root.QYSAISummary=Object.freeze({buildRequest,fallback,request});
})(globalThis);

