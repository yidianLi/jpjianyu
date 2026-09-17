/* 现场作业APP · UI 原语：toast/sheet/底部导航/视图容器/签名板 */
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
  /* 签名板 */
  UI.signPad=function(host,onOk){
    host.innerHTML='<div class="signpad"><canvas></canvas><div class="ph">请在框内签名 ✍️</div></div>'
      +'<div class="btnrow"><button class="btn ghost sm" data-sign-clear>清除</button><button class="btn pri sm" data-sign-ok>确认签名</button></div>';
    var cv=host.querySelector('canvas'),ph=host.querySelector('.ph'),ctx=cv.getContext('2d');
    function fit(){var r=cv.getBoundingClientRect();cv.width=r.width*2;cv.height=r.height*2;ctx.scale(2,2);ctx.lineWidth=2.2;ctx.lineCap='round';ctx.strokeStyle='#152338'}
    setTimeout(fit,60);
    var draw=false,has=false;
    function pos(e){var r=cv.getBoundingClientRect();var p=e.touches?e.touches[0]:e;return[p.clientX-r.left,p.clientY-r.top]}
    function start(e){draw=true;has=true;ph.style.display='none';var p=pos(e);ctx.beginPath();ctx.moveTo(p[0],p[1]);e.preventDefault()}
    function move(e){if(!draw)return;var p=pos(e);ctx.lineTo(p[0],p[1]);ctx.stroke();e.preventDefault()}
    function end(){draw=false}
    cv.addEventListener('mousedown',start);cv.addEventListener('mousemove',move);window.addEventListener('mouseup',end);
    cv.addEventListener('touchstart',start,{passive:false});cv.addEventListener('touchmove',move,{passive:false});cv.addEventListener('touchend',end);
    host.querySelector('[data-sign-clear]').onclick=function(){ctx.clearRect(0,0,cv.width,cv.height);has=false;ph.style.display='grid'};
    host.querySelector('[data-sign-ok]').onclick=function(){
      if(!has){UI.toast('签名为空，禁止提交',1);return}
      onOk(cv.toDataURL('image/png'));
    };
  };
  window.UI=UI;
})();
