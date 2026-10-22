/* PDA 扫码统一桥 pda-scan.js · 键盘楔 + 原生广播 二合一
 * 现场只要扫码(一维码/二维码),两条来源都收:
 *   1) 键盘楔:扫码键 = 键盘输入 + 回车,聚焦 input[data-scan-input] 即回收
 *   2) 原生广播:壳收到厂商扫描广播后调 window.PdaScanFeed(code, typeId)
 * 用法: PdaScan.on(function(code, source, typeId){...})
 *   source: 'broadcast'(硬件扫描) | 'wedge'(键盘回车) | 'manual'(手工输入)
 *   typeId: 码制 ID(取自 SDK SymbologyID:3=Code128 4=Code39 10=EAN13 17=QR 19=UPC-A …),-1 未知
 */
(function(){
  var subs=[];
  function symName(id){
    var m={3:'Code128',4:'Code39',10:'EAN13',19:'UPC-A',20:'UPC-E',8:'DataMatrix',
           15:'PDF417',17:'QR',48:'汉信码',59:'ITF-14',63:'ITF-25',100:'ALL'};
    return (id>=0&&m[id])?m[id]:(id>=0?('ID'+id):'未知');
  }
  function emit(raw,source,typeId){
    var code=String(raw||'').trim();
    if(!code)return;
    if(navigator.vibrate){try{navigator.vibrate(18);}catch(e){}}
    var t=(typeId===undefined||typeId===null)?-1:Number(typeId);
    subs.forEach(function(fn){try{fn(code,source||'wedge',t);}catch(e){}});
    try{document.dispatchEvent(new CustomEvent('pdaScan',
      {detail:{code:code,source:source||'wedge',type:t,sym:symName(t)}}));}catch(e){}
  }
  // 1) 键盘楔:扫码键=键盘输入+回车
  document.addEventListener('keydown',function(e){
    if(e.key!=='Enter')return;
    var el=document.activeElement;
    if(el&&el.hasAttribute&&el.hasAttribute('data-scan-input')&&el.value.trim()){
      emit(el.value,'wedge',-1);
    }
  });
  // 2) 原生广播:壳收到厂商扫描广播后调此函数(code, typeId)
  window.PdaScanFeed=function(code,typeId){emit(code,'broadcast',typeId);};
  window.PdaScan={
    on:function(fn){if(typeof fn==='function')subs.push(fn);},
    emit:emit,
    symName:symName,
    // 扫码框一键绑定:硬件广播与键盘回车都走同一回调
    bind:function(input,fn){
      if(typeof input==='string')input=document.querySelector(input);
      if(!input)return;
      input.setAttribute('data-scan-input','');
      if(fn)PdaScan.on(function(code){fn(code);});
    }
  };
})();
