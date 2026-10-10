const KEY = 'cmu_eq_db_v4', SKEY = 'cmu_eq_session_v4';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = (n, w = 4) => String(n).padStart(w, '0');
const ld = d => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
const today = () => ld(new Date());
const addDays = n => { const x = new Date(); x.setDate(x.getDate() + n); return ld(x); };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const D = d => d ? new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
const DS = d => new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const T = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m, 2)} ${h < 12 ? 'AM' : 'PM'}`; };
const clock = s => s ? new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
const DY = d => new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const dts = s => s ? `${DY(datePart(s))}, ${clock(s)}` : '—';
const dt = s => s ? `${D(datePart(s))} — ${clock(s)}` : '—';
const CLS = { AVAILABLE: 'g', APPROVED: 'g', COMPLETED: 'g', RETURNED: 'g', GOOD: 'g', ACTIVE: 'g', PENDING: 'y', FLAGGED: 'y', REJECTED: 'r', OVERDUE: 'r', 'MAJOR DAMAGE': 'r', MAINTENANCE: 'o', RESERVED: 'o', 'MINOR DAMAGE': 'o', 'NEEDS MAINTENANCE': 'o', BORROWED: 'b', CANCELLED: 'n', UNAVAILABLE: 'n', INACTIVE: 'n', ARCHIVED: 'n' };
const badge = s => `<span class="badge ${CLS[String(s).toUpperCase()] || 'n'}">${String(s).toUpperCase()}</span>`;
const EICON = { Projector: '📽️', Laptop: '💻', Camera: '📷', Microphone: '🎤', Speaker: '🔊', Table: '🪑', Extension: '🔌' };
const ico = e => EICON[e.name.split(' ')[0]] || '📦';
const CONDS = ['Good', 'Minor Damage', 'Major Damage', 'Needs Maintenance'];
const STATUSES = ['AVAILABLE', 'RESERVED', 'BORROWED', 'MAINTENANCE', 'UNAVAILABLE'];
const UNAV = 'Equipment is unavailable for the selected date and time.';
const UNAV_NAV = [['dashboard', 'Dashboard', '🏠'], ['equipment', 'Equipment', '📦'], ['reserve', 'Make Reservation', '➕'], ['my', 'My Reservations', '📋'], ['borrowed', 'My Borrowed Equipment', '🔄'], ['history', 'History', '↩️'], ['notifications', 'Notifications', '🔔'], ['profile', 'Profile', '👤']];
const ADM_NAV = [['dashboard', 'Dashboard', '🏠'], ['reservations', 'Reservations', '📅'], ['verify', 'QR Verification', '📷'], ['borrowings', 'Borrowing Transactions', '🔄'], ['returns', 'Return Transactions', '↩️'], ['equipment', 'Equipment', '🧰'], ['categories', 'Categories', '🏷️'], ['conditions', 'Condition History', '📋'], ['maintenance', 'Maintenance', '🛠️'], ['users', 'Users', '👥'], ['analytics', 'Analytics', '📈'], ['reports', 'Reports', '📊'], ['notifications', 'Notifications', '🔔'], ['profile', 'Profile', '👤'], ['settings', 'Settings', '⚙️']];
const TITLES = { verify: 'QR Verification and Equipment Release', returns: 'Return Equipment', maintenance: 'Condition and Maintenance', equipment: 'Equipment Management', categories: 'Category Management', users: 'User Management', analytics: 'Utilization Analytics', borrowings: 'Borrowing Transactions' };

let db, sess, REP, RST = null, F = {}, onYes = null, draft = null, TAB = 'pending', ATAB = 'PENDING', REL = null, INSP = null, AN = { p: 'monthly', from: '', to: '' }, lastW = window.innerWidth;
let legacyResetRequired = false, legacyStorageRaw = '';
const freshDraft = () => ({ date: '', s: '', e: '', purpose: '', notes: '', items: [{ eq: '', qty: 1 }], step: 1 });

function load() {
  const x = localStorage.getItem(KEY);
  if (!x) return emptyData();
  legacyStorageRaw = x;
  try {
    const data = JSON.parse(x);
    if (!data || !Number.isInteger(data.schemaVersion) || data.schemaVersion < 7) {
      legacyResetRequired = true;
      return emptyData();
    }
    if (data.schemaVersion < 11) removeUnmodifiedSampleCatalog(data);
    return migrateData(data);
  } catch (e) {
    console.error('Stored application data could not be read. Export a copy before resetting.', e);
    legacyResetRequired = true;
    return emptyData();
  }
}
function save() {
  if (legacyResetRequired) { toast('Resolve the existing-data notice before changing or saving records.', true); return false; }
  try { migrateData(db); localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch (e) { toast('Changes could not be saved. Browser storage is full or unavailable.', true); return false; }
}
function setSess(v) {
  try { v ? localStorage.setItem(SKEY, v) : localStorage.removeItem(SKEY); }
  catch (e) { toast('The login session could not be updated in browser storage.', true); sess = v; return false; }
  sess = v;
  return true;
}
const nid = (k, p) => `${p}-${pad(db.seq[k]++)}`;
const me = () => db.users.find(u => u.id === sess);
const usr = id => db.users.find(u => u.id === id) || { name: id, id };
const eq = id => db.equipment.find(e => e.id === id);
const res = id => db.res.find(r => r.id === id);
const brwOf = rid => db.brw.find(b => b.rid === rid);
const newest = (a, b) => (b.created || b.outAt || '').localeCompare(a.created || a.outAt || '');
const itemsText = its => its.map(i => `${esc(eq(i.eq).name)} ×${i.qty}`).join(', ');
const lineQ = (list, id) => list.reduce((a, x) => a + x.items.filter(i => i.eq === id).reduce((s, i) => s + i.qty, 0), 0);
const borrowedQ = id => lineQ(db.brw.filter(b => b.status === 'BORROWED'), id);
const reservedQ = id => lineQ(db.res.filter(r => r.status === 'APPROVED' && r.date === today() && dueAt(r) > new Date()), id);
const maintQ = e => e.status === 'MAINTENANCE' ? e.qty : Math.min(e.qty, e.maint || 0);
const availQ = e => e.status === 'UNAVAILABLE' ? 0 : Math.max(0, e.qty - borrowedQ(e.id) - maintQ(e));
const eqs = e => e.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : maintQ(e) >= e.qty ? 'MAINTENANCE' : availQ(e) === 0 ? 'BORROWED' : reservedQ(e.id) >= availQ(e) ? 'RESERVED' : 'AVAILABLE';
const needsAttention = e => !e.arch && (e.status === 'MAINTENANCE' || (e.maint || 0) > 0 || e.flag);
const dueAt = r => new Date(`${r.date}T${r.e}`);
const over = b => b.status === 'BORROWED' && dueAt(res(b.rid)) < new Date();
const qrStatus = r => ({ PENDING: 'Not generated yet', APPROVED: 'Generated — ready to present', BORROWED: 'Used for release', COMPLETED: 'Used', REJECTED: 'Not issued', CANCELLED: 'Voided' }[r.status]);
const activeCats = () => db.cats.filter(c => !c.arch).map(c => c.name);
const firstName = n => (n.includes(',') ? n.split(',')[1].trim() : n).split(/\s+/)[0];

function slotAvail(id, date, s, en, ign, sts) {
  const q = eq(id);
  if (!q || q.arch || q.status !== 'AVAILABLE') return 0;
  return Math.max(0, q.qty - maintQ(q) - stockDemand(id, date, s, en, ign, sts));
}

function notify(uid, msg, key) {
  if (!uid) return false;
  if (key && db.notes.some(n => n.key === key)) return false;
  db.notes.unshift({ id: 'NTF-' + crypto.randomUUID(), uid, msg, at: new Date().toLocaleString(), read: false, key: key || '' });
  return true;
}
function notifyAdmins(msg, key) {
  db.users.filter(u => u.role === 'admin' && u.active).forEach(u => notify(u.id, msg, key));
}
function sweep() {
  let ch = false;
  const now = new Date(), tom = addDays(1);
  db.res.filter(r => r.status === 'APPROVED' && r.date >= today() && r.date <= tom).forEach(r => { ch = notify(r.uid, `Reminder: your reservation ${r.id} is scheduled for ${r.date === today() ? 'today' : 'tomorrow'} at ${T(r.s)}.`, 'up-' + r.id) || ch; });
  db.brw.filter(b => b.status === 'BORROWED').forEach(b => {
    const r = res(b.rid), due = dueAt(r);
    if (due - now < 2 * 3600 * 1000) ch = notify(b.uid, `${due < now ? 'Overdue' : 'Due soon'}: please return the equipment for ${r.id} (due ${T(r.e)}).`, 'due-' + b.id + (due < now ? '-o' : '')) || ch;
    if (due < now) { notifyAdmins(`Overdue equipment: ${usr(b.uid).name} has not returned ${b.id} (due ${D(r.date)} ${T(r.e)}).`, 'od-' + b.id); ch = true; }
  });
  if (ch) save();
}
function toast(msg, bad) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' err2' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
function modal(html) {
  $('#modal').innerHTML = `<div class="mb" role="dialog" aria-modal="true" tabindex="-1"><button class="x" data-a="close" aria-label="Close">×</button>${html}</div>`;
  $('#modal').hidden = false;
  if (document.documentElement.dataset.device === 'desktop') { const f = $('#modal input,#modal select,#modal textarea'); if (f) f.focus(); }
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
function confirmDlg(msg, fn, label) {
  onYes = fn;
  modal(`<h3>Please confirm</h3><p>${msg}</p><div class="ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-a="yes">${label || 'Confirm'}</button></div>`);
}
function busy(el, label, fn, ms) {
  const startedSession = sess, startedRoute = location.hash;
  if (el) { el.disabled = true; el.dataset.t = el.textContent; el.textContent = label; }
  setTimeout(() => { if (el) { el.disabled = false; el.textContent = el.dataset.t; } if (startedSession === sess && startedRoute === location.hash) fn(); }, ms == null ? 650 : ms);
}
const lab = (heads, r) => { let i = 0; return r.replace(/<td([^>]*)>([\s\S]*?)<\/td>/g, (m, a, c) => `<td data-label="${esc(heads[i++] || '')}"${a}><div class="cv">${c}</div></td>`); };
const tbl = (heads, rows) => `<div class="tw"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => lab(heads, r)).join('') : `<tr><td colspan="${heads.length}" class="empty">No records found.</td></tr>`}</tbody></table></div>`;
const dl = o => `<dl>${Object.entries(o).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
const opts = (list, sel) => list.map(o => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');
const val = id => ($('#' + id) || { value: '' }).value.trim();
const panel = (title, body, extra) => `<div class="pn"><div class="pn-h"><span>${title}</span>${extra || ''}</div><div class="pn-b">${body}</div></div>`;
const stat = (icon, n, l, h) => `<a class="st" href="#/${h}"><span class="si">${icon}</span><div><b>${n}</b><small>${l}</small></div></a>`;
const loading = t => `<div class="loading" role="status">${t || 'Loading...'}</div>`;
function drawQR(el, text) {
  if (!el) return;
  el.innerHTML = '';
  try { new QRCode(el, { text, width: 216, height: 216, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { el.innerHTML = `<p role="alert">The QR code could not be generated. The administrator can verify your reservation ID instead.</p>`; }
}
// The compact QR references the canonical reservation, including its borrower,
// schedule, all equipment items, approval and current status.
const qrText = r => JSON.stringify({ q: r.qr.id, r: r.id });

function unitStats() {
  const s = { a: 0, b: 0, r: 0, m: 0, u: 0 };
  db.equipment.filter(e => !e.arch).forEach(e => {
    if (e.status === 'UNAVAILABLE') { s.u += e.qty; return; }
    const m = maintQ(e), bo = Math.min(e.qty - m, borrowedQ(e.id)), rs = Math.min(e.qty - m - bo, reservedQ(e.id));
    s.m += m; s.b += bo; s.r += rs; s.a += e.qty - m - bo - rs;
  });
  return s;
}
function donut(parts) {
  const sum = parts.reduce((a, p) => a + p[1], 0);
  if (!sum) return '<p class="empty">No equipment or activity to chart.</p>';
  const tot = sum;
  let acc = 0;
  const stops = parts.map(p => { const a = acc / tot * 100; acc += p[1]; return `${p[2]} ${a}% ${acc / tot * 100}%`; }).join(',');
  return `<div class="donut"><div class="ring" style="background:conic-gradient(${stops})" role="img" aria-label="Distribution chart"></div><div class="lg">${parts.map(p => `<span data-a="pt" data-t="${esc(p[0])}: ${p[1]}"><i style="background:${p[2]}"></i>${esc(p[0])}: ${p[1]} (${Math.round(p[1] / tot * 100)}%)</span>`).join('')}</div></div>`;
}
function bars(rows, suffix, mx) {
  if (!rows.length) return '<p class="empty">No data for the selected period.</p>';
  const sf = v => typeof suffix === 'function' ? suffix(v) : suffix;
  const top = mx || Math.max(1, ...rows.map(r => r[1]));
  return rows.map(r => `<div class="hb"><span class="l">${esc(r[0])}</span><span class="t"><i style="width:${r[1] / top * 100}%" data-a="pt" data-t="${esc(r[0])}: ${r[1]}${sf(r[1])}" title="${esc(r[0])}: ${r[1]}${sf(r[1])}"></i></span><span class="v">${r[1]}${sf(r[1])}</span></div>`).join('');
}
function lineSvg(vals, labels, wd, step) {
  const W = Math.max(240, wd || 420), H = 170, n = vals.length, top = Math.max(2, ...vals);
  const px = i => 30 + (n > 1 ? i * ((W - 45) / (n - 1)) : 0), py = v => H - 25 - v / top * (H - 45);
  const grid = [0, .5, 1].map(f => `<line x1="30" x2="${W - 15}" y1="${py(top * f)}" y2="${py(top * f)}" stroke="#e5e7eb"/><text x="24" y="${py(top * f) + 4}" text-anchor="end">${Math.round(top * f)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Trend chart">${grid}<polyline fill="none" stroke="#1f55a5" stroke-width="2" points="${vals.map((v, i) => `${px(i)},${py(v)}`).join(' ')}"/>${vals.map((v, i) => `<circle cx="${px(i)}" cy="${py(v)}" r="4" fill="#1f55a5" style="cursor:pointer" data-a="pt" data-t="${esc(labels[i])}: ${v}"><title>${esc(labels[i])}: ${v}</title></circle>${i % (step || 1) === 0 ? `<text x="${px(i)}" y="${H - 6}" text-anchor="middle">${esc(labels[i])}</text>` : ''}`).join('')}</svg>`;
}
const chartBox = (vals, labels, step) => vals.some(v => v > 0) ? `<div class="chart" data-vals="${esc(JSON.stringify(vals))}" data-labels="${esc(JSON.stringify(labels))}" data-step="${step || 1}">${lineSvg(vals, labels, 0, step)}</div>` : '<p class="empty">No activity in this period.</p>';
function fitCharts() { $$('.chart').forEach(c => { if (c.clientWidth) c.innerHTML = lineSvg(JSON.parse(c.dataset.vals), JSON.parse(c.dataset.labels), c.clientWidth, +c.dataset.step); }); }

