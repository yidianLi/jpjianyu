(function () {
  function message(value) {
    if (window.Store && Store.toast) Store.toast(value);
    else if (window.toast) window.toast(value);
  }

  function page() {
    return new URLSearchParams(location.search).get('page') || '';
  }

  function downloadList(name) {
    var table = document.querySelector('main table, #view table, table');
    if (!table) return message('当前页面没有可导出的列表');
    var rows = [].slice.call(table.querySelectorAll('tr')).map(function (row) {
      return [].slice.call(row.children).map(function (cell) {
        return '"' + (cell.innerText || '').replace(/"/g, '""').replace(/\s+/g, ' ').trim() + '"';
      }).join(',');
    }).filter(Boolean);
    var blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = name + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    message('已下载 ' + name + '.csv');
  }

  function modal(title, content, save) {
    var old = document.getElementById('actionLayerDialog');
    if (old) old.remove();
    var dialog = document.createElement('dialog');
    dialog.id = 'actionLayerDialog';
    dialog.className = 'w-[min(560px,calc(100%-32px))] rounded-2xl p-0 shadow-2xl';
    dialog.innerHTML = '<form method="dialog" class="bg-white"><div class="flex items-center justify-between border-b px-5 py-4"><b>' + title + '</b><button value="cancel" aria-label="关闭">×</button></div><div class="p-5 text-xs space-y-3">' + content + '</div><div class="flex justify-end gap-2 border-t bg-slate-50 px-5 py-4"><button value="cancel" class="border rounded-lg px-4 py-2">关闭</button>' + (save ? '<button value="save" class="bg-blue-600 text-white rounded-lg px-4 py-2">保存</button>' : '') + '</div></form>';
    document.body.appendChild(dialog);
    dialog.addEventListener('close', function () { dialog.remove(); });
    dialog.showModal();
    return dialog;
  }
  window.actionLayerModal = modal;

  function filterInventory() {
    var root = document.getElementById('view1');
    if (!root) return;
    var values = [].slice.call(root.querySelectorAll('input,select')).map(function (control) {
      return control.value && control.value.indexOf('全部') !== 0 ? control.value.trim() : '';
    }).filter(function (value) { return value && value.indexOf('\u5168') !== 0 && value.indexOf('\u9009') !== 0; });
    var rows = [].slice.call(root.querySelectorAll('tbody tr'));
    rows.forEach(function (row) { row.style.display = values.every(function (value) { return row.innerText.indexOf(value) > -1 || value.indexOf('-') > -1; }) ? '' : 'none'; });
    message('筛选已应用：显示 ' + rows.filter(function (row) { return row.style.display !== 'none'; }).length + ' 条');
  }

  function advancedFilter(button) {
    var existing = document.getElementById('desktopAdvancedFilters');
    if (existing) return existing.classList.toggle('hidden');
    var panel = document.createElement('div');
    panel.id = 'desktopAdvancedFilters';
    panel.className = 'card p-3 text-xs flex gap-2 flex-wrap items-end';
    panel.innerHTML = '<label>客户<input class="border rounded-lg px-2 py-2 block mt-1" placeholder="客户名称"></label><label>仓库<input class="border rounded-lg px-2 py-2 block mt-1" placeholder="仓库编码"></label><label>操作人<input class="border rounded-lg px-2 py-2 block mt-1" placeholder="姓名"></label><label>批次<input class="border rounded-lg px-2 py-2 block mt-1" placeholder="批次号"></label><button class="bg-slate-900 text-white rounded-lg px-3 py-2">应用高级筛选</button>';
    (button.closest('.p-6') || document.querySelector('main')).insertBefore(panel, (button.closest('.p-6') || document.querySelector('main')).children[1] || null);
    panel.querySelector('button').addEventListener('click', function () {
      var values = [].slice.call(panel.querySelectorAll('input')).map(function (input) { return input.value.trim(); }).filter(Boolean);
      document.querySelectorAll('#recBody tr').forEach(function (row) { row.style.display = values.every(function (value) { return row.innerText.indexOf(value) > -1; }) ? '' : 'none'; });
      message('高级筛选已应用');
    });
    message('高级筛选已展开');
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    var label = (button.innerText || button.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    var current = page();
    if (label === '高级筛选') { event.preventDefault(); event.stopImmediatePropagation(); advancedFilter(button); return; }
    if (['批量导出', '导出', '导出审计记录', '导出台账', '导出记录', '导出链路'].indexOf(label) > -1 && !(current === 'docs' && button.closest('#d'))) { event.preventDefault(); event.stopImmediatePropagation(); downloadList(current || '列表'); return; }
    if (label === '批量打印' && current === 'docs') { event.preventDefault(); event.stopImmediatePropagation(); window.print(); message('已打开当前列表打印预览'); return; }
    if (label === '筛选' && current === 'inventory') { event.preventDefault(); event.stopImmediatePropagation(); filterInventory(); return; }
    if ((label === '查看明细' || label === '查看明细 ›') && current === 'ai') { event.preventDefault(); event.stopImmediatePropagation(); goPage('inventoryOnhand'); return; }
    if (label === '打开追溯' && current === 'ai') { event.preventDefault(); event.stopImmediatePropagation(); goPage('docs'); return; }
    if ((label === '下钻到单据 →' || label === '下钻明细') && (current === 'report' || current === 'receipt')) { event.preventDefault(); event.stopImmediatePropagation(); goPage('docs'); return; }
    if ((label === '发起盘点' || label === '申请调整 / 发起盘点') && (current === 'inventory' || current === 'location')) { event.preventDefault(); event.stopImmediatePropagation(); goPage('stocktake'); return; }
    if (label === '处理差异' && current === 'workshopReceive') { event.preventDefault(); event.stopImmediatePropagation(); var diffRow = button.closest('tr'); if (diffRow) { var actual = diffRow.cells[2] ? diffRow.cells[2].innerText : ''; var diffDialog = modal('差异处理', '<label class="block">处理说明<textarea class="w-full border rounded-lg px-3 py-2 mt-1" rows="3">实收数量：' + actual + '，请复核并提交处理意见</textarea></label>', true); diffDialog.addEventListener('close', function () { if (diffDialog.returnValue === 'save') { button.textContent = '已提交差异'; button.className = 'text-emerald-600 font-bold'; message('差异处理意见已提交'); } }); } return; }
    if ((label === '详情' || label === '查看') && ['customerArchive', 'locationArchive', 'warehouseArchive', 'scanlog', 'workshopReceive'].indexOf(current) > -1) { event.preventDefault(); event.stopImmediatePropagation(); var row = button.closest('tr'); modal('记录详情', '<div class="bg-slate-50 rounded-xl p-3 whitespace-pre-line">' + (row ? row.innerText : '当前记录') + '</div>'); return; }
    if (label === '编辑' && ['customerArchive', 'locationArchive', 'warehouseArchive'].indexOf(current) > -1) { event.preventDefault(); event.stopImmediatePropagation(); var editRow = button.closest('tr'), cells = editRow ? [].slice.call(editRow.children) : [], content = cells.slice(0, -1).map(function (cell, index) { return '<label class="block">字段 ' + (index + 1) + '<input class="w-full border rounded-lg px-3 py-2 mt-1" value="' + (cell.innerText || '').replace(/"/g, '&quot;') + '"></label>'; }).join(''), editDialog = modal('编辑档案', content, true); editDialog.addEventListener('close', function () { if (editDialog.returnValue === 'save') { [].slice.call(editDialog.querySelectorAll('input')).forEach(function (input, index) { if (cells[index]) cells[index].textContent = input.value; }); message('档案已保存'); } }); return; }
    if ((label === '旋转' || label === '删除') && current === 'ocr') { event.preventDefault(); event.stopImmediatePropagation(); var image = document.querySelector('img.border-2') || document.querySelector('main img'); if (label === '旋转' && image) image.style.transform = 'rotate(' + ((Number(image.dataset.rotate || 0) + 90) % 360) + 'deg)'; if (label === '删除' && image) image.remove(); message(label + '已完成'); return; }
    if (label === '文件上传' && current === 'ocr') { event.preventDefault(); event.stopImmediatePropagation(); var input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,.pdf'; input.multiple = true; input.onchange = function () { if (input.files.length) message('已选择 ' + input.files.length + ' 个文件，已进入OCR队列'); }; input.click(); return; }
    if ((label === '原图' || label === '继续拍照') && current === 'receipt') { event.preventDefault(); event.stopImmediatePropagation(); if (label === '原图') modal('原图与变更记录', '<div>原始识别值：120米</div><div>人工确认值：1200米</div><div class="text-slate-500">保留原图、修改人和修改时间。</div>'); else { var photo = document.createElement('input'); photo.type = 'file'; photo.accept = 'image/*'; photo.onchange = function () { if (photo.files.length) message('已添加照片 ' + photo.files[0].name); }; photo.click(); } return; }
    if (label === '管理' && current === 'ai') { event.preventDefault(); event.stopImmediatePropagation(); modal('会话管理', '<div>当前账号：仓库负责人</div><div>历史会话按账号隔离，仅显示授权范围内的数据。</div>'); return; }
    if (label === '复制' && current === 'ai') { event.preventDefault(); event.stopImmediatePropagation(); var answer = button.closest('.border,.msg-ai'); if (navigator.clipboard) navigator.clipboard.writeText(answer ? answer.innerText : '').then(function () { message('回答已复制'); }); else message('当前浏览器不支持复制'); return; }
    if ((label === '数据刷新' || label === '近3天' || label === '近7天') && current === 'home') { event.preventDefault(); event.stopImmediatePropagation(); if (label.indexOf('近') === 0) { button.parentElement.querySelectorAll('button').forEach(function (item) { item.classList.remove('bg-blue-600', 'text-white'); }); button.classList.add('bg-blue-600', 'text-white'); } message(label === '数据刷新' ? '数据已刷新：实时数据已更新' : label + '数据已切换'); return; }
    if (label === '查看全部' && current === 'home') { event.preventDefault(); event.stopImmediatePropagation(); goPage('base'); return; }
    if (label === '全部待办' && current === 'home') { event.preventDefault(); event.stopImmediatePropagation(); goPage('docs'); return; }
    if (label === '库存流水' && current === 'docs') { event.preventDefault(); event.stopImmediatePropagation(); goPage('inventoryLedger'); return; }
    if (label === '审计日志' && current === 'docs') { event.preventDefault(); event.stopImmediatePropagation(); goPage('audit'); return; }
    if (label === '导出' && current === 'docs' && button.closest('#d')) { event.preventDefault(); event.stopImmediatePropagation(); downloadList('全链路'); return; }
    if (label === '同步筛选' && current === 'ai') { event.preventDefault(); event.stopImmediatePropagation(); goPage('inventory'); return; }
    if (label === '应用筛选' && current === 'ai') { event.preventDefault(); event.stopImmediatePropagation(); goPage('inventory'); return; }
    if (label === '确认查询' && current === 'ai') { event.preventDefault(); event.stopImmediatePropagation(); var askBox = document.querySelector('textarea, input[placeholder*="输入问题"]'); if (askBox && typeof ask === 'function') ask(askBox.value || '按当前条件查询'); else message('请先输入查询条件'); return; }
    if (label === '修改条件' && current === 'ai') { event.preventDefault(); event.stopImmediatePropagation(); var contextPanel = document.getElementById('ctxPanel'); if (contextPanel) contextPanel.classList.remove('hidden'); message('已打开条件面板，请修改后再次确认查询'); return; }
    if (label === '生成报表草稿' && current === 'ai') { event.preventDefault(); event.stopImmediatePropagation(); goPage('reportConfig'); return; }
    if (current === 'users' && label === '保存授权') { event.preventDefault(); event.stopImmediatePropagation(); var selectedName = document.getElementById('uname'); var roleCount = document.querySelectorAll('.rolechk:checked').length; localStorage.setItem('jm_wms_user_permission_' + (selectedName ? selectedName.textContent : 'current'), JSON.stringify({ roles: roleCount, savedAt: new Date().toISOString() })); message('授权已保存，变更已记录'); return; }
    if (current === 'users' && label === '停用') { event.preventDefault(); event.stopImmediatePropagation(); var selectedUser = document.querySelector('#utb tr.sel'); if (selectedUser && selectedUser.cells[3]) { selectedUser.cells[3].innerHTML = '<span class="bg-slate-100 text-slate-500 px-2 rounded-full">停用</span>'; message('账号已停用，历史单据保留'); } return; }
    if (current === 'users' && label === '启用') { event.preventDefault(); event.stopImmediatePropagation(); var enableRow = button.closest('tr'); if (enableRow && enableRow.cells[3]) { enableRow.cells[3].innerHTML = '<span class="bg-emerald-100 text-emerald-700 px-2 rounded-full">启用</span>'; button.remove(); message('账号已启用'); } return; }
    if (current === 'users' && label === '重置密码') { event.preventDefault(); event.stopImmediatePropagation(); var resetRow = button.closest('tr'); message('已为 ' + (resetRow ? resetRow.cells[0].innerText.split('\n')[0] : '当前账号') + ' 生成临时密码并通知本人'); return; }
    if (current === 'users' && label === '创建') { event.preventDefault(); event.stopImmediatePropagation(); var createModal = document.getElementById('m'), fields = createModal ? createModal.querySelectorAll('input') : []; if (fields.length >= 2 && fields[0].value.trim() && fields[1].value.trim()) { var newRow = document.createElement('tr'); newRow.className = 'border-b hover:bg-blue-50 cursor-pointer'; newRow.innerHTML = '<td class="py-2"><b>' + fields[0].value.trim() + '</b><br>' + fields[1].value.trim() + ' · 待分配角色</td><td><span class="bg-orange-100 text-orange-700 px-2 rounded-full">待授权</span></td><td>待配置</td><td><span class="bg-emerald-100 text-emerald-700 px-2 rounded-full">启用</span></td><td>—</td><td><button class="text-blue-600 font-bold">重置密码</button></td>'; document.getElementById('utb').prepend(newRow); if (createModal) createModal.classList.add('hidden'); message('账号 ' + fields[0].value.trim() + ' 已创建，请继续配置授权'); } else message('请填写账号和姓名'); return; }
  }, true);
}());
