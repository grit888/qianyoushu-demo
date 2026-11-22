(function(root){
  'use strict';
  const model=root.QYSModelConfig,$=id=>document.getElementById(id),storage=window.localStorage;
  function load(){const cfg=model.load(storage);if(!cfg)return;$('model-provider').value=cfg.provider;$('model-base-url').value=cfg.baseUrl;$('model-name').value=cfg.model;$('model-api-key').value=cfg.apiKey}
  $('model-settings-form').onsubmit=event=>{event.preventDefault();try{model.save(storage,{provider:$('model-provider').value,baseUrl:$('model-base-url').value,model:$('model-name').value,apiKey:$('model-api-key').value});$('model-status').textContent='配置已保存在本机。';}catch(error){$('model-status').textContent=error.message}};
  $('model-test').onclick=async()=>{try{const cfg=model.normalize({provider:$('model-provider').value,baseUrl:$('model-base-url').value,model:$('model-name').value,apiKey:$('model-api-key').value});$('model-status').textContent='正在测试连接…';const result=await model.test(cfg,async request=>{const response=await fetch(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(request.body),redirect:'error'});let json=null;try{json=await response.json()}catch{}return{status:response.status,json}});$('model-status').textContent=result.ok?'连接成功，模型已返回测试回答。':'连接失败：'+result.message}catch(error){$('model-status').textContent=error.message}};
  $('model-clear').onclick=()=>{model.clear(storage);$('model-settings-form').reset();$('model-status').textContent='已清除本机模型配置。'};
  root.QYSModelSettingsUI=Object.freeze({refresh:load});load();
})(globalThis);

