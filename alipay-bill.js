(function (root) {
  'use strict';
  const columns = ['交易时间','交易分类','交易对方','收/支','金额','交易状态','交易订单号'];
  const expenseCategories = new Set('餐饮美食 服饰装扮 日用百货 家居家装 数码电器 美容美发 运动户外 母婴亲子 宠物 交通出行 住房物业 酒店旅游 文化休闲 教育培训 医疗健康 生活服务 公共服务 爱车养车 充值缴费 商业服务'.split(' '));
  function locate(text) {
    const lines = text.split(/\r\n|\n|\r/, 100);
    return lines.findIndex(line => {
      const fields = line.split(',').map(cell => cell.trim().replace(/^"|"$/g,'').trim());
      return columns.every(name => fields.includes(name)) && fields.includes('对方账号');
    });
  }
  function read(bytes) {
    for (const encoding of ['utf-8','gb18030']) {
      let text;
      try { text = new TextDecoder(encoding, {fatal:true}).decode(bytes); }
      catch { continue; }
      const start = locate(text);
      if (start >= 0) return convert(text, start);
      if (/支付宝.{0,35}(?:交易|电子客户回单)/.test(text.slice(0,200))) throw Error('识别到支付宝账单，但表头版本尚不支持。请核对是否为个人对账 CSV。');
    }
    return null;
  }
  function convert(text, start) {
    const lines = text.split(/\r\n|\r|\n/);
    const parsed = root.QYSCSV.parse(lines.slice(start).join('\n'));
    const header = parsed.rows[0].map(c=>c.trim());
    if (columns.some(name=>header.filter(c=>c===name).length!==1)) throw Error('支付宝表头中有重复字段。');
    const [date,category,merchant,direction,amount,status,id] = columns.map(name=>header.indexOf(name));
    const rows = [['日期','商户','收支','金额','类别','交易编号']], lineNumbers = [start+1];
    const issues = [], excluded = new Map(), excludedOrders = new Map(), seen = new Set();
    function skip(reason, order, row) {
      excluded.set(reason,(excluded.get(reason)||0)+1);
      if (order) excludedOrders.set(order,{row,reason});
    }
    for (let i = 1; i < parsed.rows.length; i++) {
      const cells = parsed.rows[i].map(c=>c.trim());
      const line = start + parsed.lineNumbers[i], type = cells[category], state = cells[status], flow = cells[direction];
      const issue = (message, kind = 'inspect') => issues.push({
        row:line, kind, message, date:cells[date] || '', merchant:cells[merchant] || '',
        amount:cells[amount] || '', order:cells[id] || '', category:type || '', status:state || '', flow:flow || ''
      });
      if (cells.length < Math.max(date,category,merchant,direction,amount,status,id)+1) {
        issue('交易字段缺失，请核对这一行。'); continue;
      }
      if (/退款|退回|退还/.test(state) || /退款/.test(type)) {
        const refund = flow !== '支出' && ['退款成功','退回成功'].includes(state);
        issue(refund ? '核对原消费后可确认退款抵扣。' : '核对订单状态和实际退款流水。', refund ? 'refund' : 'inspect'); continue;
      }
      if (['交易关闭','已关闭','交易失败'].includes(state)) { skip('关闭或失败',cells[id],line); continue; }
      if (flow === '不计收支' || ['投资理财','信用借还','账户存取'].includes(type)) { skip('不计收支或资金业务',cells[id],line); continue; }
      if (!['交易成功','支付成功','转账成功','收款成功'].includes(state) || !['收入','支出'].includes(flow)) {
        issue('交易状态或方向尚未支持，请核对原单。'); continue;
      }
      if (!cells[id] || cells[id]==='/' || seen.has(cells[id])) {
        issue('交易订单号缺失或重复，请核对原单。'); continue;
      }
      const transfer = ['转账','转账红包','红包'].includes(type);
      if (!transfer && (flow==='支出' ? !expenseCategories.has(type) : !['收入','工资薪酬','工资福利','其他收入'].includes(type))) {
        issue('此分类需要核对用途，请整理为通用 CSV 后导入。'); continue;
      }
      seen.add(cells[id]);
      rows.push([cells[date],cells[merchant],flow,cells[amount],transfer?'转账':type,cells[id]]);
      lineNumbers.push(line);
    }
    return {rows,lineNumbers,issues,excluded,excludedOrders,sourceName:'支付宝',count:parsed.rows.length-1};
  }
  root.QYSAlipayBill = Object.freeze({read});
})(globalThis);
