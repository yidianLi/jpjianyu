/* 现场作业APP · 业务视图（含校验/弱网/签名/幂等，与PC同口径） */
(function(){
  if(!document.getElementById('qty-field-style')){var qtyStyle=document.createElement('style');qtyStyle.id='qty-field-style';qtyStyle.textContent='.qty-value,.qty-unit{display:inline-block}.qty-value{font-variant-numeric:tabular-nums;margin-right:3px}.qty-unit{font-weight:600;color:#64748b}';document.head.appendChild(qtyStyle)}
  var DB=FieldDB.get;
  var ADD={kind:'customer',owner:'',sel:{}};
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function fmt(n){return (Number(n)||0).toLocaleString('zh-CN',{maximumFractionDigits:3})}
  function qtyUnit(q,u){return '<span class="qty-value">'+fmt(q)+'</span><span class="qty-unit">'+esc(u||'')+'</span>'}
  function splitQuantityText(root){
    if(!root||root.nodeType!==1)return;
    var re=/(\d[\d,]*(?:\.\d+)?)\s*(米|件|个|箱|卷|套|台|张|条|公斤|kg)(?![\w])/gi;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[],node;
    while(node=walker.nextNode()){var p=node.parentElement;if(!p||p.closest('script,style,textarea,input,select,option,.qty-value,.qty-unit'))continue;re.lastIndex=0;if(re.test(node.nodeValue))nodes.push(node)}
    nodes.forEach(function(text){var value=text.nodeValue,frag=document.createDocumentFragment(),last=0,m;re.lastIndex=0;while((m=re.exec(value))){if(m.index>last)frag.appendChild(document.createTextNode(value.slice(last,m.index)));var q=document.createElement('span');q.className='qty-value';q.dataset.qtyField='quantity';q.textContent=m[1];var u=document.createElement('span');u.className='qty-unit';u.dataset.qtyField='quantity-unit';u.textContent=m[2];frag.appendChild(q);frag.appendChild(u);last=re.lastIndex}if(last<value.length)frag.appendChild(document.createTextNode(value.slice(last)));text.parentNode.replaceChild(frag,text)})
  }
  if(document.body){splitQuantityText(document.body);new MutationObserver(function(ms){ms.forEach(function(m){[].forEach.call(m.addedNodes,function(n){if(n.nodeType===1)splitQuantityText(n)})})}).observe(document.body,{childList:true,subtree:true})}
  function tag(s){var m={PENDING:['待办','g-amber'],APPROVED:['已过账','g-grn'],DRAFT:['草稿','g-mut'],SYNC:['待同步','g-blue']};var t=m[s]||[s,'g-mut'];return '<span class="tag '+t[1]+'">'+t[0]+'</span>'}
  function enqueue(type,payload,msg){
    var db=DB();db.queue.push({ts:Date.now(),type:type,payload:payload});FieldDB.save();UI.head();
    UI.toast(msg||'弱网已存草稿，联网后自动同步');
  }
  function qbar(){
    var q=DB().queue.length;
    if(!q)return '';
    return '<div class="syncbar"><i class="fa-solid fa-cloud-arrow-up"></i>离线队列 '+q+' 条未同步<button class="btn sm dark" style="margin-left:auto;min-height:34px" onclick="App.sync()">立即同步</button></div>';
  }
  /* ---------- 工作台 ---------- */
  UI.reg('todo',{render:function(el){
    var db=DB(),pend=db.docs.filter(function(d){return d.status==='PENDING'});
    var done=db.docs.filter(function(d){return d.status==='APPROVED'}).length;
    el.innerHTML=qbar()
      +'<div class="stats"><div class="stat warn"><b>'+pend.length+'</b><span>待办任务</span></div><div class="stat ok"><b>'+done+'</b><span>今日已完成</span></div><div class="stat '+(db.queue.length?'bad':'ok')+'"><b>'+db.queue.length+'</b><span>待同步</span></div></div>'
      +'<div class="sect"><h2>今日任务</h2><span>只显示本人授权范围</span></div>'
      +(pend.map(function(d){
        return '<div class="card tappro"><div class="top"><b>'+esc(d.doc_no)+' · '+esc(d.title)+'</b>'+tag(d.status)+'</div><div class="sub">'+esc(d.desc)+'</div><div class="btnrow"><button class="btn amber sm" onclick="App.open(\''+d.doc_no+'\')">进入办理 →</button></div></div>';
      }).join('')||'<div class="empty"><i class="fa-solid fa-check-circle"></i>全部完成，无待办</div>')
      +'<div class="sect"><h2>最近流水</h2><span>只读 · PC同源</span></div><div class="card">'
      +db.ledger.slice(0,3).map(function(l){return '<div class="kv"><span class="k">'+esc(l.t+' · '+l.biz)+'</span><b>'+esc(l.material+' ') + qtyUnit(l.qty,l.unit)+'</b></div>'}).join('')+'</div>'
      +'<div class="card"><div class="top"><b>送货单清单验收（SL2026091609）</b></div><div class="sub">含低置信度 OCR 行，需人工覆盖确认</div><div class="btnrow"><button class="btn dark sm" onclick="UI.go(\'checklist\')">打开清单验收</button></div></div>';
  }});
  /* ---------- 清单验收 ---------- */
  UI.reg('checklist',{render:function(el){
    var d=FieldDB.findDoc('SL2026091609');
    function paint(){
      var done=d.items.filter(function(i){return i.checked}).length;
      el.innerHTML='<div class="stepper"><span class="done"></span><span class="on"></span><span></span></div>'
        +'<div class="sect"><h2>送货单验收 · '+esc(d.doc_no)+'</h2><span>'+done+'/'+d.items.length+' 已核对</span></div>'
        +'<div class="pgw"><i style="width:'+Math.round(done/d.items.length*100)+'%"></i></div>'
        +d.items.map(function(it,i){
          var miss=it.checked&&Number(it.received_qty)!==Number(it.delivery_qty)&&!String(it.reason||'').trim();
          return '<div class="li '+(it.checked?(miss?'miss':'done'):'')+'"><div class="ck">'+(it.checked?'<i class="fa-solid fa-check"></i>':'')+'</div>'
            +'<div class="nm"><b>'+esc(it.name)+' · '+esc(it.material_code)+'</b><span>批次 '+esc(it.batch_no)+' · '+esc(it.unit)+' · 送货 '+it.delivery_qty+'</span>'
            +(miss?'<span style="color:#b91c1c">差异须填写原因</span>':'')+(it.reason?'<span>原因：'+esc(it.reason)+'</span>':'')+'</div>'
            +'<input type="number" min="0" value="'+it.received_qty+'" onchange="App.setQty('+i+',this.value)"></div>';
        }).join('')
        +'<button class="btn ghost sm big" onclick="App.addReason()">+ 为差异行填写原因</button>'
        +'<div class="btnrow"><button class="btn ghost" onclick="App.saveDraft()">存草稿</button><button class="btn teal" onclick="App.confirmList()">确认验收</button></div>'
        +'<button class="btn sm big" style="margin-top:8px;color:#68798e" onclick="UI.go(\'todo\')">← 返回工作台</button>';
    }
    paint();UI._paintChecklist=paint;
  }});
  /* ---------- 扫码作业 ---------- */
  UI.reg('scan',{render:function(el){
    var db=DB();
    el.innerHTML='<div class="sect"><h2>扫码作业</h2><span>SB必扫 · 箱唛可选 · 连续扫码+振动</span></div>'
      +'<div class="scanbox"><div class="torch"><i class="fa-solid fa-bolt"></i></div><div><div class="frame"><div class="c tl"></div><div class="c tr"></div><div class="c bl"></div><div class="c br"></div><div class="laser"></div></div><div class="hint" id="scanHint">对准条码自动识别</div></div></div>'
      +'<div class="card" style="margin-top:10px"><div class="flab">手动输入条码</div><div class="qtyrow"><input class="f big" id="scanCode" value="SB20260910003-01" inputmode="latin"><button class="btn pri" onclick="App.doScan()">识别</button></div>'
      +'<div class="btnrow"><button class="btn ghost sm" onclick="App.simScan(\'SB20260910003-01\')">SB-01 正常</button><button class="btn ghost sm" onclick="App.simScan(\'SB20260910003-01DUP\')">重复码</button><button class="btn ghost sm" onclick="App.simScan(\'BADCODE\')">无效码</button></div></div>'
      +'<div class="sect"><h2>本次扫码记录</h2><span>'+db.scans.length+' 条</span></div>'
      +'<div class="scanlog">'+(db.scans.slice().reverse().map(function(s){return '<div class="slog '+(s.ok?'ok':'bad')+'"><i class="fa-solid '+(s.ok?'fa-check':'fa-xmark')+'"></i><span class="code">'+esc(s.code)+'</span><span>'+esc(s.msg)+'</span><span class="t">'+s.t+'</span></div>'}).join('')||'<div class="empty">暂无扫码，先扫库区码再扫物料码</div>')+'</div>'
      +'<div class="card" style="margin-top:10px"><div class="top"><b>提交确认摘要</b>'+tag(db.scans.some(function(s){return s.ok})?'PENDING':'DRAFT')+'</div><div class="sub">照片3 · 扫码'+db.scans.filter(function(s){return s.ok}).length+' · 双签名 · PDA-03</div><div class="btnrow"><button class="btn ghost" onclick="App.scanDraft()">弱网存草稿</button><button class="btn pri" onclick="App.scanSubmit()">提交</button></div></div>';
  }});
  /* ---------- 通用单行创建 ---------- */
  function newDoc(type,title,dir){
    var p={register:'DJ',inbound:'RK',issue:'LY',wreturn:'TL',transfer:'DB',stocktake:'PD',deliver:'JJ'}[type];
    var d={doc_no:FieldDB.nextNo(p),type:type,title:title,status:'DRAFT',dir:dir,lines:[],handler:FieldDB.user().name,at:new Date().toISOString().slice(0,16).replace('T',' ')};
    DB().docs.unshift(d);FieldDB.save();return d;
  }
  /* ============ 物料登记（快捷选择：关联申请单 · 归属对象带出清单 · 扫客户箱码） ============ */
  function statusChip(m){var s=FieldDB.statusOf(m);return s==='启用'?'<span class="tag g-grn">启用</span>':'<span class="tag g-amber">草稿待审</span>'}
  function tm(){return new Date().toTimeString().slice(0,5)}
  function regDraft(){var db=DB();if(!db.reg||!Array.isArray(db.reg.lines))db.reg={biz:'material',fin_warehouse:'成品仓A',src_sq:'',lines:[],batch_no:'',loc:'第1栏第1格',handler:''};var r=db.reg;if(r.biz!=='material'&&r.biz!=='product')r.biz='material';if(!r.fin_warehouse)r.fin_warehouse='成品仓A';return r}
  function renderRegLine(l,i){
    var m=FieldDB.mat(l.material_code),p=Number(m.pack_qty)||1,u=l.unit||m.unit;
    var unbound=!l.material_code||l.material_code==='UNBOUND'||String(l.material_code).indexOf('UNBOUND-BOX:')===0;
    var bx=(l.boxes||[])[0]||{};
    return '<div class="linecard">'
      +'<div class="top"><b>'+esc(unbound?('箱码 '+(bx.code||'')):(l.name||m.name))+'</b>'+(unbound?'<span class="tag g-amber">待对应物料</span>':'<span class="tag '+(l.boxes&&l.boxes.length?'g-grn':'g-mut')+'">已扫 '+(l.boxes?l.boxes.length:0)+' 箱</span>')+'</div>'
      +'<div class="sub">'+esc(unbound?('绑定对象 '+(bx.who||'—')+(bx.src==='ocr'?'（OCR）':'（客户）')+' · 批次 '+(bx.batch_no||'—')+' · 扫码后请对应物料，自动建批'):(l.material_code+' · 单位 '+u+' · 每箱 '+p+u))+'</div>'
      +'<div class="qrow">'+(unbound
        ?'<button class="btn pri sm" onclick="App.mapBoxLine('+i+')">对应物料 · 建批</button>'
        :'<button class="step sm" onclick="App.stepLine('+i+',-'+p+')">−</button>'
        +'<input class="f" type="number" value="'+(Number(l.qty)||0)+'" onchange="App.setLineQty('+i+',this.value)">'
        +'<button class="step sm" onclick="App.stepLine('+i+','+p+')">＋</button>'
        +'<button class="btn ghost sm" onclick="App.scanForLine('+i+')">扫箱码</button>')
      +'<button class="btn ghost sm" onclick="App.dropLine('+i+')">删</button></div></div>';
  }
  UI.reg('register',{render:function(el){
    var r=regDraft();
    if(r.biz!=='material'&&r.biz!=='product')r.biz='material';
    var sqs=FieldDB.get().sq,src=r.src_sq?sqs.filter(function(s){return s.doc_no===r.src_sq})[0]:null;
    var total=r.lines.reduce(function(a,l){return a+(Number(l.qty)||0)},0);
    el.innerHTML='<div class="sect"><h2>'+bizName(r.biz)+'登记</h2><span>'+r.lines.length+' 行 · 合计 '+total+'</span></div>'
      +'<div class="flab">本次操作<i>*</i><span>先定物料还是成品管理</span></div>'
      +'<div class="chips">'+(r.biz==='material'?'<button class="chip on">物料</button><button class="chip" onclick="App.setRegBiz(\'product\')">成品</button>':'<button class="chip" onclick="App.setRegBiz(\'material\')">物料</button><button class="chip on">成品</button>')+'</div>'
      +(r.biz==='material'
        ?'<div class="card tblue"><div class="top"><b>关联申请领料单（可选）</b><button class="btn ghost sm" onclick="App.openSQ()">快捷选择</button></div><div class="sub">'+(src?('已关联 '+esc(src.doc_no)+' · '+esc(src.date)+' · '+esc(src.unit)+' · '+src.lines.length+' 行'):'不关联，直接登记')+'</div></div>'
        :'<div class="card tgrn"><div class="top"><b>成品登记</b><span class="tag g-grn">成品库</span></div><div class="sub">成品请用快捷添加清单选成品档案 / 成品库；过账入成品库。</div></div>')
      +'<div class="btnrow" style="margin-top:0"><button class="btn ghost sm" onclick="App.openAdd()">＋ 快捷添加清单</button><button class="btn ghost sm" onclick="App.openMatPick()">＋ 选'+(r.biz==='product'?'成品':'物料')+'</button>'+(r.biz==='material'?'<button class="btn ghost sm" onclick="App.goNewMat()">＋ 建档</button>':'')+'<button class="btn ghost sm" onclick="App.clearRegisterLines()">清空</button></div>'
      +'<div class="sect" style="margin-top:12px"><h2>登记清单</h2><span>可改数量</span></div>'
      +(r.lines.map(renderRegLine).join('')||'<div class="empty"><i class="fa-solid fa-list-check"></i>清单为空<br><span style="font-size:11px">用“快捷添加清单”或关联申请单</span></div>')
      +(r.biz==='material'?'<div class="flab" style="margin-top:12px">扫客户箱唛码累加<span>自动匹配清单行</span></div>'
      +'<div class="scanbox mini"><div><div class="frame" style="width:120px;height:120px"><div class="c tl"></div><div class="c tr"></div><div class="c bl"></div><div class="c br"></div><div class="laser"></div></div><div class="hint">对准箱唛码自动识别</div></div></div>'
      +'<div class="qtyrow" style="margin-top:8px"><input class="f big" id="boxCode" placeholder="输入/扫描 客户箱码" onkeydown="if(event.key===\'Enter\')App.scanBox(this.value)"><button class="btn teal" onclick="App.scanBox(document.getElementById(\'boxCode\').value)">扫码</button></div>'
      +'<div class="btnrow"><button class="btn ghost sm" onclick="App.simBox(\'HD-9664-3001\')">模拟箱码</button><button class="btn ghost sm" onclick="App.simBox(\'HD-9664-3001\')">重复箱码</button><button class="btn ghost sm" onclick="App.simBox(\'HD-NEW-9001\')">未绑定箱码</button></div>':'')
      +'<div class="flab">批次号（空则自动生成）</div><input class="f" id="rgBatch" value="'+esc(r.batch_no)+'" onchange="App.setRegField(\'batch_no\',this.value)" placeholder="如 BT2026091601">'
      +(r.biz==='product'
        ?'<div class="flab">存放仓库<i>*</i></div><select class="f" onchange="App.setRegField(\'fin_warehouse\',this.value)"><option'+(r.fin_warehouse==='成品库'?' selected':'')+'>成品库</option><option'+(r.fin_warehouse==='成品仓A'?' selected':'')+'>成品仓A</option><option'+(r.fin_warehouse==='成品仓B'?' selected':'')+'>成品仓B</option></select>'
        :'<div class="flab">存放库区<i>*</i></div><input class="f" id="rgLoc" value="'+esc(r.loc)+'" onchange="App.setRegField(\'loc\',this.value)">')
      +'<div class="btnrow"><button class="btn ghost" onclick="App.regDraftSave()">存草稿</button><button class="btn teal" onclick="App.doRegister()">提交登记入账</button></div>'
      +'<div class="sub" style="margin-top:8px">'+(r.biz==='product'?'过账后入成品库并支持成品交付':'过账后一物一码逐件生成条码、按量物料生成批次码')+'；过账幂等，重复提交自动拒绝。</div>';
  }});
  /* 现场建立物料档案 */
  UI.reg('regNew',{render:function(el){
    var name=UI.params().name||'';
    el.innerHTML='<div class="sect"><h2>新建物料档案</h2><span>初始库存 0 · 待管理员确认</span></div>'
      +'<div class="flab">物料名称<i>*</i></div><input class="f" id="nmName" value="'+esc(name)+'" placeholder="如 牛津布 藏青">'
      +'<div class="flab">规格型号</div><input class="f" id="nmSpec" placeholder="如 150D · 1.6m">'
      +'<div class="flab">基本单位<i>*</i></div><select class="f" id="nmUnit"><option>米</option><option>件</option><option>个</option><option>卷</option><option>箱</option></select>'
      +'<div class="flab">包装数量（每箱=基本单位数）<i>*</i></div><input class="f big" id="nmPack" type="number" min="1" value="50">'
      +'<div class="flab">客户 / 品牌</div><input class="f" id="nmCust" placeholder="如 恒达服饰">'
      +'<div class="btnrow"><button class="btn ghost" onclick="UI.go(\'register\')">取消</button><button class="btn amber" onclick="App.saveNewMat()">建立并加入清单</button></div>'
      +'<div class="sub" style="margin-top:8px">建档后回到登记清单；若现场拿到客户箱码，可“扫箱码”直接累加数量。</div>';
  }});
  /* ============ 入库 / 领用 / 调仓 / 盘点 / 交付：关联单据 + 快捷添加清单 ============ */
  function docCard(d,extra){
    return '<div class="card tblue"><div class="top"><b>'+esc(d.doc_no)+' · '+esc(d.title)+'</b>'+tag(d.status)+'</div><div class="sub">'+esc(d.desc||'')+'</div>'+(extra||'')+'</div>';
  }
  var MODES={stock:'库存表',finstock:'成品库',material:'物料档案',finarc:'成品档案',customer:'客户',product:'成品',workshop:'车间',history:'历史申请',ocr:'OCR记录'};
  var BIZSEG='<div class="chips"><button class="chip" data-biz="material">物料</button><button class="chip" data-biz="product">成品</button></div>';
  function bizName(b){return b==='product'?'成品':'物料'}
  var DRCFG={
    inbound:{title:'入库',src:'关联登记单',modes:['finarc'],qty:'验收数量',dir:'+',toast:'审批入账完成'},
    issue:{title:'领料',src:'关联登记单',modes:['stock'],qty:'实发数量',dir:'-',toast:'发料完成（双签名存证）'},
    transfer:{title:'调仓',src:'关联调仓申请',modes:['stock'],qty:'调仓数量',dir:'-',toast:'调仓已提交（源仓减 · 在途增）'},
    stocktake:{title:'实物盘点',src:'关联盘点任务',modes:['stock'],qty:'实盘数量',dir:'*',toast:'实盘已提交'},
    deliver:{title:'成品交付',src:'关联成品登记单',modes:['finstock','finarc'],qty:'交付数量',dir:'-',toast:'交付完成（含签收存证）'}
  };
  function blankDr(key){
    var b={biz:'material',src_doc:'',lines:[],wh:'成品仓A',loc:'',qc:'合格',sign:null,reason:''};
    if(key==='inbound'){b.fin_warehouse='成品仓A'}
    if(key==='transfer'){b.from_wh='成品仓A';b.from_loc='第1栏第1格';b.to_wh='成品仓B';b.to_loc='A区-01'}
    if(key==='deliver'){b.customer='恒达服饰';b.recv='';b.stime=''}
    return b;
  }
  function dr(key){var db=DB();if(!db.dr)db.dr={};if(!db.dr[key])db.dr[key]=blankDr(key);var b=db.dr[key];if(!b.biz)b.biz='material';if(key==='inbound'&&!b.fin_warehouse)b.fin_warehouse='成品仓A';return b}
  function regSrcDocs(biz){
    if(biz==='product')return [{no:'CP2026091608',date:'2026-09-16',party:'恒达服饰',lines:[{material_code:'CP-JK-001',name:'HD-JK-24秋 工装夹克',unit:'件',qty:400}]},
      {no:'CP2026091507',date:'2026-09-15',party:'宏远纺织',lines:[{material_code:'CP-TX-002',name:'HD-TX-24夏 工作T恤',unit:'件',qty:200}]}];
    return FieldDB.get().srcLinks.inbound||[];
  }
  function srcList(key){
    var d=dr(key),biz=d.biz||'material';
    if(key==='inbound'||key==='issue')return regSrcDocs(biz);
    if(key==='deliver')return FieldDB.get().srcLinks.deliver||[];
    return FieldDB.get().srcLinks[key]||[];
  }
  function drLine(key,i,l){
    var m=FieldDB.mat(l.material_code),p=Number(m.pack_qty)||1,u=l.unit||m.unit;
    var extra=[];
    if(l.batch_no)extra.push('批次 '+l.batch_no);
    if(l.wh)extra.push(l.wh);
    if(l.loc)extra.push(l.loc);
    var avail=(l.avail!=null)?' · 可用 '+qtyUnit(l.avail,u):'';
    var isTake=DRCFG[key].dir==='*';
    return '<div class="linecard"><div class="top"><b>'+esc(l.name||m.name)+'</b>'+((l.avail!=null)?'<span class="tag g-grn">可用 '+qtyUnit(l.avail,u)+'</span>':'<span class="tag g-mut">'+qtyUnit(p,u)+'/箱</span>')+'</div>'
      +'<div class="sub">'+esc(l.material_code)+(extra.length?' · '+esc(extra.join(' · ')):'')+avail+'</div>'
      +'<div class="qrow"><button class="step sm" onclick="App.lineStep(\''+key+'\','+i+',-'+p+')">−</button>'
      +'<input class="f" type="number" value="'+(Number(l.qty)||0)+'" onchange="App.lineQty(\''+key+'\','+i+',this.value)">'
      +'<button class="step sm" onclick="App.lineStep(\''+key+'\','+i+','+p+')">＋</button>'
      +'<button class="btn ghost sm" onclick="App.lineDrop(\''+key+'\','+i+')">删</button></div>'
      +(isTake?((Number(l.qty)!==Number(l.avail))?'<div class="sub" style="color:#b45309;margin-top:6px">差异 '+(Number(l.qty)-Number(l.avail)>0?'+':'')+(Number(l.qty)-Number(l.avail))+u+'（盘点不动账，差异走调整单）</div>':''):'')
      +'</div>';
  }
  function drView(key){return {render:function(el){
    var c=DRCFG[key],d=dr(key);
    if(key==='inbound'&&d.biz!=='product'&&d.biz!=='material')d.biz='material';
    if(key==='issue'&&d.biz!=='product'&&d.biz!=='material')d.biz='material';
    var src=srcList(key),cur=d.src_doc?src.filter(function(s){return s.no===d.src_doc})[0]:null;
    var extra='';
    if(key==='inbound'||key==='issue')extra='<div class="flab">本次操作<i>*</i><span>先定物料还是成品</span></div><div class="chips" id="bizSeg">'+(d.biz==='material'?'<button class="chip on">物料</button><button class="chip" onclick="App.setDrBiz(\''+key+'\',\'product\')">成品</button>':'<button class="chip" onclick="App.setDrBiz(\''+key+'\',\'material\')">物料</button><button class="chip on">成品</button>')+'</div>';
    if(key==='inbound')extra+='<div class="flab">质检结论<i>*</i></div><select class="f" id="drQc"><option'+(d.qc==='合格'?' selected':'')+'>合格</option><option'+(d.qc==='待检'?' selected':'')+'>待检</option><option'+(d.qc==='不合格（转拒收）'?' selected':'')+'>不合格（转拒收）</option></select>';
    if(key==='inbound')extra+=((d.biz==='product')
      ?'<div class="flab">存放仓库<i>*</i></div><select class="f" id="drFinWh" onchange="App.drField(\''+key+'\',\'fin_warehouse\',this.value)"><option'+(d.fin_warehouse==='成品库'?' selected':'')+'>成品库</option><option'+(d.fin_warehouse==='成品仓A'?' selected':'')+'>成品仓A</option><option'+(d.fin_warehouse==='成品仓B'?' selected':'')+'>成品仓B</option></select>'
      :'<div class="flab">存放库区<i>*</i></div><input class="f" id="drLoc" value="'+esc(d.loc||'第1栏第1格')+'" onchange="App.drField(\''+key+'\',\'loc\',this.value)">');
    if(key==='transfer'){
      var whs=Object.keys(FieldDB.get().locs||{'成品仓A':[],'成品仓B':[]});
      extra='<div class="flab">源仓库 / 源库区<i>*</i></div><div class="qtyrow"><select class="f" onchange="App.fromWh(\''+key+'\',this.value)">'+whs.map(function(w){return '<option'+(w===d.from_wh?' selected':'')+'>'+esc(w)+'</option>'}).join('')+'</select><select class="f" onchange="App.drField(\''+key+'\',\'from_loc\',this.value)">'+FieldDB.locsOf(d.from_wh).map(function(x){return '<option'+(x===d.from_loc?' selected':'')+'>'+esc(x)+'</option>'}).join('')+'</select></div>'
        +'<div class="flab">目标仓库 / 目标库区<i>*</i></div><div class="qtyrow"><select class="f" onchange="App.toWh(\''+key+'\',this.value)">'+whs.map(function(w){return '<option'+(w===d.to_wh?' selected':'')+'>'+esc(w)+'</option>'}).join('')+'</select><select class="f" onchange="App.drField(\''+key+'\',\'to_loc\',this.value)">'+FieldDB.locsOf(d.to_wh).map(function(x){return '<option'+(x===d.to_loc?' selected':'')+'>'+esc(x)+'</option>'}).join('')+'</select></div>';
    }
    if(key==='deliver')extra='<div class="flab">接收人<i>*</i></div><input class="f" value="'+esc(d.recv||'')+'" onchange="App.drField(\''+key+'\',\'recv\',this.value)" placeholder="如 恒达物流 · 陈司机"><div class="flab">签收时间<i>*</i></div><input class="f" type="datetime-local" value="'+esc(d.stime||'')+'" onchange="App.drField(\''+key+'\',\'stime\',this.value)">';
    if(key==='issue'||key==='deliver')extra+='<div class="flab">'+(key==='deliver'?'客户签名':'领用人签名')+'（必填）<i>*</i></div><div id="drSign"></div>';
    el.innerHTML='<div class="sect"><h2>'+esc((key==='inbound'||key==='issue'?bizName(d.biz)+' · ':'')+c.title)+'</h2><span>'+d.lines.length+' 行</span></div>'
      +'<div class="card tblue"><div class="top"><b>'+esc(c.src)+'（可选）</b><button class="btn ghost sm" onclick="App.openSrc(\''+key+'\')">快捷关联</button></div><div class="sub">'+(cur?('已关联 '+esc(cur.no)+' · '+esc(cur.date)+' · '+esc(cur.party||cur.from||cur.wh||'')+' · '+cur.lines.length+' 行'):(key==='stocktake'?'不关联，按库存全量盘点':(key==='transfer'?'不关联，直接调仓':'不关联，直接办理')))+'</div></div>'
      +'<div class="btnrow" style="margin-top:0"><button class="btn ghost sm" onclick="App.openAdd(\''+key+'\')">＋ 快捷添加清单</button><button class="btn ghost sm" onclick="App.openMatDirect(\''+key+'\')">＋ 选'+(c.modes.indexOf('stock')>=0?'库存':'物料')+'</button><button class="btn ghost sm" onclick="App.clearLines(\''+key+'\')">清空</button></div>'
      +'<div class="sect" style="margin-top:12px"><h2>'+esc(c.title)+'清单</h2><span>'+esc(c.qty)+'可改</span></div>'
      +(d.lines.map(function(l,i){return drLine(key,i,l)}).join('')||'<div class="empty"><i class="fa-solid fa-list-check"></i>清单为空<br><span style="font-size:11px">用“快捷添加清单”或“快捷关联”</span></div>')
      +extra
      +'<div class="btnrow"><button class="btn ghost" onclick="App.drDraft(\''+key+'\')">存草稿</button><button class="btn teal" onclick="App.submitDr(\''+key+'\')">提交并过账</button></div>'
      +'<div class="sub" style="margin-top:8px">'+(DRCFG[key].dir==='+'?'入账后一物一码/批次码自动生成':DRCFG[key].dir==='-'?'出库数量 ≤ 可用量，超发拦截':'盘点不动账，差异生成调整单')+'；过账幂等，重复提交自动拒绝。</div>';
    var sg=el.querySelector('#drSign');
    if(sg)UI.signPad(sg,function(img){d.sign=img;FieldDB.save();UI.toast('签名已采集')});
  }}}
  UI.reg('inbound',drView('inbound'));
  UI.reg('issue',drView('issue'));
  UI.reg('receive',{render:function(el){
    var d=FieldDB.findDoc('ZS2026091604');
    el.innerHTML=docCard(d)+'<div class="flab">签收签名<i>*</i></div><div id="rcSign"></div><div class="btnrow"><button class="btn teal" onclick="App.doReceive()">签收确认</button></div>';
    UI.signPad(el.querySelector('#rcSign'),function(){UI.toast('签收签名已采集')});
  }});
  UI.reg('wreturn',{render:function(el){
    var d=FieldDB.findDoc('TL2026091601');
    el.innerHTML=docCard(d,'<div class="sub">原领用单 '+d.src_doc+' · 超退自动拦截</div>')
      +'<div class="flab">退料原因（必填）<i>*</i></div><input class="f" id="wrReason" placeholder="如 布头不足 / 规格不符">'
      +'<div class="flab">退料人签名<i>*</i></div><div id="wrSign"></div>'
      +'<div class="btnrow"><button class="btn ghost" onclick="App.saveDraft()">存草稿</button><button class="btn amber" onclick="App.doReturn()">提交退料</button></div>';
    UI.signPad(el.querySelector('#wrSign'),function(){UI.toast('退料签名已采集')});
  }});
  UI.reg('transfer',drView('transfer'));
  UI.reg('stocktake',drView('stocktake'));
  UI.reg('deliver',drView('deliver'));
  /* ---------- 数据查看：只读查询（库存够不够+在哪里 / 单到哪了 / 谁动了 / 编码箱规） ---------- */
  UI.reg('data',{render:function(el){
    var db=DB(),u=FieldDB.user();
    var tab=UI._dtab||'stock',biz=UI._dbiz||'all',kw=String(UI._dkw||UI.params().kw||'').toLowerCase();
    UI._dkw=UI.params().kw||UI._dkw||'';
    var isFin=function(s){return FieldDB.matKind(s.material_code)==='product'||s.wh==='成品库'};
    var stocks=db.stock.filter(function(s){return (biz==='all')||(biz==='product'?isFin(s):!isFin(s))});
    var lows=stocks.filter(function(s){return s.avail<=0}).length;
    var quar=stocks.filter(function(s){return (s.quarantine||0)>0}).length;
    var pend=stocks.filter(function(s){return (s.pending||0)>0}).length;
    var docs=(db.docs||[]),led=(db.ledger||[]);
    var h='<div class="sect"><h2>数据查询</h2><span>只读 · '+esc(u.name)+'授权范围</span></div>'
      +'<div class="card tred" style="display:flex;gap:8px;align-items:center"><i class="fa-solid fa-lock" style="color:#b45309"></i><div class="sub" style="margin:0">本页只查不改，要办事请去工作台 / 扫码。离线也能查本地快照。</div></div>'
      +'<div class="chips" style="margin-top:8px">'
      +[['stock','库存'],['doc','单据'],['flow','流水'],['arc','档案']].map(function(t){return '<button class="chip'+(tab===t[0]?' on':'')+'" onclick="App.setDTab(\''+t[0]+'\')">'+t[1]+'</button>'}).join('')+'</div>';
    if(tab==='stock'){
      h+='<div class="chips">'+[['all','全部'],['material','物料'],['product','成品']].map(function(t){return '<button class="chip'+(biz===t[0]?' on':'')+'" onclick="App.setDbiz(\''+t[0]+'\')">'+t[1]+'</button>'}).join('')+'</div>'
        +'<div class="qtyrow"><input class="f" id="dKw" placeholder="搜索 物料/成品/批次/仓库/库区" value="'+esc(UI._dkw||'')+'" oninput="App.filterData(this.value)"></div>'
        +'<div class="numbadge">共 <b>'+stocks.length+'</b> 条 · 无可用 <b>'+lows+'</b> · 待检 <b>'+pend+'</b> · 隔离 <b>'+quar+'</b></div><div id="dList">'
        +(stocks.map(function(s){
          var st=s.avail<=0?'<span class="tag g-red">无可用</span>':(s.quarantine>0?'<span class="tag g-amber">隔离'+qtyUnit(s.quarantine,s.unit)+'</span>':(s.pending>0?'<span class="tag g-blue">待检'+qtyUnit(s.pending,s.unit)+'</span>':'<span class="tag g-grn">正常</span>'));
          return '<div class="li" data-k="'+esc((s.name+s.material_code+s.batch_no+s.wh+s.loc).toLowerCase())+'"><div class="nm"><b>'+esc(s.name)+'</b><span>'+esc(s.wh+' · '+s.loc+' · 批次 '+s.batch_no)+'</span><span>账面 '+qtyUnit(s.on_hand,s.unit)+' · 可用 <b>'+qtyUnit(s.avail,s.unit)+'</b></span></div>'+st+'<button class="btn ghost sm" onclick="App.showStock(\''+esc(s.material_code)+'\',\''+esc(s.batch_no)+'\',\''+esc(s.wh)+'\')">明细</button></div>';
        }).join('')||'<div class="empty"><i class="fa-solid fa-inbox"></i>无匹配库存</div>')+'</div><div class="empty" id="dEmpty" style="display:none">无匹配，换个关键词</div>';
    }else if(tab==='doc'){
      h+='<div class="qtyrow"><input class="f" placeholder="搜索 单号/标题" oninput="App.filterData(this.value)"></div><div id="dList">'
        +(docs.map(function(d){return '<div class="li" data-k="'+esc((d.doc_no+d.title).toLowerCase())+'"><div class="nm"><b>'+esc(d.doc_no)+'</b><span>'+esc(d.title)+' · '+esc(d.handler||'')+'</span></div>'+tag(d.status)+'<button class="btn ghost sm" onclick="App.open(\''+esc(d.doc_no)+'\')">打开</button></div>'}).join('')||'<div class="empty">暂无单据</div>')+'</div><div class="empty" id="dEmpty" style="display:none">无匹配单据</div>';
    }else if(tab==='flow'){
      h+='<div class="numbadge">最近 <b>'+led.length+'</b> 条 · 只读 · PC同源</div><div class="card">'
        +(led.slice(0,20).map(function(l){return '<div class="kv"><span class="k">'+esc(l.t+' · '+l.biz+' · '+l.doc+' · '+l.by)+'</span><b>'+esc(l.material+' '+l.qty)+'</b></div>'}).join('')||'<div class="empty">暂无流水</div>')+'</div>';
    }else{
      var mats=FieldDB.matList(),pros=FieldDB.productList();
      h+='<div class="flab">物料档案 · 每箱规格（建档/领料对照用）</div>'
        +(mats.map(function(m){return '<div class="li"><div class="nm"><b>'+esc(m.name)+'</b><span>'+esc(m.material_code+' · '+m.unit+'/箱 '+m.pack_qty)+'</span></div>'+statusChip(m)+'</div>'}).join(''))
        +'<div class="flab" style="margin-top:10px">成品档案 · 交付对照用</div>'
        +(pros.map(function(m){return '<div class="li"><div class="nm"><b>'+esc(m.name)+'</b><span>'+esc(m.material_code+' · '+m.unit+'/箱 '+m.pack_qty)+'</span></div><span class="tag g-grn">启用</span></div>'}).join(''));
    }
    el.innerHTML=h;
    if(kw)App.filterData(kw);
  }});
  /* ---------- 我的 ---------- */
  UI.reg('mine',{render:function(el){
    var u=FieldDB.user(),db=DB();
    el.innerHTML='<div class="card tgrn"><div class="top"><b>'+u.name+' · '+u.role+'</b><span class="tag g-grn">在线</span></div><div class="sub">'+u.scope+'<br>设备 '+u.device+' · 数据范围：本人车间/仓库</div></div>'
      +qbar()
      +'<div class="flab">切换角色（演示）</div><div class="btnrow"><button class="btn ghost sm" onclick="App.login(\'lixiaoming\')">李小明·车间</button><button class="btn ghost sm" onclick="App.login(\'zhangjianguo\')">张建国·仓库</button></div>'
      +'<div class="btnrow"><button class="btn dark sm" onclick="App.sync()">同步队列</button><button class="btn ghost sm" onclick="FieldDB.reset()">重置演示数据</button></div>'
      +'<div class="card" style="margin-top:10px"><div class="top"><b>关于本机</b></div><div class="sub">版本 v1.3-field · 离线优先 · 扫码头 Honeywell · 后端 /api/v1/app/*</div></div>';
  }});
  /* ---------- 全局动作 ---------- */
  window.App={
    openFinishedRegister:function(){location.href='../pages/finished.html?view=register&from=app'},
    openFinishedInbound:function(){location.href='../pages/finished.html?view=inbound&from=app'},
    openFinishedReturn:function(){location.href='../pages/finished.html?view=wreturn&from=app'},
    openFinishedDeliver:function(){location.href='../pages/finished.html?view=deliver&mode=new&from=app'},
    open:function(no){
      var d=FieldDB.findDoc(no);
      if(!d){UI.go('todo');return}
      var map={receipt_checklist:'checklist',issue:'issue',wreturn:'wreturn',transfer:'transfer',receive:'receive',inbound:'inbound'};
      UI.go(map[d.type]||'todo',{doc:no});
    },
    step:function(id,d){var e=document.getElementById(id);if(e)e.value=Math.max(0,(Number(e.value)||0)+d)},
    setQty:function(i,v){var d=FieldDB.findDoc('SL2026091609');d.items[i].received_qty=Number(v);FieldDB.save();UI._paintChecklist()},
    addReason:function(){
      var s=UI.sheet('<h3>差异原因</h3><p class="sub">实收 ≠ 送货的行必填，将写入审计</p><input class="f" id="rsWhy" placeholder="如 运输破损少5件"><div class="btnrow"><button class="btn ghost" onclick="UI.closeSheet()">取消</button><button class="btn pri" onclick="App.saveReason()">保存</button></div>');
    },
    saveReason:function(){
      var v=document.getElementById('rsWhy').value.trim();
      if(!v){UI.toast('请填写差异原因',1);return}
      var d=FieldDB.findDoc('SL2026091609');
      d.items.forEach(function(it){if(Number(it.received_qty)!==Number(it.delivery_qty))it.reason=v});
      FieldDB.save();UI.closeSheet();UI._paintChecklist();UI.toast('差异原因已记录');
    },
    saveDraft:function(){enqueue('draft',{at:Date.now()},'草稿已本地保存');UI.go('todo')},
    confirmList:function(){
      var d=FieldDB.findDoc('SL2026091609');
      var un=d.items.filter(function(i){return !i.checked});
      if(un.length){UI.toast('还有 '+un.length+' 行未逐项确认',1);return}
      var diff=d.items.filter(function(i){return Number(i.received_qty)!==Number(i.delivery_qty)&&!String(i.reason||'').trim()});
      if(diff.length){UI.toast('数量有差异的行必须填写原因',1);return}
      d.items.forEach(function(i){i.checked=true});
      if(!navigator.onLine){d.status='PENDING';enqueue('checklist_confirm',{doc:d.doc_no},'弱网已保存验收草稿');return}
      d.status='APPROVED';FieldDB.save();UI.toast('验收已确认 '+d.doc_no);UI.go('todo');
    },
    doScan:function(){var v=(document.getElementById('scanCode')||{}).value||'';App.simScan(v.trim())},
    simScan:function(code){
      var db=DB(),hit=db.barcodes[code];
      var t=new Date().toTimeString().slice(0,5);
      if(!code){UI.toast('请先输入或扫描条码',1);return}
      if(db.scans.some(function(s){return s.code===code&&s.ok})){db.scans.push({code:code,ok:false,msg:'重复码已拦截',t:t});FieldDB.save();UI.toast('重复码：已扫过，自动拦截',1);UI.go('scan');return}
      if(!hit){db.scans.push({code:code,ok:false,msg:'无效码：无法解析',t:t});FieldDB.save();UI.toast('无效码：请重扫',1);UI.go('scan');return}
      db.scans.push({code:code,ok:true,msg:hit.name+' '+hit.qty+hit.unit,t:t});FieldDB.save();UI.toast('扫码成功 +'+hit.qty+hit.unit);UI.go('scan');
    },
    scanDraft:function(){enqueue('scan',{n:DB().scans.length},'扫码草稿已保存 · 待同步')},
    scanSubmit:function(){
      var ok=DB().scans.filter(function(s){return s.ok}).length;
      if(!ok){UI.toast('至少成功扫码 1 条才能提交',1);return}
      UI.toast('提交成功 · 审计已写');UI.go('todo');
    },
    /* —— 物料登记（快捷选择） —— */
    openSQ:function(){
      var rows=FieldDB.get().sq;
      UI.sheet('<h3>关联申请领料单</h3><p class="sub">快捷选择：关联后自动带入清单，登记数量仍可改</p>'
        +'<input class="f" id="sqKw" placeholder="搜索 单号 / 车间" oninput="App.filterSQ(this.value)">'
        +'<div style="height:8px"></div>'
        +'<div class="li" data-k="不关联直接登记"><div class="nm"><b>不关联，直接登记</b><span>手动 / 快捷添加清单</span></div><button class="btn ghost sm" onclick="App.useSQ(\'\')">选择</button></div>'
        +rows.map(function(s){return '<div class="li" data-k="'+esc((s.doc_no+s.unit+s.status).toLowerCase())+'"><div class="nm"><b>'+esc(s.doc_no)+'</b><span>'+esc(s.date+' · '+s.unit)+' · '+s.lines.length+' 行 · '+esc(s.status)+'</span></div><button class="btn pri sm" onclick="App.useSQ(\''+s.doc_no+'\')">选择</button></div>'}).join('')
        +'<button class="btn ghost big" style="margin-top:8px" onclick="UI.closeSheet()">关闭</button>');
    },
    filterSQ:function(v){
      v=String(v||'').toLowerCase();
      Array.prototype.forEach.call(document.querySelectorAll('#sheet .li[data-k]'),function(li){
        li.style.display=(!v||(li.dataset.k||'').indexOf(v)>=0)?'':'none';
      });
    },
    useSQ:function(no){
      var r=regDraft();r.src_sq=no;
      if(no){
        var s=FieldDB.get().sq.filter(function(x){return x.doc_no===no})[0];
        r.lines=s.lines.map(function(l){var m=FieldDB.mat(l.material_code);return {material_code:l.material_code,name:l.name||m.name,unit:l.unit||m.unit,qty:Number(l.qty)||0,boxes:[],loc:r.loc}});
      }
      FieldDB.save();UI.closeSheet();
      UI.toast(no?('已关联 '+no+'，带入 '+(r.lines?r.lines.length:0)+' 行'):'已取消关联');
      UI.go('register');
    },
    /* 快捷添加清单：库存表 / 物料档案 / 预设（客户·成品·车间·历史申请·OCR） */
    openAdd:function(key){
      key=key||'register';
      var prev=ADD||{};
      var biz=(key==='register')?(prev.biz||regDraft().biz||'material'):((key==='inbound'||key==='issue')?(dr(key).biz||'material'):'material');
      var modes;
      if(key==='register')modes=(biz==='product')?['finarc','finstock']:['material','customer','product','workshop','history','ocr'];
      else modes=(DRCFG[key]&&DRCFG[key].modes)||['customer'];
      if(key==='inbound'&&biz==='product'&&modes.indexOf('finstock')<0)modes=modes.concat(['finstock']);
      ADD={key:key,biz:biz,mode:modes[0],owner:'',kw:'',sel:{},rows:[],modes:modes};
      ADD.rows=App._buildRows(ADD.mode);
      UI.sheet('<div id="addWrap"></div>');App.paintAdd();
    },
    openMatDirect:function(key){
      var biz=(key==='inbound'||key==='issue')?(dr(key).biz||'material'):'material';
      var mode=(biz==='product')?(key==='deliver'||key==='inbound'?'finarc':'finstock'):(DRCFG[key].modes.indexOf('stock')>=0?'stock':'material');
      ADD={key:key,biz:biz,mode:mode,owner:'',kw:'',sel:{},rows:[],modes:[]};
      ADD.rows=App._buildRows(mode);
      UI.sheet('<div id="addWrap"></div>');App.paintAdd();
    },
    paintAdd:function(){
      var wrap=document.getElementById('addWrap');if(!wrap)return;
      var ps=FieldDB.get().presets;
      var chips=(ADD.modes&&ADD.modes.length>1)
        ?'<div class="chips">'+ADD.modes.map(function(m){return '<button class="chip'+(m===ADD.mode?' on':'')+'" onclick="App.pickMode(\''+m+'\')">'+esc(MODES[m]||m)+'</button>'}).join('')+'</div>':'';
      var body='';
      if(ADD.mode==='stock'){
        body='<p class="sub">从库存表现有量快捷添加：按 仓库·库区·批次 取数，可用量见行。</p>'
          +'<input class="f" placeholder="搜索 物料/批次/仓库/库区" value="'+esc(ADD.kw)+'" oninput="App.setAddKw(this.value)">'
          +'<div style="height:8px"></div><div id="addList"></div>'
          +'<div class="empty" id="addEmpty" style="display:none">库存表无匹配</div>';
      }else if(ADD.mode==='finstock'){
        body='<p class="sub">从成品库现有量快捷添加：只列成品仓，可用量见行。</p>'
          +'<input class="f" placeholder="搜索 成品/批次/仓库/库区" value="'+esc(ADD.kw)+'" oninput="App.setAddKw(this.value)">'
          +'<div style="height:8px"></div><div id="addList"></div>'
          +'<div class="empty" id="addEmpty" style="display:none">成品库无匹配</div>';
      }else if(ADD.mode==='material'){
        body='<p class="sub">从物料档案（服务器名称清单）快捷添加。</p>'
          +'<input class="f" placeholder="搜索 名称/编码/规格" value="'+esc(ADD.kw)+'" oninput="App.setAddKw(this.value)">'
          +'<div style="height:8px"></div><div id="addList"></div>'
          +'<div class="empty" id="addEmpty" style="display:none">清单无匹配，可到登记页建档</div>'
          +'<button class="btn ghost big" style="margin-top:8px" onclick="App.closeAndNewMat(document.getElementById(\'addWrap\').querySelector(\'input\').value)">清单没有？＋ 建立物料档案</button>';
      }else if(ADD.mode==='finarc'){
        body='<p class="sub">从成品档案快捷添加（成品名称清单）。</p>'
          +'<input class="f" placeholder="搜索 成品名称/编码/规格" value="'+esc(ADD.kw)+'" oninput="App.setAddKw(this.value)">'
          +'<div style="height:8px"></div><div id="addList"></div>'
          +'<div class="empty" id="addEmpty" style="display:none">成品清单无匹配</div>';
      }else{
        var pk=ps[ADD.mode]||ps.customer;
        if(!ADD.owner||pk.owners.indexOf(ADD.owner)<0)ADD.owner=pk.owners[0];
        ADD.owner=pk.owners[0]&&ADD.owner?ADD.owner:pk.owners[0];
        body='<div class="flab">选择'+esc(pk.label)+'</div>'
          +'<select class="f" onchange="App.setOwner(this.value)">'+pk.owners.map(function(o){return '<option'+(o===ADD.owner?' selected':'')+'>'+esc(o)+'</option>'}).join('')+'</select>'
          +'<div class="flab">常规物料清单</div><div id="addList"></div>';
      }
      wrap.innerHTML='<h3>快捷添加清单</h3>'+chips+body
        +'<div class="numbadge">已勾选 <b>'+Object.keys(ADD.sel).length+'</b> 项 · 加入 '+esc(DRCFG[ADD.key]?((ADD.key==='inbound'||ADD.key==='issue'?bizName(ADD.biz)+' · ':'')+DRCFG[ADD.key].title):(ADD.key==='register'?bizName(ADD.biz)+' · 登记':ADD.key))+'</div>'
        +'<div class="btnrow"><button class="btn ghost" onclick="UI.closeSheet()">取消</button><button class="btn pri" onclick="App.addPicked()">加入所选物料</button></div>';
      App.paintAddList();
    },
    paintAddList:function(){
      var el=document.getElementById('addList');if(!el)return;
      var rows=App._buildRows(ADD.mode);
      ADD.rows=rows;
      var html='';
      if(ADD.mode==='stock'||ADD.mode==='finstock')html=App._rowsHtml(rows,'可用');
      else html=App._rowsHtml(rows,'每箱');
      el.innerHTML=html;
      var vis=0;Array.prototype.forEach.call(el.querySelectorAll('.li'),function(li){var on=!ADD.kw||(li.dataset.k||'').indexOf(ADD.kw)>=0;li.style.display=on?'':'none';if(on)vis++});
      var em=document.getElementById('addEmpty');if(em)em.style.display=vis?'none':'';
    },
    _buildRows:function(mode){
      var kw=String(ADD.kw||'').toLowerCase(),hit=function(s){return !kw||String(s).toLowerCase().indexOf(kw)>=0};
      if(mode==='stock'||mode==='finstock'){
        return DB().stock.filter(function(s){
          var isFin=FieldDB.matKind(s.material_code)==='product'||s.wh==='成品库';
          if(mode==='stock'&&isFin)return false;
          if(mode==='finstock'&&!isFin)return false;
          return hit(s.name+s.material_code+s.batch_no+s.wh+s.loc);
        }).map(function(s){
          var m=FieldDB.mat(s.material_code);
          return {key:s.material_code+'@'+s.batch_no+'@'+s.wh+'@'+s.loc,material_code:s.material_code,name:s.name,unit:s.unit,qty:Number(m.pack_qty)||1,avail:s.avail,batch_no:s.batch_no,wh:s.wh,loc:s.loc};
        });
      }
      if(mode==='material'){
        return FieldDB.matList().filter(function(m){return hit(m.name+m.material_code+m.spec)}).map(function(m){
          return {key:m.material_code,material_code:m.material_code,name:m.name,unit:m.unit,qty:Number(m.pack_qty)||1,avail:null,batch_no:'',wh:'',loc:''};
        });
      }
      if(mode==='finarc'){
        return FieldDB.productList().filter(function(m){return hit(m.name+m.material_code+(m.spec||''))}).map(function(m){
          var s=DB().stock.filter(function(x){return x.material_code===m.material_code})[0];
          return {key:m.material_code,material_code:m.material_code,name:m.name,unit:m.unit,qty:Number(m.pack_qty)||1,avail:s?s.avail:null,batch_no:s?s.batch_no:'',wh:s?s.wh:'',loc:s?s.loc:''};
        });
      }
      var pre=FieldDB.get().presets[mode];if(!pre)return [];
      return (pre.items[ADD.owner]||[]).map(function(it){
        var s=DB().stock.filter(function(x){return x.material_code===it.material_code})[0];
        return {key:it.material_code+'@'+(s?s.batch_no:''),material_code:it.material_code,name:it.name,unit:it.unit,qty:it.qty,avail:s?s.avail:null,batch_no:s?s.batch_no:'',wh:s?s.wh:'',loc:s?s.loc:'',note:it.note};
      });
    },
    _rowsHtml:function(rows,availLabel){
      return rows.map(function(r){
        var k=r.material_code+' '+r.batch_no+' '+r.wh+' '+r.loc+' '+r.name;
        var def=(r.avail!=null)?Math.min(r.qty,Number(r.avail)||r.qty):r.qty;
        var q=ADD.sel[r.key]!=null?ADD.sel[r.key]:def;
        var sub=[r.material_code,r.batch_no,r.wh,r.loc,r.note].filter(Boolean).join(' · ');
        var av=(r.avail!=null)?(availLabel+' '+qtyUnit(r.avail,r.unit)):(availLabel+' '+qtyUnit(r.qty,r.unit));
        return '<div class="li" data-k="'+esc(k.toLowerCase())+'"><input type="checkbox" data-row="'+esc(r.key)+'" style="width:22px;height:22px;flex-shrink:0" '+(ADD.sel[r.key]!=null?'checked':'')+' onchange="App.pickRow(\''+esc(r.key)+'\','+def+',this.checked)"><div class="nm"><b>'+esc(r.name)+'</b><span>'+esc(sub)+' · '+esc(av)+'</span></div><input type="number" style="width:74px;height:40px;text-align:center;border:1.5px solid var(--line);border-radius:10px;font-weight:800" value="'+q+'" oninput="App.rowQty(\''+esc(r.key)+'\',this.value)" onclick="event.stopPropagation()"></div>';
      }).join('');
    },
    setAddKw:function(v){
      ADD.kw=String(v||'').toLowerCase();
      var vis=0;Array.prototype.forEach.call(document.querySelectorAll('#addList .li'),function(li){var on=!ADD.kw||(li.dataset.k||'').indexOf(ADD.kw)>=0;li.style.display=on?'':'none';if(on)vis++});
      var em=document.getElementById('addEmpty');if(em)em.style.display=vis?'none':'';
    },
    pickMode:function(m){ADD.mode=m;ADD.owner='';ADD.kw='';ADD.sel={};App.paintAdd()},
    setOwner:function(o){ADD.owner=o;ADD.sel={};App.paintAdd()},
    pickRow:function(key,def,on){
      if(on){if(ADD.sel[key]==null)ADD.sel[key]=def}else delete ADD.sel[key];
      var b=document.querySelector('#addWrap .numbadge b');if(b)b.textContent=Object.keys(ADD.sel).length;
      var li=Array.prototype.filter.call(document.querySelectorAll('#addList .li input[type=checkbox]'),function(){return true});
      if(!li.length)App.paintAdd();
    },
    rowQty:function(key,v){
      /* 改数量即视为勾选：只改行内状态，不整单重绘，避免输入框失焦/勾选跳动 */
      ADD.sel[key]=Number(v)||0;
      var b=document.querySelector('#addWrap .numbadge b');if(b)b.textContent=Object.keys(ADD.sel).length;
      var cb=document.querySelector('#addList input[type=checkbox][data-k="'+esc(key)+'"]')||document.querySelector('#addList input[type=checkbox][data-row="'+esc(key)+'"]');
      if(cb&&v!==''&&v!=null)cb.checked=true;
    },
    addPicked:function(){
      var target=(ADD.key==='register')?regDraft():dr(ADD.key),n=0;
      (ADD.rows||[]).forEach(function(r){
        if(ADD.sel[r.key]==null)return;
        target.lines.push({material_code:r.material_code,name:r.name,unit:r.unit,qty:Number(ADD.sel[r.key])||r.qty,avail:r.avail,batch_no:r.batch_no||'',wh:r.wh||'',loc:r.loc||target.loc||'',boxes:[]});
        n++;
      });
      if(!n){UI.toast('请先勾选要加入的物料',1);return}
      FieldDB.save();UI.closeSheet();UI.toast('已加入 '+n+' 行');UI.go(ADD.key);
    },
    /* 手动选物料/成品（兼容入口） */
    openMatPick:function(){
      var r=regDraft(),isFin=r.biz==='product';
      ADD={key:'register',biz:r.biz,mode:isFin?'finarc':'material',owner:'',kw:'',sel:{},rows:[],modes:[]};
      ADD.rows=App._buildRows(ADD.mode);
      UI.sheet('<div id="addWrap"></div>');App.paintAdd();
    },
    closeAndNewMat:function(name){UI.closeSheet();App.goNewMat(String(name||'').trim())},
    /* 关联单据快捷选择 */
    openSrc:function(key){
      var list=srcList(key);
      UI.sheet('<h3>快捷关联 · '+esc(DRCFG[key].src)+'</h3><p class="sub">关联后自动带入清单，数量仍可改</p>'
        +'<input class="f" placeholder="搜索 单号 / 单位" oninput="App.filterSrc(this.value)">'
        +'<div style="height:8px"></div>'
        +'<div class="li" data-k="不关联直接办理"><div class="nm"><b>不关联，直接办理</b><span>手动 / 快捷添加清单</span></div><button class="btn ghost sm" onclick="App.useSrc(\''+key+'\',\'\')">选择</button></div>'
        +list.map(function(s){return '<div class="li" data-k="'+esc((s.no+(s.party||'')+(s.from||'')+(s.wh||'')).toLowerCase())+'"><div class="nm"><b>'+esc(s.no)+'</b><span>'+esc(s.date+' · '+(s.party||s.from||s.wh||''))+((s.to)?(' → '+esc(s.to)):'')+' · '+s.lines.length+' 行</span></div><button class="btn pri sm" onclick="App.useSrc(\''+key+'\',\''+esc(s.no)+'\')">选择</button></div>'}).join('')
        +'<button class="btn ghost big" style="margin-top:8px" onclick="UI.closeSheet()">关闭</button>');
    },
    filterSrc:function(v){
      v=String(v||'').toLowerCase();
      Array.prototype.forEach.call(document.querySelectorAll('#sheet .li[data-k]'),function(li){li.style.display=(!v||(li.dataset.k||'').indexOf(v)>=0)?'':'none'});
    },
    useSrc:function(key,no){
      var d=dr(key);d.src_doc=no;
      if(no){
        var s=srcList(key).filter(function(x){return x.no===no})[0];
        if((key==='inbound'||key==='issue')&&no.charAt(0)==='C')d.biz='product';
        if((key==='inbound'||key==='issue')&&no.charAt(0)==='D')d.biz='material';
        d.lines=(s.lines||[]).map(function(l){
          var m=FieldDB.mat(l.material_code);
          var st=DB().stock.filter(function(x){return x.material_code===l.material_code&&(key!=='inbound')})[0];
          return {material_code:l.material_code,name:l.name||m.name,unit:l.unit||m.unit,qty:Number(l.qty)||0,avail:st?st.avail:null,batch_no:st?st.batch_no:'',wh:st?st.wh:(key==='inbound'?(d.biz==='product'?(d.fin_warehouse||'成品库'):d.wh):''),loc:st?st.loc:'',boxes:[]};
        });
        if(key==='transfer'&&(s.from||s.from_wh)){d.from_wh=s.from_wh||s.from;d.from_loc=s.from_loc||d.from_loc;d.to_wh=s.to_wh||s.to||d.to_wh;d.to_loc=s.to_loc||d.to_loc}
        if(key==='deliver'&&s.customer)d.customer=s.customer;
        if(key==='stocktake'&&s.wh)d.wh=s.wh;
      }
      FieldDB.save();UI.closeSheet();
      UI.toast(no?('已关联 '+no+'，带入 '+d.lines.length+' 行'):'已取消关联');
      UI.go(key);
    },
    /* 业务清单行操作 */
    drField:function(key,f,v){dr(key)[f]=v;FieldDB.save()},
    setDrBiz:function(key,b){
      var d=dr(key);d.biz=b;d.src_doc='';d.lines=[];
      FieldDB.save();UI.toast('已切换为'+bizName(b)+' · 请重新关联/添加清单');UI.go(key);
    },
    fromWh:function(key,v){var d=dr(key);d.from_wh=v;var l=FieldDB.locsOf(v);if(l.length)d.from_loc=l[0];FieldDB.save();UI.go(key)},
    toWh:function(key,v){var d=dr(key);d.to_wh=v;var l=FieldDB.locsOf(v);if(l.length)d.to_loc=l[0];FieldDB.save();UI.go(key)},
    lineQty:function(key,i,v){var d=dr(key);if(d.lines[i])d.lines[i].qty=Math.max(0,Number(v)||0);FieldDB.save()},
    lineStep:function(key,i,delta){var d=dr(key);if(!d.lines[i])return;d.lines[i].qty=Math.max(0,(Number(d.lines[i].qty)||0)+Number(delta||0));FieldDB.save();UI.go(key)},
    lineDrop:function(key,i){var d=dr(key);d.lines.splice(i,1);FieldDB.save();UI.go(key)},
    clearLines:function(key){dr(key).lines=[];FieldDB.save();UI.go(key)},
    clearRegisterLines:function(){
      var r=regDraft();
      if(!r.lines.length){UI.toast('登记清单已经为空');return}
      if(!window.confirm('确定清空当前登记清单？'))return;
      r.lines=[];FieldDB.save();UI.go('register');UI.toast('登记清单已清空');
    },
    drDraft:function(key){enqueue(key+'_draft',{key:key},'草稿已保存（'+dr(key).lines.length+' 行）')},
    resetDr:function(key){DB().dr[key]=blankDr(key);FieldDB.save()},
    submitDr:function(key){
      var c=DRCFG[key],d=dr(key);
      if(!d.lines.length){UI.toast('清单为空，请快捷添加或快捷关联',1);return}
      var bad=d.lines.filter(function(l){return !(Number(l.qty)>0)});
      if(bad.length){UI.toast((bad[0].name||'物料')+' 数量必须大于 0',1);return}
      if(key==='inbound'&&d.biz!=='product'&&!String(d.loc||'').trim()){UI.toast('存放库区必填',1);return}
      /* 交付只交付成品：物料行禁止提交 */
      if(key==='deliver'){
        var mix=d.lines.filter(function(l){return FieldDB.matKind(l.material_code)!=='product'});
        if(mix.length){UI.toast('交付只交付成品：'+(mix[0].name||mix[0].material_code)+' 非成品，禁止提交',1);return}
      }
      if(c.dir==='-'){
        var over=d.lines.filter(function(l){return l.avail!=null&&Number(l.qty)>Number(l.avail)});
        if(over.length){UI.toast('超发拦截：'+over[0].name+' 可用 '+over[0].avail+'，本次 '+over[0].qty,1);return}
        if(!d.sign){UI.toast('签名为空，禁止提交',1);return}
      }
      if(key==='deliver'&&(!String(d.recv||'').trim()||!String(d.stime||'').trim())){UI.toast('外部客户交付需填写接收人与签收时间',1);return}
      if(!navigator.onLine){enqueue(key+'_draft',{key:key,lines:d.lines.length},'弱网已存草稿（'+d.lines.length+' 行）');return}
      if(key==='stocktake'){
        var diffs=d.lines.filter(function(l){return Number(l.qty)!==Number(l.avail)}).map(function(l){return l.name+' '+(Number(l.qty)-Number(l.avail)>0?'+':'')+(Number(l.qty)-Number(l.avail))+l.unit});
        if(!diffs.length)UI.toast('实盘与账面一致，无需调整');
        else enqueue('stocktake',{diffs:diffs},'差异已记录，生成调整单：'+diffs.join('；'));
        App.resetDr(key);UI.go('todo');return;
      }
      var title=((key==='inbound'||key==='issue')?bizName(d.biz)+' · ':'')+c.title;
      var doc=newDoc(key,title,c.dir);
      if(key==='transfer'){doc.wh=d.from_wh;doc.to_wh=d.to_wh;doc.from_loc=d.from_loc;doc.to_loc=d.to_loc}
      else doc.wh=(d.biz==='product')?(d.fin_warehouse||d.wh||(d.lines[0]&&d.lines[0].wh)||'成品库'):(d.wh||(d.lines[0]&&d.lines[0].wh)||'成品仓A');
      if(d.src_doc)doc.src_doc=d.src_doc;
      doc.lines=d.lines.map(function(l){
        if(key==='transfer')return {material_code:l.material_code,batch_no:l.batch_no||'',unit:l.unit,qty:Number(l.qty),wh:d.from_wh,loc:d.from_loc||l.loc||'',to_wh:d.to_wh,to_loc:d.to_loc||''};
        return {material_code:l.material_code,batch_no:l.batch_no||'',unit:l.unit,qty:Number(l.qty),wh:l.wh||doc.wh,loc:l.loc||d.loc||''};
      });
      var res=FieldDB.post(doc);
      UI.toast(res.ok?(doc.doc_no+' '+c.toast):res.msg,res.ok?0:1);
      App.resetDr(key);
      UI.go('todo');
    },
    /* 清单行操作 */
    setLineQty:function(i,v){var r=regDraft();r.lines[i].qty=Math.max(0,Number(v)||0);FieldDB.save()},
    stepLine:function(i,d){var r=regDraft();r.lines[i].qty=Math.max(0,(Number(r.lines[i].qty)||0)+Number(d||0));FieldDB.save();UI.go('register')},
    dropLine:function(i){var r=regDraft();r.lines.splice(i,1);FieldDB.save();UI.go('register')},
    mapBoxLine:function(i){
      var r=regDraft(),l=r.lines[i],bx=(l.boxes||[])[0]||{};
      UI.sheet('<h3>扫码对应 · 建批</h3><p class="sub">箱码 '+esc(bx.code||'')+'（'+esc((bx.who||'—')+(bx.src==='ocr'?' · OCR':' · 客户'))+'）请选择物料，数量在登记清单中按实填写，无需每箱数量。</p>'
        +'<div class="flab">对应物料*</div><select class="f" id="mapMat">'+FieldDB.matList().map(function(m){return '<option value="'+esc(m.material_code)+'">'+esc(m.name+' · '+m.material_code+' · '+m.unit)+'</option>'}).join('')+'</select>'
        +'<div class="btnrow"><button class="btn ghost" onclick="UI.closeSheet()">取消</button><button class="btn pri" onclick="App.mapBoxOk('+i+')">对应并建批</button></div>');
    },
    mapBoxOk:function(i){
      var r=regDraft(),l=r.lines[i],mcode=document.getElementById('mapMat').value,m=FieldDB.mat(mcode);
      var bx=(l.boxes||[])[0]||{};
      l.material_code=mcode;l.name=m.name;l.unit=m.unit;l.qty=0;
      FieldDB.noteBox?FieldDB.noteBox(bx.code||'',{material_code:mcode}):0;
      FieldDB.save();UI.closeSheet();
      UI.toast('已对应 '+m.name+' · 建批 '+(bx.batch_no||r.batch_no||'自动'));UI.go('register');
    },
    scanForLine:function(i){UI._line=i;UI.toast('已锁定第 '+(i+1)+' 行为扫码目标，请扫箱唛码')},
    goNewMat:function(name){UI.go('regNew',{name:name||''})},
    saveNewMat:function(){
      var name=document.getElementById('nmName').value.trim();
      var unit=document.getElementById('nmUnit').value;
      var pack=Number(document.getElementById('nmPack').value);
      if(!name){UI.toast('物料名称必填',1);return}
      if(!(pack>0)){UI.toast('包装数量必须大于 0',1);return}
      var m=FieldDB.addMaterial({name:name,spec:document.getElementById('nmSpec').value.trim(),unit:unit,pack_qty:pack,customer:document.getElementById('nmCust').value.trim()});
      var r=regDraft();r.lines.push({material_code:m.material_code,name:m.name,unit:m.unit,qty:Number(m.pack_qty)||1,boxes:[],loc:r.loc});
      FieldDB.save();UI.toast('已建档 '+m.material_code+'（草稿待审）并加入清单');UI.go('register');
    },
    setRegField:function(k,v){var r=regDraft();r[k]=v;FieldDB.save()},
    regDraftSave:function(){enqueue('register_draft',{reg:regDraft()},'登记草稿已本地保存，联网后自动同步')},
    /* 扫客户箱唛码：未登记箱码允许直接扫码登记（先建空批次/箱记录，物料在登记页对应），已登记则累加 */
    scanBox:function(code){
      code=String(code||'').trim();
      var r=regDraft();
      if(!code){UI.toast('请输入或扫描箱唛码',1);return}
      if(r.lines.some(function(l){return (l.boxes||[]).some(function(b){return b.code===code})})){UI.toast('重复箱码：该箱已扫过，自动拦截',1);return}
      var box=FieldDB.boxOf(code);
      /* 箱码从未在系统出现：走“扫码对应”流程——选客户或OCR来源，现场建批次（可空），不强制每箱数量 */
      if(!box){
        var ps=FieldDB.get().presets;
        var ocrs=(ps.ocr?ps.ocr.owners:[]).map(function(o){return '<option>'+esc(o)+'</option>'}).join('');
        UI.sheet('<h3>新箱码 · 扫码对应</h3><p class="sub">箱唛码 '+esc(code)+' 系统无记录。选绑定客户或OCR记录，现场扫码对应物料并自动建批（可先不定每箱数量）。</p>'
          +'<div class="flab">批次号（默认自动生成）</div><input class="f" id="nbBatch" value="'+esc('BT'+new Date().toISOString().slice(0,10).replace(/-/g,'')+(String(Math.floor(10+Math.random()*89))))+'">'
          +'<div class="flab">绑定对象*</div><div class="chips" id="nbSeg"><button class="chip on" onclick="App.nbSeg(\'cust\')">客户</button><button class="chip" onclick="App.nbSeg(\'ocr\')">OCR记录</button></div>'
          +'<div id="nbCustWrap"><div class="flab">客户</div><select class="f" id="nbCust"><option>恒达服饰</option><option>宏远纺织</option><option>单位本部</option></select></div>'
          +'<div id="nbOcrWrap" style="display:none"><div class="flab">OCR记录</div><select class="f" id="nbOcr">'+ocrs+'</select></div>'
          +'<div class="flab">对应物料（可选 · 可先不选）</div><select class="f" id="nbMat"><option value="">暂不绑定 · 登记时对应</option>'+FieldDB.matList().map(function(m){return '<option value="'+esc(m.material_code)+'">'+esc(m.name+' · '+m.material_code)+'</option>'}).join('')+'</select>'
          +'<div class="btnrow"><button class="btn ghost" onclick="UI.closeSheet()">取消</button><button class="btn pri" onclick="App.nbOk(\''+esc(code)+'\')">扫码对应 · 建批</button></div>');
        UI._nbsrc='cust';
        return;
      }
      /* 箱码已在系统但未绑物料：同样允许扫码对应建批 */
      if(FieldDB.isUnboundBox&&FieldDB.isUnboundBox(box)){
        FieldDB.saveBoxMeta?FieldDB.saveBoxMeta(box):0;
        UI.sheet('<h3>箱码待对应物料</h3><p class="sub">箱唛码 '+esc(code)+' 已生成（'+esc(box.customer||box.src||'客户/OCR')+'），尚未绑定物料。请选择本次对应的物料，自动建批入登记。</p>'
          +'<div class="flab">对应物料*</div><select class="f" id="ubMat">'+FieldDB.matList().map(function(m){return '<option value="'+esc(m.material_code)+'">'+esc(m.name+' · '+m.material_code)+'</option>'}).join('')+'</select>'
          +'<div class="btnrow"><button class="btn ghost" onclick="UI.closeSheet()">取消</button><button class="btn pri" onclick="App.ubBind(\''+esc(code)+'\')">对应并建批</button></div>');
        return;
      }
      var idx=-1;
      if(UI._line!=null&&r.lines[UI._line]&&r.lines[UI._line].material_code===box.material_code)idx=UI._line;
      if(idx<0)r.lines.forEach(function(l,ii){if(idx<0&&l.material_code===box.material_code)idx=ii});
      if(idx<0){
        var m0=FieldDB.mat(box.material_code);
        r.lines.push({material_code:box.material_code,name:m0.name,unit:m0.unit,qty:box.qty,boxes:[{code:code,qty:box.qty,t:tm()}],loc:r.loc});
        UI._line=null;FieldDB.save();
        UI.toast('箱码 '+code+' 不在清单，已新增一行 +'+box.qty+m0.unit);UI.go('register');return;
      }
      var l=r.lines[idx];l.boxes=l.boxes||[];l.boxes.push({code:code,qty:box.qty,t:tm()});l.qty=Number(l.qty||0)+box.qty;
      UI._line=null;FieldDB.save();
      UI.toast('第 '+(idx+1)+' 行 +'+box.qty+(l.unit||'')+'（'+code+'），累计 '+l.qty+(l.unit||''));
      UI.go('register');
    },
    nbSeg:function(s){
      UI._nbsrc=s;
      var c=UI._nbsrc==='ocr';
      Array.prototype.forEach.call(document.querySelectorAll('#nbSeg .chip'),function(ch,i){ch.classList.toggle('on',(i===1)===c)});
      document.getElementById('nbCustWrap').style.display=c?'none':'';
      document.getElementById('nbOcrWrap').style.display=c?'':'none';
    },
    nbOk:function(code){
      var r=regDraft(),src=UI._nbsrc||'cust';
      var batch=document.getElementById('nbBatch').value.trim()||('BT'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'01');
      var who=src==='ocr'?document.getElementById('nbOcr').value:document.getElementById('nbCust').value;
      var mcode=document.getElementById('nbMat').value||'';
      var m=mcode?FieldDB.mat(mcode):{name:'待对应物料',unit:'件',pack_qty:1};
      FieldDB.noteBox?FieldDB.noteBox(code,{batch_no:batch,src:src,customer:src==='ocr'?'':who,ocr:src==='ocr'?who:'',material_code:mcode||'UNBOUND'}):0;
      r.lines.push({material_code:mcode||'UNBOUND-BOX:'+code,name:mcode?m.name:('箱码 '+code+'（待对应）'),unit:m.unit||'件',qty:0,boxes:[{code:code,qty:0,t:tm(),batch_no:batch,src:src,who:who}],loc:r.loc});
      if(!r.batch_no)r.batch_no=batch;
      FieldDB.save();UI.closeSheet();
      UI.toast('已扫码对应建批 '+batch+'（'+who+'）');UI.go('register');
    },
    ubBind:function(code){
      var box=FieldDB.boxOf(code),r=regDraft();
      var mcode=document.getElementById('ubMat').value,m=FieldDB.mat(mcode);
      FieldDB.bindUnbound?FieldDB.bindUnbound(code,mcode):0;
      r.lines.push({material_code:mcode,name:m.name,unit:m.unit,qty:0,boxes:[{code:code,qty:0,t:tm(),batch_no:box.batch_no||r.batch_no}],loc:r.loc});
      FieldDB.save();UI.closeSheet();
      UI.toast('已对应 '+m.name+' · 建批 '+(box.batch_no||r.batch_no||'自动'));UI.go('register');
    },
    bindBox:function(code,i){
      var r=regDraft(),l=r.lines[i],m=FieldDB.mat(l.material_code);
      var q=Number(document.getElementById('bindQty').value);
      if(!(q>0)){UI.toast('每箱数量必须大于 0',1);return}
      FieldDB.bindBox(code,l.material_code,q,l.unit||m.unit,'');
      UI.closeSheet();UI.toast('箱码已绑定：'+code+' = 每箱 '+q+(l.unit||m.unit));
      App.scanBox(code);
    },
    simBox:function(code){var e=document.getElementById('boxCode');if(e)e.value=code;App.scanBox(code)},
    doRegister:function(){
      var r=regDraft(),biz=r.biz||'material',loc=String(r.loc||'').trim();
      if(!r.lines.length){UI.toast('登记清单为空，请快捷添加'+(biz==='product'?'成品档案/成品库':'或关联申请单'),1);return}
      /* 未对应物料的扫码箱行：提交前必须先对应（点行内“对应”补选） */
      var un=r.lines.filter(function(l){return !l.material_code||l.material_code==='UNBOUND'||String(l.material_code).indexOf('UNBOUND-BOX:')===0});
      if(un.length){UI.toast('有 '+un.length+' 个扫码箱未对应物料，请先点“对应”补选',1);return}
      /* 登记时两种业态禁止混单 */
      var mix=r.lines.filter(function(l){return (FieldDB.matKind(l.material_code)==='product')!==(biz==='product')});
      if(mix.length){UI.toast('当前为'+bizName(biz)+'登记：'+(mix[0].name||mix[0].material_code)+' 非'+bizName(biz)+'，禁止混单',1);return}
      var bad=r.lines.filter(function(l){return !(Number(l.qty)>0)});
      if(bad.length){UI.toast((bad[0].name||(biz==='product'?'成品':'物料'))+' 数量必须大于 0',1);return}
      if(biz!=='product'&&!loc){UI.toast('存放库区必填',1);return}
      var batch=r.batch_no||('BT'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'01');
      var d=newDoc('register',bizName(biz)+'登记 · '+r.lines.length+'行','+');
      d.wh=(biz==='product')?(r.fin_warehouse||'成品库'):'成品仓A';
      if(r.src_sq)d.src_sq=r.src_sq;
      d.lines=r.lines.map(function(l){return {material_code:l.material_code,batch_no:batch,unit:l.unit,qty:Number(l.qty),wh:d.wh,loc:l.loc||loc,boxes:(l.boxes||[]).length}});
      if(!navigator.onLine){enqueue('register',d,'弱网已存登记草稿（'+r.lines.length+'行）');return}
      var res=FieldDB.post(d);
      UI.toast(res.ok?('登记入账 '+r.lines.length+' 行（'+batch+'）'):res.msg,res.ok?0:1);
      DB().reg={biz:biz,fin_warehouse:d.wh,src_sq:'',lines:[],batch_no:'',loc:'第1栏第1格',handler:''};FieldDB.save();
      UI.go('todo');
    },
    setRegBiz:function(b){
      var r=regDraft();
      r.biz=b;r.src_sq='';r.lines=[];
      FieldDB.save();UI.toast('已切换为'+bizName(b)+'登记 · 请重新关联/添加清单');UI.go('register');
    },
    doReceive:function(){
      var signed=!!document.getElementById('rcSign').dataset.img;
      if(!signed){UI.toast('请先签收签名',1);return}
      var d=FieldDB.findDoc('ZS2026091604');d.status='APPROVED';FieldDB.save();UI.toast(d.doc_no+' 已签收');UI.go('todo');
    },
    doReturn:function(){
      var why=document.getElementById('wrReason').value.trim();
      if(!why){UI.toast('退料原因必填',1);return}
      if(!document.getElementById('wrSign').dataset.img){UI.toast('签名为空，禁止提交',1);return}
      var d=FieldDB.findDoc('TL2026091601');d.wh='成品仓A';d.dir='+';
      if(!navigator.onLine){enqueue('wreturn',{doc:d.doc_no},'弱网已存退料草稿');return}
      var r=FieldDB.post(d);UI.toast(r.ok?d.doc_no+' 退料回仓完成':r.msg,r.ok?0:1);UI.go('todo');
    },
    searchData:function(v){UI._dkw=v||'';if(UI.cur()==='data')App.filterData(v);else UI.go('data',{kw:v})},
    filterData:function(v){
      v=String(v||'').toLowerCase();
      var vis=0;Array.prototype.forEach.call(document.querySelectorAll('#dList .li'),function(li){var on=!v||(li.dataset.k||'').indexOf(v)>=0;li.style.display=on?'':'none';if(on)vis++});
      var em=document.getElementById('dEmpty');if(em)em.style.display=vis?'none':'';
    },
    setDTab:function(t){UI._dtab=t;UI.go('data')},
    setDbiz:function(b){UI._dbiz=b;UI.go('data')},
    showStock:function(code,batch,wh){
      var s=FieldDB.stockOf(code,batch,wh),m=FieldDB.mat(code);
      if(!s){UI.toast('无该库存记录',1);return}
       UI.sheet('<h3>'+esc(m.name||s.name)+'</h3><p class="sub">'+esc(code+' · 批次 '+batch+' · '+wh)+'</p>'
         +'<div class="card"><div class="kv"><span class="k">账面</span><b>'+qtyUnit(s.on_hand,s.unit)+'</b></div><div class="kv"><span class="k">可用</span><b>'+qtyUnit(s.avail,s.unit)+'</b></div><div class="kv"><span class="k">待检</span><b>'+qtyUnit(s.pending,s.unit)+'</b></div><div class="kv"><span class="k">隔离</span><b>'+qtyUnit(s.quarantine||0,s.unit)+'</b></div><div class="kv"><span class="k">库区</span><b>'+esc(s.loc)+'</b></div><div class="kv"><span class="k">每箱</span><b>'+qtyUnit(Number(m.pack_qty)||1,s.unit)+'</b></div></div>'
        +'<div class="btnrow"><button class="btn ghost" onclick="UI.closeSheet()">关闭</button><button class="btn pri" onclick="UI.closeSheet();UI.go(\'scan\')">去扫码核对</button></div>');
    },
    login:function(id){FieldDB.login(id);UI.head();UI.toast('已切换为 '+FieldDB.user().name);UI.go('todo')},
    sync:function(){
      var db=DB();
      if(!db.queue.length){UI.toast('同步队列已清空');return}
      var n=db.queue.length;db.queue=[];FieldDB.save();UI.head();UI.toast('已同步 '+n+' 条，队列已清空');UI.go(UI.cur());
    }
  };
  UI.tabs([{id:'todo',label:'工作台',icon:'fa-house'},{id:'scan',label:'扫码',icon:'fa-expand'},{id:'data',label:'数据',icon:'fa-table-cells'},{id:'mine',label:'我的',icon:'fa-circle-user'}]);
  UI.head();
  var start='todo';
  try{var q=new URLSearchParams(location.search);if(q.get('view')&&({todo:1,scan:1,data:1,mine:1}[q.get('view')]))start=q.get('view')}catch(e){}
  UI.go(start);
  document.getElementById('syncBtn').onclick=function(){UI.go('mine')};
  window.addEventListener('online',function(){UI.head();UI.toast('网络已恢复，可同步队列')});
  window.addEventListener('offline',function(){UI.head();UI.toast('已进入离线模式，操作将存草稿',1)});
})();
