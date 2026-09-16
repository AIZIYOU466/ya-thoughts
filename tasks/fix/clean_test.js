const fs = require('fs');
const rc = fs.readFileSync('/tmp/runauto.txt','utf8').replace('function runAutoClean() {\n','function runAutoCleanInner() {\n');
const ov = fs.readFileSync('/tmp/isoverdue.txt','utf8').match(/function isOverdue[\s\S]*?\n  \}/)[0];
let failed=0;
const assert=(c,m)=>{ if(!c){failed=1;console.error('FAIL: '+m);} else console.log('ok  - '+m); };
function LS(init){ const m=Object.assign({},init); return {
  getItem(k){ return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null; },
  setItem(k,v){ m[k]=String(v); }, dump:()=>m } }

async function run(init, notes, clock){
  // clock: {y,m,d,h,min} 模拟当前时间
  const at = new Date(clock.y||2026, (clock.m||1)-1, clock.d||10, clock.h||21, clock.min||0);
  const FakeDate = Object.assign(function(){ return new Date(at.getTime()); }, { now: ()=>at.getTime() });
  const store = LS(init);
  const calls = { cancel:[], delIds:null, toast:null, rendered:0, last:null };
  const vals = { localStorage:store, CLEAN_DONE_KEY:'auto_clean_done', CLEAN_EXPIRED_KEY:'auto_clean_expired',
    CLEAN_LAST_KEY:'auto_clean_last_date', notes, pad:n=>n<10?'0'+n:''+n, Date:FakeDate,
    isTodo:n=>n.type==='todo', isDone:n=>n.doneAt!=null,
    cancelNoteNotification:id=>calls.cancel.push(id),
    dbDeleteNotesWithImages:ids=>{ calls.delIds=ids.slice(); return Promise.resolve([]); },
    imgUrlCache:{}, renderList:()=>calls.rendered++, showUndoToast:t=>calls.toast=t,
    setCleanLastDate:y=>calls.last=y };
  const mk = new Function('localStorage','CLEAN_DONE_KEY','CLEAN_EXPIRED_KEY','CLEAN_LAST_KEY','notes','pad','Date',
    'isTodo','isDone','cancelNoteNotification','dbDeleteNotesWithImages','imgUrlCache','renderList',
    'showUndoToast','setCleanLastDate',
    'function cleanPref(k){return localStorage.getItem(k)==="1";}\n' + ov + '\n' + rc + '\nreturn runAutoCleanInner;');
  const inner = mk(...Object.values(vals));
  inner();
  await new Promise(r=>setTimeout(r,5));
  return { calls, store };
}

(async ()=>{
  const mkN = (id,o)=>Object.assign({id,type:'note',doneAt:null,dueAt:null},o||{});
  const BASE = new Date(2026,0,10,21,0).getTime(); // 与测试假时钟一致
  const list = [
    mkN('done2',{type:'todo',doneAt:200}),
    mkN('done1',{type:'todo',doneAt:100}),
    mkN('exp1',{type:'todo',dueAt:BASE-5e3}),
    mkN('exp2',{type:'todo',dueAt:BASE-9e3}),
    mkN('future',{type:'todo',dueAt:BASE+9e3}),
    mkN('plain'),
  ];

  let r = await run({}, list, {});
  assert(r.calls.delIds===null && r.calls.last===null, '1. 开关全关：不执行、不记录日期');

  r = await run({auto_clean_done:'1'}, list, {});
  assert(JSON.stringify(r.calls.delIds.sort())===JSON.stringify(['done1','done2']), '2. 只开已完成：仅删 done 两条。实际='+(r.calls.delIds||[]).join(','));
  assert(r.calls.toast==='已清理 2 条已完成，0 条已过期', '2. toast 文案。实际='+r.calls.toast);
  assert(r.calls.last==='2026-01-10', '2. 记录 last_date。实际='+r.calls.last);

  r = await run({auto_clean_expired:'1'}, list, {});
  console.log('DEBUG t3 delIds=', JSON.stringify(r.calls.delIds), 'last=', r.calls.last, 'toast=', r.calls.toast, 'cancel=', JSON.stringify(r.calls.cancel));
  assert(JSON.stringify((r.calls.delIds||[]).sort())===JSON.stringify(['exp1','exp2']), '3. 只开已过期：仅删过期两条。实际='+(r.calls.delIds||[]).join(','));

  r = await run({auto_clean_done:'1',auto_clean_expired:'1'}, list, {});
  assert(JSON.stringify(r.calls.delIds.sort())===JSON.stringify(['done1','done2','exp1','exp2']), '4. 都开：合并删 4 条。实际='+(r.calls.delIds||[]).join(','));
  assert(r.calls.toast==='已清理 2 条已完成，2 条已过期', '4. 计数组独立。实际='+r.calls.toast);

  r = await run({auto_clean_done:'1',auto_clean_last_date:'2026-01-10'}, list, {});
  assert(r.calls.delIds===null, '5. 今天已清理过：跳过');

  r = await run({auto_clean_done:'1'}, [mkN('future',{type:'todo',dueAt:BASE+9e3}), mkN('plain')], {});
  assert(r.calls.delIds===null && r.calls.last!==null && r.calls.toast===null, '6. 无可清理：只记日期，不 toast 不渲染');

  r = await run({auto_clean_done:'1',auto_clean_expired:'1'}, [mkN('both',{type:'todo',doneAt:100,dueAt:BASE-9e3})], {});
  assert(JSON.stringify(r.calls.delIds)===JSON.stringify(['both']) && r.calls.toast==='已清理 1 条已完成，0 条已过期',
    '7. 已完成优先：done+过期 只算一次。实际='+(r.calls.delIds||[]).join(',')+' | '+r.calls.toast);

  r = await run({auto_clean_done:'1'}, list, {h:10});
  assert(r.calls.delIds===null, '8. 早上 10:00：未到 20:00，跳过');
  r = await run({auto_clean_done:'1',auto_clean_last_date:'2026-01-09'}, list, {h:23});
  assert(r.calls.delIds && r.calls.delIds.length===2, '8. 深夜 23:00 且昨天已清理：今天照常执行（last_date 跨天失效）');

  console.log('DEBUG test3:', JSON.stringify(r.calls), r.store.dump());
  process.exit(failed);
})();
