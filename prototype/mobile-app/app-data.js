/* 现场作业APP · 演示数据中心（独立于PC账套，模拟后端 /api/v1/app/*）
 * 真实环境由 AppApi(api-client.js) 提供；此处为无后端演示种子。
 * 字段命名与《页面字段对照表》冻结口径一致：material_code/batch_no/on_hand/avail/doc_no/status… */
(function(){
  var KEY='wms_field_app_v1';
  var USERS={
    lixiaoming:{name:'李小明',role:'车间领料员',scope:'一监区 · 缝制一车间 / 王班组',device:'PDA-03',home:'todo',
      actions:['issue','receive','wreturn','scan','deliver']},
    zhangjianguo:{name:'张建国',role:'仓库负责人',scope:'外仓 WH-A · 内仓1/2',device:'PDA-01',home:'todo',
      actions:['register','inbound','issue','transfer','stocktake','deliver','finregister','fininbound','finreturn','findeliver']}
  };
  function seed(){
    return {
      user:'zhangjianguo',
      seq:{DJ:209,RK:106,LY:312,TL:52,DB:47,PD:19,CP:209,JJ:105,M:36},
      /* 物料名称清单：status 启用=可登记；草稿待审=APP现场新建，待管理员确认 */
      materials:[
        {material_code:'10A0501020100013',name:'牛津布 藏青',spec:'150D · 1.6m',unit:'米',manage_mode:'QTY',pack_qty:50,price:12.5,category:'面料',customer:'恒达服饰',status:'启用'},
        {material_code:'10A0501020100015',name:'拉链 黑色',spec:'20cm',unit:'件',manage_mode:'QTY',pack_qty:100,price:1.8,category:'辅料',customer:'恒达服饰',status:'启用'},
        {material_code:'10A0501020100016',name:'纽扣 白色',spec:'四孔 15mm',unit:'个',manage_mode:'QTY',pack_qty:500,price:0.4,category:'辅料',customer:'恒达服饰',status:'启用'},
        {material_code:'10A0501020100014',name:'里布 白色',spec:'120cm',unit:'米',manage_mode:'QTY',pack_qty:80,price:6.0,category:'面料',customer:'宏远纺织',status:'启用'}
      ],
      /* 成品档案（交付只交付成品；登记/入库切到成品时用这份清单） */
      products:[
        {material_code:'CP-JK-001',name:'HD-JK-24秋 工装夹克',spec:'藏青',unit:'件',pack_qty:10,category:'成品',status:'启用'},
        {material_code:'CP-TX-002',name:'HD-TX-24夏 工作T恤',spec:'白色',unit:'件',pack_qty:20,category:'成品',status:'启用'}
      ],
      /* 仓库 → 库区（调仓时源/目标库区可选） */
      locs:{
        '成品仓A':['第1栏第1格','第1栏第2格','F01'],
        '成品仓B':['A区-01','A区-02','F02'],
        '成品库':['F01','F02']
      },
      custBoxes:[
        {box_code:'HD-9664-3001',material_code:'10A0501020100013',qty:50,unit:'米',box_qty:1,box_unit:'箱',customer:'恒达服饰'},
        {box_code:'HD-9664-3002',material_code:'10A0501020100013',qty:50,unit:'米',box_qty:1,box_unit:'箱',customer:'恒达服饰'},
        {box_code:'HD-9664-3005',material_code:'10A0501020100013',qty:50,unit:'米',box_qty:1,box_unit:'箱',customer:'恒达服饰'},
        {box_code:'HDZL-20-BK',material_code:'10A0501020100015',qty:100,unit:'件',box_qty:1,box_unit:'箱',customer:'恒达服饰'}
      ],
      /* 登记草稿：快捷选择清单行（关联申请单 / 归属对象带出 / 扫客户箱码累加） */
      reg:{biz:'material',fin_warehouse:'成品仓A',src_sq:'',lines:[],batch_no:'',loc:'第1栏第1格',handler:''},
      /* 申请领料单（登记时可快捷关联并带入清单） */
      sq:[
        {doc_no:'SQ20260916004',date:'2026-09-16',unit:'单位本部',status:'已审批',lines:[{material_code:'10A0501020100016',name:'纽扣 白色',unit:'个',qty:500},{material_code:'10A0501020100015',name:'拉链 黑色',unit:'件',qty:200}]},
        {doc_no:'SQ20260916003',date:'2026-09-16',unit:'缝制一车间',status:'已审批',lines:[{material_code:'10A0501020100013',name:'牛津布 藏青',unit:'米',qty:300}]},
        {doc_no:'SQ20260916002',date:'2026-09-16',unit:'单位本部',status:'已保存',lines:[{material_code:'10A0501020100014',name:'里布 白色',unit:'米',qty:160}]},
        {doc_no:'SQ20260915005',date:'2026-09-15',unit:'单位本部',status:'已审批',lines:[{material_code:'10A0501020100013',name:'牛津布 藏青',unit:'米',qty:800}]},
        {doc_no:'SQ20260915004',date:'2026-09-15',unit:'裁剪车间',status:'已审批',lines:[{material_code:'10A0501020100015',name:'拉链 黑色',unit:'件',qty:1000}]}
      ],
      /* 快捷添加清单预设：归属对象 → 常规物料清单 */
      presets:{
        customer:{label:'客户',owners:['单位本部','恒达服饰','宏远纺织'],items:{
          '单位本部':[{material_code:'10A0501020100016',name:'纽扣 白色',unit:'个',qty:200,note:'常规清单'},{material_code:'10A0501020100015',name:'拉链 黑色',unit:'件',qty:100,note:'常规清单'}],
          '恒达服饰':[{material_code:'10A0501020100013',name:'牛津布 藏青',unit:'米',qty:50,note:'常规清单'},{material_code:'10A0501020100015',name:'拉链 黑色',unit:'件',qty:100,note:'常规清单'}],
          '宏远纺织':[{material_code:'10A0501020100014',name:'里布 白色',unit:'米',qty:80,note:'常规清单'}]
        }},
        product:{label:'成品',owners:['HD-JK-24秋 工装夹克'],items:{
          'HD-JK-24秋 工装夹克':[{material_code:'10A0501020100016',name:'纽扣 白色',unit:'个',qty:5,note:'BOM用量'},{material_code:'10A0501020100015',name:'拉链 黑色',unit:'件',qty:1,note:'BOM用量'}]
        }},
        workshop:{label:'车间',owners:['缝制一车间','裁剪车间'],items:{
          '缝制一车间':[{material_code:'10A0501020100013',name:'牛津布 藏青',unit:'米',qty:200,note:'常规领用'},{material_code:'10A0501020100014',name:'里布 白色',unit:'米',qty:80,note:'常规领用'}],
          '裁剪车间':[{material_code:'10A0501020100013',name:'牛津布 藏青',unit:'米',qty:300,note:'常规领用'}]
        }},
        history:{label:'历史申请',owners:['SQ20260915004 · 2026-09-15','SQ20260915003 · 2026-09-15'],items:{
          'SQ20260915004 · 2026-09-15':[{material_code:'10A0501020100015',name:'拉链 黑色',unit:'件',qty:1000,note:'历史申请带入'}],
          'SQ20260915003 · 2026-09-15':[{material_code:'10A0501020100013',name:'牛津布 藏青',unit:'米',qty:600,note:'历史申请带入'}]
        }},
        ocr:{label:'OCR记录',owners:['OCR2026091201 · 送货单识别结果'],items:{
          'OCR2026091201 · 送货单识别结果':[{material_code:'10A0501020100013',name:'牛津布 藏青',unit:'米',qty:1200,note:'OCR识别'},{material_code:'10A0501020100015',name:'拉链 黑色',unit:'件',qty:2000,note:'OCR识别'}]
        }}
      },
      /* 关联单据来源：各业务的“关联”快捷选择列表（入库/领料都关联登记单DJ） */
      srcLinks:{
        inbound:[
          {no:'DJ20260916004',date:'2026-09-16',party:'单位本部',lines:[{material_code:'10A0501020100016',name:'纽扣 白色',unit:'个',qty:500},{material_code:'10A0501020100015',name:'拉链 黑色',unit:'件',qty:200}]},
          {no:'DJ20260916003',date:'2026-09-16',party:'缝制一车间',lines:[{material_code:'10A0501020100013',name:'牛津布 藏青',unit:'米',qty:300}]},
          {no:'DJ20260915002',date:'2026-09-15',party:'单位本部',lines:[{material_code:'10A0501020100014',name:'里布 白色',unit:'米',qty:160}]}
        ],
        transfer:[
          {no:'DB2026091602',date:'2026-09-16',from:'成品仓A',to:'成品仓B',lines:[{material_code:'10A0501020100015',name:'拉链 黑色',unit:'件',qty:2000}]},
          {no:'DB2026091501',date:'2026-09-15',from:'成品仓B',to:'成品仓A',lines:[{material_code:'10A0501020100016',name:'纽扣 白色',unit:'个',qty:5000}]}
        ],
        stocktake:[
          {no:'PD2026091601',date:'2026-09-16',wh:'成品仓A',scope:'全面盘点',lines:[{material_code:'10A0501020100013',name:'牛津布 藏青',unit:'米',qty:4200},{material_code:'10A0501020100014',name:'里布 白色',unit:'米',qty:1600}]},
          {no:'PD2026091602',date:'2026-09-16',wh:'成品仓B',scope:'循环盘点(辅料)',lines:[{material_code:'10A0501020100015',name:'拉链 黑色',unit:'件',qty:9000}]}
        ],
        deliver:[
          {no:'CP2026091608',date:'2026-09-16',customer:'恒达服饰',lines:[{material_code:'CP-JK-001',name:'HD-JK-24秋 工装夹克',unit:'件',qty:400}]},
          {no:'CP2026091507',date:'2026-09-15',customer:'宏远纺织',lines:[{material_code:'CP-JK-001',name:'HD-JK-24秋 工装夹克',unit:'件',qty:200}]}
        ]
      },
      /* 各业务草稿（关联+快捷添加清单，与登记同构） */
      dr:{
        inbound:{biz:'material',src_doc:'',lines:[],wh:'成品仓A',fin_warehouse:'成品仓A',loc:'第1栏第1格',qc:'合格'},
        issue:{biz:'material',src_doc:'',lines:[],wh:'成品仓A',loc:'',receiver:''},
        transfer:{src_doc:'',lines:[],from_wh:'成品仓A',from_loc:'第1栏第1格',to_wh:'成品仓B',to_loc:'A区-01'},
        stocktake:{src_doc:'',lines:[],wh:'成品仓A'},
        deliver:{src_doc:'',lines:[],customer:'恒达服饰',recv:'',stime:''}
      },
      stock:[
        {material_code:'10A0501020100013',name:'牛津布 藏青',batch_no:'BT2026091501',wh:'成品仓A',loc:'第1栏第1格',unit:'米',on_hand:4200,avail:3980,pending:220,quarantine:0,frozen:0},
        {material_code:'10A0501020100014',name:'里布 白色',batch_no:'BT2026091502',wh:'成品仓A',loc:'第1栏第2格',unit:'米',on_hand:1600,avail:1600,pending:0,quarantine:0,frozen:0},
        {material_code:'10A0501020100015',name:'拉链 黑色',batch_no:'BT2026091503',wh:'成品仓B',loc:'A区-01',unit:'件',on_hand:9000,avail:9000,pending:0,quarantine:0,frozen:0},
        {material_code:'10A0501020100016',name:'纽扣 白色',batch_no:'BT2026091504',wh:'成品仓B',loc:'A区-02',unit:'个',on_hand:12000,avail:12000,pending:0,quarantine:0,frozen:0},
        /* 成品库 */
        {material_code:'CP-JK-001',name:'HD-JK-24秋 工装夹克',batch_no:'CP2026091201',wh:'成品库',loc:'F01',unit:'件',on_hand:600,avail:600,pending:0,quarantine:0,frozen:0},
        {material_code:'CP-TX-002',name:'HD-TX-24夏 工作T恤',batch_no:'CP2026091202',wh:'成品库',loc:'F02',unit:'件',on_hand:300,avail:300,pending:0,quarantine:0,frozen:0}
      ],
      barcodes:{
        'SB20260910003-01':{material_code:'10A0501020100013',name:'牛津布 藏青',batch_no:'BT2026091501',qty:200,unit:'米',loc:'第1栏第1格'},
        'SB20260910003-02':{material_code:'10A0501020100015',name:'拉链 黑色',batch_no:'BT2026091503',qty:1000,unit:'件',loc:'A区-01'}
      },
      docs:[
        {doc_no:'SL2026091609',type:'receipt_checklist',title:'送货单清单验收',desc:'恒达服饰 · 3项物料 · 现场逐行确认',status:'PENDING',from:'恒达服饰',items:[
          {material_code:'10A0501020100013',name:'牛津布 藏青',batch_no:'BT2026091501',unit:'米',delivery_qty:1200,received_qty:1200,checked:true},
          {material_code:'10A0501020100015',name:'拉链 黑色',batch_no:'BT2026091503',unit:'件',delivery_qty:2000,received_qty:2000,checked:true},
          {material_code:'10A0501020100016',name:'纽扣 白色',batch_no:'BT2026091504',unit:'个',delivery_qty:500,received_qty:500,checked:false}]},
        {doc_no:'LY2026091608',type:'issue',title:'物料领用 · 缝制一车间',desc:'牛津布 800米 · 待发料',status:'PENDING',dept:'缝制一车间',receiver:'李小明',lines:[{material_code:'10A0501020100013',batch_no:'BT2026091501',unit:'米',qty:800,issued:0}]},
        {doc_no:'TL2026091601',type:'wreturn',title:'退料待判定',desc:'牛津布 120米 · 原领 LY2026091108',status:'PENDING',src_doc:'LY2026091108',lines:[{material_code:'10A0501020100013',batch_no:'BT2026091501',unit:'米',qty:120}]},
        {doc_no:'DB2026091602',type:'transfer',title:'调拨待接收',desc:'成品仓A → 成品仓B · 2000件',status:'PENDING',lines:[{material_code:'10A0501020100015',unit:'件',qty:2000}]},
        {doc_no:'ZS2026091604',type:'receive',title:'直送待接收',desc:'里布 800米 · 裁剪车间',status:'PENDING',lines:[{material_code:'10A0501020100014',unit:'米',qty:800}]},
        {doc_no:'RK2026091601',type:'inbound',title:'成品入库待验收',desc:'HD-JK-24秋 工装夹克 400件',status:'PENDING',lines:[{material_code:'CP-JK-001',name:'HD-JK-24秋 工装夹克',unit:'件',qty:400}]}
      ],
      scans:[],           // 本次会话扫码记录 {code,ok,msg,t}
      queue:[],           // 弱网离线队列 {ts,type,payload}
      ledger:[            // 最近流水（只读）
        {t:'09-16 08:40',doc:'LY2026091607',biz:'物料领用',material:'牛津布 藏青',qty:-200,unit:'米',by:'张建国'},
        {t:'09-16 08:12',doc:'RK2026091600',biz:'成品入库',material:'工装夹克',qty:400,unit:'件',by:'张建国'},
        {t:'09-15 17:30',doc:'TL2026091551',biz:'车间退料',material:'拉链 黑色',qty:100,unit:'件',by:'王芳'}
      ]
    };
  }
  function load(){try{return JSON.parse(localStorage.getItem(KEY))||seed()}catch(e){return seed()}}
  var DB=load();
  (function ensure(){
    var s=seed();
    if(!DB.custBoxes)DB.custBoxes=s.custBoxes;
    if(!DB.sq)DB.sq=s.sq;
    if(!DB.presets)DB.presets=s.presets;
    if(!DB.products)DB.products=s.products;
    if(!DB.locs)DB.locs=s.locs;
    if(!DB.reg||!Array.isArray(DB.reg.lines))DB.reg=s.reg;
    if(DB.reg&&!DB.reg.biz)DB.reg.biz='material';
    if(DB.reg&&!DB.reg.fin_warehouse)DB.reg.fin_warehouse='成品仓A';
    if(!DB.srcLinks)DB.srcLinks=s.srcLinks;
    if(!DB.dr)DB.dr=s.dr;
    if(DB.seq&&DB.seq.M==null)DB.seq.M=36;
    (DB.materials||[]).forEach(function(m){if(!m.status)m.status='启用'});
  })();
  function save(){try{localStorage.setItem(KEY,JSON.stringify(DB))}catch(e){}}
  window.FieldDB={
    get:function(){return DB},
    save:save,
    reset:function(){DB=seed();save();location.reload()},
    login:function(id){if(USERS[id]){DB.user=id;save()}return FieldDB.user()},
    user:function(){return USERS[DB.user]},
    users:function(){return USERS},
    nextNo:function(prefix){DB.seq[prefix]=(DB.seq[prefix]||100)+1;save();return prefix+new Date().toISOString().slice(0,10).replace(/-/g,'')+String(DB.seq[prefix]).slice(-4)},
    findDoc:function(no){return DB.docs.filter(function(d){return d.doc_no===no})[0]},
    mat:function(code){var m=(DB.materials||[]).filter(function(m){return m.material_code===code})[0];if(m)return m;var p=(DB.products||[]).filter(function(x){return x.material_code===code})[0];if(p)return p;return {name:code,unit:'件',pack_qty:1}},
    matKind:function(code){if((DB.materials||[]).filter(function(m){return m.material_code===code}).length)return 'material';if((DB.products||[]).filter(function(x){return x.material_code===code}).length)return 'product';return 'material'},
    productList:function(){return DB.products||[]},
    locsOf:function(wh){return (DB.locs||{})[wh]||[]},
    /* 成品库库存（成品快捷添加用） */
    statusOf:function(m){return (m&&m.status)||'启用'},
    /* 物料名称清单（只列可登记：启用 + 现场新建待审） */
    matList:function(){return DB.materials.filter(function(m){return m.status==='启用'||m.status==='草稿待审'})},
    /* 客户箱码（含“先不绑物料，只绑客户/OCR”的预生成码） */
    boxOf:function(code){return DB.custBoxes.filter(function(b){return b.box_code===code})[0]},
    isUnboundBox:function(b){return b&&(b.material_code==='UNBOUND'||!b.material_code)},
    /* 扫码对应：预生成箱码记录客户/OCR与批次；移动端扫码时再对应物料 */
    noteBox:function(code,meta){
      meta=meta||{};
      var b=DB.custBoxes.filter(function(x){return x.box_code===code})[0];
      if(!b){b={box_code:code,material_code:meta.material_code||'UNBOUND',qty:0,unit:'',customer:meta.customer||'',ocr:meta.ocr||'',src:meta.src||'cust',batch_no:meta.batch_no||'',label:'扫码对应 · 自动建批'};DB.custBoxes.push(b)}
      else{if(meta.material_code)b.material_code=meta.material_code;if(meta.customer!=null)b.customer=meta.customer;if(meta.ocr!=null)b.ocr=meta.ocr;if(meta.src)b.src=meta.src;if(meta.batch_no)b.batch_no=meta.batch_no}
      save();return b;
    },
    bindUnbound:function(code,mcode){
      var b=DB.custBoxes.filter(function(x){return x.box_code===code})[0];
      if(b){b.material_code=mcode;var m=FieldDB.mat(mcode);b.unit=m.unit;b.qty=0;save()}
      return b;
    },
    bindBox:function(boxCode,materialCode,qty,unit,customer){
      DB.custBoxes.push({box_code:boxCode,material_code:materialCode,qty:Number(qty)||1,unit:unit||'件',customer:customer||'',label:'现场绑定'});
      save();
    },
    /* 现场新建物料档案：初始库存 0，状态“草稿待审”，管理员确认后启用 */
    addMaterial:function(o){
      DB.seq.M=(DB.seq.M||0)+1;
      var code='M'+new Date().toISOString().slice(2,10).replace(/-/g,'')+String(DB.seq.M).padStart(2,'0');
      var m={material_code:code,name:o.name,spec:o.spec||'',unit:o.unit||'件',manage_mode:o.manage_mode||'QTY',pack_qty:Number(o.pack_qty)||1,price:0,category:o.category||'新建',customer:o.customer||'',status:'草稿待审',origin:'APP现场建档'};
      DB.materials.push(m);save();return m;
    },
    stockOf:function(code,batch,wh){return DB.stock.filter(function(s){return s.material_code===code&&(!batch||s.batch_no===batch)&&(!wh||s.wh===wh)})[0]},
    /* 过账：唯一写库存入口（模拟后端事务，含幂等） */
    post:function(doc){
      if(doc.__posted)return {ok:false,code:'DUPLICATE_POST',msg:'单据已过账，禁止重复提交'};
      (doc.lines||[]).forEach(function(l){
        var wh=l.wh||doc.wh||'成品仓A';
        var s=FieldDB.stockOf(l.material_code,l.batch_no,wh);
        if(!s){s={material_code:l.material_code,name:(FieldDB.mat(l.material_code).name),batch_no:l.batch_no||'-',wh:wh,loc:l.loc||'-',unit:l.unit,on_hand:0,avail:0,pending:0,quarantine:0,frozen:0};DB.stock.push(s)}
        var q=Number(l.qty)||0,d=l.dir||doc.dir||'+';
        if(d==='-'){s.on_hand-=q;s.avail-=q}else{s.on_hand+=q;s.avail+=q}
        s.last_move=new Date().toISOString().slice(0,16).replace('T',' ');
        DB.ledger.unshift({t:s.last_move.slice(5),doc:doc.doc_no,biz:doc.title||doc.type,material:FieldDB.mat(l.material_code).name,qty:d==='-'?-q:q,unit:l.unit,by:FieldDB.user().name});
      });
      doc.__posted=true;doc.status='APPROVED';save();
      return {ok:true,doc_no:doc.doc_no};
    }
  };
})();
