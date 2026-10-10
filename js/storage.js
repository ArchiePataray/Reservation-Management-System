/* Persistent frontend simulation. Nested records are the canonical source of truth.
   relationalSnapshot() exposes the planned database tables without storing duplicates. */
function emptyData() {
  return { schemaVersion: 11, users: [], equipment: [], cats: [], res: [], brw: [], notes: [], seq: { res: 1, brw: 1, ret: 1 } };
}

function removeUnmodifiedSampleCatalog(data) {
  data.cats = data.cats || [];
  data.equipment = data.equipment || [];
  if ((data.res || []).length || (data.brw || []).length || data.equipment.some(e => (e.hist || []).length)) return false;
  const matches = (categories, equipment) => data.cats.length === categories.length
    && data.cats.every(c => categories.includes(c.name) && !c.arch)
    && data.equipment.length === equipment.length
    && data.equipment.every(e => {
      const record = equipment.find(item => item[0] === e.id);
      return record && e.name === record[1] && e.cat === record[2] && e.qty === record[3] && e.desc === record[4]
        && !e.acquired && e.cond === 'Good' && e.status === 'AVAILABLE'
        && !e.arch && !(e.maint || 0) && !e.flag;
    });
  const original = matches(
    ['Computing', 'Audio/Visual', 'Camera', 'Furniture', 'Other'],
    [
      ['PRJ-0001', 'Projector', 'Audio/Visual', 5, 'HD projector with HDMI and VGA cables.'],
      ['LAP-0003', 'Laptop', 'Computing', 10, 'Core i5 laptop with charger for classroom and research use.'],
      ['CAM-0002', 'Camera', 'Camera', 2, 'DSLR camera with tripod and memory card.'],
      ['MIC-0001', 'Microphone', 'Audio/Visual', 4, 'Wireless handheld microphone set.'],
      ['SPK-0001', 'Speaker', 'Audio/Visual', 3, 'Portable PA speaker with stand.'],
      ['TBL-0001', 'Table', 'Furniture', 12, 'Folding event table, 6 ft.'],
      ['EXT-0001', 'Extension Cord Set', 'Other', 6, '5-meter extension cord with surge protection.'],
      ['PRJ-0002', 'Projector #002', 'Audio/Visual', 1, 'Spare projector with lamp issue.'],
      ['TRI-0001', 'Tripod', 'Camera', 3, 'Adjustable camera tripod with carrying bag.'],
      ['SCR-0001', 'Projector Screen', 'Audio/Visual', 2, 'Portable pull-up projection screen.']
    ]
  );
  const previous = matches(
    ['Audio-Visual', 'Computing & Accessories', 'Audio Equipment', 'Classroom & Event Equipment'],
    [
      ['AV-001', 'LCD Projector', 'Audio-Visual', 2, 'Suggested quantity; verify actual stock.'],
      ['AV-002', 'Projection Screen', 'Audio-Visual', 2, 'Suggested quantity; verify actual stock.'],
      ['CMP-001', 'Laptop', 'Computing & Accessories', 3, 'Suggested quantity; verify actual stock.'],
      ['CMP-002', 'HDMI Cable', 'Computing & Accessories', 6, 'Suggested quantity; verify actual stock.'],
      ['AUD-001', 'PA Speaker', 'Audio Equipment', 2, 'Suggested quantity; verify actual stock.'],
      ['AUD-002', 'Wireless Microphone', 'Audio Equipment', 4, 'Suggested quantity; verify actual stock.'],
      ['CLS-001', 'Extension Cord', 'Classroom & Event Equipment', 4, 'Suggested quantity; verify actual stock.'],
      ['CLS-002', 'Webcam', 'Classroom & Event Equipment', 2, 'Suggested quantity; verify actual stock.']
    ]
  );
  if (!original && !previous) return false;
  data.cats = [];
  data.equipment = [];
  return true;
}

function migrateData(data) {
  data.schemaVersion = 11;
  data.users = data.users || [];
  data.equipment = data.equipment || [];
  data.cats = data.cats || [];
  data.res = data.res || [];
  data.brw = data.brw || [];
  data.notes = data.notes || [];
  data.seq = data.seq || {};
  data.seq.res = data.seq.res || data.res.length + 1;
  data.seq.brw = data.seq.brw || data.brw.length + 1;
  data.seq.ret = data.seq.ret || data.brw.length + 1;
  data.cats.forEach((c, i) => { c.id = c.id || `CAT-${String(i + 1).padStart(4, '0')}`; });
  data.res.forEach(r => {
    r.notes = r.notes || '';
    r.items.forEach((it, i) => { it.id = it.id || `RI-${r.id}-${i + 1}`; });
    r.approvals = r.approvals || [];
  });
  data.brw.forEach(b => {
    const reservation = data.res.find(r => r.id === b.rid);
    b.items.forEach(it => { it.reservationItemId = it.reservationItemId || (reservation && reservation.items.find(i => i.eq === it.eq) || {}).id; });
  });
  data.equipment.forEach(e => {
    e.hist = e.hist || [];
    e.hist.forEach(h => { h.id = h.id || 'COND-' + crypto.randomUUID(); });
  });
  data.notes.forEach((n, i) => { n.id = n.id || `NTF-LEGACY-${i + 1}`; });
  return data;
}

