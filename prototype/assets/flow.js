/* 审批流配置 · 全站共享 (S1~S6 + 提交 + 审核 + 仓管确认)
 * 工单类型: 物料7种 + 成品4种 + 调仓DB + 盘点PD
 * 规则: 提交后 S1=1; S2..S6 按绑定角色依次审批, 未绑定跳过; 最后一步为仓管员确认, 确认后才过账 */
(function(){
var KEY='jm_approve_flow_v1';
var CKEY='jm_approve_flow_custom_v1';
var BUILTIN_KEYS=['request','register','reject','inbound','issue','wreturn','return','fin_register','fin_inbound','fin_wreturn','fin_deliver','transfer','stocktake'];
var ROLES=['不绑定(跳过)','经办人','仓库管理员','内仓管理员','仓库负责人','监区/楼层负责人','车间领料员','成品交接员','系统管理员'];
var TYPES=[
 {k:'request',n:'物料·申请领料'},{k:'register',n:'物料·物料登记'},{k:'reject',n:'物料·来料拒收'},
 {k:'inbound',n:'物料·物料入库'},{k:'issue',n:'物料·物料领用'},{k:'wreturn',n:'物料·车间退料'},
 {k:'return',n:'物料·物料退库'},{k:'fin_register',n:'成品·成品登记'},{k:'fin_inbound',n:'成品·成品入库'},
 {k:'fin_wreturn',n:'成品·成品退仓'},{k:'fin_deliver',n:'成品·成品交付'},
 {k:'transfer',n:'仓储·库存调仓(DB)'},{k:'stocktake',n:'仓储·库存盘点(PD)'}
];
function defSteps(){return [
 {k:'S1',label:'提交',role:'经办人',on:true,auto:true},
 {k:'S2',label:'一级审批',role:'仓库负责人',on:true},
 {k:'S3',label:'二级审批',role:'监区/楼层负责人',on:false},
 {k:'S4',label:'三级审批',role:'不绑定(跳过)',on:false},
 {k:'S5',label:'四级审批',role:'不绑定(跳过)',on:false},
 {k:'S6',label:'仓管确认(完成)',role:'仓库管理员',on:true,last:true}
];}
function loadCustom(){try{var v=JSON.parse(localStorage.getItem(CKEY)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
function saveCustom(list){try{localStorage.setItem(CKEY,JSON.stringify(list||[]))}catch(e){}}
function customDef(key,name){return {k:key,n:name,custom:true}}
function load(){try{var v=JSON.parse(localStorage.getItem(KEY)||'null');if(v&&v.request){syncCustom(v);return v}}catch(e){}
 var o={};TYPES.forEach(function(t){o[t.k]={steps:defSteps(),updated:'2026-09-14 08:30',by:'系统管理员'}});syncCustom(o);try{localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}return o;}
function syncCustom(o){var list=loadCustom();var changed=false;
 list.forEach(function(c){if(!c||!c.k)return;if(!o[c.k]){o[c.k]={steps:defSteps(),updated:nowStr(),by:'系统管理员',custom:true,name:c.n||c.k};changed=true;}});
 Object.keys(o).forEach(function(k){if(BUILTIN_KEYS.indexOf(k)<0&&!list.some(function(c){return c&&c.k===k})){delete o[k];changed=true;}});
 if(changed)save(o);return o;}
function allTypes(){var o=load();var list=TYPES.filter(function(t){return o[t.k]});loadCustom().forEach(function(c){if(c&&c.k&&o[c.k]&&!list.some(function(t){return t.k===c.k}))list.push(customDef(c.k,c.n||c.k));});return list;}
function addCustom(name){name=String(name||'').trim();if(!name)return {ok:false,msg:'请填写工单类型名称'};
 var key='custom_'+Date.now().toString(36);
 var o=load();o[key]={steps:defSteps(),updated:nowStr(),by:'系统管理员',custom:true,name:name};
 var list=loadCustom();list.push({k:key,n:name});saveCustom(list);save(o);return {ok:true,key:key};}
function removeCustom(key){if(BUILTIN_KEYS.indexOf(key)>=0)return {ok:false,msg:'内置工单类型不可删除'};
 var o=load();delete o[key];var list=loadCustom().filter(function(c){return c.k!==key});saveCustom(list);save(o);return {ok:true};}
function save(o){try{localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}}
function cfg(type){var o=load();return o[type]||{steps:defSteps()};}
function activeSteps(type){return cfg(type).steps.filter(function(s){return s.on&&s.role!=='不绑定(跳过)'||s.auto||s.last});}
function ensureFlow(doc,type){if(!doc.flow)doc.flow={S1:0,S2:0,S3:0,S4:0,S5:0,S6:0,submitted:0,cur:'S1',done:0,hist:[]};return doc.flow;}
function nextPending(type,flow){var steps=cfg(type).steps;
 for(var i=0;i<steps.length;i++){var s=steps[i];if(!s.on)continue;if(s.role==='不绑定(跳过)'&&!s.auto&&!s.last)continue;
  if(!flow[s.k])return s;}
 return null;}
function flowText(type,flow){var steps=cfg(type).steps.filter(function(s){return s.on});
 return steps.map(function(s){return s.k+'='+(flow[ s.k]?1:0)+'('+(s.auto?'提交':s.last?'仓管确认':s.role)+')'}).join(' → ');}
window.ApproveFlow={KEY:KEY,CKEY:CKEY,BUILTIN_KEYS:BUILTIN_KEYS,ROLES:ROLES,TYPES:TYPES,load:load,save:save,loadCustom:loadCustom,saveCustom:saveCustom,allTypes:allTypes,addCustom:addCustom,removeCustom:removeCustom,cfg:cfg,activeSteps:activeSteps,ensureFlow:ensureFlow,nextPending:nextPending,flowText:flowText,
 submit:function(doc,type,by){var f=ensureFlow(doc,type);if(f.submitted){return {ok:false,msg:'已提交，请等待审核'};}
  f.submitted=1;f.S1=1;f.cur=(nextPending(type,f)||{}).k||'S6';(f.hist=f.hist||[]).push({t:nowStr(),act:'提交',by:by||'经办人',s:'S1=1'});
  return {ok:true,msg:'已提交，S1=1，后续按审批流审核'};},
 approve:function(doc,type,by,role,pass,note){var f=ensureFlow(doc,type);if(!f.submitted)return {ok:false,msg:'请先点“提交” (S1=1) 后再审核'};
  var nx=nextPending(type,f);if(!nx)return {ok:false,msg:'审批流已走完'};
  if(!pass){doc.status='已驳回';(f.hist=f.hist||[]).push({t:nowStr(),act:'驳回',by:by,step:nx.k,note:note||''});return {ok:true,reject:true,msg:'已驳回，退回经办人'};}
  f[nx.k]=1;(f.hist=f.hist||[]).push({t:nowStr(),act:'审核通过',by:by,step:nx.k+'('+(role||nx.role)+')',note:note||''});
  var left=nextPending(type,f);f.cur=left?left.k:'DONE';if(!left)f.done=1;
  return {ok:true,done:!left,step:nx.k,msg:left?nx.k+' 已通过，下一节点 '+left.k+'(' +left.role+')':'审批流走完，可做仓管确认/过账'};},
 needPost:function(doc,type){var f=ensureFlow(doc,type);return !!f.done;}
};
function nowStr(){var d=new Date();function p(x){return String(x).padStart(2,'0')}return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());}
})();
