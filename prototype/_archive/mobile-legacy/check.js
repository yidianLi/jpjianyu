



function t(x){var d=document.getElementById('t');if(d){d.textContent=x;d.classList.add('show');setTimeout(function(){d.classList.remove('show')},1800)}}
function goTab(k){document.querySelectorAll('.view').forEach(function(v){v.classList.toggle('on',v.id==='v-'+k)});document.querySelectorAll('nav button').forEach(function(b){b.classList.toggle('on',b.dataset.t===k)});if(k==='scan'&&window.startCamera)setTimeout(startCamera,100)}
function doScan(){var e=document.getElementById('scanList');if(e)e.innerHTML='<div class="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold">鐠囧棗鍩嗛幋鎰 璺?閻楁稒瑙︾敮?200 缁?/div>';t('閹殿偆鐖滈幋鎰')}
function doOcr(){var e=document.getElementById("ocrMsg");if(e)e.textContent="识别完成，请人工确认结果";t("OCR结果已返回")}
function saveBase(){localStorage.setItem("wms_app_base",document.getElementById("base").value);t("连接设置已保存")}
var signed=false,cv,ctx;function initPad(){cv=document.getElementById('pad');if(!cv)return;ctx=cv.getContext('2d');cv.width=cv.offsetWidth*2;cv.height=220;ctx.lineWidth=4;ctx.lineCap='round';ctx.strokeStyle='#10233f';var d=false,l=[0,0];cv.onpointerdown=function(e){d=true;var r=cv.getBoundingClientRect();l=[(e.clientX-r.left)*2,(e.clientY-r.top)*2]};cv.onpointermove=function(e){if(!d)return;var r=cv.getBoundingClientRect(),p=[(e.clientX-r.left)*2,(e.clientY-r.top)*2];ctx.beginPath();ctx.moveTo(l[0],l[1]);ctx.lineTo(p[0],p[1]);ctx.stroke();l=p;signed=true};window.onpointerup=function(){d=false}}
function clearPad(){if(ctx&&cv){ctx.clearRect(0,0,cv.width,cv.height);signed=false}}
function doSubmit(){if(!signed){t('鐠囧嘲鍘涚€瑰本鍨氱粵鎯ф倳');return}t('閹绘劒姘﹂幋鎰')}
function startCamera(){var v=document.getElementById('cameraVideo');if(!navigator.mediaDevices){t('閺冪姵纭剁拫鍐暏閹藉嫬鍎氭径杈剧礉鐠囬攱澧滈崝銊ㄧ翻閸?);return}navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(function(s){v.srcObject=s;v.classList.add('ready');t('閹藉嫬鍎氭径鏉戝嚒瀵偓閸?)}).catch(function(){t('鐠囧嘲鍘戠拋鍛婃啔閸嶅繐銇旈弶鍐')})}
document.addEventListener('DOMContentLoaded',initPad);

