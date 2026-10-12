/* 主档/报表/系统只读桥接:GET masters/meta/rpt_configs/users/roles/equipment.
 * select[data-master] 自动填充(失败保留原Demo项);WmsRpt/WmsSys 供页面渐进接入. */
(function(){
  var BASE = (window.WmsAi && window.WmsAi.base) ||
    localStorage.getItem('wms_api_base') || 'http://10.8.0.12:8080/api/v1';
  function token(){ return localStorage.getItem('wms_token') || ''; }
  function gate(){ return (window.WmsAi && window.WmsAi.ready) || Promise.resolve(); }
  function get(path){
    return gate().then(function(){
      return fetch(BASE + path, {headers:{'Authorization':'Bearer ' + token()}});
    }).then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function post(path, body){
    return gate().then(function(){
      return fetch(BASE + path, {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer ' + token()},
        body: JSON.stringify(body || {})});
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  var MASTER_PATH = {
    products: '/web/masters/products?page_size=200',
    materials: '/web/masters/materials?page_size=200',
    warehouses: '/web/masters/warehouses',
    locations: '/web/masters/locations?page_size=200',
    customers: '/web/masters/customers?page_size=200',
    biz_states: '/web/meta/biz_states',
    bill_methods: '/web/meta/bill_methods',
    doc_templates: '/web/masters/doc_templates'
  };
  function labelOf(kind, row){
    if(kind === 'products') return (row.product_code || '') + ' · ' + (row.name || '');
    if(kind === 'materials') return (row.material_code || '') + ' · ' + (row.name || '');
    if(kind === 'warehouses') return (row.wh_code || '') + ' · ' + (row.name || '');
    if(kind === 'locations') return row.loc_code || '';
    if(kind === 'customers') return row.name || '';
    if(kind === 'biz_states') return (row.sid || '') + ' · ' + (row.name || '');
    if(kind === 'bill_methods') return (row.method_code || '') + ' · ' + (row.method_name || '');
    if(kind === 'doc_templates') return (row.tpl_code || '') + ' · v' + (row.version || '');
    return JSON.stringify(row).slice(0, 40);
  }
  function valueOf(kind, row){
    return row.product_code || row.material_code || row.wh_code ||
      row.loc_code || row.name || row.tpl_code || row.method_code || '';
  }
  function fillSelect(sel){
    var kind = sel.getAttribute('data-master');
    var path = MASTER_PATH[kind];
    if(!path) return;
    get(path).then(function(j){
      var rows = (j && j.data) || [];
      if(!rows.length) return;
      var keep = sel.querySelector('option[value=""]');
      sel.innerHTML = '';
      if(keep) sel.appendChild(keep);
      rows.slice(0, 200).forEach(function(row){
        var o = document.createElement('option');
        o.value = valueOf(kind, row);
        o.textContent = labelOf(kind, row);
        sel.appendChild(o);
      });
      sel.setAttribute('data-master-live', 'true');
    }).catch(function(){});
  }
  window.WmsMaster = {get: get, fillAll: function(){
    document.querySelectorAll('select[data-master]').forEach(fillSelect);
  }};
  window.WmsRpt = {
    configs: function(){ return get('/web/rpt_configs'); },
    generate: function(rptCode, period){ return post('/web/rpt_instances/generate', {rpt_code: rptCode, period: period}); },
    publish: function(rptNo){
      return fetch(BASE + '/web/rpt_instances/' + encodeURIComponent(rptNo) + '/publish',
        {method:'POST', headers:{'Authorization':'Bearer ' + token()}}).then(function(r){
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }
  };
  window.WmsSys = {
    users: function(){ return get('/web/system/users'); },
    roles: function(){ return get('/web/system/roles'); },
    equipment: function(){ return get('/web/system/equipment'); }
  };
  document.addEventListener('DOMContentLoaded', function(){
    try{ window.WmsMaster.fillAll(); }catch(e){}
  });
})();