function relationalSnapshot() {
  const reservations = db.res.map(({ items, approvals, qr, ...r }) => r);
  return {
    schemaVersion: db.schemaVersion,
    users: db.users.map(({ pw, ...u }) => u),
    equipment: db.equipment.map(({ hist, ...e }) => ({ ...e, categoryId: (db.cats.find(c => c.name === e.cat) || {}).id })),
    categories: db.cats,
    reservations,
    reservationItems: db.res.flatMap(r => r.items.map(i => ({ ...i, reservationId: r.id }))),
    approvals: db.res.flatMap(r => (r.approvals || []).map(a => ({ ...a, reservationId: r.id }))),
    qrCodes: db.res.filter(r => r.qr).map(r => ({ ...r.qr, reservationId: r.id, status: r.status })),
    borrowingTransactions: db.brw.map(({ returnTransaction, ...b }) => b),
    returnTransactions: db.brw.filter(b => b.returnTransaction).map(b => ({ ...b.returnTransaction, borrowingId: b.id, reservationId: b.rid, borrowerId: b.uid, items: b.items })),
    equipmentConditions: db.equipment.flatMap(e => e.hist.map(h => ({ ...h, equipmentId: e.id }))),
    notifications: db.notes,
    utilizationData: db.equipment.map(e => ({ equipmentId: e.id, reservations: db.res.filter(r => ['APPROVED', 'BORROWED', 'COMPLETED'].includes(r.status) && r.items.some(i => i.eq === e.id)).length, borrowings: db.brw.filter(b => b.items.some(i => i.eq === e.id)).length }))
  };
}

function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00')) && ld(new Date(v + 'T00:00:00')) === v; }
function datePart(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ld(new Date(value)); }
function validTime(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(v); }
function canViewReservation(r) { return r && me() && (me().role === 'admin' || r.uid === sess); }
function borrowerState(b) {
  if (b.status === 'RETURNED') return 'RETURNED';
  const remaining = dueAt(res(b.rid)) - new Date();
  return remaining < 0 ? 'OVERDUE' : remaining <= 2 * 3600000 ? 'DUE SOON' : 'ACTIVE';
}

// Measure the busiest instant in the requested interval. Separate appointments
// within a long reservation must not be added as if they happen simultaneously.
function stockDemand(id, date, startTime, endTime, ignoreId, statuses) {
  const start = +new Date(`${date}T${startTime}`), end = +new Date(`${date}T${endTime}`), changes = new Map();
  const add = (from, to, quantity) => {
    const a = Math.max(start, +from), z = Math.min(end, +to);
    if (!quantity || a >= z) return;
    changes.set(a, (changes.get(a) || 0) + quantity);
    changes.set(z, (changes.get(z) || 0) - quantity);
  };
  db.res.filter(r => r.id !== ignoreId && r.status !== 'BORROWED' && (statuses || ['PENDING', 'APPROVED']).includes(r.status) && r.date === date).forEach(r => add(new Date(`${r.date}T${r.s}`), new Date(`${r.date}T${r.e}`), r.items.filter(i => i.eq === id).reduce((n, i) => n + i.qty, 0)));
  db.brw.filter(b => b.status === 'BORROWED' && b.rid !== ignoreId).forEach(b => add(new Date(b.outAt), over(b) ? new Date(end) : dueAt(res(b.rid)), b.items.filter(i => i.eq === id).reduce((n, i) => n + i.qty, 0)));
  let used = 0, maximum = 0;
  [...changes.entries()].sort((a, b) => a[0] - b[0]).forEach(([, change]) => { used += change; maximum = Math.max(maximum, used); });
  return maximum;
}

function releaseError(r) {
  if (!r || r.status !== 'APPROVED' || brwOf(r.id)) return 'Only an approved reservation awaiting release can be borrowed.';
  if (!usr(r.uid).active) return 'The borrower account is inactive.';
  if (r.date !== today()) return 'Equipment can only be released on the reservation date.';
  if (dueAt(r) <= new Date()) return 'The reservation end time has already passed.';
  const bad = r.items.find(i => !eq(i.eq) || eq(i.eq).arch || availQ(eq(i.eq)) < i.qty);
  return bad ? `${eq(bad.eq).name} is not currently available for release.` : '';
}

function approvalError(r) {
  if (!r || r.status !== 'PENDING') return 'Only a pending reservation can be approved.';
  if (!usr(r.uid).active) return 'This requester account is inactive.';
  if (dueAt(r) <= new Date()) return 'This reservation schedule has already ended.';
  const bad = r.items.find(i => slotAvail(i.eq, r.date, r.s, r.e, r.id, ['APPROVED', 'BORROWED']) < i.qty);
  return bad ? `${eq(bad.eq).name} is not available for this schedule.` : '';
}
