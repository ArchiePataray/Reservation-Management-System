/* Complete role-specific views, accessible interaction, and application startup. */
function buildEquipmentToolbar() {
  return `<div class="toolbar equipment-toolbar"><input data-f="q" placeholder="Search name, ID or category" aria-label="Search equipment" value="${esc(F.q || '')}"><select data-f="cat" aria-label="Category"><option value="">All categories</option>${opts(activeCats(), F.cat)}</select><select data-f="st" aria-label="Status"><option value="">All statuses</option>${opts(STATUSES, F.st)}</select><select data-f="cond" aria-label="Condition"><option value="">All conditions</option>${opts(CONDS, F.cond)}</select><select data-f="sort" aria-label="Sort equipment"><option value="name" ${!F.sort || F.sort === 'name' ? 'selected' : ''}>Name A–Z</option><option value="available" ${F.sort === 'available' ? 'selected' : ''}>Availability: highest</option><option value="id" ${F.sort === 'id' ? 'selected' : ''}>Equipment ID</option></select><button class="btn ghost" data-a="clearFilters">Clear filters</button></div>`;
}
eqFiltered = function() {
  const query = (F.q || '').toLowerCase();
  return db.equipment.filter(e => !e.arch && (!query || `${e.name} ${e.id} ${e.cat} ${e.desc}`.toLowerCase().includes(query)) && (!F.cat || e.cat === F.cat) && (!F.st || eqs(e) === F.st) && (!F.cond || e.cond === F.cond)).sort((a, b) => F.sort === 'available' ? availQ(b) - availQ(a) : F.sort === 'id' ? a.id.localeCompare(b.id) : a.name.localeCompare(b.name));
};
const originalEquipmentCard = ecCard;
ecCard = e => originalEquipmentCard(e).replace('<button class="btn sm"', `<p class="equipment-description">${esc(e.desc)}</p><button class="btn sm"`);
A.clearFilters = function() { F = {}; render(); };

function notificationsView() {
  const all = db.notes.filter(n => n.uid === sess), list = all.filter(n => !F.st || !n.read);
  return `<div class="page-intro"><div><h3>Notifications</h3><p>${all.filter(n => !n.read).length} unread · Updates from your equipment office</p></div><button class="btn ghost" data-a="readAll">Mark all as read</button></div><div class="toolbar"><select data-f="st" aria-label="Notification filter"><option value="">All notifications</option><option value="unread" ${F.st ? 'selected' : ''}>Unread only</option></select></div><div id="list">${notificationRows(list)}</div>`;
}
function notificationRows(list) {
  return list.length ? `<div class="notification-list">${list.map(n => `<article class="notification ${n.read ? '' : 'unread'}"><span class="notification-icon" aria-hidden="true">🔔</span><div><p>${esc(n.msg)}</p><small>${esc(n.at)}</small></div>${!n.read ? `<button class="btn sm ghost" data-a="readNote" data-id="${n.id}">Mark as read</button>` : '<span class="mut">Read</span>'}</article>`).join('')}</div>` : '<p class="empty">No notifications in this list.</p>';
}
UV.notifications = AV.notifications = notificationsView;
LISTS['user/notifications'] = LISTS['admin/notifications'] = () => notificationRows(db.notes.filter(n => n.uid === sess && (!F.st || !n.read)));
A.readNote = function(d) { const note = db.notes.find(n => n.id === d.id && n.uid === sess); if (note) { note.read = true; refresh(); } };