const eqBar = () => buildEquipmentToolbar();
function eqFiltered() {
  const k = (F.q || '').toLowerCase();
  return db.equipment.filter(e => !e.arch && (!k || (e.name + e.id + e.cat).toLowerCase().includes(k)) && (!F.cat || e.cat === F.cat) && (!F.st || eqs(e) === F.st));
}
function ecCard(e) {
  const st = eqs(e), off = availQ(e) < 1 || st === 'MAINTENANCE' || st === 'UNAVAILABLE';
  return `<div class="ec" tabindex="0" data-a="eqv" data-id="${e.id}"><div class="ect"><span class="ic">${ico(e)}</span>${badge(st)}</div><b>${esc(e.name)}</b><small>${e.id} · ${esc(e.cat)}</small><div class="ecm">Available: <b>${availQ(e)} / ${e.qty}</b></div><div class="ecm">Condition: ${esc(e.cond)}</div><button class="btn sm" data-a="reserveEq" data-id="${e.id}" ${off ? 'disabled' : ''}>Reserve</button></div>`;
}

function resCard(r) {
  const b = brwOf(r.id), can = ['PENDING', 'APPROVED'].includes(r.status);
  let note = '';
  if (r.status === 'PENDING') note = '<div class="note warn">Waiting for administrator approval.</div>';
  if (r.status === 'APPROVED') note = '<div class="note good">Approved. Present your QR code to the administrator at equipment release.</div>';
  if (r.status === 'BORROWED') note = `<div class="note">Borrowed ${dt(b && b.outAt)}. Please return by ${T(r.e)} on ${D(r.date)}.</div>`;
  if (r.status === 'REJECTED') note = `<div class="note bad"><b>Rejected.</b> ${esc(r.reason)}</div>`;
  if (r.status === 'COMPLETED') note = `<div class="note good">Returned ${dt(b && b.retAt)}.</div>`;
  return `<div class="rc"><div class="rt"><b>${r.id}</b>${badge(r.status)}</div><div class="rm">${D(r.date)} · ${T(r.s)} - ${T(r.e)}</div><ul class="its">${r.items.map(i => `<li>${esc(eq(i.eq).name)} ×${i.qty}</li>`).join('')}</ul><div class="rm">Purpose: ${esc(r.purpose)}</div><div class="rm">QR code: ${qrStatus(r)}</div>${note}<div class="two"><button class="btn ghost" data-a="vres" data-id="${r.id}">View Details</button>${r.status === 'APPROVED' ? `<button class="btn" data-a="qr" data-id="${r.id}">View QR Code</button>` : ''}${can ? `<button class="btn bad" data-a="cancel" data-id="${r.id}">Cancel</button>` : ''}${r.status === 'REJECTED' ? '<a class="btn" href="#/reserve">Make Another Reservation</a>' : ''}</div></div>`;
}
const resMini = r => `<div class="li"><div><b>${r.id}</b> · ${itemsText(r.items)}<small>${D(r.date)} | ${T(r.s)} - ${T(r.e)}</small></div><div class="act">${badge(r.status)}<button class="btn sm ghost" data-a="vres" data-id="${r.id}">View</button></div></div>`;
const noteList = uid => { const L = db.notes.filter(n => n.uid === uid).slice(0, 5); return L.length ? L.map(n => `<div class="li"><div>${esc(n.msg)}<small>${esc(n.at)}</small></div>${n.read ? '' : '<span class="badge b">NEW</span>'}</div>`).join('') : '<p class="empty">No notifications yet.</p>'; };

function resDetail(id) {
  const r = res(id);
  if (!canViewReservation(r)) return toast('Reservation not found or unavailable to your account.', true);
  const b = brwOf(id), ad = me().role === 'admin', u = usr(r.uid);
  const info = { 'Reservation ID': r.id, 'CMU ID': u.id, Requester: esc(u.name), Date: D(r.date), Time: `${T(r.s)} - ${T(r.e)}`, Purpose: esc(r.purpose), 'Additional notes': esc(r.notes) || 'None', Status: badge(r.status), 'QR code': qrStatus(r), Submitted: dt(r.created) };
  if (['APPROVED', 'BORROWED', 'COMPLETED'].includes(r.status) && r.decided) info.Approval = `Approved ${dt(r.decided)} by Administrator`;
  if (r.status === 'REJECTED') { info.Decision = `Rejected ${dt(r.decided)}`; info.Reason = esc(r.reason); }
  if (r.status === 'CANCELLED') info.Cancelled = dt(r.cancelledAt);
  if (b) { info.Borrowed = dt(b.outAt); if (b.retAt) info.Returned = dt(b.retAt); }
  const rows = r.items.map((i, k) => { const bi = b && b.items[k]; return `<tr><td>${esc(eq(i.eq).name)}</td><td>${i.eq}</td><td>${i.qty}</td>${b && b.status === 'RETURNED' ? `<td>${badge(bi.cond)}</td>` : ''}</tr>`; });
  let acts = '';
  if (ad && r.status === 'PENDING') acts = `<button class="btn ok" data-a="appr" data-id="${r.id}">Approve</button><button class="btn bad" data-a="rej" data-id="${r.id}">Reject</button>`;
  if (!ad && r.status === 'APPROVED') acts = `<button class="btn" data-a="qr" data-id="${r.id}">View QR Code</button>`;
  if (!ad && ['PENDING', 'APPROVED'].includes(r.status)) acts += `<button class="btn bad" data-a="cancel" data-id="${r.id}">Cancel Reservation</button>`;
  modal(`<h3>Reservation Details</h3>${dl(info)}<h3 style="margin-top:12px">Equipment Items</h3>${tbl(['Equipment', 'ID', 'Qty', ...(b && b.status === 'RETURNED' ? ['Condition'] : [])], rows)}${acts ? `<div class="ft">${acts}</div>` : ''}`);
}
function showQR(id) {
  const r = res(id);
  if (!canViewReservation(r) || r.status !== 'APPROVED' || !r.qr) return toast('A QR code is available only for your approved reservation.', true);
  const u = usr(r.uid);
  modal(`<h3>Reservation QR Code</h3><div class="qr"><div id="qrc"></div></div>${dl({ 'Reservation ID': r.id, 'CMU ID': u.id, Name: esc(u.name), Date: D(r.date), Time: `${T(r.s)} - ${T(r.e)}`, Equipment: itemsText(r.items), Status: badge(r.status) })}<p class="note">Present this QR code to the administrator during equipment release.</p>`);
  drawQR($('#qrc'), qrText(r));
}
function eqDetail(id) {
  const e = eq(id), st = eqs(e), ad = me().role === 'admin';
  modal(`<h3>${ico(e)} ${esc(e.name)}</h3>${dl({ 'Equipment ID': e.id, Category: esc(e.cat), 'Total quantity': e.qty, 'Available now': `${availQ(e)} / ${e.qty}`, 'Under maintenance': maintQ(e), Status: badge(st), Condition: badge(e.cond), Description: esc(e.desc) })}<div class="ft">${ad ? `<button class="btn ghost" data-a="hist" data-id="${e.id}">Condition History</button><button class="btn" data-a="eqForm" data-id="${e.id}">Edit</button>` : `<button class="btn" data-a="reserveEq" data-id="${e.id}" ${availQ(e) < 1 || st === 'MAINTENANCE' || st === 'UNAVAILABLE' ? 'disabled' : ''}>Reserve This Equipment</button>`}</div>`);
}
function histModal(id) {
  const e = eq(id);
  modal(`<h3>Condition History</h3><p><b>${esc(e.name)}</b> ${e.id}</p>${e.hist.length ? `<div class="tl">${e.hist.map(h => `<div><b>${dt(h.date)}</b><div>${badge(h.cond)}</div><div class="mut">Returned by: ${usr(h.by).role === 'admin' ? 'Equipment office' : esc(h.by)}${usr(h.by).role !== 'admin' && usr(h.by).name !== h.by ? ' (' + esc(usr(h.by).name) + ')' : ''}</div><div>Remarks: ${esc(h.rem) || '—'}</div></div>`).join('')}</div>` : '<p class="empty">No condition records yet.</p>'}`);
}

const slotMsg = it => {
  if (!it.eq) return ['', ''];
  const e = eq(it.eq);
  if (!draft.date || !draft.s || !draft.e || draft.e <= draft.s) return [`Total stock: ${e.qty}. Choose a date and time to check availability.`, ''];
  const n = slotAvail(it.eq, draft.date, draft.s, draft.e);
  if (n < 1) return [UNAV, 'bad'];
  if (it.qty > n) return [`Only ${n} available for the selected schedule.`, 'bad'];
  return [`Available for this schedule: ${n}`, 'ok'];
};
function validateDraft() {
  const d = draft;
  if (!d || !validDate(d.date)) return 'Please select a valid date.';
  if (d.date < today()) return 'Date cannot be in the past.';
  if (!validTime(d.s) || !validTime(d.e)) return 'Please select a valid start time and end time.';
  if (d.e <= d.s) return 'End time must be later than the start time.';
  if (new Date(`${d.date}T${d.s}`) <= new Date()) return 'Start time must be in the future.';
  if (d.purpose.length < 3) return 'Please enter the purpose of the reservation.';
  if (!d.items.length || d.items.some(i => !i.eq)) return 'Select equipment for every row, or remove the empty row.';
  const seen = new Set();
  for (const i of d.items) {
    const e = eq(i.eq);
    if (!e) return 'Select valid equipment for every row.';
    if (seen.has(i.eq)) return `${e.name} was added more than once. Change its quantity instead.`;
    seen.add(i.eq);
    if (!Number.isInteger(i.qty) || i.qty < 1) return `Enter a whole-number quantity of at least 1 for ${e.name}.`;
    if (i.qty > e.qty) return `Only ${e.qty} ${e.name} exist in total.`;
    const n = slotAvail(i.eq, d.date, d.s, d.e);
    if (n < 1) return `${e.name}: ${UNAV}`;
    if (i.qty > n) return `Not enough ${e.name} for the selected schedule (requested ${i.qty}, available ${n}).`;
  }
  return '';
}
function readDraft() {
  if (!draft || draft.step !== 1 || !$('#rd')) return;
  draft.date = val('rd'); draft.s = val('rs'); draft.e = val('rend'); draft.purpose = val('rp'); draft.notes = val('rn');
  draft.items = $$('.ir').map(row => ({ eq: $('select', row).value, qty: Number($('input', row).value) }));
}
function paintAvail() { draft.items.forEach((it, i) => { const m = $('#av' + i), [t, c] = slotMsg(it); if (m) { m.textContent = t; m.className = 'avl ' + c; } }); }

