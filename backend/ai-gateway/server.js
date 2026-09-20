/* WMS AI 最小网关(单文件,<=300行):POST /ai/ask 只做问答中转+护栏
 * 模型不写死:BASE_URL/MODEL/KEY 全走环境变量(LLM_BASE_URL/LLM_MODEL/LLM_API_KEY),
 * 换模型只改 backend/config/.env,不改代码。页面 key 永不落地前端。
 * 护栏:禁写词/禁 5.6 方言外语法在转给模型前先拦;模型只做"出 SQL",不直连 DB。
 * 运行: set LLM_API_KEY=xxx&& node server.js (默认 127.0.0.1:8081) */
var http = require('http');
var CFG = {
  port: Number(process.env.AI_PORT || 8081),
  base: process.env.LLM_BASE_URL || 'https://api.a6api.com/v1',
  model: process.env.LLM_MODEL || 'qwen3.8-flash',
  key: process.env.LLM_API_KEY || ''
};
var ALLOW_TABLES = ['doc_main', 'doc_line', 'stock_onhand', 'stock_ledger', 'material_item', 'batch'];
var DENY = ['insert', 'update', 'delete', 'drop', 'alter', 'grant', 'truncate', 'post'];
function bodyOf(req) {
  return new Promise(function (res) {
    var s = '';
    req.on('data', function (c) { s += c; });
    req.on('end', function () { try { res(JSON.parse(s || '{}')); } catch (e) { res({}); } });
  });
}
function deniedQuestion(q) {
  var low = String(q || '').toLowerCase();
  if (DENY.some(function (w) { return low.indexOf(w) > -1; })) return '写操作禁过账,AI只读。';
  if (/with\s|over\s*\(|json_/i.test(q)) return 'MySQL5.6方言禁CTE/窗口/JSON函数。';
  return '';
}
function checkSql(sql) {
  var s = String(sql || '').trim();
  if (!/^select\b/i.test(s)) return '只允许单条SELECT。';
  var low = s.toLowerCase();
  if (DENY.some(function (w) { return low.indexOf(w) > -1; })) return 'SQL含禁写词,已拒绝。';
  if (/with\s|over\s*\(|json_/i.test(s)) return 'SQL超出MySQL5.6方言,已拒绝。';
  if (!ALLOW_TABLES.some(function (t) { return low.indexOf(t) > -1; })) return 'SQL表不在三域白名单,已拒绝。';
  if (!/limit\s+\d+/i.test(s)) s += ' LIMIT 200';
  return { sql: s };
}
async function askLLM(question) {
  var sys = 'You output exactly one line of MySQL 5.6 SELECT SQL and nothing else. Tables only: ' + ALLOW_TABLES.join(',') + '. Must include LIMIT. No writes, no comments, no CTE, no window functions, no JSON functions.';
  var prompt = '问题:' + question + '\n表结构:doc_main(doc_no,type,status,handler),doc_line(doc_no,line_no,material_code,batch_no,qty,unit),stock_onhand(material_code,batch_no,wh,loc,on_hand,avail),stock_ledger(doc_no,material_code,batch_no,qty,unit,biz),material_item(barcode,material_code,batch_no),batch(batch_no,material_code)\n只输出SQL:';
  var r = await fetch(CFG.base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CFG.key },
    body: JSON.stringify({ model: CFG.model, messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], temperature: 0, max_tokens: 200 })
  });
  if (!r.ok) throw new Error('LLM HTTP ' + r.status);
  var j = await r.json();
  var text = (((j.choices || [])[0] || {}).message || {}).content || '';
  var m = text.match(/select[\s\S]*?;/i) || text.match(/select[\s\S]*/i);
  return (m ? m[0] : text).trim();
}
var server = http.createServer(async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.end('{}'); return; }
  if (req.method === 'POST' && req.url === '/ai/ask') {
    var b = await bodyOf(req);
    var no = deniedQuestion(b.question);
    if (no) { res.end(JSON.stringify({ ok: false, msg: no })); return; }
    if (!CFG.key) { res.end(JSON.stringify({ ok: false, msg: '网关未配 LLM_API_KEY,页面已回退Mock。' })); return; }
    try {
      var sql = await askLLM(b.question);
      var chk = checkSql(sql);
      if (typeof chk === 'string') { res.end(JSON.stringify({ ok: false, msg: chk })); return; }
      // 最小网关只出SQL,不直连DB;执行由后端只读账号另行完成,此处回SQL+公式占位
      res.end(JSON.stringify({ ok: true, data: { sql: chk.sql, formula: '见执行方案V2.1', answer: 'SQL已生成(只读),请经只读账号执行。' } }));
    } catch (e) { res.end(JSON.stringify({ ok: false, msg: 'LLM调用失败:' + e.message })); }
    return;
  }
  res.end(JSON.stringify({ ok: true, msg: 'wms-ai-gateway-min' }));
});
server.listen(CFG.port, '127.0.0.1', function () { console.log('ai-gateway-min on 127.0.0.1:' + CFG.port + ' model=' + CFG.model); });