function borrowedCard(b) {
  const r = res(b.rid), state = borrowerState(b);
  return `<article class="rc"><div class="rt"><b>${b.id}</b>${badge(state)}</div><p class="mut">Reservation ${r.id}</p><ul class="its">${b.items.map(i => `<li>${esc(eq(i.eq).name)} (${i.eq}) × ${i.qty}</li>`).join('')}</ul>${dl({ Borrowed: dt(b.outAt), 'Expected return': `${D(r.date)} at ${T(r.e)}`, ...(b.retAt ? { Returned: dt(b.retAt), 'Return ID': b.returnTransaction.id } : {}) })}${state === 'OVERDUE' ? '<p class="note bad">This equipment is overdue. Please return it to the equipment office for inspection.</p>' : state === 'DUE SOON' ? '<p class="note warn">Due within two hours. Please prepare to return all items.</p>' : ''}<div class="two"><button class="btn ghost" data-a="vres" data-id="${r.id}">View Details</button>${b.status === 'BORROWED' ? `<button class="btn" data-a="returnInstructions" data-id="${b.id}">Return Instructions</button>` : ''}</div></article>`;
}
UV.borrowed = function() {
  const list = db.brw.filter(b => b.uid === sess && (!F.st || borrowerState(b) === F.st)).sort(newest);
  return `<div class="page-intro"><div><h3>My Borrowed Equipment</h3><p>Track equipment in your care and its expected return time.</p></div></div><div class="toolbar"><select data-f="st" aria-label="Borrowing status"><option value="">All transactions</option>${opts(['ACTIVE', 'DUE SOON', 'OVERDUE', 'RETURNED'], F.st)}</select></div><div id="list">${list.length ? `<div class="rgrid">${list.map(borrowedCard).join('')}</div>` : '<p class="empty">No borrowing transactions in this list.</p>'}</div>`;
};
LISTS['user/borrowed'] = () => { const list = db.brw.filter(b => b.uid === sess && (!F.st || borrowerState(b) === F.st)).sort(newest); return list.length ? `<div class="rgrid">${list.map(borrowedCard).join('')}</div>` : '<p class="empty">No borrowing transactions in this list.</p>'; };
UV.history = function() {
  const reservations = db.res.filter(r => r.uid === sess && ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(r.status)).sort(newest);
  const returns = db.brw.filter(b => b.uid === sess && b.status === 'RETURNED').sort((a, b) => b.retAt.localeCompare(a.retAt));
  return panel('Reservation History', reservations.length ? `<div class="rgrid">${reservations.map(resCard).join('')}</div>` : '<p class="empty">No completed, rejected or cancelled reservations yet.</p>') + panel('Return History', tbl(['Return ID', 'Reservation', 'Returned', 'Equipment and condition', 'Remarks', 'Inspected by'], returns.map(b => `<tr><td>${b.returnTransaction.id}</td><td>${b.rid}</td><td>${dt(b.retAt)}</td><td>${b.items.map(i => `${esc(eq(i.eq).name)} × ${i.qty}: ${badge(i.cond)}`).join('<br>')}</td><td>${b.items.map(i => esc(i.rem) || 'No issues').join('<br>')}</td><td>${esc(usr(b.returnTransaction.inspectedBy).name)}</td></tr>`)));
};
A.returnInstructions = function(d) {
  const b = db.brw.find(b => b.id === d.id && b.uid === sess);
  if (!b) return toast('Borrowing transaction not found.', true);
  modal(`<h3>Return Instructions &amp; Check-in QR</h3><p>Bring every item listed in ${b.id} to the CMU equipment office by ${D(res(b.rid).date)} at ${T(res(b.rid).e)}.</p><div class="qr"><div id="returnqr"></div></div><p class="center"><b>${b.id}</b> · ${b.rid}</p><ol><li>Present your CMU ID and this check-in QR.</li><li>Return all equipment and accessories to the administrator.</li><li>The administrator will verify the transaction and inspect each item.</li><li>Your reservation will be completed after the inspection is recorded.</li></ol><div class="ft"><button class="btn" data-a="close">Understood</button></div>`);
  drawQR($('#returnqr'), JSON.stringify({ action: 'RETURN', b: b.id, r: b.rid }));
};

const baseReturnsView = AV.returns;
AV.returns = function(arg) {
  if (arg) return baseReturnsView(arg);
  return panel('Check-in · Verify Return QR', `<p class="mut">Paste the member's check-in QR value or enter their borrowing or reservation ID. Inspect each equipment item before confirming the return.</p><label for="returncode">Check-in QR / Transaction ID</label><div class="pwrow"><input id="returncode" placeholder="Enter a borrowing or reservation ID"><button class="btn" data-a="verifyReturn">Verify Return</button></div><div id="returnerr" class="err" role="alert"></div>`) + baseReturnsView(arg);
};
A.verifyReturn = function(d, el) {
  let value = val('returncode'), payload = null;
  try { if (value.startsWith('{')) payload = JSON.parse(value); } catch (e) { $('#returnerr').textContent = 'Invalid check-in QR. Please scan again.'; return; }
  const b = db.brw.find(b => b.id === (payload ? payload.b : value.toUpperCase()) || (!payload && b.rid === value.toUpperCase()));
  if (!b || b.status !== 'BORROWED' || (payload && (payload.action !== 'RETURN' || payload.r !== b.rid))) { $('#returnerr').textContent = 'This QR does not match an active borrowing awaiting return.'; return; }
  busy(el, 'Verifying...', () => {
    if (b.status !== 'BORROWED') return toast('This borrowing was already returned.', true);
    INSP = { bid: b.id, at: new Date().toISOString(), c: {}, r: {}, v: true };
    location.hash = '#/returns/' + b.id;
    toast('Check-in verified. Inspect every equipment item to complete the return.');
  }, 400);
};