const UV = {
  dashboard() {
    const u = me(), mine = db.res.filter(r => r.uid === sess), c = s => mine.filter(r => r.status === s).length;
    const avail = db.equipment.filter(e => !e.arch && availQ(e) > 0 && ['AVAILABLE', 'RESERVED'].includes(eqs(e))).length;
    const active = mine.filter(r => ['PENDING', 'APPROVED', 'BORROWED'].includes(r.status)).length;
    const up = mine.filter(r => ['PENDING', 'APPROVED'].includes(r.status) && r.date >= today()).sort((a, b) => (a.date + a.s).localeCompare(b.date + b.s)).slice(0, 4);
    return `<div class="welcome"><h3>Welcome, ${esc(firstName(u.name))}!</h3><p class="mut">CMU ID: <b>${u.id}</b> · ${esc(u.type)}</p></div><div class="stats">${stat('📦', avail, 'Available Equipment', 'equipment')}${stat('📋', active, 'Active Reservations', 'my')}${stat('⏳', c('PENDING'), 'Pending', 'my')}${stat('✅', c('APPROVED'), 'Approved', 'my')}${stat('🔄', c('BORROWED'), 'Currently Borrowed', 'borrowed')}</div>${panel('Upcoming Reservations', up.length ? up.map(resMini).join('') : '<p class="empty">No upcoming reservations. <a href="#/reserve">Make a reservation</a></p>', '<a class="btn sm ghost" href="#/my">View All</a>')}${panel('Notifications', noteList(sess))}`;
  },
  equipment: () => `${eqBar()}<div id="list">${LISTS['user/equipment']()}</div>`,
  reserve() {
    draft = draft || freshDraft();
    const d = draft;
    if (d.step === 2) {
      return `<div class="fm"><h3>Review Reservation</h3>${dl({ Requester: `${esc(me().name)} (${sess})`, Date: D(d.date), Time: `${T(d.s)} - ${T(d.e)}`, Purpose: esc(d.purpose) })}<h3 style="margin-top:12px">Equipment</h3><ul class="its big">${d.items.map(i => `<li><span>${ico(eq(i.eq))} ${esc(eq(i.eq).name)}</span><b>Qty: ${i.qty}</b></li>`).join('')}</ul><p class="note good">All items are available for the selected schedule.</p><div id="rerr" class="err"></div><div class="ft"><button class="btn ghost" data-a="editRes">Back to Edit</button><button class="btn ok" data-a="submitRes">Submit Reservation</button></div></div>`;
    }
    const rows = d.items.map((it, i) => { const [t, c] = slotMsg(it); return `<div class="irw"><div class="ir"><select data-chk aria-label="Equipment ${i + 1}"><option value="">Select equipment...</option>${db.equipment.filter(e => !e.arch).map(e => `<option value="${e.id}" ${e.id === it.eq ? 'selected' : ''} ${['MAINTENANCE', 'UNAVAILABLE'].includes(eqs(e)) ? 'disabled' : ''}>${esc(e.name)} (${availQ(e)}/${e.qty})</option>`).join('')}</select><div class="qty"><button type="button" data-a="qty" data-i="${i}" data-d="-1" aria-label="Decrease quantity">−</button><input type="number" min="1" value="${it.qty}" data-chk aria-label="Quantity ${i + 1}"><button type="button" data-a="qty" data-i="${i}" data-d="1" aria-label="Increase quantity">+</button></div><button type="button" class="sq bad" data-a="rmItem" data-i="${i}" title="Remove" aria-label="Remove equipment ${i + 1}">✕</button></div><small id="av${i}" class="avl ${c}">${t}</small></div>`; }).join('');
    return `<div class="fm"><h3>New Reservation</h3><label for="rd">Date</label><input id="rd" type="date" min="${today()}" value="${d.date}" data-chk><div class="row2"><div><label for="rs">Start time</label><input id="rs" type="time" value="${d.s}" data-chk></div><div><label for="rend">End time</label><input id="rend" type="time" value="${d.e}" data-chk></div></div><label for="rp">Purpose</label><input id="rp" placeholder="Describe the purpose of your reservation" value="${esc(d.purpose)}" data-chk><h3 style="margin-top:16px">Equipment</h3><div id="items">${rows}</div><button type="button" class="btn ghost" style="margin-top:8px" data-a="addItem">+ Add Equipment</button><div id="rerr" class="err"></div><button class="btn full" data-a="toReview">Review Reservation</button></div>`;
  },
  my() {
    const mine = db.res.filter(r => r.uid === sess).sort(newest), G = { pending: ['PENDING'], approved: ['APPROVED'], borrowed: ['BORROWED'], history: ['COMPLETED', 'REJECTED', 'CANCELLED'] };
    const L = mine.filter(r => G[TAB].includes(r.status));
    const tab = (k, l) => `<button class="${TAB === k ? 'on' : ''}" data-a="tab" data-t="${k}">${l}<span class="cnt">${mine.filter(r => G[k].includes(r.status)).length}</span></button>`;
    return `<div class="tabs">${tab('pending', 'Pending')}${tab('approved', 'Approved')}${tab('borrowed', 'Borrowed')}${tab('history', 'History')}</div>${L.length ? `<div class="rgrid">${L.map(resCard).join('')}</div>` : '<p class="empty">No reservations in this list yet.</p>'}`;
  },
  profile() {
    const u = me();
    return `<div class="fm"><h3>My Account</h3>${dl({ 'CMU ID': u.id, 'Member type': esc(u.type), 'Member since': /^\d{9}$/.test(u.id) ? u.id.slice(0, 4) : '—' })}<label for="pn">Full name</label><input id="pn" value="${esc(u.name)}"><label for="pd">Department / College</label><input id="pd" value="${esc(u.dept || '')}"><label for="pe">Email</label><input id="pe" value="${esc(u.email)}"><label for="pc">Current password (to change)</label><input id="pc" type="password"><label for="pp">New password</label><input id="pp" type="password"><div id="perr" class="err"></div><button class="btn full" data-a="saveProfile">Save Changes</button><button class="btn ghost full" style="margin-top:8px" data-a="logout">Logout</button></div>`;
  }
};
const REPORTS = ['Reservation Report', 'Borrowing Report', 'Return Report', 'Equipment Utilization Report', 'Equipment Condition Report', 'Maintenance Report'];
const adminResRow = r => { const u = usr(r.uid); return `<tr><td>${r.id}</td><td>${esc(u.name)}<br><small>CMU ID ${u.id}</small></td><td>${D(r.date)}<br><small>${T(r.s)} - ${T(r.e)}</small></td><td class="wrap">${itemsText(r.items)}</td><td class="wrap">${esc(r.purpose)}</td><td>${badge(r.status)}</td><td><div class="act"><button class="btn sm ghost" data-a="vres" data-id="${r.id}">View Details</button>${r.status === 'PENDING' ? `<button class="btn sm ok" data-a="appr" data-id="${r.id}">Approve</button><button class="btn sm bad" data-a="rej" data-id="${r.id}">Reject</button>` : ''}</div></td></tr>`; };
const LISTS = {
  'user/equipment': () => { const L = eqFiltered(); return L.length ? `<div class="egrid">${L.map(ecCard).join('')}</div>` : '<p class="empty">No equipment matches your filters.</p>'; },
  'admin/equipment': () => tbl(['Equipment ID', 'Name', 'Category', 'Total', 'Available', 'Condition', 'Status', 'Actions'], eqFiltered().map(e => `<tr><td>${e.id}</td><td>${ico(e)} ${esc(e.name)}</td><td>${esc(e.cat)}</td><td>${e.qty}</td><td>${availQ(e)}</td><td>${badge(e.cond)}${e.flag ? ' ' + badge('Flagged') : ''}</td><td>${badge(eqs(e))}</td><td><div class="act"><button class="btn sm ghost" data-a="eqv" data-id="${e.id}">View</button><button class="btn sm" data-a="eqForm" data-id="${e.id}">Edit</button><button class="btn sm ghost" data-a="hist" data-id="${e.id}">History</button><button class="btn sm bad" data-a="arch" data-id="${e.id}">Archive</button></div></td></tr>`)),
  'admin/reservations': () => {
    const G = { PENDING: ['PENDING'], APPROVED: ['APPROVED', 'BORROWED'], REJECTED: ['REJECTED'], COMPLETED: ['COMPLETED'], ALL: null }, k = (F.q || '').toLowerCase();
    const L = db.res.filter(r => (!G[ATAB] || G[ATAB].includes(r.status)) && (!k || (r.id + usr(r.uid).name + r.uid + itemsText(r.items)).toLowerCase().includes(k))).sort(newest);
    return tbl(['Reservation ID', 'Requester', 'Date / Time', 'Equipment Items', 'Purpose', 'Status', 'Actions'], L.map(adminResRow));
  },
  'admin/borrowings': () => {
    const k = (F.q || '').toLowerCase();
    const L = db.brw.filter(b => (!F.st || (F.st === 'OVERDUE' ? over(b) : b.status === F.st)) && (!k || (b.id + b.rid + usr(b.uid).name + b.uid + itemsText(b.items)).toLowerCase().includes(k))).sort(newest);
    return tbl(['Transaction', 'Borrower', 'Equipment', 'Borrowed', 'Due', 'Returned', 'Status', 'Action'], L.map(b => { const r = res(b.rid); return `<tr><td>${b.id}<br><small>${b.rid}</small></td><td>${esc(usr(b.uid).name)}<br><small>CMU ID ${b.uid}</small></td><td class="wrap">${itemsText(b.items)}</td><td>${dts(b.outAt)}</td><td>${DY(r.date)}<br><small>${T(r.e)}</small></td><td>${b.retAt ? dts(b.retAt) : '—'}</td><td>${badge(b.status)} ${over(b) ? badge('Overdue') : ''}</td><td><div class="act"><button class="btn sm ghost" data-a="vres" data-id="${b.rid}">View</button>${b.status === 'BORROWED' ? `<a class="btn sm" href="#/returns/${b.id}">Process Return</a>` : ''}</div></td></tr>`; }));
  }
};
const listKey = () => me().role + '/' + route()[0];
const route = () => location.hash.replace('#/', '').split('/');

