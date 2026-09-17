(function(){
  var activePage=null;
  var native={};
  var installed=false;

  function rememberNode(scope,node){
    if(!scope||!node)return;
    var nodes=node.nodeType===11?[].slice.call(node.childNodes):[node];
    nodes.forEach(function(item){
      if(item.nodeType!==1)return;
      var parent=item.parentNode;
      if(parent&&parent!==scope.view&&!scope.view.contains(parent))scope.externalNodes.push(item);
    });
  }

  function installTracking(){
    if(installed||!window.EventTarget)return;
    installed=true;
    var eventProto=EventTarget.prototype;
    native.add=eventProto.addEventListener;
    native.remove=eventProto.removeEventListener;
    eventProto.addEventListener=function(type,listener,options){
      if(activePage&&this===document&&type==='DOMContentLoaded'&&document.readyState!=='loading'){
        activePage.readyCallbacks.push({listener:listener,options:options});
        return;
      }
      if(activePage&&typeof listener==='function')activePage.listeners.push({target:this,type:type,listener:listener,options:options});
      return native.add.call(this,type,listener,options);
    };
    var timerNames=['setTimeout','setInterval'];
    timerNames.forEach(function(name){
      native[name]=window[name];
      window[name]=function(handler,delay){
        var args=[].slice.call(arguments,2),id=native[name].apply(window,[handler,delay].concat(args));
        if(activePage)activePage[name].push(id);
        return id;
      };
    });
    native.clearTimeout=window.clearTimeout;
    native.clearInterval=window.clearInterval;
    if(window.requestAnimationFrame){
      native.requestAnimationFrame=window.requestAnimationFrame;
      native.cancelAnimationFrame=window.cancelAnimationFrame;
      window.requestAnimationFrame=function(callback){
        var id=native.requestAnimationFrame.call(window,callback);
        if(activePage)activePage.animationFrames.push(id);
        return id;
      };
    }
    if(window.MutationObserver){
      native.MutationObserver=window.MutationObserver;
      window.MutationObserver=function(callback){
        var observer=new native.MutationObserver(callback);
        if(activePage)activePage.observers.push(observer);
        return observer;
      };
      window.MutationObserver.prototype=native.MutationObserver.prototype;
    }
    if(window.IntersectionObserver){
      native.IntersectionObserver=window.IntersectionObserver;
      window.IntersectionObserver=function(callback,options){
        var observer=new native.IntersectionObserver(callback,options);
        if(activePage)activePage.observers.push(observer);
        return observer;
      };
      window.IntersectionObserver.prototype=native.IntersectionObserver.prototype;
    }
    if(window.BroadcastChannel){
      native.BroadcastChannel=window.BroadcastChannel;
      window.BroadcastChannel=function(name){
        var channel=new native.BroadcastChannel(name);
        if(activePage)activePage.channels.push(channel);
        return channel;
      };
      window.BroadcastChannel.prototype=native.BroadcastChannel.prototype;
    }
    if(window.Node){
      native.appendChild=Node.prototype.appendChild;
      native.insertBefore=Node.prototype.insertBefore;
      Node.prototype.appendChild=function(node){
        var result=native.appendChild.call(this,node);
        if(activePage)rememberNode(activePage,node);
        return result;
      };
      Node.prototype.insertBefore=function(node,reference){
        var result=native.insertBefore.call(this,node,reference);
        if(activePage)rememberNode(activePage,node);
        return result;
      };
    }
  }

  function cleanup(scope){
    if(!scope)return;
    var shellState={
      dashboardMode:document.body.classList.contains('dashboard-mode'),
      navOpen:document.body.classList.contains('nav-open')
    };
    scope.listeners.forEach(function(item){
      try{native.remove.call(item.target,item.type,item.listener,item.options);}catch(e){}
    });
    scope.setTimeout.forEach(function(id){try{native.clearTimeout.call(window,id);}catch(e){}});
    scope.setInterval.forEach(function(id){try{native.clearInterval.call(window,id);}catch(e){}});
    if(native.cancelAnimationFrame)scope.animationFrames.forEach(function(id){try{native.cancelAnimationFrame.call(window,id);}catch(e){}});
    scope.observers.forEach(function(observer){try{observer.disconnect();}catch(e){}});
    scope.channels.forEach(function(channel){try{channel.close();}catch(e){}});
    scope.externalNodes.forEach(function(node){try{if(node.parentNode)node.parentNode.removeChild(node);}catch(e){}});
    scope.styles.forEach(function(style){try{if(style.parentNode)style.parentNode.removeChild(style);}catch(e){}});
    document.body.setAttribute('class',scope.bodyClass);
    document.body.classList.toggle('dashboard-mode',shellState.dashboardMode);
    document.body.classList.toggle('nav-open',shellState.navOpen);
    if(scope.bodyStyle===null)document.body.removeAttribute('style');else document.body.setAttribute('style',scope.bodyStyle);
    activePage=null;
  }

  function pageScope(view){
    return {
      view:view,
      listeners:[],
      readyCallbacks:[],
      setTimeout:[],
      setInterval:[],
      animationFrames:[],
      observers:[],
      channels:[],
      externalNodes:[],
      styles:[],
      bodyClass:document.body.getAttribute('class')||'',
      bodyStyle:document.body.getAttribute('style')
    };
  }

  function isExternal(value){return /^(https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(value||'');}
  function resolveUrl(value,file){
    if(!value||isExternal(value))return value;
    try{return new URL(value,new URL(file,document.baseURI)).href;}catch(e){return value;}
  }
  function rewriteCss(css,file){
    return css.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi,function(all,quote,value){
      return 'url('+quote+resolveUrl(value.trim(),file)+quote+')';
    });
  }
  function rewriteResources(doc,file){
    doc.querySelectorAll('[src],[href]').forEach(function(el){
      ['src','href'].forEach(function(attr){
        if(!el.hasAttribute(attr))return;
        var value=el.getAttribute(attr);
        if(value&&!isExternal(value))el.setAttribute(attr,resolveUrl(value,file));
      });
    });
  }
  function rewriteInlineHandler(value){
    return value.replace(/location\.href\s*=\s*(['"])([^'"]+\.html(?:\?[^'"]*)?)\1(?=\s*(?:[;}]|$))/g,function(all,quote,url){
      return 'WMSView.navigateFile('+JSON.stringify(url)+')';
    });
  }
  function normalizeScript(code){
    return code
      .replace(/\bconst\b/g,'var')
      .replace(/\blet\b/g,'var')
      .replace(/location\.href\s*=\s*(['"])([^'"]+\.html(?:\?[^'"]*)?)\1(?=\s*(?:[;}]|$))/g,function(all,quote,url){
        return 'WMSView.navigateFile('+JSON.stringify(url)+')';
      });
  }

  function loadText(url){
    return fetch(url,{cache:'no-store'}).then(function(response){
      if(!response.ok)throw new Error('HTTP '+response.status);
      return response.text();
    }).catch(function(fetchError){
      return new Promise(function(resolve,reject){
        var request=new XMLHttpRequest();
        request.open('GET',url,true);
        request.onload=function(){if(request.status===0||request.status>=200&&request.status<300)resolve(request.responseText);else reject(fetchError);};
        request.onerror=function(){reject(fetchError);};
        try{request.send();}catch(e){reject(fetchError);}
      });
    });
  }

  function execute(code,source){
    var script=document.createElement('script');
    script.setAttribute('data-wms-view-script','true');
    script.text=normalizeScript(code)+'\n//# sourceURL='+source;
    document.head.appendChild(script);
    if(script.parentNode)script.parentNode.removeChild(script);
  }

  function stripPageShell(body,file){
    var flex=body.querySelector('body > div.flex');
    var aside=flex&&flex.querySelector(':scope > aside');
    if(!aside)aside=body.querySelector('body > aside');
    if(aside)aside.remove();
    var header=flex&&flex.querySelector(':scope > div.flex-1 > header');
    if(!header)header=flex&&flex.querySelector(':scope > header');
    var keepPageHeader=/(?:^|\/)ai\.html(?:\?|$)/i.test(file||'');
    if(header&&!keepPageHeader)header.remove();
    if(flex){
      flex.classList.add('wms-page-layout');
      flex.style.width='100%';
      flex.style.minWidth='0';
      var main=flex.querySelector(':scope > div.flex-1');
      if(main){main.style.width='100%';main.style.minWidth='0';}
    }
  }

  function addStyles(doc,file,scope){
    doc.head.querySelectorAll('style').forEach(function(source){
      var style=document.createElement('style');
      style.setAttribute('data-wms-view-style','true');
      style.textContent=rewriteCss(source.textContent||'',file);
      document.head.appendChild(style);
      scope.styles.push(style);
    });
  }

  function copyBody(body,view){
    var fragment=document.createDocumentFragment();
    [].slice.call(body.childNodes).forEach(function(node){fragment.appendChild(document.importNode(node,true));});
    view.appendChild(fragment);
    view.querySelectorAll('[onclick]').forEach(function(el){el.setAttribute('onclick',rewriteInlineHandler(el.getAttribute('onclick')||''));});
  }

  function externalKind(src){
    if(/tailwindcss|font-awesome|cdnjs\.cloudflare\.com/i.test(src))return 'skip';
    if(/(?:^|\/)store\.js(?:\?|$)/i.test(src)||/(?:^|\/)link\.js(?:\?|$)/i.test(src)||/(?:^|\/)nav\.js(?:\?|$)/i.test(src))return 'skip';
    if(/receipt-checklist\.js(?:\?|$)/i.test(src))return 'receipt-checklist';
    return 'load';
  }

  async function runPageScripts(doc,scripts,file,scope){
    var checklist=false;
    for(var i=0;i<scripts.length;i++){
      var script=scripts[i],src=script.getAttribute('src');
      try{
        if(src){
          var kind=externalKind(src);
          if(kind==='skip')continue;
          if(kind==='receipt-checklist')checklist=true;
          execute(await loadText(resolveUrl(src,file)),resolveUrl(src,file));
        }else if(script.textContent.trim()){
          execute(script.textContent,file+'#inline-'+i);
        }
      }catch(error){
        console.error('[WMS page]',file,error);
      }
    }
    scope.readyCallbacks.forEach(function(item){
      try{item.listener.call(document,new Event('DOMContentLoaded'));}catch(error){console.error('[WMS page ready]',file,error);}
    });
    if(checklist&&window.receiptChecklist&&typeof window.receiptChecklist.render==='function')window.receiptChecklist.render();
  }

  function routeFromFile(file,params){
    file=(file||'').split('/').pop().split('?')[0];
    var view=params.get('view')||params.get('tab')||'';
    var map={
      'home.html':'home','dashboard.html':'dashboard','ai.html':'ai','base.html':'base','docs.html':'docs','ocr.html':'ocr','ocr-result.html':'ocrResult',
      'report.html':'report','report-config.html':'reportConfig','audit.html':'audit','processing-fee.html':'processingFee','users.html':'users','equipment.html':'equipment',
      'receipt.html':'receipt','issue.html':'issue','transfer.html':'transfer','workshop.html':'workshop','workshop-receive.html':'workshopReceive','return.html':'return','inventory.html':'inventory','finished.html':'finished',
      'location-archive.html':'location','location.html':'location','warehouse-archive.html':'warehouseArchive','customer-archive.html':'customerArchive','scanlog.html':'scanlog','stocktake.html':'stocktake','qrcode.html':'qrcode'
    };
    if(file==='material-workbench.html'){
      if(view==='materialCode'||view==='detail')return ['materialCode','detail'];
      if(view==='stock'||view==='onhand'||view==='ledger')return [view==='ledger'||params.get('sub')==='ledger'?'inventoryLedger':'inventoryOnhand',''];
      return [{request:'materialRequest',register:'materialRegister',reject:'materialReject',inbound:'materialInbound',issue:'materialIssue',wreturn:'materialWReturn',return:'materialReturn'}[view]||'materialRequest',view];
    }
    if(file==='finished.html')return [{detail:'finishedDetail',register:'finishedRegister',inbound:'finishedInbound',wreturn:'finishedReturn',deliver:'finishedDeliver'}[view]||'finishedRegister',view];
    return [map[file]||'home',view];
  }

  async function loadPage(options){
    installTracking();
    var view=document.getElementById('view');
    if(!view)return;
    /* 独立APP页（mobile-app 等自带完整壳）直接 iframe 嵌入，避免样式/脚本被壳改写 */
    if(options&&options.iframe){
      if(activePage)cleanup(activePage);
      view.setAttribute('aria-busy','false');
      view.innerHTML='<iframe title="'+String(options.id||'app')+'" src="'+options.file+'" style="width:100%;height:100%;min-height:calc(100vh - 150px);border:0;background:#0b1626" allow="camera;microphone;geolocation"></iframe>';
      return;
    }
    if(location.protocol==='file:'){
      var directFile=options.file, directQuery=[];
      if(options.contextTab)directQuery.push('view='+encodeURIComponent(options.contextTab));
      if(options.extra)Object.keys(options.extra).forEach(function(key){directQuery.push(encodeURIComponent(key)+'='+encodeURIComponent(options.extra[key]))});
      location.replace(directFile+(directQuery.length?'?'+directQuery.join('&'):''));
      return;
    }
    var token=++loadPage.token;
    if(activePage)cleanup(activePage);
    view.setAttribute('aria-busy','true');
    view.innerHTML='<div class="wms-page-loading" role="status" aria-live="polite">正在加载页面…</div>';
    var file=options.file,scope=pageScope(view);
    activePage=scope;
    window.__WMS_PAGE_CONTEXT={file:file.split('/').pop(),tab:options.contextTab||'',route:options.id};
    try{
      var html=await loadText(file);
      if(token!==loadPage.token)return;
      var parsed=new DOMParser().parseFromString(html,'text/html');
      rewriteResources(parsed,file);
      addStyles(parsed,file,scope);
      var scripts=[].slice.call(parsed.querySelectorAll('script'));
      parsed.querySelectorAll('script').forEach(function(script){script.remove();});
      stripPageShell(parsed.body,file);
      view.innerHTML='';
      copyBody(parsed.body,view);
      scope.view=view;
      await runPageScripts(parsed,scripts,file,scope);
      if(token!==loadPage.token)return;
      if(window.wmsEnhancePage)window.wmsEnhancePage();
      if(window.wmsSplitFields)window.wmsSplitFields(view);
      if(window.__WMS_PAGE_READY)window.__WMS_PAGE_READY(options);
      view.scrollTop=0;
      view.setAttribute('aria-busy','false');
    }catch(error){
      if(token!==loadPage.token)return;
      console.error('[WMS route]',file,error);
      view.innerHTML='<div class="wms-page-error" role="alert"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><b>页面加载失败</b><span>'+String(error.message||error)+'</span></div>';
      view.setAttribute('aria-busy','false');
    }
  }
  loadPage.token=0;

  window.WMSView={
    load:loadPage,
    navigateFile:function(target){
      var clean=String(target||'').replace(/^\.\.\//,'');
      var q=clean.indexOf('?'),file=q>=0?clean.slice(0,q):clean,query=q>=0?clean.slice(q+1):'';
      var params=new URLSearchParams(query),pair=routeFromFile(file,params),extra={};
      params.forEach(function(value,key){if(['view','tab','sub','from','page'].indexOf(key)<0)extra[key]=value;});
      if(window.__WMS_APP_GO)window.__WMS_APP_GO(pair[0],pair[1],{extra:extra});
    },
    cleanup:function(){if(activePage)cleanup(activePage);}
  };
})();