const baseUserDashboard = UV.dashboard;
UV.dashboard = function() {
  const quickActions = `<div class="quick-actions"><a class="btn" href="#/equipment">Browse Equipment</a><a class="btn ok" href="#/reserve">Make Reservation</a><a class="btn ghost" href="#/my">View Reservations</a><a class="btn ghost" href="#/borrowed">View Borrowed Equipment</a></div>`;
  return baseUserDashboard().replace('<div class="pn">', quickActions + '<div class="pn">') + panel('Recent Activity', db.res.filter(r => r.uid === sess).sort(newest).slice(0, 5).map(resMini).join('') || '<p class="empty">No activity yet. Your reservations and returns will appear here.</p>');
};
const baseReservationCard = resCard;
resCard = function(r) {
  const html = baseReservationCard(r);
  return r.status === 'APPROVED' ? html.replace('>View QR Code</button>', `>View QR Code</button><button class="btn ghost" data-a="reservationInstructions" data-id="${r.id}">Instructions</button>`) : html;
};
A.reservationInstructions = function(d) {
  const r = res(d.id);
  if (!canViewReservation(r) || r.status !== 'APPROVED') return toast('Instructions are available for approved reservations.', true);
  modal(`<h3>Equipment Collection Instructions</h3><p>Your reservation <b>${r.id}</b> is approved for ${D(r.date)}, ${T(r.s)} – ${T(r.e)}.</p><ol><li>Bring your CMU ID and present the reservation QR at the equipment office.</li><li>The administrator will verify your identity, schedule, equipment and quantities.</li><li>Receive the equipment only after the administrator confirms release.</li><li>Return all items before ${T(r.e)} for individual condition inspection.</li></ol><div class="ft"><button class="btn" data-a="qr" data-id="${r.id}">View QR Code</button><button class="btn ghost" data-a="close">Close</button></div>`);
};
const baseReservationForm = UV.reserve;
UV.reserve = function() {
  let html = baseReservationForm();
  if (draft.step === 1) html = html.replace('<h3 style="margin-top:16px">Equipment</h3>', `<label for="rn">Additional notes <span class="mut">(optional)</span></label><textarea id="rn" rows="2" maxlength="1000" data-chk placeholder="Room, accessories, or other details for the equipment office">${esc(draft.notes)}</textarea><h3 style="margin-top:16px">Equipment</h3>`);
  else html = html.replace('<h3 style="margin-top:12px">Equipment</h3>', `<p><b>Additional notes:</b> ${esc(draft.notes) || 'None'}</p><h3 style="margin-top:12px">Equipment</h3>`);
  return `<div class="workflow-steps" aria-label="Reservation progress"><span class="${draft.step === 1 ? 'current' : ''}">1 · Equipment &amp; schedule</span><span class="${draft.step === 2 ? 'current' : ''}">2 · Review &amp; submit</span><span>3 · Admin approval</span></div>` + html;
};

