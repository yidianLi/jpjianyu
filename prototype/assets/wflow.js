/* WFlow · 业务单步向导通用框架
 * 列表(业务记录查询表格) + 向导(一步一个页面) + 右侧业务流 + 草稿续办
 * 用法: WFlow.init({page:'receipt', steps:['拍照','OCR',...], validate:fn, onFinish:fn}) */
(function(){
  function toast(m,e){ if(typeof window.toast==='function') return window.toast(m,e);
    var d=document.getElementById('t'); if(!d){alert(m);return;} d.textContent=m;
    d.style.background=e?'#dc2626':'#0f172a'; d.classList.remove('hidden');
    setTimeout(function(){d.classList.add('hidden')},2300); }
  var S={page:'',steps:[],panelIds:[],cur:1,visited:1,rec:null};
  function key(id){ return 'wflow_'+S.page+'_'+id; }
  function load(id){ try{ return JSON.parse(localStorage.getItem(key(id))||'null'); }catch(e){ return null; } }
  function save(id,obj){ try{ localStorage.setItem(key(id),JSON.stringify(obj)); }catch(e){} }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function renderStepper(){
    var host=document.getElementById('wfSteps'); if(!host) return;
    host.innerHTML=S.steps.map(function(t,i){
      var n=i+1, cls='bg-slate-100 text-slate-500';
      if(n<S.cur||n<=S.doneMax) cls='bg-emerald-100 text-emerald-700';
      if(n===S.cur) cls='bg-blue-600 text-white';
      var sub=n<=S.doneMax||n===1||n<=S.visited;
      return (i?'<span class="text-slate-300">→</span>':'')+
        '<button '+(sub?'onclick="WFlow.go('+n+')"':'disabled title="按顺序完成"')+
        ' class="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap '+cls+'">'+n+' '+esc(t)+'</button>';
    }).join('');
    var bar=document.getElementById('wfBar'), txt=document.getElementById('wfPct');
    var pct=Math.round(((S.doneMax||1)/S.steps.length)*100);
    if(bar) bar.style.width=pct+'%';
    if(txt) txt.textContent='已完成 '+S.doneMax+'/'+S.steps.length+' · '+pct+'%';
    var rail=document.getElementById('railStep');
    if(rail) rail.innerHTML='步骤 <b>'+S.cur+'/'+S.steps.length+'</b> · '+esc(S.steps[S.cur-1]);
    var hint=document.getElementById('wfHint');
    if(hint) hint.textContent='第'+S.cur+'步 / 共'+S.steps.length+'步：'+S.steps[S.cur-1]+' · 未完成的单可随时返回列表，下次按业务流继续';
  }
  function show(n){
    S.cur=Math.min(S.steps.length,Math.max(1,n));
    S.visited=Math.max(S.visited,S.cur);
    document.querySelectorAll('.wstep').forEach(function(el){ el.classList.add('hidden'); });
    var p=document.getElementById('st'+(S.panelIds[S.cur-1]||S.cur)); if(p) p.classList.remove('hidden');
    var bPrev=document.getElementById('wfPrev'), bNext=document.getElementById('wfNext'), bFin=document.getElementById('wfFin');
    if(bPrev) bPrev.disabled=S.cur===1;
    var last=S.cur===S.steps.length;
    if(bNext) bNext.classList.toggle('hidden',last);
    if(bFin) bFin.classList.toggle('hidden',!last);
    renderStepper();
    var chat=document.getElementById('wfScroll'); if(chat) chat.scrollTop=0; window.scrollTo({top:0,behavior:'smooth'});
    if(S.rec) save(S.rec.id,{step:S.cur,visited:S.visited,done:S.doneMax||1,updated:Date.now()});
    refreshList();
  }
  function refreshList(){
    document.querySelectorAll('[data-prog-for]').forEach(function(el){
      var id=el.getAttribute('data-prog-for'), d=load(id);
      if(d&&d.done>=S.steps.length){ el.innerHTML='<span class="bg-emerald-100 text-emerald-700 px-2 rounded-full">已完成 '+d.done+'/'+S.steps.length+'</span>'; }
      else if(d){ el.innerHTML='<span class="bg-blue-100 text-blue-600 px-2 rounded-full">进行中 '+d.done+'/'+S.steps.length+'</span>'; }
      else { el.innerHTML='<span class="bg-slate-100 text-slate-500 px-2 rounded-full">未开始</span>'; }
    });
    document.querySelectorAll('[data-resume-for]').forEach(function(btn){
      var id=btn.getAttribute('data-resume-for'), d=load(id);
      btn.textContent=(d&&d.done>=S.steps.length)?'查看':(d?'继续办理':'开始办理');
    });
  }
  window.WFlow={
    init:function(o){
      S.page=o.page;
      S.steps=(o.steps||[]).slice();
      S.panelIds=S.steps.map(function(_,i){return i+1;});
      var originalValidate=o.validate||null;
      if(o.page==='receipt'){
        if(new URLSearchParams(location.search).get('from')==='app'){
          // 入库后台只保留真实的六个业务步骤；此前错误引用不存在的第7、8步，导致空节点显示。
          S.steps=[S.steps[0],S.steps[1],S.steps[2],S.steps[4],S.steps[3],S.steps[5]];
          S.panelIds=[1,2,3,5,4,6];
        }else{
          S.steps=S.steps.filter(function(_,i){return i!==4;});
          S.panelIds=[1,2,3,4,6,7,8];
        }
      }
      S.validate=originalValidate?function(step,why){return originalValidate(S.panelIds[step-1]||step,why);}:null;
      S.onFinish=o.onFinish||null;
      S.cur=1; S.visited=1; S.doneMax=1; S.rec=null; S.titleOf=o.titleOf||function(r){return r.id;};
      renderStepper(); refreshList();
      var q=document.getElementById('recSearch');
      if(q) q.addEventListener('input',function(){
        var kw=q.value.trim();
        document.querySelectorAll('#recBody tr').forEach(function(tr){
          tr.style.display=!kw||tr.innerText.indexOf(kw)>-1?'':'none';
        });
        var emp=document.getElementById('recEmpty');
        if(emp){ var vis=[].some.call(document.querySelectorAll('#recBody tr'),function(tr){return tr.style.display!=='none';}); emp.classList.toggle('hidden',vis); }
      });
    },
    open:function(id,title,meta){
      S.rec={id:id,title:title||id,meta:meta||''};
      var d=load(id);
      S.cur=d?Math.min(d.step,S.steps.length):1;
      S.visited=d?Math.max(d.visited||1,S.cur):1;
      S.doneMax=d?(d.done||1):1;
      document.getElementById('listView').classList.add('hidden');
      document.getElementById('wizView').classList.remove('hidden');
      var t=document.getElementById('wfTitle'); if(t) t.innerHTML='<b>'+esc(title||id)+'</b> '+(meta?'<span class="text-[11px] font-normal text-slate-400">'+esc(meta)+'</span>':'');
      show(S.cur);
      toast('已进入 '+id+'：第'+S.cur+'步，'+S.steps[S.cur-1]);
    },
    back:function(){ this.save(true); document.getElementById('wizView').classList.add('hidden'); document.getElementById('listView').classList.remove('hidden'); refreshList(); },
    go:function(n){
      n=Math.min(S.steps.length,Math.max(1,n));
      if(n===S.cur) return;
      if(n>S.visited){ toast('请按顺序完成上一步',true); return; }
      if(n>S.cur&&S.validate){ var r=S.validate(S.cur,'jump'); if(r&&!r.ok){ toast(r.msg||'本步尚未完成',true); return; } }
      show(n);
    },
    prev:function(){ if(S.cur>1) show(S.cur-1); },
    next:function(){
      if(S.validate){ var r=S.validate(S.cur,'next'); if(r&&!r.ok){ toast(r.msg||'本步尚未完成',true); return; } }
      S.doneMax=Math.max(S.doneMax||1,S.cur+ (S.cur<S.steps.length?1:0));
      if(S.cur>=S.steps.length){ this.finish(); return; }
      show(S.cur+1);
    },
    save:function(silent){
      if(!S.rec) return;
      save(S.rec.id,{step:S.cur,visited:S.visited,done:Math.max(S.doneMax||1,S.cur-(S.cur===S.steps.length?0:1)),updated:Date.now()});
      refreshList(); if(!silent) toast('草稿已保存：'+S.rec.id+' 第'+S.cur+'步，可从列表继续办理');
    },
    finish:function(){
      if(S.validate){ var r=S.validate(S.cur,'finish'); if(r&&!r.ok){ toast(r.msg||'最后一步尚未完成',true); return; } }
      S.doneMax=S.steps.length;
      if(S.rec) save(S.rec.id,{step:S.steps.length,visited:S.steps.length,done:S.steps.length,updated:Date.now()});
      refreshList(); renderStepper();
      if(S.onFinish) S.onFinish(S.rec);
      else toast('已完成：'+(S.rec?S.rec.id:'')+'，记录已更新，可按业务流继续');
    },
    progress:refreshList
  };
})();
