(function () {
  function notify(value) {
    if (window.Store && Store.toast) Store.toast(value);
    else if (window.toast) window.toast(value);
  }
  function currentPage() { return new URLSearchParams(location.search).get('page') || ''; }
  document.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    var current = currentPage();
    if (current === 'report' && button.classList.contains('bg-slate-900') && button.closest('main')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      var values = [].slice.call(document.querySelectorAll('main input, main select')).map(function (control) {
        return control.value && control.value.indexOf('\u5168\u90e8') !== 0 ? control.value.trim() : '';
      }).filter(Boolean);
      var rows = [].slice.call(document.querySelectorAll('#rlist tr'));
      rows.forEach(function (row) { row.style.display = values.every(function (value) { return value.indexOf('-') > -1 || row.innerText.indexOf(value) > -1; }) ? '' : 'none'; });
      notify('\u62a5\u8868\u67e5\u8be2\u5df2\u5b8c\u6210\uff1a\u663e\u793a ' + rows.filter(function (row) { return row.style.display !== 'none'; }).length + ' \u4efd');
      return;
    }
    if (current === 'report' && button.closest('#rlist') && button.classList.contains('text-violet-700')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      var row = button.closest('tr');
      if (window.actionLayerModal) window.actionLayerModal('\u62a5\u8868\u9884\u89c8', '<div class="bg-slate-50 rounded-xl p-3 whitespace-pre-line">' + (row ? row.innerText : '') + '</div><div class="text-slate-500">\u5f53\u524d\u4e3a\u8349\u7a3f\uff0c\u9884\u89c8\u4e0d\u4f1a\u6539\u53d8\u53d1\u5e03\u72b6\u6001\u3002</div>');
      else notify('\u5df2\u6253\u5f00\u62a5\u8868\u9884\u89c8');
      return;
    }
    if (current === 'report' && button.closest('main') && button.innerText.indexOf('\u4e0b') > -1 && button.innerText.indexOf('\u5355') > -1) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof goPage === 'function') goPage('docs');
      return;
    }
  }, true);
}());