AV.profile = UV.profile;
function conditionRows() {
  const query = (F.q || '').toLowerCase();
  const records = db.equipment.flatMap(e => e.hist.map(h => ({ e, h }))).filter(({ e, h }) => (!F.eq || e.id === F.eq) && (!F.cond || h.cond === F.cond) && (!query || `${e.name} ${e.id} ${h.rid} ${usr(h.by).name} ${h.rem}`.toLowerCase().includes(query))).sort((a, b) => b.h.date.localeCompare(a.h.date));
  return tbl(['Equipment', 'Condition', 'Remarks', 'Borrower', 'Reservation', 'Returned / inspected', 'Inspected by', 'Transaction'], records.map(({ e, h }) => `<tr><td>${esc(e.name)}<br><small>${e.id}</small></td><td>${badge(h.cond)}</td><td>${esc(h.rem) || 'No issues'}</td><td>${usr(h.by).role === 'admin' ? 'Office inspection' : `${esc(usr(h.by).name)}<br><small>${esc(h.by)}</small>`}</td><td>${h.rid || '—'}</td><td>${dt(h.date)}</td><td>${esc(usr(h.inspectedBy).name)}</td><td>${esc(h.txn)}</td></tr>`));
}
AV.conditions = function() { return `<div class="toolbar"><input data-f="q" placeholder="Search equipment, borrower or remarks" aria-label="Search condition history" value="${esc(F.q || '')}"><select data-f="eq" aria-label="Equipment"><option value="">All equipment</option>${db.equipment.map(e => `<option value="${e.id}" ${F.eq === e.id ? 'selected' : ''}>${esc(e.name)} (${e.id})</option>`).join('')}</select><select data-f="cond" aria-label="Condition"><option value="">All conditions</option>${opts(CONDS, F.cond)}</select><button class="btn ghost" data-a="clearFilters">Clear filters</button></div>${panel('Condition History', `<p class="mut">Permanent inspection records from returns and equipment office maintenance.</p><div id="list">${conditionRows()}</div>`)}`; };
LISTS['admin/conditions'] = conditionRows;
histModal = function(id) {
  const e = eq(id);
  if (!e) return toast('Equipment not found.', true);
  modal(`<h3>Condition History · ${esc(e.name)}</h3><p>${e.id}</p>${tbl(['Date', 'Condition', 'Remarks', 'Borrower', 'Reservation', 'Inspected by'], e.hist.map(h => `<tr><td>${dt(h.date)}</td><td>${badge(h.cond)}</td><td>${esc(h.rem) || 'No issues'}</td><td>${usr(h.by).role === 'admin' ? 'Office inspection' : esc(usr(h.by).name)}</td><td>${h.rid || '—'}</td><td>${esc(usr(h.inspectedBy).name)}</td></tr>`))}`);
};

const baseUsersView = AV.users;
AV.users = () => baseUsersView().replace(/(<button class="btn sm (?:bad|ok)" data-a="toggleUser" data-id="([^"]+)">)/g, '<button class="btn sm ghost" data-a="resetUserPassword" data-id="$2">Reset Password</button>$1');
A.toggleUser = function(d) {
  const u = db.users.find(u => u.id === d.id && u.role === 'user');
  if (!u) return toast('Only member accounts can be changed here.', true);
  confirmDlg(`${u.active ? 'Deactivate' : 'Activate'} the account for ${esc(u.name)}?`, () => { u.active = !u.active; refresh(); toast(`Account ${u.active ? 'activated' : 'deactivated'}.`); });
};
A.resetUserPassword = function(d) {
  const u = db.users.find(u => u.id === d.id && u.role === 'user');
  if (!u) return toast('Member account not found.', true);
  modal(`<h3>Reset member password</h3><p>Set a new password for ${esc(u.name)}. The member must be told the new password directly.</p><label for="newpw">New password</label><input id="newpw" type="password" minlength="6" autocomplete="new-password"><div id="pwrerr" class="err"></div><div class="ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-a="applyUserPassword" data-id="${esc(u.id)}">Set password</button></div>`);
};
A.applyUserPassword = function(d) {
  const u = db.users.find(user => user.id === d.id && user.role === 'user'), password = val('newpw');
  if (!u) return toast('Member account not found.', true);
  if (password.length < 6) { $('#pwrerr').textContent = 'Password must be at least 6 characters.'; return; }
  u.pw = password;
  notify(u.id, 'The equipment office changed your password. Contact an administrator if you did not expect this change.');
  closeModal(); refresh(); toast('Member password updated.');
};
const baseEquipmentForm = A.eqForm;
A.eqForm = function(d) {
  baseEquipmentForm(d);
  const e = d.id ? eq(d.id) : null;
  const field = document.createElement('div');
  field.innerHTML = `<label for="eacq">Date acquired</label><input id="eacq" type="date" max="${today()}" value="${e ? e.acquired : today()}">`;
  $('#eerr').before(field);
};
const baseSaveEquipment = A.saveEq;
A.saveEq = function(d) {
  const acquired = val('eacq'), code = val('ek').toUpperCase();
  if (acquired && (!validDate(acquired) || acquired > today())) { $('#eerr').textContent = 'Enter a valid acquisition date on or before today, or leave it blank if unknown.'; return; }
  const current = d.id ? eq(d.id) : null;
  if (['Major Damage', 'Needs Maintenance'].includes(val('eo')) && val('es') !== 'MAINTENANCE' && (!current || current.cond !== val('eo') || !maintQ(current))) { $('#eerr').textContent = 'Major damage and maintenance conditions require the Maintenance status.'; return; }
  if (current) {
    const quantity = Number(val('eqq')), capacity = quantity - (val('es') === 'MAINTENANCE' ? quantity : current.status === 'MAINTENANCE' && val('es') === 'AVAILABLE' ? 0 : current.maint || 0);
    const commitments = db.res.filter(r => r.status === 'APPROVED' && r.items.some(i => i.eq === current.id));
    const maximum = Math.max(0, ...commitments.map(r => stockDemand(current.id, r.date, r.s, r.e, null, ['APPROVED', 'BORROWED'])));
    if (capacity < borrowedQ(current.id) || (commitments.length && (val('es') !== 'AVAILABLE' || capacity < maximum))) { $('#eerr').textContent = 'This change would invalidate borrowed equipment or approved reservations. Resolve those transactions first.'; return; }
  }
  baseSaveEquipment(d);
  if ($('#modal').hidden) { eq(d.id || code).acquired = acquired; save(); }
};
const baseEquipmentDetail = eqDetail;
eqDetail = function(id) { baseEquipmentDetail(id); const date = document.createElement('p'); date.className = 'mut'; date.textContent = 'Date acquired: ' + (eq(id).acquired ? D(eq(id).acquired) : 'Not recorded'); $('#modal .ft').before(date); };

