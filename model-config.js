(function(root){
  'use strict';
  const KEY='qys_model_config_v1';
  function normalize(input){
    if(!input||typeof input!=='object')throw Error('模型配置无效。');
    const baseUrl=String(input.baseUrl||'').trim(),model=String(input.model||'').trim(),apiKey=String(input.apiKey||'');
    let url;try{url=new URL(baseUrl)}catch{throw Error('接口地址无效。')}
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw Error('外部接口必须使用 HTTPS。');
    if(url.username||url.password||url.search||url.hash||baseUrl.length>300||model.length<1||model.length>120||apiKey.length>500)throw Error('模型配置字段无效。');
    return {provider:String(input.provider||'custom').slice(0,40),baseUrl,model,apiKey};
  }
  function endpoint(cfg){const url=new URL(normalize(cfg).baseUrl),path=url.pathname.replace(/\/+$/,'');url.pathname=path.endsWith('/chat/completions')?path:path+'/chat/completions';return url.href}
  function testRequest(cfg){const c=normalize(cfg);return{url:endpoint(c),headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.apiKey},body:{model:c.model,messages:[{role:'user',content:'请只回复一个字：好'}],max_tokens:10}}}
  function save(storage,cfg){const c=normalize(cfg);storage.setItem(KEY,JSON.stringify(c));return c}
  function load(storage){try{const raw=storage.getItem(KEY);return raw?normalize(JSON.parse(raw)):null}catch{return null}}
  function clear(storage){storage.removeItem(KEY)}
  async function test(cfg,transport,timeoutMs=8000){try{const req=testRequest(cfg);const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Error('连接超时，请检查地址、网络和服务状态。')),Math.max(1,Math.min(90000,timeoutMs))));const response=await Promise.race([transport(req),timeout]);if(!response||response.status<200||response.status>=300)throw Error('模型服务返回 HTTP '+(response?.status||0)+'。');const text=response.json?.choices?.[0]?.message?.content;if(typeof text!=='string'||!text.trim())throw Error('模型服务未返回正式回答。');return{ok:true,text:text.trim()}}catch(error){return{ok:false,message:String(error.message||'连接失败').replace(/Bearer\s+[^\s]+/gi,'Bearer [已隐藏]').replace(/secret/gi,'[已隐藏]')}}}
  root.QYSModelConfig=Object.freeze({KEY,normalize,endpoint,testRequest,save,load,clear,test});
})(globalThis);

