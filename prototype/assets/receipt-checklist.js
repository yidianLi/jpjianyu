/* 送货单清单验收：后台逐行核对，结果写入本机演示状态并留下审计。 */
(function(){
  var ORDER_ID='SL2026091209';
  var KEY='wms_receipt_checklist_'+ORDER_ID;
  var ITEMS=[
    {code:'HD-OXF-001',name:'牛津布',batch:'MB2026091003',unit:'米',qty:1200},
    {code:'HD-ZP-011',name:'拉链',batch:'MB2026090901',unit:'件',qty:2000},
    {code:'HD-NK-005',name:'纽扣',batch:'MB2026090905',unit:'件',qty:500}
  ];
  var state=load();

  function load(){
    var fallback={ack:false,confirmed:false,items:{}};
    ITEMS.forEach(function(item){ fallback.items[item.code]={received:item.qty,checked:item.code!=='HD-NK-005',reason:''}; });
    try{
      var bridge=localStorage.getItem('wms_mock_backend_checklist_'+ORDER_ID),saved=JSON.parse(bridge||localStorage.getItem(KEY)||'null');
      if(!saved)return fallback;
      fallback.ack=!!saved.ack||saved.status==='ACCEPTED'; fallback.confirmed=!!saved.confirmed||saved.status==='ACCEPTED';
      ITEMS.forEach(function(item){
        var row=Array.isArray(saved.items)?saved.items.find(function(x){return x.code===item.code;}):(saved.items&&saved.items[item.code]);
        if(row) fallback.items[item.code]={received:Number(row.received==null?row.receivedQty:row.received)||0,checked:!!row.checked,reason:String(row.reason||'')};
      });
    }catch(e){}
    return fallback;
  }
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function notify(msg,error){if(typeof window.toast==='function')window.toast(msg,error);else if(window.Store&&Store.toast)Store.toast(msg,error?'error':undefined);}
  function row(code){return state.items[code]||{received:0,checked:false,reason:''};}
  function mismatch(item){return Number(row(item.code).received)!==item.qty;}
  function counts(){return ITEMS.reduce(function(a,item){if(row(item.code).checked)a.done++;if(mismatch(item))a.diff++;return a;},{done:0,diff:0});}
  function statusText(){var c=counts();if(state.confirmed)return '已验收 · '+c.done+'/'+ITEMS.length;return c.done+'/'+ITEMS.length+' 已核对'+(c.diff?' · '+c.diff+' 项有差异':'');}
  function styles(){
    if(document.getElementById('receipt-checklist-style'))return;
    var s=document.createElement('style');s.id='receipt-checklist-style';
    s.textContent='.receipt-checklist-scroll{overflow-x:auto}.receipt-checklist-table{min-width:690px}.receipt-checklist-table th,.receipt-checklist-table td{vertical-align:middle}.receipt-checklist-row.is-checked{background:#f0fdf4}.receipt-checklist-row.has-diff{background:#fff7ed}.receipt-reason-row td{padding:0 8px 9px!important;background:#fff7ed}.receipt-reason{min-height:32px}.receipt-checklist-summary{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}.receipt-checklist-status{font-weight:700}.receipt-checklist-status.ok{color:#047857}.receipt-checklist-status.warn{color:#b45309}.receipt-checklist-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}.receipt-checklist-actions button{min-height:38px;padding:7px 12px;border-radius:7px;font-size:12px;font-weight:700}.receipt-checklist-confirm{background:#1689e8;color:#fff}.receipt-checklist-confirm:hover{background:#0875d2}.receipt-checklist-save{border:1px solid #cde8f7;background:#fff;color:#315b7d}@media(max-width:900px){.receipt-checklist-scroll{margin-inline:-4px;padding-inline:4px}.receipt-checklist-actions{display:grid;grid-template-columns:1fr 1fr}.receipt-checklist-actions button{width:100%}}';
    document.head.appendChild(s);
  }
  function render(){
    var st=document.getElementById('st3');if(!st)return;
    styles();
    var box=st.querySelector('.bg-blue-50');if(!box)return;
    var heading=st.querySelector('b'),intro=st.querySelector('p');
    if(heading)heading.textContent='第3步 · 送货单清单验收';
    if(intro)intro.textContent='以已确认的送货单为唯一验收基准，逐项核对物料编码、名称、批次、单位与数量；验收结果与送货单一一对应。';
    var legacy=st.querySelector('.space-y-2');
    if(legacy&&legacy!==box)legacy.classList.add('hidden');
    box.id='receipt-checklist';
    var c=counts();
    var rail=document.getElementById('railChecklistCount');if(rail)rail.textContent=c.done+'/'+ITEMS.length;
    var rows=ITEMS.map(function(item){
      var r=row(item.code), diff=mismatch(item);
      return '<tr class="receipt-checklist-row border-b '+(r.checked?'is-checked ':'')+(diff?'has-diff':'')+'" data-code="'+item.code+'">'
        +'<td class="py-2"><b>'+item.code+'</b><br><span class="text-slate-500">'+item.name+'</span></td>'
        +'<td>'+item.batch+'</td><td>'+item.unit+'</td><td>'+item.qty+'</td>'
        +'<td><input class="field py-1 receipt-qty" data-code="'+item.code+'" type="number" min="0" step="0.001" value="'+esc(r.received)+'" aria-label="'+item.name+'实收数量"></td>'
        +'<td class="text-center"><input type="checkbox" class="receipt-pick w-4 h-4" data-code="'+item.code+'" '+(r.checked?'checked':'')+' aria-label="确认'+item.name+'验收"></td></tr>'
        +'<tr class="receipt-reason-row '+(diff?'':'hidden')+'" data-reason-for="'+item.code+'"><td colspan="6"><label class="text-[11px] text-orange-700">差异原因（必填）<input class="field receipt-reason mt-1" data-code="'+item.code+'" value="'+esc(r.reason)+'" placeholder="例如：少收 20 米，待补送" aria-label="'+item.name+'差异原因"></label></td></tr>';
    }).join('');
    box.innerHTML='<div class="receipt-checklist-summary"><b>送货单 SL2026091209 · 恒达服饰 · 已确认</b><span id="receipt-checklist-status" role="status" aria-live="polite" class="receipt-checklist-status '+(state.confirmed?'ok':'warn')+'">'+statusText()+'</span></div>'
      +'<div class="receipt-checklist-scroll mt-2"><table class="w-full text-xs receipt-checklist-table"><thead><tr class="text-slate-500 text-left border-b"><th class="py-1">物料编码/名称</th><th>批次</th><th>单位</th><th>送货数量</th><th>实收数量</th><th>验收</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
      +'<div class="mt-2 text-[11px] text-slate-500">核对规则：编码、批次、单位必须一致；实收数量不符时标记差异并填写原因。清单只来源于本张送货单，不自动增加或合并物料。</div>'
      +'<div class="receipt-checklist-actions"><button type="button" class="receipt-checklist-save" onclick="receiptChecklist.saveDraft()">保存草稿</button><button type="button" class="receipt-checklist-confirm" onclick="receiptChecklist.confirm()">确认验收并继续</button></div>';
    var ack=document.getElementById('sqCheckAck');
    if(ack){ack.checked=state.ack;ack.parentElement.lastChild.textContent='我已按送货单逐行核对物料编码、批次、单位与数量';if(!ack.__receiptBound){ack.addEventListener('change',function(){state.ack=ack.checked;state.confirmed=false;persist();render();});ack.__receiptBound=true;}}
    if(!box.__receiptBound){
      box.addEventListener('input',function(e){var code=e.target.getAttribute('data-code');if(!code)return;state.confirmed=false;if(e.target.classList.contains('receipt-qty'))state.items[code].received=Number(e.target.value)||0;if(e.target.classList.contains('receipt-reason'))state.items[code].reason=e.target.value;persist();refreshRows();});
      box.addEventListener('change',function(e){var code=e.target.getAttribute('data-code');if(!code||!e.target.classList.contains('receipt-pick'))return;state.items[code].checked=e.target.checked;state.confirmed=false;persist();render();});
      box.__receiptBound=true;
    }
  }
  function refreshRows(){
    var c=counts(),status=document.getElementById('receipt-checklist-status');
    var rail=document.getElementById('railChecklistCount');if(rail)rail.textContent=c.done+'/'+ITEMS.length;
    if(status){status.textContent=statusText();status.className='receipt-checklist-status '+(state.confirmed?'ok':'warn');}
    document.querySelectorAll('#receipt-checklist .receipt-checklist-row').forEach(function(tr){var code=tr.getAttribute('data-code');var r=row(code);tr.classList.toggle('is-checked',r.checked);tr.classList.toggle('has-diff',mismatch(ITEMS.find(function(i){return i.code===code;})));});
    ITEMS.forEach(function(item){var reason=document.querySelector('[data-reason-for="'+item.code+'"]');if(reason)reason.classList.toggle('hidden',!mismatch(item));});
  }
  function validate(requireConfirmed){
    var c=counts();
    if(c.done!==ITEMS.length)return{ok:false,msg:'请逐项勾选清单（当前 '+c.done+'/'+ITEMS.length+'）'};
    for(var i=0;i<ITEMS.length;i++){var item=ITEMS[i];if(mismatch(item)&&!row(item.code).reason.trim())return{ok:false,msg:item.name+'存在数量差异，请填写原因'};}
    if(!state.ack)return{ok:false,msg:'请勾选“我已按送货单逐行核对”'};
    if(requireConfirmed&&!state.confirmed)return{ok:false,msg:'请先点击“确认验收并继续”保存验收结果'};
    return{ok:true};
  }
  window.receiptChecklist={
    validate:function(){return validate(true);},
    saveDraft:function(){persist();notify('验收清单草稿已保存，可稍后继续');},
    confirm:function(){
      var check=validate(false);if(!check.ok){notify(check.msg,true);return false;}
      state.confirmed=true;persist();if(window.Store&&Store.addAudit)Store.addAudit(ORDER_ID+' 清单验收 '+counts().done+'/'+ITEMS.length+' · 后台');render();notify('清单验收已确认，下一步分配去向');return true;
    },
    render:render,
    getState:function(){return state;}
  };
  document.addEventListener('DOMContentLoaded',render);
})();
