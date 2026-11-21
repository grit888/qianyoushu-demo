(function (root) {
  'use strict';
  const model = root.QYSTransferPurpose, app = root.QYSDemoData;
  const $ = id => document.getElementById(id);
  const record = $('transfer-record'), kind = $('transfer-purpose-kind');
  const purchase = $('transfer-purchase'), amount = $('transfer-amount');
  const money = cents => '¥' + (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits:2, maximumFractionDigits:2
  });
  let rows, entries, signature, caps;

  function fill(select, options, value) {
    select.replaceChildren();
    for (const [key, label] of options) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = label;
      select.append(option);
    }
    if (options.some(([key]) => key === value)) select.value = value;
  }

  function describe(row) {
    const source = row.source;
    const when = source?.occurredAt || row.date;
    const origin = source ? source.name + ' 第' + source.row + '行' : row.id;
    return [when, row.merchant, money(row.cents), origin].join(' · ');
  }

  function notice(text) {
    const element = $('transfer-status');
    element.hidden = !text;
    element.textContent = text;
  }

  function updateAmount() {
    const limit = caps.get(purchase.value);
    $('transfer-limit').textContent = limit === undefined
      ? '没有可关联的消费。请检查原消费是否已导入，或是否已经全部抵减。'
      : '本次最多计入 ' + money(limit) + '。';
    $('transfer-save').disabled = kind.value === 'reimbursement' && limit === undefined;
    amount.value = '';
  }

  function updatePurchase(saved) {
    const repay = kind.value === 'reimbursement';
    $('transfer-purchase-field').hidden = !repay;
    $('transfer-amount-field').hidden = !repay;
    $('transfer-limit').hidden = !repay;
    $('transfer-save').disabled = false;
    if (!repay) return;

    const transfer = rows.get(record.value);
    const other = model.amountsByExpense(entries, transfer.id);
    caps = new Map();
    const options = [];
    for (const row of rows.values()) {
      if (!model.canLink(transfer, row)) continue;
      const limit = Math.min(transfer.cents, row.cents - (other.get(row.id) || 0));
      if (limit <= 0) continue;
      caps.set(row.id, limit);
      options.push([row.id, describe(row)]);
    }
    fill(purchase, [['','请选择原消费'],...options], saved?.expenseId);
    updateAmount();
    if (saved?.expenseId === purchase.value) amount.value = (saved.cents / 100).toFixed(2);
    if (options.length && !purchase.value) $('transfer-limit').textContent = '请先选择原消费。';
  }

  function drawEditor() {
    const transfer = rows.get(record.value);
    if (!transfer) return;
    const entry = entries.find(item => item.transferId === transfer.id);
    const available = Object.entries(model.labels).filter(([value]) =>
      value !== 'reimbursement' || transfer.kind === 'income');
    fill(kind, [['','请选择用途'],...available], entry?.purpose);
    $('transfer-clear').hidden = !entry;
    updatePurchase(entry);
  }

  function drawRepayments(scopedRows) {
    const list = $('review-repayment-rows');
    list.replaceChildren();
    const ids = new Set(scopedRows.map(row => row.id));
    for (const entry of entries) {
      if (entry.purpose !== 'reimbursement' || !ids.has(entry.expenseId)) continue;
      const original = rows.get(entry.expenseId), transfer = rows.get(entry.transferId);
      const item = document.createElement('li');
      const text = document.createElement('span'), edit = document.createElement('button');
      text.textContent = original.date+' · '+original.merchant+' · 原消费 '+money(original.cents)
        +'，收到 '+money(entry.cents)+'（'+transfer.date+' · '+(transfer.source?.name || '演示账本')
        +' · '+transfer.merchant+'）';
      edit.type = 'button';
      edit.className = 'backup-secondary';
      edit.textContent = '编辑回款';
      edit.onclick = () => root.QYSReviewUI.selectTransfer(transfer);
      item.append(text, edit);
      list.append(item);
    }
    $('review-repayment-detail').hidden = !list.children.length;
    if (!list.children.length) $('review-repayment-detail').open = false;
  }

  function refresh(snapshot, scopedRows) {
    signature = app.signature();
    const ordered = [...snapshot.demo.data].sort((a,b) =>
      (b.source?.occurredAt || b.date).localeCompare(a.source?.occurredAt || a.date));
    rows = new Map(ordered.map(row => [row.id,row]));
    entries = snapshot.transferPurposes || [];
    const current = scopedRows.filter(model.isTransfer).reverse();
    fill(record, current.map(row => [row.id, (row.kind === 'income' ? '转入 · ' : '转出 · ') + describe(row)]), record.value);
    const marked = new Set(entries.map(entry => entry.transferId));
    $('transfer-marked').textContent = current.length
      ? '已标注 ' + current.filter(row => marked.has(row.id)).length + ' / ' + current.length : '';
    $('transfer-empty').hidden = Boolean(current.length);
    $('transfer-purpose-form').hidden = !current.length;
    notice('');
    drawEditor();
    drawRepayments(scopedRows);
  }

  function save(entry) {
    if (!app.canImport()) throw Error('请先处理待确认的操作，再保存标注。');
    const next = app.capture();
    const updated = (next.transferPurposes || []).filter(item => item.transferId !== record.value);
    if (entry) updated.push(entry);
    if (updated.length) {
      next.transferPurposes = model.normalize(next.demo.data,updated);
    } else {
      delete next.transferPurposes;
    }
    next.demo.audit.unshift({
      time:new Date().toLocaleTimeString('zh-CN',{hour12:false}),
      text:entry ? '保存转账用途 · '+model.labels[entry.purpose] : '清除转账用途标注'
    });
    try {
      app.restore(next,signature);
    } catch {
      throw Error('保存失败。请刷新页面，以最新账本重试。');
    }
  }

  $('transfer-purpose-form').onsubmit = event => {
    event.preventDefault();
    if (!record.value || !kind.value) return;
    const entry = {transferId:record.value,purpose:kind.value};
    if (entry.purpose === 'reimbursement') {
      const match = /^([0-9]{1,14})(?:\.([0-9]{1,2}))?$/.exec(amount.value.trim());
      if (!match) { notice('请输入有效的回款金额，最多两位小数。'); return; }
      entry.expenseId = purchase.value;
      entry.cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2,'0'));
    }
    try {
      save(entry);
      notice('已保存标注。');
    } catch (error) { notice(error.message); }
  };
  $('transfer-clear').onclick = () => {
    try {
      save(null);
      notice('已清除标注。');
    } catch (error) { notice(error.message); }
  };
  record.onchange = () => { notice(''); drawEditor(); };
  kind.onchange = () => { notice(''); updatePurchase(); };
  purchase.onchange = () => { notice(''); updateAmount(); };

  root.QYSTransferPurposeUI = Object.freeze({
    refresh,
    open(id) {
      record.value = id;
      drawEditor();
      $('transfer-purpose-panel').open = true;
      record.focus();
    }
  });
})(globalThis);