const baseReleasePanel = relPanel;
relPanel = function() {
  const html = baseReleasePanel();
  if (REL.done) return html;
  const error = releaseError(res(REL.rid));
  return error ? html.replace('<div id="rerr" class="err"></div>', `<div id="rerr" class="err" role="alert">${esc(error)}</div>`).replace('data-a="release"', 'data-a="release" disabled') : html;
};

const baseSaveCondition = A.saveCond;
A.saveCond = function(d) {
  if (['Major Damage', 'Needs Maintenance'].includes(val('cc')) && val('cs') !== 'MAINTENANCE') { $('#cerr').textContent = 'Major damage and maintenance conditions require the Maintenance status.'; return; }
  const equipment = eq(d.id);
  if (val('cs') !== 'AVAILABLE' && db.res.some(r => r.status === 'APPROVED' && r.items.some(i => i.eq === equipment.id))) { $('#cerr').textContent = 'Resolve approved reservations before taking this equipment out of service.'; return; }
  if (val('cs') === 'MAINTENANCE' && borrowedQ(equipment.id)) { $('#cerr').textContent = 'Return borrowed units before marking the entire equipment stock as under maintenance.'; return; }
  baseSaveCondition(d);
};

const basePrintReport = A.print;
A.print = function() { if (!REP) return basePrintReport(); document.body.classList.add('print-report'); window.print(); };
window.addEventListener('afterprint', () => document.body.classList.remove('print-report'));

const baseAnalytics = AV.analytics;
AV.analytics = function() {
  const html = baseAnalytics(), range = anRange();
  if (!range) return html;
  const bor = db.brw.filter(b => datePart(b.outAt) >= range.from && datePart(b.outAt) <= range.to);
  const values = db.equipment.filter(e => !e.arch).map(e => [e.name, bor.filter(b => b.items.some(i => i.eq === e.id)).length]).sort((a, b) => b[1] - a[1]);
  const hasData = db.res.some(r => r.date >= range.from && r.date <= range.to) || bor.length;
  return (hasData ? '' : '<p class="note" role="status">No transaction data for the selected period. Choose another date range to view activity.</p>') + html.replace('Frequently Used Equipment', 'Most Frequently Reserved Equipment').replace(/Busiest window: <b>[^<]+<\/b>/, hasData ? '$&' : 'No peak period: no reservations in this range.') + panel('Most Frequently Borrowed Equipment', bor.length ? bars(values.slice(0, 5), v => v === 1 ? ' borrowing' : ' borrowings') : '<p class="empty">No borrowings in this period.</p>');
};

