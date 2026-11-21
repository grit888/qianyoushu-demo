(function (root) {
  'use strict';
  function applyTransfer(state, operation) {
    if (!Array.isArray(state.data) || !Number.isSafeInteger(state.daily) || state.daily < 0 || state.daily > 100000) throw new Error('本机限额状态无效，请核对演示数据。');
    const {id, name, cents} = operation;
    if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('金额须为大于零的安全整数分。');
    if (typeof id !== 'string' || !/^SIM-[A-Za-z0-9-]{1,100}$/.test(id) || typeof name !== 'string' || !name.trim()) throw new Error('凭证或收款人无效。');
    if (operation.approved !== true) return {state, status:'rejected'};
    const existing = state.data.find(row => row.id === id);
    if (existing) {
      if (existing.cents !== cents || existing.merchant !== name || existing.kind !== 'expense') throw new Error('凭证与原操作不一致，未重复执行。');
      return {state, status:'already_completed'};
    }
    if (state.daily + cents > 100000) throw new Error('本机模拟转账累计上限为1,000元。');
    const row = {id, date:'2026-10-06', merchant:name, category:'转账', cents, kind:'expense'};
    return {state:{...state, data:[...state.data,row], daily:state.daily+cents}, status:'completed'};
  }
  function parseFeedback(raw) {
    try {
      const saved = JSON.parse(raw || '{}'), result = {};
      if (!saved || Array.isArray(saved) || typeof saved !== 'object') return result;
      for (const key of ['0','1','2']) if (['needs_review','false_positive'].includes(saved[key])) result[key] = saved[key];
      return result;
    } catch { return {}; }
  }
  function validateState(saved) {
    const text = (s, max=200) => typeof s==='string' && s.length>0 && s.length<=max;
    const cents = n => Number.isSafeInteger(n) && n>=0;
    if (!saved || !Array.isArray(saved.data) || saved.data.length>10000 || !Array.isArray(saved.subs) || saved.subs.length>100 || !Array.isArray(saved.audit) || saved.audit.length>10000 || !cents(saved.daily) || saved.daily>100000 || !cents(saved.serial)) throw Error('备份结构或限额字段无效');
    const ids=new Set(); let transfers=0, total=0;
    for(const row of saved.data){
      if(!row || !text(row.id,110) || !/^(DEMO-\d+|SIM-[A-Za-z0-9-]+|CSV-[a-f0-9]{64})$/.test(row.id) || ids.has(row.id) || !/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(row.date) || Number(row.date.slice(0,4))>2100 || new Date(row.date+'T00:00:00Z').toISOString().slice(0,10)!==row.date || !text(row.merchant) || !text(row.category,50) || !cents(row.cents) || row.cents===0 || !['income','expense'].includes(row.kind)) throw Error('账单记录、日期或编号无效');
      if(row.id.startsWith('CSV-')){
        const s=row.source;
        if(!s||!text(s.name,80)||typeof s.id!=='string'||s.id.length>120||!Number.isInteger(s.row)||s.row<2||s.row>100000||typeof s.occurredAt!=='string'||!/^\d{4}-\d{2}-\d{2}(?: (?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)?$/.test(s.occurredAt)||s.occurredAt.slice(0,10)!==row.date)throw Error('CSV来源字段或日期无效');
      }else if(row.source!==undefined)throw Error('非CSV记录不能携带CSV来源字段');
      ids.add(row.id); total+=row.cents;
      if(!Number.isSafeInteger(total))throw Error('账单总额超出安全范围');
      if(row.id.startsWith('SIM-')){if(row.kind!=='expense')throw Error('模拟凭证方向无效');transfers+=row.cents;}
      const serialId=row.id.match(/^SIM-T(\d+)$/);if(serialId && Number(serialId[1])>saved.serial)throw Error('凭证序号无效');
    }
    if(transfers!==saved.daily)throw Error('累计限额与模拟凭证不一致');
    const names=new Set();for(const sub of saved.subs){if(!sub||!text(sub.name)||names.has(sub.name)||!cents(sub.cents)||typeof sub.active!=='boolean')throw Error('订阅记录无效');names.add(sub.name);}
    for(const row of saved.audit)if(!row||!text(row.time,100)||!text(row.text,1000))throw Error('操作记录无效');
    return saved;
  }
  function scenario({income, variable, fixed}) {
    if (![income,variable,fixed].every(n=>Number.isSafeInteger(n)&&n>=0) || !Number.isSafeInteger(variable+fixed) || !Number.isSafeInteger(income-variable-fixed)) throw Error('请填写有效的非负金额');
    return {income,variable,fixed,remaining:income-variable-fixed};
  }
  root.QYSDemoCore = Object.freeze({applyTransfer, parseFeedback, validateState, scenario});
})(globalThis);
