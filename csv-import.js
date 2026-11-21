(function(root){
  'use strict';
  const MAX_BYTES=2*1024*1024;
  function parse(input,delimiter=','){
    if(typeof input!=='string'||input.length>MAX_BYTES||new TextEncoder().encode(input).length>MAX_BYTES)throw Error('文件超过 2 MB。');
    if(![',',';','\t'].includes(delimiter))throw Error('请选择有效分隔符。');
    const text=input.replace(/^\uFEFF/,''),rows=[],lineNumbers=[];
    let row=[],field='',quoted=false,closed=false,line=1,start=1;
    function cell(){row.push(field);field='';closed=false;if(row.length>100)throw Error('列数超过100列。');}
    function record(){cell();if(row.some(x=>x.trim())){rows.push(row);lineNumbers.push(start);}row=[];start=line+1;if(rows.length>5001)throw Error('记录超过5000条。');}
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else{field+=c;if(c==='\n')line++;}continue;}
      if(c==='"'){if(field||closed)throw Error('引号格式错误，请检查CSV文件。');quoted=true;}
      else if(c===delimiter)cell();
      else if(c==='\n'||c==='\r'){record();if(c==='\r'&&text[i+1]==='\n')i++;line++;start=line;}
      else{if(closed)throw Error('引号后存在多余字符。');field+=c;}
    }
    if(quoted)throw Error('引号没有闭合。');
    if(field||row.length||closed)record();
    if(rows.length<2)throw Error('CSV至少需要表头和一条记录。');
    return {rows,lineNumbers};
  }
  function dateValue(value){
    const match=value.trim().match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if(!match)throw Error('日期须为YYYY-MM-DD，可附HH:mm:ss。');
    const date=match[1]+'-'+match[2]+'-'+match[3],year=Number(match[1]);
    if(year<1900||year>2100||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||Number(match[4]||0)>23||Number(match[5]||0)>59||Number(match[6]||0)>59)throw Error('日期或时间无效。');
    return {date,occurredAt:date+(match[4]?' '+match[4]+':'+match[5]+(match[6]?':'+match[6]:''):'')};
  }
  function centsValue(amount) {
    if (!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(amount)) throw Error('金额须为正元金额，最多两位小数；不接受货币符号或千分位。');
    const [whole,fraction=''] = amount.split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2,'0'));
    if (!Number.isSafeInteger(cents) || cents<=0) throw Error('金额无效。');
    return cents;
  }
  async function hash(text){return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');}
  const same=(a,b)=>a.date===b.date&&(a.source?.occurredAt||a.date)===(b.source?.occurredAt||b.date)&&a.merchant===b.merchant&&a.cents===b.cents&&a.kind===b.kind&&(a.category==='转账')===(b.category==='转账');
  const similar=(a,b)=>a.date===b.date&&a.merchant===b.merchant&&a.cents===b.cents&&a.kind===b.kind;
  async function preview({text,delimiter=',',parsed=parse(text,delimiter),source,mapping,existing=[],reviews=[]}){
    if(typeof source!=='string'||!source.trim()||source.trim().length>80)throw Error('请填写固定来源名称，最多80字。');
    source=source.trim();const header=parsed.rows[0],fields=['date','merchant','kind','amount','category','sourceId'];
    const indices=fields.map(k=>mapping[k]);
    if(indices.some((n,i)=>!Number.isInteger(n)||n>=header.length||n< (i<4?0:-1))||new Set(indices.filter(n=>n>=0)).size!==indices.filter(n=>n>=0).length)throw Error('日期、商户、收支和金额须映射到不同的列。');
    const fileId=await hash(JSON.stringify(parsed.rows)),byId=new Map(existing.map(row=>[row.id,row])),seen=[...existing],rows=[],errors=[];
    const reviewRows = [], known = new Set(reviews.map(item=>item.id)), occurrences = new Map();
    let knownReviews = 0;
    for (const issue of parsed.issues || []) {
      let date = '', cents = null;
      try { date = dateValue(issue.date).occurredAt; } catch {}
      try { cents = centsValue(issue.amount); } catch {}
      const refund = issue.kind==='refund' && date && cents;
      // Keep distinct refund events on the same order and deduplicate overlapping exports.
      const evidence = JSON.stringify(refund && issue.order
        ? [source,'refund',issue.order,date,cents]
        : [source,issue.kind,issue.order,date||issue.date,issue.merchant,cents||issue.amount,issue.category,issue.status,issue.flow]);
      const occurrence = (occurrences.get(evidence) || 0) + 1;
      occurrences.set(evidence,occurrence);
      const id = await hash(JSON.stringify([evidence,occurrence]));
      if (known.has(id)) { knownReviews++; continue; }
      reviewRows.push({id,source,row:issue.row,kind:refund && occurrence===1 ? 'refund' : 'inspect',
        date,cents,merchant:issue.merchant.slice(0,200),order:issue.order.slice(0,120),message:refund && occurrence>1?'与本文件另一条退款具有相同依据，请先核对是否重复。':issue.message,state:'pending'});
    }
    if (parsed.excludedOrders?.size) {
      for (const old of existing) {
        const removed = old.source?.name === source && parsed.excludedOrders.get(old.source.id);
        if (removed) {
          errors.push({row:removed.row,code:'conflict',message:'原先记入的交易现已列为「'+removed.reason+'」。请先核对并修正旧记录，再追加这份账单。'});
        }
      }
    }
    for(let i=1;i<parsed.rows.length;i++){
      const cells=parsed.rows[i],line=parsed.lineNumbers[i];
      try{
        if(cells.length!==header.length)throw Error('列数与表头不一致。');
        const value=k=>mapping[k]<0?'':cells[mapping[k]].trim(),d=dateValue(value('date')),merchant=value('merchant'),category=value('category')||'未分类',rawAmount=value('amount'),sourceId=value('sourceId');
        if(!merchant||merchant.length>200||category.length>50||sourceId.length>120)throw Error('商户、类别或交易编号长度无效。');
        const cents = centsValue(rawAmount);
        const direction=value('kind'),kind=['收入','income'].includes(direction)?'income':['支出','expense'].includes(direction)?'expense':null;
        if(!kind)throw Error('收支只接受收入/支出或income/expense；退款、转账和其他状态请先核对。');
        const id='CSV-'+await hash(JSON.stringify(sourceId?[source,'id',sourceId]:[source,'file',fileId,i]));
        const record={id,date:d.date,merchant,category,cents,kind,source:{name:source,id:sourceId,row:line,occurredAt:d.occurredAt}};
        const previous=byId.get(id);
        if(previous&&!same(previous,record)){errors.push({row:line,code:'conflict',message:'来源编号已对应不同的日期、商户、金额、收支或转账性质，未覆盖旧记录。'});continue;}
        const match=previous?null:seen.find(old=>similar(old,record));
        const status=previous?'duplicate':match?'candidate':'new';
        rows.push({row:line,status,record,match:match?{id:match.id,occurredAt:match.source?.occurredAt||match.date,sourceId:match.source?.id||'',sourceName:match.source?.name||'合成样例'}:null});
        if(!previous){byId.set(id,record);seen.push(record);}
      }catch(error){errors.push({row:line,code:'invalid',message:error instanceof RangeError?'日期或时间无效。':error.message});}
    }
    return {rows,errors,reviewRows,knownReviews,hasSourceIds:mapping.sourceId>=0,source};
  }
  root.QYSCSV=Object.freeze({MAX_BYTES,parse,preview});
})(globalThis);