function inspectView(bid) {
  const b = db.brw.find(x => x.id === bid);
  if (!b || b.status !== 'BORROWED') return panel('Return Equipment', '<p class="empty">This transaction is not awaiting return.</p><a class="btn" href="#/returns">Back to Returns</a>');
  if (!INSP || INSP.bid !== bid) INSP = { bid, at: new Date().toISOString(), c: {}, r: {}, v: false };
  const u = usr(b.uid), r = res(b.rid), n = b.items.length;
  const cards = b.items.map((it, i) => { const e = eq(it.eq); return `<div class="insp"><h3>${ico(e)} ${esc(e.name)} ${e.id} × ${it.qty}</h3><p class="mut">Condition After Return</p><div class="radios">${CONDS.map(c => `<label><input type="radio" name="c${i}" value="${c}" data-ins="${i}" ${INSP.c[i] === c ? 'checked' : ''}>${c}</label>`).join('')}</div><label for="rem${i}">Remarks</label><textarea id="rem${i}" rows="2" data-rem="${i}" placeholder="Required when the equipment is not in good condition">${esc(INSP.r[i] || '')}</textarea></div>`; }).join('');
  const done = Object.keys(INSP.c).length;
  return panel(`Returned Equipment — Inspection (${b.id})`, `${dl({ 'Reservation': `${r.id} · ${D(r.date)} ${T(r.s)} - ${T(r.e)}`, Borrower: `${esc(u.name)} (${u.id})`, Borrowed: dt(b.outAt), Returned: dt(INSP.at) })}<label class="chk"><input type="checkbox" id="ckv" data-ins-v ${INSP.v ? 'checked' : ''}> I verified the transaction: the borrower and the returned items match this record.</label><h3 style="margin:12px 0 8px">Inspect each item</h3>${cards}<p id="inspprog" class="mut">${done} of ${n} items inspected</p><div id="ierr" class="err"></div><div class="ft"><a class="btn ghost" href="#/returns">Cancel</a><button id="confirmRet" class="btn ok" data-a="confirmReturn" data-id="${b.id}" ${done === n && INSP.v ? '' : 'disabled'}>Confirm Return &amp; Update Equipment</button></div>`);
}
function updateInsp() {
  const b = db.brw.find(x => x.id === INSP.bid), done = Object.keys(INSP.c).length, p = $('#inspprog'), c = $('#confirmRet');
  if (p) p.textContent = `${done} of ${b.items.length} items inspected`;
  if (c) c.disabled = !(done === b.items.length && INSP.v);
}
function relPanel() {
  const r = res(REL.rid), u = usr(r.uid);
  if (REL.done) {
    const b = db.brw.find(x => x.id === REL.done);
    return panel('Equipment Released', `<div class="note good"><b>Equipment released successfully.</b> Borrowing transaction ${b.id} recorded ${dt(b.outAt)}.</div>${dl({ Borrower: `${esc(u.name)} (${u.id})`, Equipment: itemsText(r.items), Status: badge('BORROWED') })}<a class="btn" href="#/borrowings">View Borrowings</a>`);
  }
  const lines = r.items.map(i => { const e = eq(i.eq), ok = availQ(e) >= i.qty && eqs(e) !== 'MAINTENANCE'; return `<tr><td>${ico(e)} ${esc(e.name)}</td><td>${e.id}</td><td>× ${i.qty}</td><td>${ok ? badge('Available') : badge('Unavailable')}</td></tr>`; });
  return panel('Reservation Verified ✓', `<div class="note good"><b>QR code verified.</b> This is an approved reservation.</div>${r.date !== today() ? `<div class="note warn">This reservation is scheduled for ${D(r.date)}, not today. Release is available only on the reservation date.</div>` : ''}${dl({ Borrower: esc(u.name), 'CMU ID': u.id, Department: esc(u.dept || '—'), Reservation: `${D(r.date)}<br>${T(r.s)} - ${T(r.e)}`, Purpose: esc(r.purpose) })}<h3 style="margin:8px 0">Equipment</h3>${tbl(['Equipment', 'ID', 'Quantity', 'Stock'], lines)}<label class="chk"><input type="checkbox" class="rck"> Borrower identity confirmed</label><label class="chk"><input type="checkbox" class="rck"> Equipment and quantities confirmed</label><label class="chk"><input type="checkbox" class="rck"> Reservation schedule confirmed</label><div id="rerr" class="err"></div><button class="btn ok" data-a="release" data-id="${r.id}">Confirm Equipment Release</button>`);
}
function parseQR(v) {
  v = v.trim();
  if (v.startsWith('{')) { try { const o = JSON.parse(v); return { id: o.r, u: o.u, data: o }; } catch (e) { return null; } }
  return { id: v.toUpperCase() };
}

function anRange() {
  const B = [], p = AN.p;
  if (p === 'daily') for (let i = 13; i >= 0; i--) B.push({ from: addDays(-i), to: addDays(-i), label: DS(addDays(-i)) });
  else if (p === 'weekly') for (let i = 7; i >= 0; i--) B.push({ from: addDays(-7 * i - 6), to: addDays(-7 * i), label: DS(addDays(-7 * i - 6)) });
  else if (p === 'monthly') for (let i = 5; i >= 0; i--) { const d = new Date(), s = new Date(d.getFullYear(), d.getMonth() - i, 1), e = new Date(d.getFullYear(), d.getMonth() - i + 1, 0); B.push({ from: ld(s), to: ld(e), label: s.toLocaleDateString('en-US', { month: 'short' }) }); }
  else {
    const from = AN.from || addDays(-29), to = AN.to || today();
    if (from > to) return null;
    const days = Math.round((new Date(to + 'T00:00') - new Date(from + 'T00:00')) / 864e5) + 1;
    const step = days <= 31 ? 1 : 7;
    for (let i = 0; i < days; i += step) { const s = ld(new Date(new Date(from + 'T00:00').getTime() + i * 864e5)), e = step === 1 ? s : (i + step >= days ? to : ld(new Date(new Date(from + 'T00:00').getTime() + (i + step - 1) * 864e5))); B.push({ from: s, to: e, label: DS(s) }); }
  }
  return { B, from: B[0].from, to: B[B.length - 1].to };
}
const hrs = r => (+r.e.slice(0, 2) * 60 + +r.e.slice(3) - +r.s.slice(0, 2) * 60 - +r.s.slice(3)) / 60;
function reportRows(type, a, z) {
  const inR = d => d >= a && d <= z, act = db.equipment.filter(e => !e.arch);
  if (type === 'Reservation Report') return { head: ['Reservation ID', 'CMU ID', 'Requester', 'Date', 'Time', 'Equipment', 'Purpose', 'Status'], rows: db.res.filter(r => inR(r.date)).sort(newest).map(r => [r.id, r.uid, usr(r.uid).name, r.date, `${T(r.s)}-${T(r.e)}`, r.items.map(i => `${eq(i.eq).name} x${i.qty}`).join('; '), r.purpose, r.status]) };
  if (type === 'Borrowing Report') return { head: ['Transaction', 'Reservation', 'CMU ID', 'Borrower', 'Equipment', 'Borrowed', 'Due', 'Returned', 'Status'], rows: db.brw.filter(b => inR(datePart(b.outAt))).sort(newest).map(b => [b.id, b.rid, b.uid, usr(b.uid).name, b.items.map(i => `${eq(i.eq).name} x${i.qty}`).join('; '), dt(b.outAt), `${res(b.rid).date} ${res(b.rid).e}`, b.retAt ? dt(b.retAt) : '-', over(b) ? 'OVERDUE' : b.status]) };
  if (type === 'Return Report') return { head: ['Transaction', 'Borrower', 'Returned', 'Equipment and condition', 'Remarks'], rows: db.brw.filter(b => b.status === 'RETURNED' && inR(datePart(b.retAt))).sort((x, y) => y.retAt.localeCompare(x.retAt)).map(b => [b.id, `${usr(b.uid).name} (${b.uid})`, dt(b.retAt), b.items.map(i => `${eq(i.eq).name} x${i.qty}: ${i.cond}`).join('; '), b.items.map(i => i.rem).filter(Boolean).join('; ') || '-']) };
  if (type === 'Equipment Condition Report') return { head: ['Equipment ID', 'Equipment', 'Condition', 'Status', 'Units in maintenance', 'Flagged', 'Last inspection', 'Last remarks'], rows: act.map(e => [e.id, e.name, e.cond, eqs(e), maintQ(e), e.flag ? 'Yes' : 'No', e.hist[0] ? dt(e.hist[0].date) : '-', e.hist[0] ? e.hist[0].rem : '-']) };
  if (type === 'Maintenance Report') return { head: ['Date', 'Equipment', 'Condition recorded', 'Returned by', 'Remarks', 'Transaction'], rows: act.flatMap(e => e.hist.filter(h => h.cond !== 'Good' && inR(datePart(h.date))).map(h => [dt(h.date), `${e.name} (${e.id})`, h.cond, h.by, h.rem, h.txn])).sort((x, y) => y[0].localeCompare(x[0])) };
  const sum = Math.max(1, db.res.filter(r => ['APPROVED', 'BORROWED', 'COMPLETED'].includes(r.status) && inR(r.date)).reduce((s, r) => s + hrs(r) * r.items.length, 0));
  return { head: ['Equipment', 'Reservations', 'Quantity reserved', 'Times borrowed', 'Hours reserved', 'Share of usage'], rows: act.map(e => { const rs = db.res.filter(r => ['APPROVED', 'BORROWED', 'COMPLETED'].includes(r.status) && inR(r.date) && r.items.some(i => i.eq === e.id)), h = rs.reduce((x, r) => x + hrs(r), 0); return [e.name, rs.length, lineQ(rs, e.id), db.brw.filter(b => inR(datePart(b.outAt)) && b.items.some(i => i.eq === e.id)).length, h.toFixed(1), Math.round(h / sum * 100) + '%']; }).sort((x, y) => y[1] - x[1]) };
}
const repHtml = () => REP ? `<h3>${REP.t} (${D(REP.a)} – ${D(REP.z)})</h3><p class="mut">Generated ${new Date().toLocaleString()} · ${REP.rows.length} record(s)</p>${tbl(REP.head, REP.rows.map(r => `<tr>${r.map(c => `<td class="wrap">${esc(c)}</td>`).join('')}</tr>`))}` : '<p class="empty">Choose a report type and date range, then press View Report.</p>';

