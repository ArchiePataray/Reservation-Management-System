/* Runs the browser-only app in headless Chrome through CDP. No npm packages.
   Usage: node tests/browser-workflow.cjs */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const results = [], errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, socket, server, browserProfile;

async function main() {
  server = http.createServer((req, res) => {
    const relative = decodeURIComponent(req.url.split('?')[0]);
    const file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
      res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
      res.end(body);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port, debugPort = 9400 + Math.floor(Math.random() * 1000);
  browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'cmu-equipment-test-'));
  browser = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + browserProfile, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page'); if (target) break; }
    catch {}
    await pause(100);
  }
  if (!target) throw new Error('Chrome debugging connection failed.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  let seq = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const p = pending.get(data.id); pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error.message)); else p.resolve(data.result);
    }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async code => {
    const result = await cdp('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const check = async (name, code) => {
    const passed = await run(code);
    assert.equal(passed, true, name); results.push(name); console.log('PASS ' + name);
  };
  const waitReady = async () => {
    for (let i = 0; i < 100; i++) {
      try { if (await run(`document.readyState==='complete' && typeof db!=='undefined' && !!db && typeof A==='object'`)) return; }
      catch {}
      await pause(100);
    }
    throw new Error('App did not load: ' + errors.join('\n'));
  };
  const go = async route => { await run(`location.hash=${JSON.stringify('#/' + route)}`); await pause(80); };
  const login = async (id, password) => {
    await run(`if (me()) A.logout(); $('#uid').value=${JSON.stringify(id)}; $('#pw').value=${JSON.stringify(password)}; $('#lf').requestSubmit();`);
    await pause(600);
  };
  const signup = async (id, name, email, password) => {
    await run(`A.showSignup(); $('#sun').value=${JSON.stringify(name)}; $('#suid').value=${JSON.stringify(id)}; $('#sut').value='Student'; $('#sud').value='Test Department'; $('#sue').value=${JSON.stringify(email)}; $('#sup').value=${JSON.stringify(password)}; $('#sup2').value=${JSON.stringify(password)}; $('#sf').requestSubmit();`);
    await pause(80);
  };

  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-09T09:00:00+08:00']))}static now(){return new NativeDate('2026-10-09T09:00:00+08:00').getTime()}};` });
  await cdp('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/` }); await pause(600);
  await run('localStorage.clear(); location.reload()'); await pause(500); await waitReady();

  const year = await run('new Date().getFullYear()');
  const memberId = `${year}19001`, adminId = `${year}19002`;
  const memberPassword = `Member-${Date.now()}`, adminPassword = `Operator-${Date.now()}`;
  await check('First launch starts with no accounts, inventory, or transactions', `db.schemaVersion===11 && !db.users.length && !db.cats.length && !db.equipment.length && !db.res.length && !db.brw.length && !db.notes.length && !$('#login').hidden && !document.querySelector('.demo-accounts')`);
  await run('location.reload()'); await pause(500); await waitReady();
  await check('Empty inventory remains empty after refresh', `db.schemaVersion===11 && !db.cats.length && !db.equipment.length`);
  await check('First administrator setup is available only while no administrator exists', `!$('#admin-setup-link').hidden && $('#af').hidden`);
  await login(memberId, 'not-a-real-account');
  await check('Unknown account cannot log in', `!me() && $('#lerr').textContent.includes('Incorrect')`);
  await signup(memberId, 'Test Member', 'member@test.invalid', memberPassword);
  await check('Public signup creates a member account only', `usr(${JSON.stringify(memberId)}).role==='user' && !db.users.some(u=>u.role==='admin')`);
  await login(memberId, memberPassword);
  await check('Member can log in and sees empty-state counts', `me().id===${JSON.stringify(memberId)} && $('#uview').textContent.includes('0') && $('#uview').textContent.includes('No upcoming reservations')`);
  await go('equipment');
  await check('Member equipment page clearly shows the empty inventory', `$('#uview').textContent.includes('No equipment matches your filters')`);
  await pause(100);
  await run('A.logout()');
  await run(`A.showAdminSetup(); $('#an').value='Authorized Operator'; $('#aid').value=${JSON.stringify(adminId)}; $('#ad').value='Test Office'; $('#ae').value='operator@test.invalid'; $('#apw').value=${JSON.stringify(adminPassword)}; $('#apw2').value=${JSON.stringify(adminPassword)}; $('#af').requestSubmit();`);
  await check('First administrator setup requires explicit confirmation', `$('#modal').textContent.includes('cannot verify that you are authorized') && !db.users.some(user=>user.role==='admin')`);
  await run('A.yes()'); await pause(100);
  await check('First administrator is created with chosen credentials and setup closes', `usr(${JSON.stringify(adminId)}).role==='admin' && usr(${JSON.stringify(adminId)}).pw===${JSON.stringify(adminPassword)} && $('#af').hidden && $('#admin-setup-link').hidden`);
  await login(adminId, adminPassword);
  await check('Administrator can log in; public signup cannot assign that role', `me().id===${JSON.stringify(adminId)} && me().role==='admin' && db.users.find(u=>u.id===${JSON.stringify(memberId)}).role==='user'`);
  await check('Empty administrator dashboard counters are zero', `$('#aview').textContent.includes('Total Equipment') && $('#aview').textContent.includes('0') && $('#aview').textContent.includes('No reservations yet') && $('#aview').textContent.includes('No borrowing transactions yet')`);
  await go('analytics');
  await check('Analytics uses an empty state before activity exists', `$('#aview').textContent.includes('No reservation, borrowing, return, or inspection activity')`);
  await go('reports');
  await run(`$('#rf').value=today();$('#rto').value=today();A.gen({},$('[data-a="gen"]'));`); await pause(500);
  await check('Reports have no records before real transactions exist', `REP && REP.rows.length===0 && $('#rep').textContent.includes('No records found')`);

  await go('categories');
  await run(`A.catForm({});$('#cn').value='Test Equipment';A.saveCat({n:''});`);
  const category = await run('db.cats.at(-1).name');
  await check('Administrator can add a category', `db.cats.length===1 && db.cats[0].name==='Test Equipment'`);
  await go('equipment');
  await run(`A.eqForm({});$('#ek').value='TST-1001';$('#en').value='Test Projector';$('#ec').value=${JSON.stringify(category)};$('#eqq').value='4';$('#ed').value='Workflow test equipment';$('#eacq').value=today();A.saveEq({});`);
  await run(`A.eqForm({});$('#ek').value='TST-1002';$('#en').value='Test Microphone';$('#ec').value=${JSON.stringify(category)};$('#eqq').value='3';$('#ed').value='Second workflow test item';$('#eacq').value=today();A.saveEq({});`);
  await check('Administrator can create equipment with real inventory fields', `db.equipment.length===2 && eq('TST-1001').qty===4 && eq('TST-1001').acquired===today() && eq('TST-1002').qty===3`);
  await run('A.logout()'); await login(memberId, memberPassword);
  await go('reserve');
  await run(`draft={date:today(),s:'10:00',e:'12:00',purpose:'Workflow test reservation',notes:'Multiple-item test',items:[{eq:'TST-1001',qty:2},{eq:'TST-1002',qty:1}],step:1};render();`);
  await check('Multiple-item reservation schedule and stock validation work', `!validateDraft() && draft.items.length===2 && slotAvail('TST-1001',today(),'10:00','12:00')===4 && slotAvail('TST-1002',today(),'10:00','12:00')===3`);
  await run(`draft.step=2;A.submitRes({},$('[data-a="submitRes"]'));`); await pause(750);
  const rid = await run('db.res.at(-1).id');
  await check('Reservation submission stores linked equipment items and notification', `res(${JSON.stringify(rid)}).status==='PENDING' && res(${JSON.stringify(rid)}).items.length===2 && db.notes.some(n=>n.uid===${JSON.stringify(memberId)} && n.msg.includes(${JSON.stringify(rid)}))`);
  await run('A.logout()'); await login(adminId, adminPassword);
  await go('reservations');
  await run(`A.appr({id:${JSON.stringify(rid)}});A.yes();`);
  await check('Approval links audit record and QR to the reservation', `res(${JSON.stringify(rid)}).status==='APPROVED' && !!res(${JSON.stringify(rid)}).qr && res(${JSON.stringify(rid)}).approvals.at(-1).by===${JSON.stringify(adminId)}`);
  await go('verify');
  await run(`verifyValue('NONEXISTENT-ID')`);
  await check('Unknown reservation IDs are rejected by QR verification', `!REL && $('#verr').textContent.includes('Reservation not found')`);
  await run(`verifyValue(qrText(res(${JSON.stringify(rid)})));$$('.rck').forEach(c=>c.checked=true);A.release({id:${JSON.stringify(rid)}},$('[data-a="release"]'));`); await pause(750);
  const bid = await run(`brwOf(${JSON.stringify(rid)}).id`);
  await check('Verified approved reservation creates the linked borrowing record', `res(${JSON.stringify(rid)}).status==='BORROWED' && brwOf(${JSON.stringify(rid)}).id===${JSON.stringify(bid)} && brwOf(${JSON.stringify(rid)}).releasedBy===${JSON.stringify(adminId)}`);
  await run(`INSP={bid:${JSON.stringify(bid)},at:new Date().toISOString(),c:{0:'Good',1:'Needs Maintenance'},r:{0:'',1:'Maintenance test condition'},v:true};A.confirmReturn({id:${JSON.stringify(bid)}},$('#confirmRet'));A.yes();`); await pause(750);
  await check('Return inspection completes linked items and records condition history', `res(${JSON.stringify(rid)}).status==='COMPLETED' && brwOf(${JSON.stringify(rid)}).status==='RETURNED' && res(${JSON.stringify(rid)}).items.length===2 && eq('TST-1001').hist[0].rid===${JSON.stringify(rid)} && availQ(eq('TST-1001'))===4 && eq('TST-1002').maint===1 && availQ(eq('TST-1002'))===2`);
  await run('A.logout()'); await login(memberId, memberPassword);
  await go('reserve');
  await run(`draft={date:today(),s:'13:00',e:'14:00',purpose:'Rejection workflow test',notes:'',items:[{eq:'TST-1001',qty:1}],step:1};render();draft.step=2;A.submitRes({},$('[data-a="submitRes"]'));`); await pause(750);
  const rejectedRid = await run('db.res.at(-1).id');
  await run('A.logout()'); await login(adminId, adminPassword); await go('reservations');
  await run(`A.rej({id:${JSON.stringify(rejectedRid)}});A.doReject({id:${JSON.stringify(rejectedRid)}});`);
  await check('Rejection requires a reason', `res(${JSON.stringify(rejectedRid)}).status==='PENDING' && $('#rjerr').textContent.includes('reason')`);
  await run(`$('#rj').value='Not available for this schedule.';A.doReject({id:${JSON.stringify(rejectedRid)}});`);
  await check('Rejection records its reason, decision and member notification', `res(${JSON.stringify(rejectedRid)}).status==='REJECTED' && res(${JSON.stringify(rejectedRid)}).reason==='Not available for this schedule.' && db.notes.some(n=>n.uid===${JSON.stringify(memberId)}&&n.msg.includes('rejected'))`);
  await go('reports'); await run(`$('#rt').value='Return Report';$('#rf').value=today();$('#rto').value=today();A.gen({},$('[data-a="gen"]'));`); await pause(450);
  await check('Return report includes the actual completed transaction only', `REP.rows.length===1 && REP.rows[0].includes(${JSON.stringify(rid)}) && !REP.rows[0].includes(${JSON.stringify(rejectedRid)})`);
  await go('analytics');
  await check('Analytics reflects actual reservation and borrowing records', `!$('#aview').textContent.includes('No reservation, borrowing, return, or inspection activity') && $('#aview').textContent.includes('Reservation Frequency')`);
  await check('CSV export is available for a generated actual-record report', `REP.rows.length===1 && typeof A.csv==='function'`);
  await run('A.logout()'); await login(memberId, memberPassword);
  await check('Records persist across logout and login', `db.res.some(r=>r.id===${JSON.stringify(rid)}) && db.brw.some(b=>b.id===${JSON.stringify(bid)}) && localStorage.getItem(SKEY)===${JSON.stringify(memberId)}`);

  const widths = [1440, 1024, 768, 430, 390, 360];
  await run('A.logout()'); await login(adminId, adminPassword);
  for (const width of widths) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 641 });
    for (const route of ['dashboard', 'reservations', 'verify', 'borrowings', 'returns', 'equipment', 'categories', 'conditions', 'maintenance', 'users', 'analytics', 'reports', 'notifications', 'profile', 'settings']) {
      await go(route);
      await check(`Administrator ${route} renders at ${width}px without horizontal overflow`, `!!$('#aview').innerHTML && document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`);
    }
  }
  await run('A.logout()'); await login(memberId, memberPassword);
  for (const width of widths) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 641 });
    for (const route of ['dashboard', 'equipment', 'my', 'borrowed', 'history', 'notifications', 'profile']) {
      await go(route);
      await check(`Member ${route} renders at ${width}px without horizontal overflow`, `!!$('#uview').innerHTML && document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`);
    }
  }

  await run(`const cats=['Computing','Audio/Visual','Camera','Furniture','Other'].map(name=>({name,arch:false}));const items=[['PRJ-0001','Projector','Audio/Visual',5,'HD projector with HDMI and VGA cables.'],['LAP-0003','Laptop','Computing',10,'Core i5 laptop with charger for classroom and research use.'],['CAM-0002','Camera','Camera',2,'DSLR camera with tripod and memory card.'],['MIC-0001','Microphone','Audio/Visual',4,'Wireless handheld microphone set.'],['SPK-0001','Speaker','Audio/Visual',3,'Portable PA speaker with stand.'],['TBL-0001','Table','Furniture',12,'Folding event table, 6 ft.'],['EXT-0001','Extension Cord Set','Other',6,'5-meter extension cord with surge protection.'],['PRJ-0002','Projector #002','Audio/Visual',1,'Spare projector with lamp issue.'],['TRI-0001','Tripod','Camera',3,'Adjustable camera tripod with carrying bag.'],['SCR-0001','Projector Screen','Audio/Visual',2,'Portable pull-up projection screen.']].map(([id,name,cat,qty,desc])=>({id,name,cat,qty,desc,acquired:'',cond:'Good',status:'AVAILABLE',maint:0,flag:false,arch:false,hist:[]}));localStorage.setItem(KEY,JSON.stringify({...emptyData(),schemaVersion:10,cats,equipment:items}));location.reload();`); await pause(600); await waitReady();
  await check('Upgrade clears the exact unmodified project catalog', `db.schemaVersion===11 && !db.cats.length && !db.equipment.length`);
  await run(`const cats=['Audio-Visual','Computing & Accessories','Audio Equipment','Classroom & Event Equipment'].map(name=>({name,arch:false}));const items=[['AV-001','LCD Projector','Audio-Visual',2],['AV-002','Projection Screen','Audio-Visual',2],['CMP-001','Laptop','Computing & Accessories',3],['CMP-002','HDMI Cable','Computing & Accessories',6],['AUD-001','PA Speaker','Audio Equipment',2],['AUD-002','Wireless Microphone','Audio Equipment',4],['CLS-001','Extension Cord','Classroom & Event Equipment',4],['CLS-002','Webcam','Classroom & Event Equipment',2]].map(([id,name,cat,qty])=>({id,name,cat,qty,desc:'Suggested quantity; verify actual stock.',acquired:'',cond:'Good',status:'AVAILABLE',maint:0,flag:false,arch:false,hist:[]}));localStorage.setItem(KEY,JSON.stringify({...emptyData(),schemaVersion:9,cats,equipment:items}));location.reload();`); await pause(600); await waitReady();
  await check('Upgrade clears the exact untouched placeholder catalog', `db.schemaVersion===11 && !db.cats.length && !db.equipment.length`);
  await run(`const custom={...emptyData(),schemaVersion:10,cats:[{name:'Existing Category',arch:false}],equipment:[{id:'REAL-001',name:'Existing Equipment',cat:'Existing Category',qty:7,desc:'Existing user inventory',acquired:'',cond:'Good',status:'AVAILABLE',maint:0,flag:false,arch:false,hist:[]}]};localStorage.setItem(KEY,JSON.stringify(custom));location.reload();`); await pause(600); await waitReady();
  await check('Upgrade preserves customized existing inventory', `db.schemaVersion===11 && db.cats.length===1 && db.cats[0].name==='Existing Category' && db.equipment.length===1 && db.equipment[0].id==='REAL-001'`);
  await run(`localStorage.setItem(KEY,JSON.stringify({...db,schemaVersion:6}));localStorage.setItem(SKEY,${JSON.stringify(memberId)});location.reload();`); await pause(600); await waitReady();
  await check('Legacy browser data is hidden pending explicit reset without overwriting it', `legacyResetRequired && $('#modal').textContent.includes('permanently clears') && db.users.length===0 && JSON.parse(localStorage.getItem(KEY)).schemaVersion===6 && !localStorage.getItem(SKEY)`);
  await run(`A.migrationReset()`); await pause(100);
  await check('Confirmed clean-start reset clears old records and session', `!legacyResetRequired && !localStorage.getItem(SKEY) && db.users.length===0 && db.equipment.length===0 && db.res.length===0 && db.brw.length===0`);
  await run('location.reload()'); await pause(500); await waitReady();
  await check('Explicit reset stays empty after refresh', `db.schemaVersion===11 && !db.users.length && !db.equipment.length && !db.cats.length && !db.res.length && !db.brw.length && !db.notes.length && !me()`);
  await check('No browser JavaScript exceptions were recorded', `true`);
  if (errors.length) throw new Error(errors.join('\n'));

  fs.writeFileSync(path.join(__dirname, 'last-run.json'), JSON.stringify({ passed: results.length, failed: 0, checks: results, errors }, null, 2));
  console.log(`\n${results.length} checks passed.`);
}

main().catch(error => {
  console.error(error);
  try { fs.writeFileSync(path.join(__dirname, 'last-run.json'), JSON.stringify({ passed: results.length, failed: 1, checks: results, errors, failure: error.message }, null, 2)); } catch {}
  process.exitCode = 1;
}).finally(async () => {
  if (socket) socket.close();
  if (browser) {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    browser.kill(); await exited;
  }
  if (server) server.close();
  if (browserProfile) fs.rmSync(browserProfile, { recursive: true, force: true });
});
