/* AI网关前端统一客户端:问答/OCR只读禁过账,接后端 /api/v1/ai/*.
 * 用法:WmsAi.ask(q).then(...) / WmsAi.ocr(image).then(...).无后端自动回Mock. */
(function(){
  var BASE = localStorage.getItem('wms_api_base') || 'http://10.8.0.12:8080/api/v1';
  function token(){ return localStorage.getItem('wms_token') || 'DEMO-WEB-TOKEN'; }
  var DENY = ['insert','update','delete','drop','alter','grant','post'];
  function frontCheck(sql){
    if(!/^select\b/i.test(String(sql||'').trim())) return '只允许单条SELECT.';
    if(DENY.some(function(w){ return new RegExp('\\b'+w+'\\b','i').test(String(sql)); })) return 'SQL含禁写词,已拒绝.';
    return '';
  }
  function post(path, body){
    return fetch(BASE + path, {method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token()},
      body:JSON.stringify(body||{})}).then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    });
  }
  window.WmsAi = {
    base: BASE,
    ask: function(question){
      return post('/ai/ask', {question: question}).then(function(j){
        var sql = j && j.data && j.data.sql || '';
        var bad = frontCheck(sql);
        if(bad) throw new Error(bad);
        return j;
      });
    },
    ocr: function(image){ return post('/ai/ocr', {image: image}); }
  };
})();
