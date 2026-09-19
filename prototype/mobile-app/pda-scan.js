/* PDA扫码统一桥 pda-scan.js · 键盘楔+广播二合一，screens/scan|data共用
 * 厂家文档无论给哪种：1)扫码键模拟键盘回车 2)安卓广播Intent，只需各配一行
 * 用法：PdaScan.on(function(code,source){...})；广播时厂家调 window.PdaScanFeed(code) */
(function(){
  var subs=[];
  function emit(raw,source){
    var code=String(raw||'').trim();
    if(!code)return;
    if(navigator.vibrate){try{navigator.vibrate(18);}catch(e){}}
    subs.forEach(function(fn){try{fn(code,source||'wedge');}catch(e){}});
    try{document.dispatchEvent(new CustomEvent('pdaScan',{detail:{code:code,source:source||'wedge'}}));}catch(e){}
  }
  // 1) 键盘楔：PDA扫码键=键盘输入+回车，聚焦input[data-scan-input]直接收
  document.addEventListener('keydown',function(e){
    if(e.key!=='Enter')return;
    var el=document.activeElement;
    if(el&&el.hasAttribute&&el.hasAttribute('data-scan-input')&&el.value.trim()){emit(el.value,'wedge');}
  });
  // 2) 厂家广播：Intent→WebView时调此函数，路径由厂家文档配一次即可
  window.PdaScanFeed=function(code){emit(code,'broadcast');};
  window.PdaScan={
    on:function(fn){if(typeof fn==='function')subs.push(fn);},
    emit:emit,
    // 扫码框一键绑定：回车或厂家广播都走同一回调
    bind:function(input,fn){
      if(typeof input==='string')input=document.querySelector(input);
      if(!input)return;
      input.setAttribute('data-scan-input','');
      if(fn)PdaScan.on(function(code){fn(code);});
    }
  };
})();
