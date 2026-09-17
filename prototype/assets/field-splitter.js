(function () {
  var headerPattern = /[\/／→]/;
  var splitPattern = /\s*(?:\/|／|→)\s*/;
  var dotPattern = /\s*[·•]\s*/;

  function splitValue(text, header) {
    var parts = text.split(splitPattern).map(function (part) { return part.trim(); }).filter(Boolean);
    if (parts.length > 1) return parts;
    parts = text.split(dotPattern).map(function (part) { return part.trim(); }).filter(Boolean);
    if (parts.length > 1) return parts;
    if (/数量|件数|金额|单价|价格/.test(header)) {
      var match = text.match(/^(.*?)(\s*[-+]?\d[\d,]*(?:\.\d+)?\s*(?:米|件|个|箱|包|套|元|吨|公斤|kg|m)?\s*)$/i);
      if (match && match[1].trim()) return [match[1].trim(), match[2].trim()];
    }
    return [text];
  }

  function partsForCell(cell, header) {
    var htmlParts = cell.innerHTML.split(/<br\s*\/?>/i).map(function (part) {
      return part.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    if (htmlParts.length > 1) return htmlParts;
    var text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
    var parts = splitValue(text, header);
    if (parts.length > 1) return parts;
    return [text];
  }

  function normalizeTable(table) {
    if (table.getAttribute('data-fields-split') === 'true') return;
    var headers = [].slice.call(table.querySelectorAll(':scope > thead > tr:first-child > th'));
    if (!headers.length) return;
    var targets = headers.map(function (header) {
      var text = (header.textContent || '').replace(/\s+/g, ' ').trim();
      return headerPattern.test(text) ? { header: header, text: text } : null;
    });
    if (!targets.some(Boolean)) return;
    var rows = [].slice.call(table.querySelectorAll(':scope > tbody > tr'));
    targets.slice().reverse().forEach(function (target) {
      if (!target) return;
      var index = targets.indexOf(target);
      var labels = target.text.split(splitPattern).map(function (part) { return part.trim(); }).filter(Boolean);
      if (labels.length < 2) {
        if (/编码\s*\/?\s*名称|账号\s*\/?\s*姓名|成品编码\s*\/?\s*名称|客户\s*\/?\s*物料/.test(target.text)) labels = ['编码', '名称'];
        else return;
      }
      target.header.textContent = labels[0];
      labels.slice(1).forEach(function (label) {
        var newHeader = document.createElement('th');
        newHeader.textContent = label;
        target.header.parentNode.insertBefore(newHeader, target.header.nextSibling);
      });
      rows.forEach(function (row) {
        var cell = row.children[index];
        if (!cell || cell.getAttribute('colspan')) return;
        var values = partsForCell(cell, target.text);
        cell.textContent = values[0] || '';
        labels.slice(1).forEach(function (label, offset) {
          var newCell = document.createElement('td');
          newCell.textContent = values[offset + 1] || '';
          row.insertBefore(newCell, row.children[index + offset + 1] || null);
        });
      });
    });
    table.setAttribute('data-fields-split', 'true');
  }

  function normalize(root) {
    if (!root) return;
    [].slice.call(root.querySelectorAll('table')).forEach(normalizeTable);
  }

  window.wmsSplitFields = normalize;
}());