const AV = {
  dashboard() {
    const act = db.equipment.filter(e => !e.arch), s = unitStats(), tot = act.reduce((a, e) => a + e.qty, 0);
    const mo = today().slice(0, 7), dim = new Date(+mo.slice(0, 4), +mo.slice(5), 0).getDate();
    const cnt = Array.from({ length: dim }, (_, i) => db.res.filter(r => r.date === `${mo}-${pad(i + 1, 2)}`).length);
    const att = act.filter(needsAttention);
    const rb = db.brw.slice().sort((a, b) => b.outAt.localeCompare(a.outAt)).slice(0, 5), rr = db.brw.filter(b => b.status === 'RETURNED').sort((a, b) => b.retAt.localeCompare(a.retAt)).slice(0, 5);
    return `<div class="stats">${stat('📦', tot, 'Total Equipment', 'equipment')}${stat('✅', s.a, 'Available Equipment', 'equipment')}${stat('🔄', s.b, 'Currently Borrowed', 'borrowings')}${stat('⏳', db.res.filter(r => r.status === 'PENDING').length, 'Pending Reservations', 'reservations')}${stat('📅', db.res.filter(r => r.date === today() && ['PENDING', 'APPROVED', 'BORROWED'].includes(r.status)).length, "Today's Reservations", 'reservations')}${stat('⏰', db.brw.filter(over).length, 'Overdue Equipment', 'borrowings')}${stat('🛠️', s.m, 'Under Maintenance', 'maintenance')}</div>
    <div class="row">${panel('Reservations (This Month)', chartBox(cnt, cnt.map((_, i) => String(i + 1)), 7))}${panel('Equipment Status', donut([['Available', s.a, '#2e9e5b'], ['Borrowed', s.b, '#2f6fd0'], ['Reserved', s.r, '#e0a21c'], ['Maintenance', s.m, '#e2763a'], ['Unavailable', s.u, '#9ca3af']]))}</div>
    <div class="row">${panel('Recent Reservations', db.res.length ? db.res.slice().sort(newest).slice(0, 5).map(r => `<div class="li"><div><b>${r.id}</b> · ${esc(usr(r.uid).name)}<small>${itemsText(r.items)}</small></div><div class="act">${badge(r.status)}<button class="btn sm ghost" data-a="vres" data-id="${r.id}">View</button></div></div>`).join('') : '<p class="empty">No reservations yet.</p>', '<a class="btn sm ghost" href="#/reservations">View All</a>')}${panel('Recent Borrowing Transactions', rb.length ? rb.map(b => `<div class="li"><div><b>${b.id}</b> · ${esc(usr(b.uid).name)}<small>${itemsText(b.items)} · ${dt(b.outAt)}</small></div>${badge(over(b) ? 'Overdue' : b.status)}</div>`).join('') : '<p class="empty">No borrowing transactions yet.</p>', '<a class="btn sm ghost" href="#/borrowings">View All</a>')}</div>
    <div class="row">${panel('Recent Returns', rr.length ? rr.map(b => `<div class="li"><div><b>${b.id}</b> · ${esc(usr(b.uid).name)}<small>${b.items.map(i => `${esc(eq(i.eq).name)}: ${i.cond}`).join(', ')}</small></div><small>${dt(b.retAt)}</small></div>`).join('') : '<p class="empty">No returns recorded yet.</p>', '<a class="btn sm ghost" href="#/returns">View All</a>')}${panel('Equipment Requiring Maintenance', att.length ? att.map(e => `<div class="li"><div><b>${ico(e)} ${esc(e.name)}</b> ${e.id}<small>${maintQ(e)} unit(s) in maintenance${e.flag ? ' · flagged for inspection' : ''}</small></div>${badge(e.status === 'MAINTENANCE' ? 'Maintenance' : e.flag ? 'Flagged' : 'Maintenance')}</div>`).join('') : '<p class="empty">No equipment needs maintenance.</p>', '<a class="btn sm ghost" href="#/maintenance">Open</a>')}</div>
    ${panel('Notifications', noteList(sess))}`;
  },
  reservations() {
    const G = { PENDING: ['PENDING'], APPROVED: ['APPROVED', 'BORROWED'], REJECTED: ['REJECTED'], COMPLETED: ['COMPLETED'], ALL: null };
    const tab = (k, l) => `<button class="${ATAB === k ? 'on' : ''}" data-a="atab" data-t="${k}">${l}<span class="cnt">${db.res.filter(r => !G[k] || G[k].includes(r.status)).length}</span></button>`;
    return `<div class="toolbar"><input data-f="q" placeholder="Search by ID, name or equipment..." aria-label="Search reservations" value="${esc(F.q || '')}"></div>${panel('Reservations', `<div class="tabs">${tab('PENDING', 'Pending')}${tab('APPROVED', 'Approved')}${tab('REJECTED', 'Rejected')}${tab('COMPLETED', 'Completed')}${tab('ALL', 'All')}</div><div id="list">${LISTS['admin/reservations']()}</div>`)}`;
  },
  verify() {
    const ready = db.res.filter(r => r.status === 'APPROVED').sort((a, b) => (a.date + a.s).localeCompare(b.date + b.s));
    const left = panel('Verify Reservation', `<p class="mut">Paste a reservation QR value, or enter the ID printed on an approved reservation. Camera scanning is not available in this browser-only version.</p><label for="vid">QR value or reservation ID</label><div class="pwrow"><input id="vid" placeholder="Enter a reservation ID"><button class="btn ghost" data-a="verify">Verify</button></div><div id="verr" class="err"></div>`);
    const right = panel('Approved Reservations Awaiting Release', ready.length ? ready.map(r => `<div class="li"><div><b>${r.id}</b> · ${esc(usr(r.uid).name)}<small>${itemsText(r.items)} · ${D(r.date)} ${T(r.s)}</small></div><button class="btn sm" data-a="verifyReservationId" data-id="${r.id}">Verify ID</button></div>`).join('') : '<p class="empty">No approved reservations are waiting for release.</p>');
    return `<div class="row">${left}${right}</div><div id="relbox">${REL ? relPanel() : ''}</div>`;
  },
  borrowings: () => `<div class="toolbar"><input data-f="q" placeholder="Search transactions..." aria-label="Search transactions" value="${esc(F.q || '')}"><select data-f="st" aria-label="Status"><option value="">All Status</option>${['BORROWED', 'RETURNED', 'OVERDUE'].map(c => `<option ${F.st === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>${panel('Borrowing Transactions', `<div id="list">${LISTS['admin/borrowings']()}</div>`)}`,
  returns(arg) {
    if (arg) return inspectView(arg);
    const out = db.brw.filter(b => b.status === 'BORROWED').sort(newest), done = db.brw.filter(b => b.status === 'RETURNED').sort((a, b) => b.retAt.localeCompare(a.retAt)).slice(0, 15);
    return panel('Borrowed Equipment — Awaiting Return', tbl(['Transaction', 'Borrower', 'Equipment', 'Borrowed', 'Due', 'Status', 'Action'], out.map(b => { const r = res(b.rid); return `<tr><td>${b.id}</td><td>${esc(usr(b.uid).name)}<br><small>${b.uid}</small></td><td class="wrap">${itemsText(b.items)}</td><td>${dts(b.outAt)}</td><td>${DY(r.date)}<br><small>${T(r.e)}</small></td><td>${badge(over(b) ? 'Overdue' : 'Borrowed')}</td><td><a class="btn sm" href="#/returns/${b.id}">Inspect &amp; Return</a></td></tr>`; })))
      + panel('Recent Returns', tbl(['Transaction', 'Borrower', 'Returned', 'Items and condition', 'Remarks'], done.map(b => `<tr><td>${b.id}</td><td>${esc(usr(b.uid).name)}</td><td>${dts(b.retAt)}</td><td class="wrap">${b.items.map(i => `${esc(eq(i.eq).name)} ×${i.qty}: ${badge(i.cond)}`).join('<br>')}</td><td class="wrap">${b.items.map(i => esc(i.rem)).filter(Boolean).join('; ') || '—'}</td></tr>`)));
  },
  equipment: () => `${eqBar()}${panel('Equipment', `<div id="list">${LISTS['admin/equipment']()}</div>`, '<button class="btn sm ghost" data-a="eqForm">Add Equipment</button>')}`,
  categories: () => panel('Categories', tbl(['Category', 'Equipment Items', 'Status', 'Actions'], db.cats.map(c => `<tr><td>${esc(c.name)}</td><td>${db.equipment.filter(e => e.cat === c.name && !e.arch).length}</td><td>${badge(c.arch ? 'Archived' : 'Active')}</td><td><div class="act"><button class="btn sm" data-a="catForm" data-n="${esc(c.name)}">Edit</button><button class="btn sm ${c.arch ? 'ok' : 'bad'}" data-a="catArch" data-n="${esc(c.name)}">${c.arch ? 'Restore' : 'Archive'}</button></div></td></tr>`)), '<button class="btn sm ghost" data-a="catForm">Add Category</button>'),
  maintenance() {
    const att = db.equipment.filter(needsAttention), all = db.equipment.filter(e => !e.arch);
    return panel('Equipment Requiring Maintenance or Inspection', tbl(['Equipment', 'Condition', 'Units in maintenance', 'Flag', 'Latest remarks', 'Actions'], att.map(e => `<tr><td>${ico(e)} ${esc(e.name)} (${e.id})</td><td>${badge(e.cond)}</td><td>${maintQ(e)} / ${e.qty}</td><td>${e.flag ? badge('Flagged') : '—'}</td><td class="wrap">${e.hist[0] ? esc(e.hist[0].rem) : '—'}</td><td><div class="act"><button class="btn sm ok" data-a="repair" data-id="${e.id}">Mark Repaired</button><button class="btn sm ghost" data-a="hist" data-id="${e.id}">History</button></div></td></tr>`)))
      + panel('Equipment Condition Overview', tbl(['Equipment', 'Current Condition', 'Last Inspection', 'Remarks', 'Status', 'Actions'], all.map(e => `<tr><td>${ico(e)} ${esc(e.name)} (${e.id})</td><td>${badge(e.cond)}</td><td>${e.hist[0] ? dts(e.hist[0].date) : '—'}</td><td class="wrap">${e.hist[0] ? esc(e.hist[0].rem) : '—'}</td><td>${badge(eqs(e))}</td><td><div class="act"><button class="btn sm ghost" data-a="hist" data-id="${e.id}">Condition History</button><button class="btn sm" data-a="condForm" data-id="${e.id}">Update</button></div></td></tr>`)));
  },
  users: () => panel('Users', tbl(['CMU ID', 'Full Name', 'Email', 'User Type', 'Department', 'Status', 'Actions'], db.users.map(u => `<tr><td>${u.id}</td><td>${esc(u.name)}</td><td class="wrap">${esc(u.email)}</td><td>${esc(u.type)}</td><td class="wrap">${esc(u.dept || '—')}</td><td>${badge(u.active ? 'Active' : 'Inactive')}</td><td><div class="act"><button class="btn sm ghost" data-a="vuser" data-id="${u.id}">View</button>${u.role === 'admin' ? '' : `<button class="btn sm ghost" data-a="uhist" data-id="${u.id}" data-k="res">Reservations</button><button class="btn sm ghost" data-a="uhist" data-id="${u.id}" data-k="brw">Borrowings</button><button class="btn sm ${u.active ? 'bad' : 'ok'}" data-a="toggleUser" data-id="${u.id}">${u.active ? 'Deactivate' : 'Activate'}</button>`}</div></td></tr>`))),
  analytics() {
    const R = anRange(), custom = AN.p === 'custom';
    const bar = `<div class="toolbar"><select data-an="p" aria-label="Period"><option value="daily" ${AN.p === 'daily' ? 'selected' : ''}>Daily (last 14 days)</option><option value="weekly" ${AN.p === 'weekly' ? 'selected' : ''}>Weekly (last 8 weeks)</option><option value="monthly" ${AN.p === 'monthly' ? 'selected' : ''}>Monthly (last 6 months)</option><option value="custom" ${custom ? 'selected' : ''}>Custom Date Range</option></select>${custom ? `<input type="date" data-an="from" value="${AN.from || addDays(-29)}" aria-label="From"><input type="date" data-an="to" value="${AN.to || today()}" aria-label="To">` : ''}</div>`;
    if (!R) return bar + '<div class="note bad">The start date must be on or before the end date.</div>';
    const inR = d => d >= R.from && d <= R.to, act = db.equipment.filter(e => !e.arch);
    const allRes = db.res.filter(r => inR(r.date)), used = allRes.filter(r => ['APPROVED', 'BORROWED', 'COMPLETED'].includes(r.status));
    const bor = db.brw.filter(b => inR(datePart(b.outAt))), rets = db.brw.filter(b => b.status === 'RETURNED' && inR(datePart(b.retAt)));
    if (!allRes.length && !bor.length && !rets.length && !act.some(e => e.hist.some(h => inR(datePart(h.date))))) return `${bar}<div class="stats"><div class="st"><span class="si">📋</span><div><b>0</b><small>Reservations</small></div></div><div class="st"><span class="si">✅</span><div><b>0</b><small>Approved / Used</small></div></div><div class="st"><span class="si">🔄</span><div><b>0</b><small>Borrowing Transactions</small></div></div><div class="st"><span class="si">↩️</span><div><b>0</b><small>Returns Recorded</small></div></div></div><p class="empty">No reservation, borrowing, return, or inspection activity for the selected period.</p>`;
    const per = act.map(e => [e.name, used.filter(r => r.items.some(i => i.eq === e.id)).length]).sort((a, b) => b[1] - a[1]);
    const top = per.slice(0, 5), low = per.slice().reverse().slice(0, 3);
    const inB = (d, b) => d >= b.from && d <= b.to, labels = R.B.map(b => b.label), st = Math.ceil(R.B.length / 8);
    const hour = Array(24).fill(0);
    used.forEach(r => { for (let h = +r.s.slice(0, 2); h < +r.e.slice(0, 2); h++) hour[h]++; });
    let pk = 8, pm = -1;
    for (let h = 7; h <= 15; h++) { const v = hour[h] + hour[h + 1] + hour[h + 2]; if (v > pm) { pm = v; pk = h; } }
    const cc = CONDS.map(c => [c, rets.reduce((a, b) => a + b.items.filter(i => i.cond === c).length, 0)]), ct = Math.max(1, cc.reduce((a, x) => a + x[1], 0));
    const mf = act.map(e => [e.name, e.hist.filter(h => ['Major Damage', 'Needs Maintenance'].includes(h.cond) && inR(datePart(h.date))).length]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const s = unitStats();
    return `${bar}<div class="stats"><div class="st"><span class="si">📋</span><div><b>${allRes.length}</b><small>Reservations</small></div></div><div class="st"><span class="si">✅</span><div><b>${used.length}</b><small>Approved / Used</small></div></div><div class="st"><span class="si">🔄</span><div><b>${bor.length}</b><small>Borrowing Transactions</small></div></div><div class="st"><span class="si">↩️</span><div><b>${rets.length}</b><small>Returns Recorded</small></div></div></div>
    <div class="row">${panel('Frequently Used Equipment', bars(top.map(p => [p[0], p[1]]), (v => v === 1 ? ' reservation' : ' reservations')))}${panel('Underutilized Equipment', bars(low.map(p => [p[0], p[1]]), (v => v === 1 ? ' reservation' : ' reservations'), Math.max(1, per[0] ? per[0][1] : 1)))}</div>
    <div class="row">${panel('Reservation Frequency', chartBox(R.B.map(b => allRes.filter(r => inB(r.date, b)).length), labels, st))}${panel('Borrowing Frequency', chartBox(R.B.map(b => bor.filter(x => inB(datePart(x.outAt), b)).length), labels, st))}</div>
    <div class="row">${panel('Equipment Usage Trend (items reserved)', chartBox(R.B.map(b => used.filter(r => inB(r.date, b)).reduce((a, r) => a + r.items.reduce((x, i) => x + i.qty, 0), 0)), labels, st))}${panel('Peak Usage Periods', `<p class="mut">Busiest window: <b>${T(pad(pk, 2) + ':00')} – ${T(pad(pk + 3, 2) + ':00')}</b></p>${bars(Array.from({ length: 11 }, (_, i) => [T(pad(i + 7, 2) + ':00'), hour[i + 7]]), '')}`)}</div>
    <div class="row">${panel('Equipment Status', donut([['Available', s.a, '#2e9e5b'], ['Borrowed', s.b, '#2f6fd0'], ['Reserved', s.r, '#e0a21c'], ['Maintenance', s.m, '#e2763a'], ['Unavailable', s.u, '#9ca3af']]))}${panel('Return Condition Statistics', rets.length ? bars(cc.map(x => [x[0], Math.round(x[1] / ct * 100)]), '%', 100) + `<p class="mut">Based on ${ct} returned item(s).</p>` : '<p class="empty">No returns in this period.</p>')}</div>
    ${panel('Maintenance Frequency (major damage / needs maintenance)', mf.length ? bars(mf, v => v === 1 ? ' time' : ' times') : '<p class="empty">No maintenance events in this period.</p>')}`;
  },
  reports: () => `${panel('Generate Report', `<div class="row"><div><label for="rt">Report type</label><select id="rt">${opts(REPORTS, REP ? REP.t : REPORTS[0])}</select></div><div><label for="rf">From</label><input id="rf" type="date" value="${REP ? REP.a : addDays(-60)}"></div><div><label for="rto">To</label><input id="rto" type="date" value="${REP ? REP.z : today()}"></div></div><div id="rerr" class="err"></div><div class="exp"><button class="btn ok" data-a="gen">View Report</button><button class="btn ghost" data-a="print">Print</button><button class="btn ghost" data-a="csv">Export</button></div>`)}<div class="pn"><div class="pn-b" id="rep">${repHtml()}</div></div>`,
  settings() {
    const u = me();
    return panel('Settings', `<div style="max-width:480px">${dl({ 'CMU ID': u.id, Role: esc(u.type) })}<label for="pn">Full name</label><input id="pn" value="${esc(u.name)}"><label for="pd">Department / Office</label><input id="pd" value="${esc(u.dept || '')}"><label for="pe">Email</label><input id="pe" value="${esc(u.email)}"><label for="pc">Current password (to change)</label><input id="pc" type="password"><label for="pp">New password</label><input id="pp" type="password"><div id="perr" class="err"></div><div class="exp"><button class="btn" data-a="saveProfile">Save Changes</button><button class="btn ghost" data-a="reset">Reset all browser data</button></div></div>`);
  }
};
function download(name, type, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
}
function refresh() { save(); render(); }
function refreshRel() {
  const b = $('#relbox');
  if (!b) return;
  b.innerHTML = REL ? relPanel() : '';
  if (REL && b.scrollIntoView) b.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function verifyValue(v) {
  const p = parseQR(v), err = m => { $('#verr').textContent = m; REL = null; refreshRel(); };
  $('#verr').textContent = '';
  if (!p || !p.id) return err('Invalid QR code. Please scan again.');
  const r = res(p.id);
  if (!r) return err('Reservation not found. The QR code is not valid.');
  if (p.u && p.u !== r.uid) return err('The QR code does not match the reservation record.');
  if (r.status !== 'APPROVED') return err(`This reservation is ${r.status}. Only approved reservations can be released.`);
  if (p.data && (p.data.q !== r.qr.id || Object.keys(p.data).sort().join(',') !== 'q,r')) return err('The QR payload does not match the approved reservation. Present the latest QR code.');
  if (brwOf(r.id)) return err('Equipment for this reservation was already released.');
  REL = { rid: r.id }; refreshRel(); toast('QR code verified.');
}
function applyReturn(b) {
  if (!INSP || b.status !== 'BORROWED') return toast('This borrowing has already been returned.', true);
  if (!INSP.v || b.items.some((_, i) => !CONDS.includes(INSP.c[i]) || (INSP.c[i] !== 'Good' && !(INSP.r[i] || '').trim()))) return toast('Complete every item inspection and required remark before confirming the return.', true);
  const at = new Date().toISOString(), out = [];
  b.returnTransaction = { id: nid('ret', `RET-${new Date().getFullYear()}`), at, inspectedBy: sess };
  b.items.forEach((it, i) => {
    const e = eq(it.eq), c = INSP.c[i], rem = (INSP.r[i] || '').trim();
    it.cond = c; it.rem = rem; e.cond = c;
    e.hist.unshift({ id: 'COND-' + crypto.randomUUID(), date: at, cond: c, by: b.uid, rem: rem || 'No issues', txn: b.id, rid: b.rid, returnId: b.returnTransaction.id, inspectedBy: sess });
    let result = 'AVAILABLE';
    if (c === 'Minor Damage') { e.flag = true; result = 'AVAILABLE (flagged for inspection)'; }
    if (c === 'Major Damage' || c === 'Needs Maintenance') { e.maint = Math.min(e.qty, (e.maint || 0) + it.qty); result = 'MAINTENANCE'; }
    out.push({ e, it, c, result });
  });
  b.status = 'RETURNED'; b.retAt = at; res(b.rid).status = 'COMPLETED';
  const u = usr(b.uid), bad = out.filter(o => o.c !== 'Good'), mt = out.filter(o => o.result === 'MAINTENANCE');
  notify(b.uid, `Your equipment return for ${b.rid} has been successfully recorded.`);
  notifyAdmins(`Equipment returned: ${out.map(o => o.e.name).join(', ')} by ${u.name} (${b.id}).`);
  if (bad.length) notifyAdmins(`Equipment marked damaged: ${bad.map(o => `${o.e.name} (${o.c})`).join(', ')}.`);
  if (mt.length) notifyAdmins(`Equipment requires maintenance: ${mt.map(o => o.e.name).join(', ')}.`);
  INSP = null; save();
  location.hash = '#/returns';
  render();
  modal(`<h3>Return recorded</h3><p>Transaction ${b.id} is complete. Equipment records were updated:</p>${tbl(['Equipment', 'Condition', 'Equipment status'], out.map(o => `<tr><td>${esc(o.e.name)} ×${o.it.qty}</td><td>${badge(o.c)}</td><td>${esc(o.result)}</td></tr>`))}<div class="ft"><button class="btn" data-a="close">Done</button></div>`);
}
function signup() {
  const name = val('sun'), id = val('suid'), type = val('sut'), dept = val('sud'), em = val('sue'), p1 = $('#sup').value, p2 = $('#sup2').value, err = m => { $('#suerr').textContent = m; };
  $('#suerr').textContent = '';
  if (!name) return err('Full name is required.');
  if (!/^\d{9}$/.test(id)) return err('Enter the valid 9-digit CMU member ID assigned to you.');
  if (+id.slice(0, 4) < 2000 || +id.slice(0, 4) > new Date().getFullYear()) return err(`The first 4 digits of your CMU ID must be a valid year (2000-${new Date().getFullYear()}).`);
  if (id.slice(4) === '00000') return err('The last 5 digits of your CMU ID cannot be all zeros.');
  if (db.users.some(u => u.id === id)) return err('An account with this CMU ID already exists.');
  if (!dept) return err('Department or college is required.');
  if (!/^\S+@\S+\.\S+$/.test(em)) return err('Enter a valid email address.');
  if (db.users.some(u => u.email.toLowerCase() === em.toLowerCase())) return err('This email is already registered.');
  if (p1.length < 6) return err('Password must be at least 6 characters.');
  if (p1 !== p2) return err('Passwords do not match.');
  db.users.push({ id, name, type, dept, role: 'user', email: em, pw: p1, active: true });
  notifyAdmins(`New member account created: ${name} (${id}).`);
  save(); $('#sf').reset(); A.showLogin();
  $('#uid').value = id; $('#pw').value = '';
  toast('Account created. You can now log in.');
}

function setupAdmin() {
  const name = val('an'), id = val('aid'), dept = val('ad'), email = val('ae'), password = $('#apw').value, confirmPassword = $('#apw2').value, err = message => { $('#aerr').textContent = message; };
  $('#aerr').textContent = '';
  if (db.users.some(user => user.role === 'admin')) { A.showLogin(); return toast('An administrator account already exists. Sign in with that account.', true); }
  if (!name) return err('Full name is required.');
  if (!/^\d{9}$/.test(id)) return err('Enter the valid 9-digit CMU member ID assigned to the administrator.');
  if (+id.slice(0, 4) < 2000 || +id.slice(0, 4) > new Date().getFullYear() || id.slice(4) === '00000') return err('Enter a valid CMU ID.');
  if (db.users.some(user => user.id === id)) return err('An account with this CMU ID already exists. Use a different administrator ID.');
  if (!dept) return err('Department or office is required.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return err('Enter a valid email address.');
  if (db.users.some(user => user.email.toLowerCase() === email.toLowerCase())) return err('This email is already registered.');
  if (password.length < 6) return err('Password must be at least 6 characters.');
  if (password !== confirmPassword) return err('Passwords do not match.');
  confirmDlg('Create this first administrator account on this browser? The application cannot verify that you are authorized. Anyone with access to this setup page can claim the initial administrator role.', () => A.confirmAdminSetup({ name, id, dept, email, password }), 'Create administrator');
}

const A = {
  togglePw(d) { const p = $('#' + (d.t || 'pw')); p.type = p.type === 'password' ? 'text' : 'password'; },
  showSignup() { $('#lf').hidden = true; $('#af').hidden = true; $('#sf').hidden = false; $('#suerr').textContent = ''; },
  showAdminSetup() { if (db.users.some(user => user.role === 'admin')) return toast('An administrator account already exists.', true); $('#lf').hidden = true; $('#sf').hidden = true; $('#af').hidden = false; $('#aerr').textContent = ''; },
  showLogin() { $('#sf').hidden = true; $('#af').hidden = true; $('#lf').hidden = false; $('#lerr').textContent = ''; },
  setupAdmin,
  confirmAdminSetup(d) {
    if (db.users.some(user => user.role === 'admin')) { A.showLogin(); return toast('An administrator account already exists.', true); }
    if (db.users.some(user => user.id === d.id || user.email.toLowerCase() === d.email.toLowerCase())) return toast('That CMU ID or email is already registered. No administrator was created.', true);
    const user = { id: d.id, name: d.name, type: 'Administrator', dept: d.dept, role: 'admin', email: d.email, pw: d.password, active: true };
    db.users.push(user);
    if (!save()) { db.users.pop(); return; }
    $('#af').reset(); A.showLogin(); $('#uid').value = d.id; $('#pw').value = '';
    render();
    toast('First administrator account created. Sign in with your CMU ID and chosen password.');
  },
  forgot() { RST = null; modal(`<h3>Forgot password?</h3><p>Password recovery is simulated in this browser. No email is sent.</p><label for="fid">CMU ID</label><input id="fid" placeholder="Enter your CMU ID" value="${esc(val('uid'))}"><label for="fem">Registered email</label><input id="fem" type="email" placeholder="Enter your registered email"><div id="ferr" class="err"></div><div class="ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-a="sendCode">Continue</button></div>`); },
  sendCode(d, el) {
    const id = val('fid'), em = val('fem').toLowerCase(), u = db.users.find(x => x.id.toLowerCase() === id.toLowerCase() || (x.username || '').toLowerCase() === id.toLowerCase());
    if (!id || !em) { $('#ferr').textContent = 'Enter your CMU ID and registered email.'; return; }
    if (!u || u.email.toLowerCase() !== em) { $('#ferr').textContent = 'The CMU ID and email do not match any account.'; return; }
    if (!u.active) { $('#ferr').textContent = 'This account is inactive. Please contact the administrator.'; return; }
    busy(el, 'Sending...', () => {
      RST = { uid: u.id, code: String(Math.floor(100000 + Math.random() * 900000)) };
      modal(`<h3>Reset password</h3><p class="note">Password reset for ${esc(u.email.replace(/^(.{2}).*(@.*)$/, '$1***$2'))}.<br><small>Demonstration verification code: <b>${RST.code}</b></small></p><label for="fcode">Verification code</label><input id="fcode" inputmode="numeric" maxlength="6"><label for="fp1">New password</label><input id="fp1" type="password" placeholder="At least 6 characters"><label for="fp2">Confirm new password</label><input id="fp2" type="password"><div id="ferr" class="err"></div><div class="ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-a="resetPw">Reset Password</button></div>`);
    }, 500);
  },
  resetPw() {
    const code = val('fcode'), p1 = $('#fp1').value, p2 = $('#fp2').value, err = m => { $('#ferr').textContent = m; };
    if (!RST || code !== RST.code) return err('The verification code is incorrect.');
    if (p1.length < 6) return err('New password must be at least 6 characters.');
    if (p1 !== p2) return err('Passwords do not match.');
    const u = usr(RST.uid);
    u.pw = p1; RST = null;
    notify(u.id, 'Your password was changed successfully.');
    save(); closeModal(); $('#uid').value = u.id; $('#pw').value = '';
    toast('Password reset successful. You can now log in.');
  },
  logout() { setSess(null); draft = null; INSP = null; REL = null; closeModal(); A.showLogin(); $('#bellbox').hidden = true; location.hash = ''; render(); },
  back() { if (history.length > 1) history.back(); else location.hash = '#/equipment'; },
  menu() { $('#side').classList.toggle('open'); },
  bell() { bell(); },
  readAll() { db.notes.forEach(n => { if (n.uid === sess) n.read = true; }); refresh(); },
  close() { closeModal(); },
  yes() { const f = onYes; onYes = null; closeModal(); if (f) f(); },
  reset() { confirmDlg('Reset all browser-stored accounts, equipment, categories, reservations, transactions, history, and notifications? This cannot be undone. Export a backup first if you need to keep any records.', () => { const previous = db; db = emptyData(); if (!save()) { db = previous; return; } draft = null; INSP = null; REL = null; REP = null; const sessionCleared = setSess(null); render(); if (sessionCleared) toast('Application data reset. The system is empty.'); }, 'Reset all data'); },
  migrationBackup() {
    if (!legacyResetRequired) return;
    download('cmu-equipment-browser-data-backup.json', 'application/json', legacyStorageRaw);
    toast('Existing browser data backup downloaded. Retain it before resetting.');
  },
  migrationReset() {
    if (!legacyResetRequired) return;
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(SKEY);
    } catch (e) {
      console.error('Could not clear the obsolete application data.', e);
      return toast('The old browser data could not be cleared. Check browser storage permissions and try again.', true);
    }
    legacyResetRequired = false;
    legacyStorageRaw = '';
    sess = null;
    db = emptyData();
    const saved = save();
    draft = null; INSP = null; REL = null; REP = null;
    closeModal(); render();
    if (saved) toast('Old browser data cleared. You can now start with a clean system.');
  },
  pt(d) { toast(d.t); },
  tab(d) { TAB = d.t; render(); },
  atab(d) { ATAB = d.t; render(); },
  eqv(d) { eqDetail(d.id); },
  hist(d) { histModal(d.id); },
  reserveEq(d) { draft = freshDraft(); draft.items[0].eq = d.id; closeModal(); location.hash = '#/reserve'; render(); },
  addItem() { readDraft(); draft.items.push({ eq: '', qty: 1 }); render(); },
  rmItem(d) { readDraft(); draft.items.splice(+d.i, 1); if (!draft.items.length) draft.items.push({ eq: '', qty: 1 }); render(); },
  qty(d) { readDraft(); const it = draft.items[+d.i]; it.qty = Math.max(1, (it.qty || 1) + +d.d); render(); },
  toReview() {
    readDraft();
    const m = validateDraft();
    if (m) { $('#rerr').textContent = m; paintAvail(); return; }
    draft.step = 2; render();
  },
  editRes() { draft.step = 1; render(); },
  submitRes(d, el) {
    const m = validateDraft();
    if (m) { $('#rerr').textContent = m; return; }
    busy(el, 'Submitting...', () => {
      if (validateDraft()) { draft.step = 1; render(); return toast('Availability changed. Please review your reservation.', true); }
      const r = { id: nid('res', `RES-${new Date().getFullYear()}`), uid: sess, date: draft.date, s: draft.s, e: draft.e, purpose: draft.purpose, notes: draft.notes, status: 'PENDING', items: draft.items.map(i => ({ eq: i.eq, qty: i.qty })), reason: '', created: new Date().toISOString(), decided: '' };
      db.res.push(r);
      notify(sess, `Reservation ${r.id} submitted successfully.`);
      notifyAdmins(`New reservation request ${r.id} from ${me().name} is waiting for approval.`);
      draft = null; TAB = 'pending'; save(); render();
      modal(`<h3>Reservation request submitted successfully.</h3>${dl({ 'Reservation ID': r.id, Date: D(r.date), Time: `${T(r.s)} - ${T(r.e)}`, Equipment: itemsText(r.items), Purpose: esc(r.purpose), Status: badge('PENDING') })}<p class="note">The administrator will review your request. You will be notified once it is approved or rejected.</p><div class="ft"><a class="btn" href="#/my" data-a="close">View My Reservations</a></div>`);
    });
  },
  vres(d) { resDetail(d.id); },
  qr(d) { showQR(d.id); },
  cancel(d) {
    const r = res(d.id);
    if (!canViewReservation(r)) return toast('This reservation is unavailable to your account.', true);
    if (!['PENDING', 'APPROVED'].includes(r.status)) return toast('This reservation can no longer be cancelled.', true);
    confirmDlg(`Cancel reservation ${r.id}? ${r.status === 'APPROVED' ? 'Its QR code will no longer be valid.' : ''}`, () => {
      if (!['PENDING', 'APPROVED'].includes(r.status)) return toast('This reservation can no longer be cancelled.', true);
      r.status = 'CANCELLED'; r.cancelledAt = new Date().toISOString();
      notify(r.uid, `Your reservation ${r.id} has been cancelled.`);
      if (me().role === 'user') notifyAdmins(`${me().name} cancelled reservation ${r.id}.`);
      refresh(); toast('Reservation cancelled.');
    }, 'Yes, cancel');
  },
  appr(d) {
    const r = res(d.id);
    const error = approvalError(r);
    if (error) return toast(error, true);
    confirmDlg(`Approve reservation ${r.id}? A QR code will be generated and the member will be notified.`, () => {
      const error = approvalError(r);
      if (error) return toast(error, true);
      r.status = 'APPROVED'; r.decided = new Date().toISOString();
      r.approvals.push({ id: 'APR-' + crypto.randomUUID(), status: 'APPROVED', at: r.decided, by: sess, reason: '' });
      r.qr = { id: `QR-${r.id}`, created: r.decided, usedAt: '' };
      notify(r.uid, `Your reservation ${r.id} has been approved. Your QR code is ready.`);
      refresh(); toast(`${r.id} approved. QR code generated.`);
    }, 'Approve');
  },
  rej(d) { modal(`<h3>Reject Reservation ${d.id}</h3><label for="rj">Rejection reason (shown to the member)</label><textarea id="rj" rows="3" placeholder="Enter the reason for this decision."></textarea><div id="rjerr" class="err"></div><div class="ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn bad" data-a="doReject" data-id="${d.id}">Reject</button></div>`); },
  doReject(d) {
    const t = val('rj');
    if (t.length < 5) { $('#rjerr').textContent = 'Please provide a rejection reason.'; return; }
    const r = res(d.id);
    if (!r || r.status !== 'PENDING') return toast('Only a pending reservation can be rejected.', true);
    r.status = 'REJECTED'; r.reason = t; r.decided = new Date().toISOString();
    r.approvals.push({ id: 'APR-' + crypto.randomUUID(), status: 'REJECTED', at: r.decided, by: sess, reason: t });
    notify(r.uid, `Your reservation ${r.id} has been rejected. Reason: ${t}`);
    closeModal(); refresh(); toast(`${r.id} rejected.`);
  },
  verifyReservationId(d) { $('#vid').value = d.id; verifyValue(d.id); },
  verify(d, el) {
    const v = val('vid');
    if (!v) { $('#verr').textContent = 'Enter the QR value or Reservation ID.'; return; }
    busy(el, 'Checking...', () => verifyValue(v), 500);
  },
  release(d, el) {
    const r = res(d.id), err = m => { $('#rerr').textContent = m; };
    const error = releaseError(r);
    if (error) return err(error);
    if (!REL || REL.rid !== r.id || $$('.rck').length !== 3) return err('Verify the reservation QR before release.');
    if (!$$('.rck').every(c => c.checked)) return err('Please tick all three confirmations before releasing the equipment.');
    busy(el, 'Releasing...', () => {
      const error = releaseError(r);
      if (error) return err(error);
      const b = { id: nid('brw', `BRW-${new Date().getFullYear()}`), rid: r.id, uid: r.uid, items: r.items.map(i => ({ eq: i.eq, qty: i.qty, cond: '', rem: '' })), outAt: new Date().toISOString(), retAt: '', status: 'BORROWED', releasedBy: sess };
      db.brw.push(b); r.status = 'BORROWED';
      r.qr.usedAt = b.outAt;
      notify(r.uid, `Equipment for ${r.id} has been released to you (${b.id}). Please return it by ${T(r.e)} on ${D(r.date)}.`);
      REL = { rid: r.id, done: b.id }; save(); render(); toast('Equipment released. Status: Borrowed.');
    });
  },
  confirmReturn(d, el) {
    const b = db.brw.find(x => x.id === d.id), err = m => { $('#ierr').textContent = m; };
    if (!b || b.status !== 'BORROWED' || !INSP || INSP.bid !== b.id) return toast('Choose a borrowing transaction awaiting return.', true);
    if (!INSP.v) return err('Please verify the transaction first.');
    if (b.items.some((_, i) => !CONDS.includes(INSP.c[i]))) return err('Select a condition for every returned item.');
    const miss = b.items.findIndex((_, i) => INSP.c[i] !== 'Good' && !(INSP.r[i] || '').trim());
    if (miss >= 0) return err(`Enter remarks for ${eq(b.items[miss].eq).name}. Remarks are required when the equipment is not in good condition.`);
    confirmDlg('Complete this return? Each item condition and inspection remark will be saved to its history.', () => busy(el, 'Updating equipment...', () => applyReturn(b)), 'Confirm Return');
  },
  eqForm(d) {
    const e = d.id ? eq(d.id) : { id: '', name: '', cat: activeCats()[0], desc: '', qty: 1, cond: 'Good', status: 'AVAILABLE' };
    const cats = activeCats().includes(e.cat) ? activeCats() : [e.cat, ...activeCats()];
    modal(`<h3>${d.id ? 'Edit' : 'Add'} Equipment</h3><label for="ek">Equipment ID</label><input id="ek" value="${esc(e.id)}" placeholder="Enter the unique equipment ID" ${d.id ? 'readonly' : ''}><label for="en">Equipment name</label><input id="en" value="${esc(e.name)}"><label for="ec">Category</label><select id="ec">${opts(cats, e.cat)}</select><div class="row"><div><label for="eqq">Quantity</label><input id="eqq" type="number" min="1" value="${e.qty}"></div><div><label>Available quantity</label><input value="${d.id ? availQ(e) : 'Same as quantity'}" readonly></div></div><div class="row"><div><label for="eo">Condition</label><select id="eo">${opts(CONDS, e.cond)}</select></div><div><label for="es">Status</label><select id="es">${opts(['AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE'], e.status)}</select></div></div><label for="ed">Description</label><textarea id="ed" rows="2">${esc(e.desc)}</textarea><div id="eerr" class="err"></div><div class="ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-a="saveEq" data-id="${d.id || ''}">Save</button></div>`);
  },
  saveEq(d) {
    const code = val('ek').toUpperCase(), name = val('en'), qty = Number(val('eqq')), err = m => { $('#eerr').textContent = m; };
    if (!/^[A-Z0-9-]{3,12}$/.test(code)) return err('Equipment ID is required and may contain letters, numbers and dashes.');
    if (!d.id && eq(code)) return err('That equipment ID already exists.');
    if (!name) return err('Equipment name is required.');
    if (!Number.isInteger(qty) || qty < 1) return err('Quantity must be a whole number of at least 1.');
    if (d.id && qty < borrowedQ(d.id) + maintQ(eq(d.id))) return err('Quantity cannot be lower than the total units borrowed or under maintenance.');
    if (!activeCats().includes(val('ec')) && (!d.id || eq(d.id).cat !== val('ec'))) return err('Select an active category.');
    const data = { name, cat: val('ec'), desc: val('ed'), qty, cond: val('eo'), status: val('es') };
    if (d.id) {
      const e = eq(d.id);
      if (e.cond !== data.cond) e.hist.unshift({ date: new Date().toISOString(), cond: data.cond, by: sess, rem: 'Updated by administrator', txn: 'Manual update' });
      if (e.status === 'MAINTENANCE' && data.status === 'AVAILABLE') e.maint = 0;
      Object.assign(e, data);
    } else db.equipment.push({ id: code, ...data, maint: 0, flag: false, arch: false, hist: [] });
    closeModal(); refresh(); toast(d.id ? 'Equipment updated.' : 'Equipment added.');
  },
  arch(d) {
    const e = eq(d.id);
    if (borrowedQ(e.id) > 0) return toast('This equipment is currently borrowed and cannot be archived.', true);
    if (db.res.some(r => ['PENDING', 'APPROVED', 'BORROWED'].includes(r.status) && r.items.some(i => i.eq === e.id))) return toast('This equipment has active reservations and cannot be archived.', true);
    confirmDlg(`Archive ${esc(e.name)} (${e.id})? It will no longer appear in equipment lists.`, () => { e.arch = true; refresh(); toast('Equipment archived.'); }, 'Archive');
  },
  catForm(d) {
    modal(`<h3>${d.n ? 'Edit' : 'Add'} Category</h3><label for="cn">Category name</label><input id="cn" value="${esc(d.n || '')}" placeholder="Enter a category name"><div id="cerr" class="err"></div><div class="ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-a="saveCat" data-n="${esc(d.n || '')}">Save</button></div>`);
  },
  saveCat(d) {
    const n = val('cn'), err = m => { $('#cerr').textContent = m; };
    if (!n) return err('Category name is required.');
    if (db.cats.some(c => c.name.toLowerCase() === n.toLowerCase() && c.name !== d.n)) return err('That category already exists.');
    if (d.n) { db.cats.find(c => c.name === d.n).name = n; db.equipment.forEach(e => { if (e.cat === d.n) e.cat = n; }); }
    else db.cats.push({ name: n, arch: false });
    closeModal(); refresh(); toast(d.n ? 'Category updated.' : 'Category added.');
  },
  catArch(d) {
    const c = db.cats.find(x => x.name === d.n);
    if (!c.arch && db.equipment.some(e => e.cat === c.name && !e.arch)) return toast('Move or archive the equipment in this category first.', true);
    c.arch = !c.arch; refresh(); toast(c.arch ? 'Category archived.' : 'Category restored.');
  },
  condForm(d) {
    const e = eq(d.id);
    modal(`<h3>Update Condition: ${esc(e.name)}</h3><label for="cc">Condition</label><select id="cc">${opts(CONDS, e.cond)}</select><label for="cs">Status</label><select id="cs">${opts(['AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE'], e.status)}</select><label for="cr">Remarks</label><textarea id="cr" rows="3" placeholder="Inspection notes"></textarea><div id="cerr" class="err"></div><div class="ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-a="saveCond" data-id="${e.id}">Save</button></div>`);
  },
  saveCond(d) {
    const e = eq(d.id), c = val('cc'), s = val('cs'), r = val('cr');
    if (c !== 'Good' && !r) { $('#cerr').textContent = 'Enter remarks for the recorded condition.'; return; }
    if (e.status === 'MAINTENANCE' && s === 'AVAILABLE') e.maint = 0;
    e.cond = c; e.status = s;
    e.hist.unshift({ date: new Date().toISOString(), cond: c, by: sess, rem: r || 'Manual inspection: no issues', txn: 'Manual inspection' });
    closeModal(); refresh(); toast('Equipment condition updated.');
  },
  repair(d) {
    const e = eq(d.id);
    modal(`<h3>Mark Repaired: ${esc(e.name)}</h3><p>All units will return to service and the condition will be recorded as Good.</p><label for="rr2">Repair remarks</label><textarea id="rr2" rows="3" placeholder="Describe the repair performed"></textarea><div class="ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn ok" data-a="doRepair" data-id="${e.id}">Confirm</button></div>`);
  },
  doRepair(d) {
    const e = eq(d.id), r = val('rr2');
    e.maint = 0; e.flag = false; e.cond = 'Good'; if (e.status === 'MAINTENANCE') e.status = 'AVAILABLE';
    e.hist.unshift({ date: new Date().toISOString(), cond: 'Good', by: sess, rem: r ? `Repaired: ${r}` : 'Repaired and returned to service', txn: 'Maintenance' });
    closeModal(); refresh(); toast(`${e.name} is back in service.`);
  },
  vuser(d) { const u = usr(d.id); modal(`<h3>Account Details</h3>${dl({ 'CMU ID': u.id, 'Full name': esc(u.name), Email: esc(u.email), 'User type': esc(u.type), Department: esc(u.dept || '—'), Status: badge(u.active ? 'Active' : 'Inactive'), 'Reservations': db.res.filter(r => r.uid === u.id).length, 'Borrowing transactions': db.brw.filter(b => b.uid === u.id).length })}`); },
  uhist(d) {
    const u = usr(d.id);
    if (d.k === 'res') modal(`<h3>Reservation History</h3><p>${esc(u.name)} (${u.id})</p>${tbl(['Reservation', 'Date', 'Equipment', 'Status'], db.res.filter(r => r.uid === u.id).sort(newest).map(r => `<tr><td>${r.id}</td><td>${D(r.date)}</td><td class="wrap">${itemsText(r.items)}</td><td>${badge(r.status)}</td></tr>`))}`);
    else modal(`<h3>Borrowing History</h3><p>${esc(u.name)} (${u.id})</p>${tbl(['Transaction', 'Equipment', 'Borrowed', 'Returned', 'Status'], db.brw.filter(b => b.uid === u.id).sort(newest).map(b => `<tr><td>${b.id}</td><td class="wrap">${itemsText(b.items)}</td><td>${D(datePart(b.outAt))}</td><td>${b.retAt ? D(datePart(b.retAt)) : '—'}</td><td>${badge(b.status)}</td></tr>`))}`);
  },
  toggleUser(d) { const u = usr(d.id); u.active = !u.active; refresh(); toast(`Account ${u.active ? 'activated' : 'deactivated'}.`); },
  saveProfile() {
    const u = me(), n = val('pn'), em = val('pe'), dp = val('pd'), cp = $('#pc').value, np = $('#pp').value, err = m => { $('#perr').textContent = m; };
    if (!n) return err('Name is required.');
    if (!/^\S+@\S+\.\S+$/.test(em)) return err('Enter a valid email address.');
    if (db.users.some(x => x.id !== u.id && x.email.toLowerCase() === em.toLowerCase())) return err('This email is already registered.');
    if (np) { if (cp !== u.pw) return err('Current password is incorrect.'); if (np.length < 6) return err('New password must be at least 6 characters.'); u.pw = np; }
    u.name = n; u.email = em; u.dept = dp; refresh(); toast('Profile updated.');
  },
  gen(d, el) {
    const t = val('rt'), a = val('rf'), z = val('rto');
    if (!a || !z || a > z) { $('#rerr').textContent = 'Please provide a valid date range.'; return; }
    $('#rerr').textContent = '';
    $('#rep').innerHTML = loading('Generating report...');
    busy(el, 'Generating...', () => { REP = { t, a, z, ...reportRows(t, a, z) }; $('#rep').innerHTML = repHtml(); toast('Report generated.'); }, 600);
  },
  csv() {
    if (!REP) return toast('View a report first, then export it.', true);
    download(REP.t.replace(/\s+/g, '_') + '.csv', 'text/csv', [REP.head, ...REP.rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
    toast('Report exported as CSV.');
  },
  print() { if (!REP) return toast('View a report before printing.', true); window.print(); }
};

function renderUserApp() {
  const [r] = route(), titles = { dashboard: 'Dashboard', equipment: 'Equipment', reserve: 'New Reservation', my: 'My Reservations', profile: 'Profile' };
  const key = titles[r] ? r : 'dashboard';
  $('#ut').textContent = titles[key];
  $('#back').hidden = key !== 'reserve';
  $('#unav').innerHTML = UNAV_NAV.map(n => `<a href="#/${n[0]}" class="${n[0] === key ? 'on' : ''}"><span>${n[2]}</span>${n[1]}</a>`).join('');
  $('#uview').innerHTML = UV[key]();
}
function renderAdminApp() {
  const [r, arg] = route(), key = Object.hasOwn(AV, r) ? r : 'dashboard', cur = ADM_NAV.find(n => n[0] === key);
  const pend = db.res.filter(x => x.status === 'PENDING').length, wait = db.brw.filter(b => b.status === 'BORROWED').length, appr = db.res.filter(x => x.status === 'APPROVED').length;
  const pill = k => { const n = k === 'reservations' ? pend : k === 'returns' ? wait : k === 'verify' ? appr : 0; return n ? `<span class="pill">${n}</span>` : ''; };
  const item = (n, short) => `<a href="#/${n[0]}" class="${n[0] === key ? 'on' : ''}"><span class="ni">${n[2]}</span><span class="nl">${short || n[1]}</span>${pill(n[0])}</a>`;
  const SHORT = { dashboard: 'Home', reservations: 'Requests', verify: 'Release', returns: 'Returns' }, BT = Object.keys(SHORT);
  $('#anav').innerHTML = ADM_NAV.map(n => item(n)).join('') + '<a href="#/dashboard" data-a="logout"><span class="ni">🚪</span><span class="nl">Logout</span></a>';
  $('#abnav').innerHTML = BT.map(k => item(ADM_NAV.find(n => n[0] === k), SHORT[k])).join('') + `<button data-a="menu" class="${BT.includes(key) ? '' : 'on'}" aria-label="More pages"><span class="ni">☰</span><span class="nl">More</span></button>`;
  $('#at').textContent = TITLES[key] || cur[1];
  $('#awho').textContent = me().name;
  $('#aview').innerHTML = AV[key](arg);
  $('#side').classList.remove('open');
}
function render() {
  if (!db) db = load();
  if (!sess) { try { sess = localStorage.getItem(SKEY); } catch (e) { } }
  let u = sess && me();
  if (sess && (!u || !u.active)) { setSess(null); u = null; }
  $('#login').hidden = !!u; $('#uapp').hidden = !(u && u.role === 'user'); $('#aapp').hidden = !(u && u.role === 'admin');
  if (!u) return;
  sweep();
  u.role === 'admin' ? renderAdminApp() : renderUserApp();
  fitCharts();
  const n = db.notes.filter(x => x.uid === sess && !x.read).length;
  $('#ubc').textContent = n || ''; $('#abc').textContent = n || '';
  if (!$('#bellbox').hidden) bell(true);
}
function bell(keep) {
  const b = $('#bellbox');
  if (!keep) b.hidden = !b.hidden;
  const L = db.notes.filter(n => n.uid === sess).slice(0, 20);
  b.innerHTML = `<div><b>Notifications</b> <button class="link" data-a="readAll">Mark all as read</button></div>` + (L.map(n => `<div class="${n.read ? '' : 'unread'}">${esc(n.msg)}<small>${esc(n.at)}</small></div>`).join('') || '<div class="empty">No notifications.</div>');
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) { if (!e.target.closest('#bellbox') && !e.target.closest('.bell')) $('#bellbox').hidden = true; if (e.target.id === 'modal' && !legacyResetRequired) closeModal(); if (!e.target.closest('#side')) $('#side').classList.remove('open'); return; }
  if (el.tagName === 'A' && ['close', 'logout'].includes(el.dataset.a)) { if (el.dataset.a === 'logout') e.preventDefault(); A[el.dataset.a](el.dataset, el); return; }
  if (A[el.dataset.a]) { if (el.tagName !== 'A') e.preventDefault(); A[el.dataset.a](el.dataset, el); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!legacyResetRequired) closeModal(); $('#side').classList.remove('open'); $('#bellbox').hidden = true; }
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.a === 'eqv') A.eqv(e.target.dataset);
});
document.addEventListener('input', e => {
  const t = e.target, ds = t.dataset || {};
  if (ds.chk !== undefined) { readDraft(); paintAvail(); return; }
  if (ds.ins !== undefined) { INSP.c[ds.ins] = t.value; updateInsp(); return; }
  if (ds.rem !== undefined) { INSP.r[ds.rem] = t.value; return; }
  if (ds.insV !== undefined) { INSP.v = t.checked; updateInsp(); return; }
  if (ds.an) { AN[ds.an] = t.value; render(); return; }
  if (!ds.f) return;
  F[ds.f] = t.value;
  const l = $('#list');
  if (l && LISTS[listKey()]) l.innerHTML = LISTS[listKey()]();
});
function setDevice() {
  const root = document.documentElement, w = window.innerWidth, d = w <= 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
  if (root.dataset.device !== d) { root.dataset.device = d; $('#side').classList.remove('open'); }
  root.dataset.input = window.matchMedia && window.matchMedia('(pointer:coarse)').matches ? 'touch' : 'mouse';
}
function onResize() {
  setDevice();
  if (sess && ['dashboard', 'analytics'].includes(route()[0]) && Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; fitCharts(); }
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
window.addEventListener('hashchange', () => { F = {}; REL = null; if (!route()[0].startsWith('returns') || !route()[1]) INSP = null; render(); });
$('#lf').addEventListener('submit', e => {
  e.preventDefault();
  const id = val('uid'), pw = $('#pw').value, err = m => { $('#lerr').textContent = m; };
  if (!id || !pw) return err('Please enter your CMU ID and password.');
  const u = db.users.find(x => x.id.toLowerCase() === id.toLowerCase() || (x.username || '').toLowerCase() === id.toLowerCase());
  $('#lerr').textContent = '';
  busy($('#lf button[type=submit]'), 'Signing in...', () => {
    if (!u || u.pw !== pw) return err('Incorrect CMU ID or password.');
    if (!u.active) return err('This account is inactive. Please contact the equipment administrator.');
    $('#pw').value = '';
    setSess(u.id); draft = null; TAB = 'pending'; location.hash = '#/dashboard'; render(); toast(`Welcome, ${firstName(u.name)}.`);
  }, 500);
});
$('#sf').addEventListener('submit', e => { e.preventDefault(); signup(); });
$('#af').addEventListener('submit', e => { e.preventDefault(); setupAdmin(); });