renderUserApp = function() {
  const [requested] = route(), key = Object.hasOwn(UV, requested) ? requested : 'dashboard';
  if (requested && !Object.hasOwn(UV, requested)) { history.replaceState(null, '', '#/dashboard'); toast('This page is unavailable to your account.', true); }
  const current = UNAV_NAV.find(n => n[0] === key);
  $('#ut').textContent = current ? current[1] : 'Dashboard';
  $('#back').hidden = key !== 'reserve';
  const link = (n, mobile) => `<a href="#/${n[0]}" class="${n[0] === key ? 'on' : ''}" ${n[0] === key ? 'aria-current="page"' : ''}><span aria-hidden="true">${n[2]}</span>${mobile ? ({ dashboard: 'Home', my: 'Reservations', borrowed: 'Borrowed' }[n[0]] || n[1]) : n[1]}</a>`;
  const mobile = innerWidth < 1024, bottom = UNAV_NAV.filter(n => ['dashboard', 'equipment', 'my', 'borrowed'].includes(n[0]));
  $('#unav').innerHTML = (mobile ? bottom : UNAV_NAV).map(n => link(n, mobile)).join('') + (mobile ? `<button class="more-button ${bottom.some(n => n[0] === key) ? '' : 'on'}" data-a="userMenu" aria-expanded="false"><span aria-hidden="true">☰</span>More</button>` : '<button class="user-logout" data-a="logout"><span aria-hidden="true">🚪</span>Logout</button>');
  $('#umenu').hidden = true;
  $('#umenu').innerHTML = `<div class="member-menu" role="dialog" aria-modal="true" aria-label="Member navigation" tabindex="-1"><div class="page-intro"><h3>CMU Equipment</h3><button class="ib dark" data-a="userMenu" aria-label="Close menu">✕</button></div><nav aria-label="More member pages">${UNAV_NAV.map(n => link(n, false)).join('')}<button class="btn ghost full" data-a="logout">Logout</button></nav></div>`;
  $('#uview').innerHTML = UV[key]();
};
A.userMenu = function() {
  const menu = $('#umenu'); menu.hidden = !menu.hidden;
  $('#unav .more-button').setAttribute('aria-expanded', String(!menu.hidden));
  $('#uview').inert = !menu.hidden;
  if (!menu.hidden) $('.member-menu').focus(); else $('#unav .more-button').focus();
};
const baseAdminRender = renderAdminApp;
renderAdminApp = function() {
  const [requested] = route();
  if (requested && !Object.hasOwn(AV, requested)) { history.replaceState(null, '', '#/dashboard'); toast('This page is unavailable to your account.', true); }
  baseAdminRender();
  $$('#anav a.on,#abnav a.on').forEach(a => a.setAttribute('aria-current', 'page'));
};

const baseModal = modal, baseCloseModal = closeModal;
let modalTrigger = null;
modal = function(html) {
  if ($('#modal').hidden) modalTrigger = document.activeElement;
  baseModal(html);
  const heading = $('#modal h3');
  if (heading) { heading.id = 'dialog-heading'; $('#modal .mb').setAttribute('aria-labelledby', heading.id); }
  $$('#modal .err').forEach(e => e.setAttribute('role', 'alert'));
  ['login', 'uapp', 'aapp'].forEach(id => { $('#' + id).inert = true; });
  document.body.classList.add('dialog-open');
  const focus = $('#modal input:not([readonly]),#modal select,#modal textarea,#modal .x');
  if (focus) focus.focus();
};
closeModal = function() {
  const wasOpen = !$('#modal').hidden;
  baseCloseModal();
  ['login', 'uapp', 'aapp'].forEach(id => { $('#' + id).inert = false; });
  document.body.classList.remove('dialog-open');
  if (wasOpen && modalTrigger && modalTrigger.isConnected) modalTrigger.focus();
};
function hydrateAccessibility() {
  $$('.err').forEach(e => e.setAttribute('role', 'alert'));
  $$('#uview label:not([for]),#aview label:not([for]),#modal label:not([for])').forEach((label, i) => {
    const next = label.nextElementSibling;
    if (next && /^(INPUT|SELECT|TEXTAREA)$/.test(next.tagName)) { next.id = next.id || `field-${i}`; label.htmlFor = next.id; }
  });
}
const baseRender = render;
render = function() {
  $('#uview').inert = false;
  baseRender();
  $('#admin-setup-link').hidden = legacyResetRequired || db.users.some(user => user.role === 'admin');
  hydrateAccessibility();
  document.title = me() ? `${me().role === 'admin' ? $('#at').textContent : $('#ut').textContent} | CMU Equipment` : 'CMU Equipment Reservation and Management System';
};

