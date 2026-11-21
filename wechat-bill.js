(function (root) {
  'use strict';
  const header = ['交易时间','交易类型','交易对方','商品','收/支','金额(元)','支付方式','当前状态','交易单号','商户单号','备注'];
  function cents(text) {
    const match = /^(\d{1,10})(?:\.(\d{1,2})0*)?$/.exec(text);
    if (!match) throw Error('金额无效');
    const result = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2,'0'));
    if (!result) throw Error('金额必须为正数');
    return result;
  }
  function stamp(value) {
    if (!/^\d{5}(?:\.\d+)?$/.test(value)) throw Error('交易时间不是原始 Excel 日期');
    const date = new Date(Date.UTC(1899,11,30) + Math.round(Number(value) * 86400) * 1000);
    if (date.getUTCFullYear() < 2020 || date.getUTCFullYear() > 2100) throw Error('交易时间超出范围');
    return date.toISOString().slice(0,19).replace('T',' ');
  }
  function convert(sheet) {
    const start = sheet.findIndex(({cells}) => header.every((label,i) => cells[String.fromCharCode(65+i)] === label));
    if (start < 0) throw Error('未找到微信支付交易表头，请选择原始微信账单。');
    const rows = [['日期','商户','收支','金额','类别','交易编号']], lineNumbers = [sheet[start].number];
    const ids = new Set(), refunds = new Map(), excluded = new Map(), excludedOrders = new Map();
    let net = 0, transferIn = 0, transferOut = 0, partial = 0, refundTotal = 0;
    const countRefund = (n,step) => refunds.set(n, (refunds.get(n) || 0) + step);
    for (const {number,cells:r,types} of sheet.slice(start+1)) {
      if (!Object.values(r).some(Boolean)) continue;
      try {
        if (!Number.isInteger(number) || number < 2 || number > 100000) throw Error('工作表行号无效');
        if (!r.I || r.I === '/' || ids.has(r.I) || !['s','inlineStr','str'].includes(types.I)) throw Error('交易单号缺失、重复或不是文本');
        ids.add(r.I);
        const amount = cents(r.F), date = stamp(r.A);
        let value = amount, category = '未分类', skip = '';
        if (r.B === '商户消费') {
          if (r.E !== '支出') throw Error('商户消费的收支方向异常');
          if (r.H === '已全额退款') {
            excludedOrders.set(r.I, {row:number,reason:'已全额退款'});
            countRefund(amount,-1);
            skip = '全额退款原交易';
          } else if (r.H !== '支付成功') {
            const m = /^已退款[（(][¥￥](\d+(?:\.\d{1,2})?)[）)]$/.exec(r.H);
            if (!m) throw Error('商户交易状态尚不支持');
            const returned = cents(m[1]);
            if (returned >= amount) throw Error('部分退款超过允许金额');
            countRefund(returned,-1);
            value -= returned;
            partial++;
          }
          if (!skip) net += value;
        } else if (r.B === '转账' && ((r.E === '支出' && r.H === '对方已收钱') || (r.E === '收入' && r.H === '已存入零钱'))) {
          category = '转账';
          if (r.E === '支出') transferOut += value;
          else transferIn += value;
        } else if (r.B?.endsWith('-退款') && r.E === '收入') {
          countRefund(amount,1);
          refundTotal += amount;
          skip = '退款流水';
        } else {
          skip = ['零钱充值','零钱提现'].includes(r.B) ? r.B : '其他类型或状态';
        }
        if (skip) {
          excluded.set(skip, (excluded.get(skip) || 0) + 1);
        } else {
          if (!r.C || r.C === '/') throw Error('交易对方缺失');
          rows.push([date,r.C,r.E,(value/100).toFixed(2),category,r.I]);
          lineNumbers.push(number);
        }
      } catch (error) { throw Error('第 '+number+' 行：'+error.message); }
    }
    if (!ids.size || ids.size > 5000) throw Error('微信账单须包含 1 至 5000 笔交易。');
    if ([...refunds.values()].some(Boolean)) throw Error('退款流水与原交易的退款金额或笔数对不上。请核对导出日期是否覆盖原交易和退款。');
    return {sourceName:"微信支付",rows,lineNumbers,net,transferIn,transferOut,partial,refundTotal,excluded,excludedOrders,count:ids.size};
  }
  root.QYSWechatBill = Object.freeze({convert});
})(globalThis);
