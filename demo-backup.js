(function(root){
  'use strict';
  const KEY='qys_snapshot_v1', MAX_BYTES=2*1024*1024;
  function invalid(){throw Error('备份格式或内容无效，请使用钱有数导出的 JSON 备份。');}
  function keys(obj,allowed){if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!allowed.includes(k)))invalid();}
  function pick(obj,fields){return Object.fromEntries(fields.map(k=>[k,obj[k]]));}
  function taskValue(task,demo){
    if(task===null)return null;
    keys(task,['id','status','index','amount','steps','receiptId']);
    if(typeof task.id!=='string'||!/^[A-Za-z0-9-]{1,80}$/.test(task.id)||!['draft','running','awaiting','completed','cancelled'].includes(task.status)||!Number.isInteger(task.index)||task.index<0||task.index>3||typeof task.amount!=='string'||!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(task.amount)||Number(task.amount)<=0||Number(task.amount)>1000||!Array.isArray(task.steps)||task.steps.length!==3)invalid();
    task.steps.forEach((step,i)=>{keys(step,['kind','label','status']);if(step.kind!==['query','transfer','subscriptions'][i]||typeof step.label!=='string'||step.label.length>200||!['pending','completed','awaiting','rejected'].includes(step.status))invalid();});
    const receipt=demo.data.find(r=>r.id==='SIM-C-'+task.id);
    if(task.receiptId!==undefined&&(task.receiptId!=='SIM-C-'+task.id||!receipt))invalid();
    if(task.status==='completed'&&(task.index!==3||task.steps.some(s=>s.status!=='completed')||!receipt||receipt.merchant!=='小张'||receipt.cents!==Math.round(Number(task.amount)*100)||task.receiptId!==receipt.id))invalid();
    return JSON.parse(JSON.stringify(task));
  }
  function normalize(payload){
    keys(payload,['demo','task','feedback','recurring','budgets','transferPurposes','importReviews','monthlyClose']);
    const demo=payload.demo;
    keys(demo,['data','subs','audit','daily','serial']);
    root.QYSDemoCore.validateState(demo);
    for(const row of demo.data){keys(row,['id','date','merchant','category','cents','kind','source']);if(row.source)keys(row.source,['name','id','row','occurredAt']);}
    for(const sub of demo.subs)keys(sub,['name','cents','active']);
    for(const row of demo.audit)keys(row,['time','text']);
    keys(payload.feedback,['0','1','2']);
    if(Object.values(payload.feedback).some(v=>!['needs_review','false_positive'].includes(v)))invalid();
    const result={demo:JSON.parse(JSON.stringify(demo)),task:taskValue(payload.task,demo),feedback:{...payload.feedback}};
    if(payload.recurring!==undefined){
      if(!Array.isArray(payload.recurring)||payload.recurring.length>200)invalid();
      const ids=new Set(),linked=new Set();
      result.recurring=payload.recurring.map(p=>{
        keys(p,['id','name','cents','due','transactionId']);
        if(typeof p.id!=='string'||!/^PLAN-[a-zA-Z0-9-]{1,80}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||!Number.isSafeInteger(p.cents)||p.cents<=0||p.cents>100000000||typeof p.due!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(p.due)||!Number.isFinite(Date.parse(p.due))||new Date(p.due).toISOString().slice(0,10)!==p.due)invalid();
        ids.add(p.id);
        if(p.transactionId!==null){const row=demo.data.find(r=>r.id===p.transactionId);if(!row||row.kind!=='expense'||row.category==='转账'||row.id.startsWith('SIM-')||linked.has(row.id)||row.date.slice(0,7)!==p.due.slice(0,7))invalid();linked.add(row.id);}
        return {...p};
      });
    }
    if(payload.budgets!==undefined){
      if(!Array.isArray(payload.budgets)||payload.budgets.length>300)invalid();
      const unique=new Set();result.budgets=payload.budgets.map(b=>{
        keys(b,['month','category','cents']);
        if(typeof b.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(b.month)||typeof b.category!=='string'||!b.category.trim()||b.category.length>50||!Number.isSafeInteger(b.cents)||b.cents<=0||b.cents>100000000||unique.has(b.month+'\0'+b.category))invalid();
        unique.add(b.month+'\0'+b.category);return {...b};
      });
    }
    if(payload.transferPurposes!==undefined)result.transferPurposes=root.QYSTransferPurpose.normalize(demo.data,payload.transferPurposes);
    if(payload.importReviews!==undefined)result.importReviews=root.QYSImportReview.normalize({...result,importReviews:payload.importReviews});
    if(payload.monthlyClose!==undefined){
      const m=payload.monthlyClose;
      if(!m||typeof m.scope!=='string'||!m.scope.trim()||m.scope.length>100||typeof m.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m.month)||![m.openingCents,m.actualCents].every(v=>v===null||v===undefined||Number.isSafeInteger(v)&&v>=0))invalid();
      result.monthlyClose={scope:m.scope,month:m.month,openingCents:m.openingCents??null,actualCents:m.actualCents??null};
    }
    return result;
  }
  function documentFor(payload){return {format:'qianyoushu-demo',version:payload.monthlyClose!==undefined?7:payload.importReviews!==undefined?6:payload.transferPurposes!==undefined?5:payload.budgets!==undefined?4:payload.recurring!==undefined?3:payload.demo.data.some(r=>r.id.startsWith('CSV-'))?2:1,exportedAt:new Date().toISOString(),payload:normalize(payload)};}
  function encode(doc){const text=JSON.stringify(doc,null,2);if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('备份超过 2 MB，请减少操作记录后重试。');return text;}
  function parseDocument(text,internal=false){
    if(typeof text!=='string'||text.length>MAX_BYTES||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('文件超过 2 MB，未读取或修改本机数据。');
    let doc;try{doc=JSON.parse(text)}catch{invalid()}
    keys(doc,['format','version','exportedAt','payload']);
    if(doc.format!=='qianyoushu-demo'||![1,2,3,4,5,6,7].includes(doc.version)||typeof doc.exportedAt!=='string'||!Number.isFinite(Date.parse(doc.exportedAt)))invalid();
    let payload;try{payload=normalize(doc.payload)}catch{invalid()}
    if(doc.version<7&&payload.monthlyClose!==undefined)invalid();
    if(doc.version<6&&payload.importReviews!==undefined)invalid();
    if(doc.version<5&&payload.transferPurposes!==undefined)invalid();
    if(doc.version<4&&payload.budgets!==undefined)invalid();
    if(doc.version<3&&payload.recurring!==undefined)invalid();
    if(doc.version===1&&payload.demo.data.some(r=>r.id.startsWith('CSV-')))invalid();
    if(!internal&&payload.task&&payload.task.status!=='completed')invalid();
    return payload;
  }
  function exportText(payload){
    // Construct an allowlist instead of serializing the app, browser storage or session.
    const demo=payload.demo;
    const clean={demo:{data:demo.data.map(r=>({...pick(r,['id','date','merchant','category','cents','kind']),...(r.source?{source:pick(r.source,['name','id','row','occurredAt'])}:{})})),subs:demo.subs.map(r=>pick(r,['name','cents','active'])),audit:demo.audit.map(r=>pick(r,['time','text'])),daily:demo.daily,serial:demo.serial},task:payload.task?.status==='completed'?payload.task:null,feedback:payload.feedback};
    if(payload.recurring!==undefined)clean.recurring=payload.recurring;
    if(payload.budgets!==undefined)clean.budgets=payload.budgets;
    if(payload.transferPurposes!==undefined)clean.transferPurposes=payload.transferPurposes;
    if(payload.importReviews!==undefined)clean.importReviews=payload.importReviews;
    if(payload.monthlyClose!==undefined)clean.monthlyClose=payload.monthlyClose;
    return encode(documentFor(clean));
  }
  function load(storage){
    let raw=null;
    try{
      raw=storage.getItem(KEY);
      if(raw!==null)return {payload:parseDocument(raw,true),raw,corruptRaw:null};
      raw=storage.getItem('qys_demo_v2');
      if(raw===null)return {payload:null,raw:null,corruptRaw:null};
      const demo=root.QYSDemoCore.validateState(JSON.parse(raw));
      let task=null;try{const old=JSON.parse(storage.getItem('qys_task_v1')||'null');task=taskValue(old,demo)}catch{}
      const feedback=root.QYSDemoCore.parseFeedback(storage.getItem('qys_anomaly_v1'));
      return {payload:normalize({demo,task,feedback}),raw:null,corruptRaw:null};
    }catch{return {payload:null,raw:null,corruptRaw:raw??'',error:true};}
  }
  function commit(storage,payload,expectedRaw){
    const text=encode(documentFor(payload));
    if(storage.getItem(KEY)!==expectedRaw)throw Error('本机数据已变化，请刷新页面后重新预览。');
    storage.setItem(KEY,text); // One atomic storage write is the only commit point.
    return text;
  }
  function summary(payload){
    const rows=payload.demo.data,dates=rows.map(r=>r.date).sort();
    return {plans:payload.recurring?.length||0,budgets:payload.budgets?.length||0,transferPurposes:payload.transferPurposes?.length||0,importReviews:payload.importReviews?.filter(item=>item.state==='pending').length||0,rows:rows.length,income:rows.filter(r=>r.kind==='income').reduce((s,r)=>s+r.cents,0),expense:rows.filter(r=>r.kind==='expense').reduce((s,r)=>s+r.cents,0),earned:rows.filter(r=>r.kind==='income'&&r.category!=='转账').reduce((s,r)=>s+r.cents,0),consumption:rows.filter(r=>r.kind==='expense'&&r.category!=='转账').reduce((s,r)=>s+r.cents,0),transferIn:rows.filter(r=>r.kind==='income'&&r.category==='转账').reduce((s,r)=>s+r.cents,0),transferOut:rows.filter(r=>r.kind==='expense'&&r.category==='转账').reduce((s,r)=>s+r.cents,0),subscriptions:payload.demo.subs.length,active:payload.demo.subs.filter(r=>r.active).length,feedback:Object.keys(payload.feedback).length,tasks:payload.task?.status==='completed'?1:0,audit:payload.demo.audit.length,start:dates[0]||'无',end:dates.at(-1)||'无'};
  }
  function compareRecords(current, incoming) {
    const remaining = new Map(current.map(row => [row.id, row]));
    let added = 0, changed = 0;
    for (const row of incoming) {
      const old = remaining.get(row.id);
      if (!old) {
        added++;
        continue;
      }
      remaining.delete(row.id);
      const sameEntry = ['date','merchant','category','cents','kind'].every(key => old[key] === row[key]);
      const sameSource = ['name','id','row','occurredAt'].every(key => old.source?.[key] === row.source?.[key]);
      if (!sameEntry || !sameSource) changed++;
    }
    return {added, removed:remaining.size, changed};
  }
  root.QYSBackup=Object.freeze({KEY,MAX_BYTES,exportText,parse:text=>parseDocument(text),load,commit,summary,normalize,compareRecords});
})(globalThis);

