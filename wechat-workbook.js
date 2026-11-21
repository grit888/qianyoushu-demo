(function (root) {
  'use strict';
  // Read only the XML parts used by single-sheet WeChat exports.
  const maxFile = 2 * 1024 * 1024, maxPart = 8 * 1024 * 1024;
  const decoder = new TextDecoder('utf-8', {fatal:true});
  const invalid = () => { throw Error('工作簿结构不受支持，请选择微信支付导出的原始 XLSX。'); };

  function zipParts(bytes) {
    if (bytes.length < 22 || bytes.length > maxFile) invalid();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = n => view.getUint16(n, true), u32 = n => view.getUint32(n, true);
    let end = bytes.length - 22;
    while (end >= 0 && !(u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length)) end--;
    if (end < 0 || u16(end + 4) || u16(end + 6) || u16(end + 10) > 256) invalid();
    const parts = new Map();
    let p = u32(end + 16);
    if (p + u32(end + 12) !== end) invalid();
    for (let i = 0; i < u16(end + 10); i++) {
      if (p + 46 > end || u32(p) !== 0x02014b50) invalid();
      const length = u16(p + 28), name = decoder.decode(bytes.subarray(p + 46, p + 46 + length));
      if (parts.has(name) || u16(p + 8) & 1) invalid();
      parts.set(name, {size:u32(p + 24), compressed:u32(p + 20), method:u16(p + 10), offset:u32(p + 42), crc:u32(p + 16)});
      p += 46 + length + u16(p + 30) + u16(p + 32);
    }
    if (p !== end) invalid();
    return async function xml(name) {
      const part = parts.get(name);
      if (!part) return null;
      const h = part.offset;
      if (h + 30 > end || u32(h) !== 0x04034b50 || part.size > maxPart) invalid();
      const start = h + 30 + u16(h + 26) + u16(h + 28);
      if (start + part.compressed > end || ![0, 8].includes(part.method)) invalid();
      let data = bytes.subarray(start, start + part.compressed);
      if (part.method === 8) {
        if (!root.DecompressionStream) throw Error('当前浏览器缺少 XLSX 解压支持，请使用新版 Edge 或 Chrome。');
        const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const output = new Uint8Array(part.size);
        let used = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (used + chunk.value.length > output.length) { await reader.cancel(); invalid(); }
          output.set(chunk.value, used);
          used += chunk.value.length;
        }
        data = output.subarray(0, used);
      }
      if (data.length !== part.size) invalid();
      let crc = -1;
      for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
      if ((~crc >>> 0) !== part.crc) invalid();
      const text = decoder.decode(data);
      if (/<!DOCTYPE|<!ENTITY/i.test(text)) invalid();
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) invalid();
      return doc;
    };
  }

  const elements = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
  const richText = node => elements(node, 't').map(t => t.textContent).join('');
  async function read(bytes) {
    const xml = zipParts(bytes), book = await xml('xl/workbook.xml');
    if (!book || elements(book, 'sheet').length !== 1) invalid();
    if (['1','true'].includes(elements(book, 'workbookPr')[0]?.getAttribute('date1904'))) invalid();
    const sheetRef = elements(book, 'sheet')[0].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rels = await xml('xl/_rels/workbook.xml.rels');
    if (!sheetRef || !rels) invalid();
    const matches = elements(rels, 'Relationship').filter(r => r.getAttribute('Id') === sheetRef);
    if (matches.length !== 1 || matches[0].getAttribute('TargetMode') === 'External' || !matches[0].getAttribute('Type')?.endsWith('/worksheet')) invalid();
    const target = matches[0].getAttribute('Target')?.replace(/^\/xl\//, '');
    if (!/^worksheets\/sheet\d+\.xml$/.test(target)) invalid();
    const sheet = await xml('xl/' + target);
    if (!sheet || elements(sheet, 'f').length) invalid();
    const shared = await xml('xl/sharedStrings.xml');
    const strings = shared ? elements(shared, 'si').map(richText) : [];
    const lines = elements(sheet, 'row');
    if (lines.length > 5100) throw Error('工作簿超过 5000 笔交易的读取范围。');
    let lastLine = 0;
    return lines.map(line => {
      const number = Number(line.getAttribute('r'));
      if (!Number.isInteger(number) || number <= lastLine || number > 100000) invalid();
      lastLine = number;
      const cells = {}, types = {};
      for (const cell of elements(line, 'c')) {
        const ref = /^([A-Z]+)(\d+)$/.exec(cell.getAttribute('r'));
        if (!ref || Number(ref[2]) !== number || Object.hasOwn(cells,ref[1])) invalid();
        const column = ref[1];
        const type = cell.getAttribute('t') || 'n', value = elements(cell, 'v')[0]?.textContent || '';
        if (type === 's' && (!/^\d+$/.test(value) || strings[Number(value)] === undefined)) invalid();
        cells[column] = (type === 's' ? strings[Number(value)] : type === 'inlineStr' ? richText(cell) : value).trim();
        types[column] = type;
      }
      return {number, cells, types};
    });
  }
  root.QYSWechatWorkbook = Object.freeze({read});
})(globalThis);
