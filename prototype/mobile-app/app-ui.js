/* 现场作业APP · UI 原语：toast/sheet/底部导航/视图容器/拍照存证 */
(function(){
  var UI={};
  var toastT;
  UI.toast=function(msg,bad){
    var t=document.getElementById('toast');
    t.textContent=msg;t.className=bad?'on bad':'on';
    clearTimeout(toastT);toastT=setTimeout(function(){t.className=''},2200);
    if(navigator.vibrate)try{navigator.vibrate(bad?[60,40,60]:18)}catch(e){}
  };
  UI.sheet=function(html){
    var m=document.getElementById('mask'),s=document.getElementById('sheet');
    s.innerHTML='<div class="grab"></div>'+html;
    m.classList.add('on');
    return {
      close:function(){m.classList.remove('on')},
      el:s
    };
  };
  UI.closeSheet=function(){document.getElementById('mask').classList.remove('on')};
  document.getElementById('mask').addEventListener('click',function(e){if(e.target===this)UI.closeSheet()});
  /* 视图注册：views = {id:{title,icon,label,render(el),tab}} */
  var views={},current='',tabbar=document.getElementById('tabbar');
  UI.reg=function(id,def){views[id]=def};
  UI.go=function(id,params){
    var v=views[id];if(!v)return;
    current=id;UI._params=params||{};
    var c=document.getElementById('content');
    c.innerHTML='<div class="skel"></div><div class="skel" style="width:70%"></div>';
    document.querySelectorAll('.tabbar button').forEach(function(b){
      b.classList.toggle('on',b.dataset.v===(v.tab||id));
    });
    setTimeout(function(){
      c.innerHTML='<div class="view on" id="view-'+id+'"></div>';
      try{v.render(document.getElementById('view-'+id),params||{})}catch(e){
        c.innerHTML='<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>页面加载失败<br><span style="font-size:11px">'+String(e.message||e)+'</span><br><button class="btn sm pri" style="margin-top:12px" onclick="UI.go(\''+id+'\')">重试</button></div>';
      }
      c.scrollTop=0;
    },120);
  };
  UI.cur=function(){return current};
  UI.params=function(){return UI._params||{}};
  /* 底部导航：[{id,label,icon,tab?}] */
  UI.tabs=function(list){
    var todos=FieldDB.get().docs.filter(function(d){return d.status==='PENDING'}).length;
    var q=FieldDB.get().queue.length;
    tabbar.innerHTML=list.map(function(t){
      var badge=t.id==='todo'&&todos?'<span class="bdg">'+todos+'</span>':(t.id==='mine'&&q?'<span class="bdg" style="background:#d97706">'+q+'</span>':'');
      return '<button data-v="'+(t.tab||t.id)+'" onclick="UI.go(\''+t.id+'\')" aria-current="'+(false?'page':'false')+'"><i class="fa-solid '+t.icon+'"></i>'+t.label+badge+'</button>';
    }).join('');
  };
  /* 头部 */
  UI.head=function(){
    var u=FieldDB.user(),db=FieldDB.get();
    document.getElementById('hName').textContent=u.name+' · '+u.role;
    document.getElementById('hScope').textContent=u.scope+' · 设备 '+u.device;
    var q=db.queue.length;
    var badge=document.getElementById('syncBadge');
    badge.textContent=q;badge.style.display=q?'grid':'none';
    document.body.classList.toggle('offline',!navigator.onLine);
    var grid=document.getElementById('quickGrid');
    var ICONS={register:['fa-barcode','q-teal'],inbound:['fa-arrow-down',''],issue:['fa-arrow-up','q-amber'],receive:['fa-hand-holding',''],wreturn:['fa-rotate-left','q-red'],transfer:['fa-shuffle',''],stocktake:['fa-clipboard-check',''],deliver:['fa-flag-checkered','q-teal'],finregister:['fa-box-open','q-teal'],fininbound:['fa-arrow-down',''],finreturn:['fa-rotate-left','q-red'],findeliver:['fa-flag-checkered','q-teal'],scan:['fa-expand','']};
    grid.innerHTML=u.actions.map(function(a){
      var ic=ICONS[a]||['fa-circle',''];
      var label={register:'登记',inbound:'入库',issue:'领料',receive:'接收',wreturn:'退料',transfer:'调仓',stocktake:'盘点',deliver:'交付',finregister:'成品登记',fininbound:'成品入库',finreturn:'成品退仓',findeliver:'成品交付',scan:'扫码'}[a]||a;
      var target={finregister:'register',fininbound:'inbound',finreturn:'wreturn',findeliver:'deliver'}[a]||a;
      var action=target==='register'&&a==='finregister'?'App.openFinishedRegister()':target==='inbound'&&a==='fininbound'?'App.openFinishedInbound()':target==='wreturn'&&a==='finreturn'?'App.openFinishedReturn()':target==='deliver'&&a==='findeliver'?'App.openFinishedDeliver()':'UI.go(\''+target+'\')';
      return '<button onclick="'+action+'" class="'+ic[1]+'"><i class="fa-solid '+ic[0]+'"></i>'+label+'</button>';
    }).join('');
  };
  /* 签名板已下线（2026-09-19）：全系统不再使用手写签名，提交以登录账号+拍照存证为准。
     保留空壳仅防旧代码误调。 */
  UI.signPad=function(host,onOk){
    if(host)host.style.display='none';
    if(typeof onOk==='function'){try{onOk(null);}catch(e){}}
  };
  /* 拍照存证（相机唤起）：input capture=environment，PDA/手机直接调相机 */
  UI.photoField=function(host,opts){
    opts=opts||{};
    var key=opts.key||('photos_'+Date.now());
    host.innerHTML='<div class="photo-field"><input type="file" accept="image/*" capture="environment" multiple data-photo-input style="display:none">'
      +'<div class="btnrow"><button class="btn ghost sm" data-photo-pick>拍照 / 上传图片</button><span class="sub" data-photo-count>0 张</span></div>'
      +'<div class="photo-prev" data-photo-prev style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"></div></div>';
    var input=host.querySelector('[data-photo-input]'),prev=host.querySelector('[data-photo-prev]'),count=host.querySelector('[data-photo-count]');
    var list=opts.list||[];
    function paint(){
      count.textContent=list.length+' 张';
      prev.innerHTML=list.map(function(p,i){return '<div style="position:relative"><img src="'+p+'" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--line,#dbe5ef)"><button data-photo-del="'+i+'" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:99px;border:0;background:#b42318;color:#fff;font-size:12px">×</button></div>';}).join('');
      prev.querySelectorAll('[data-photo-del]').forEach(function(b){b.onclick=function(){list.splice(Number(b.getAttribute('data-photo-del')),1);paint();if(opts.onChange)opts.onChange(list);};});
    }
    host.querySelector('[data-photo-pick]').onclick=function(){input.click();};
    input.onchange=function(){
      var files=[].slice.call(input.files||[]).slice(0,6);
      var left=6-list.length;
      files.slice(0,Math.max(0,left)).forEach(function(f){
        var r=new FileReader();
        r.onload=function(){var img=new Image();img.onload=function(){var c=document.createElement('canvas'),max=1024,s=Math.min(1,max/Math.max(img.width,img.height));c.width=img.width*s;c.height=img.height*s;c.getContext('2d').drawImage(img,0,0,c.width,c.height);list.push(c.toDataURL('image/jpeg',0.7));paint();if(opts.onChange)opts.onChange(list);};img.src=r.result;};
        r.readAsDataURL(f);
      });
      input.value='';
    };
    paint();
    return {get:function(){return list;}};
  };
  window.UI=UI;
})();
