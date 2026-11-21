(function(root){
 'use strict';
 function add(payload,input){
   const next=JSON.parse(JSON.stringify(payload));
   next.recurring=[...(next.recurring||[]),{...input,transactionId:null}];
   return root.QYSBackup.normalize(next);
 }
 function link(payload,id,transactionId){
   const next=root.QYSBackup.normalize(payload),plan=next.recurring?.find(p=>p.id===id);
   if(!plan)throw Error('计划不存在，请刷新。');
   plan.transactionId=transactionId;
   return root.QYSBackup.normalize(next);
 }
 function revise(payload,id,changes){
   const next=root.QYSBackup.normalize(payload),plan=next.recurring?.find(p=>p.id===id);
   if(!plan)throw Error('计划不存在，请刷新。');
   Object.assign(plan,changes);
   if(plan.transactionId&&next.demo.data.find(r=>r.id===plan.transactionId)?.date.slice(0,7)!==plan.due.slice(0,7))plan.transactionId=null;
   return root.QYSBackup.normalize(next);
 }
 function remove(payload,id){
   const next=root.QYSBackup.normalize(payload);
   if(!next.recurring?.some(p=>p.id===id))throw Error('计划不存在，请刷新。');
   next.recurring=next.recurring.filter(p=>p.id!==id);
   return root.QYSBackup.normalize(next);
 }
 function following(plan){
   const [y,m,d]=plan.due.split('-').map(Number),date=new Date(Date.UTC(y,m,1));
   const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
   date.setUTCDate(Math.min(d,last));return date.toISOString().slice(0,10);
 }
 root.QYSRecurring=Object.freeze({add,link,revise,remove,following});
})(globalThis);