// Guard delegated actions as well as route navigation in this frontend simulation.
const adminActions = new Set('appr rej doReject verifyReservationId verify verifyReturn release confirmReturn eqForm saveEq arch catForm saveCat catArch condForm saveCond repair doRepair vuser uhist toggleUser resetUserPassword applyUserPassword gen csv print reset'.split(' '));
const memberActions = new Set('reserveEq addItem rmItem qty toReview editRes submitRes returnInstructions'.split(' '));
const publicActions = new Set('togglePw showSignup showAdminSetup showLogin forgot sendCode resetPw setupAdmin confirmAdminSetup yes close pt migrationBackup migrationReset'.split(' '));
Object.keys(A).forEach(name => {
  const action = A[name];
  A[name] = function(...args) {
    if (legacyResetRequired && !['migrationBackup', 'migrationReset'].includes(name)) return toast('Review and resolve the existing-browser-data notice first.', true);
    const account = me();
    if ((!account && !publicActions.has(name)) || (adminActions.has(name) && account.role !== 'admin') || (memberActions.has(name) && account.role !== 'user')) return toast('This action is unavailable to your account.', true);
    return action(...args);
  };
});
const togglePasswordAction = A.togglePw;
A.togglePw = function(d, el) { togglePasswordAction(d); if (el) { const showing = $('#' + d.t).type === 'text'; el.setAttribute('aria-pressed', String(showing)); el.setAttribute('aria-label', showing ? 'Hide password' : 'Show password'); } };

document.addEventListener('keydown', e => {
  const dialog = !$('#modal').hidden ? $('#modal .mb') : !$('#umenu').hidden ? $('.member-menu') : null;
  if (e.key === 'Escape' && !$('#umenu').hidden) A.userMenu();
  if (e.key === 'Tab' && dialog) {
    const focusable = [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')];
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { e.preventDefault(); first.focus(); }
  }
});
document.addEventListener('click', e => { if (e.target.id === 'umenu') A.userMenu(); });
window.addEventListener('storage', e => {
  if (e.key === KEY || e.key === SKEY) { closeModal(); db = load(); sess = localStorage.getItem(SKEY); INSP = null; REL = null; render(); if (legacyResetRequired) showLegacyResetNotice(); }
});
window.addEventListener('resize', () => { if (me() && me().role === 'user' && ((innerWidth < 1024) !== !!$('#unav .more-button'))) renderUserApp(); });
setInterval(() => { if (me()) { sweep(); const count = db.notes.filter(n => n.uid === sess && !n.read).length; $('#ubc').textContent = count || ''; $('#abc').textContent = count || ''; } }, 60000);

function showLegacyResetNotice() {
  let corrupt = false;
  try { JSON.parse(legacyStorageRaw); } catch (e) { corrupt = true; }
  modal(`<h3>Existing browser data needs review</h3><p>${corrupt ? 'The saved application data is unreadable.' : 'This browser contains data from an older version. It may include demonstration records as well as records you created.'} To ensure old sample data does not return, the application is paused until you explicitly reset the old data.</p><p><b>Resetting permanently clears all accounts, equipment, categories, reservations, transactions, condition history and notifications stored in this browser.</b> Download a backup first if you may need any of it.</p><div class="ft"><button class="btn ghost" data-a="migrationBackup">Download backup</button><button class="btn bad" data-a="migrationReset">Reset old data and continue</button></div>`);
}
db = load();
if (!legacyResetRequired) save();
setDevice();
render();
if (legacyResetRequired) showLegacyResetNotice();
