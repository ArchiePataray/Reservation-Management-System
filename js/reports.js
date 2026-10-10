/* Reports are derived from the same canonical transactions as the operational views. */
reportRows = function(type, from, to, filters = {}) {
  const within = d => d && datePart(d) >= from && datePart(d) <= to;
  const equipment = db.equipment.filter(e => (!filters.cat || e.cat === filters.cat) && (!filters.eq || e.id === filters.eq));
  const selected = new Set(equipment.map(e => e.id));
  const items = list => list.filter(i => selected.has(i.eq));
  const itemNames = list => items(list).map(i => `${eq(i.eq).name} (${i.eq}) × ${i.qty}`).join('; ');
  const statusOK = s => !filters.st || filters.st === s;
  const reservations = db.res.filter(r => within(r.date) && items(r.items).length && statusOK(r.status));
  const borrowings = db.brw.filter(b => within(b.outAt) && items(b.items).length && statusOK(over(b) ? 'OVERDUE' : b.status));
  if (type === 'Reservation Report') return {
    head: ['Reservation ID', 'CMU ID', 'Requester', 'Date', 'Time', 'Equipment', 'Purpose', 'Status', 'Submitted', 'Decision by'],
    rows: reservations.sort(newest).map(r => [r.id, r.uid, usr(r.uid).name, r.date, `${T(r.s)} – ${T(r.e)}`, itemNames(r.items), r.purpose, r.status, dt(r.created), r.approvals.length ? usr(r.approvals.at(-1).by).name : '—'])
  };
  if (type === 'Borrowing Report') return {
    head: ['Transaction', 'Reservation', 'Borrower', 'Equipment', 'Borrowed', 'Expected return', 'Status', 'Released by'],
    rows: borrowings.sort(newest).map(b => [b.id, b.rid, `${usr(b.uid).name} (${b.uid})`, itemNames(b.items), dt(b.outAt), `${D(res(b.rid).date)} ${T(res(b.rid).e)}`, over(b) ? 'OVERDUE' : b.status, usr(b.releasedBy).name])
  };
  if (type === 'Return Report') return {
    head: ['Return ID', 'Borrowing', 'Reservation', 'Borrower', 'Returned', 'Equipment and condition', 'Remarks', 'Inspected by'],
    rows: db.brw.filter(b => b.status === 'RETURNED' && within(b.retAt) && items(b.items).length && statusOK('RETURNED')).sort((a, b) => b.retAt.localeCompare(a.retAt)).map(b => [b.returnTransaction.id, b.id, b.rid, `${usr(b.uid).name} (${b.uid})`, dt(b.retAt), items(b.items).map(i => `${eq(i.eq).name} × ${i.qty}: ${i.cond}`).join('; '), items(b.items).map(i => i.rem || 'No issues').join('; '), usr(b.returnTransaction.inspectedBy).name])
  };
  if (type === 'Equipment Condition Report' || type === 'Maintenance Report') {
    const maintenance = type === 'Maintenance Report';
    return {
      head: ['Inspection date', 'Equipment ID', 'Equipment', 'Condition', 'Remarks', 'Borrower', 'Reservation', 'Borrowing', 'Inspected by'],
      rows: equipment.flatMap(e => e.hist.filter(h => within(h.date) && (!maintenance || ['Major Damage', 'Needs Maintenance'].includes(h.cond)) && statusOK(h.cond.toUpperCase())).map(h => ({ date: h.date, row: [dt(h.date), e.id, e.name, h.cond, h.rem || 'No issues', usr(h.by).role === 'admin' ? 'Office inspection' : `${usr(h.by).name} (${h.by})`, h.rid || '—', h.txn, usr(h.inspectedBy).name] }))).sort((a, b) => b.date.localeCompare(a.date)).map(x => x.row)
    };
  }
  const effective = reservations.filter(r => ['APPROVED', 'BORROWED', 'COMPLETED'].includes(r.status));
  const hours = id => effective.reduce((n, r) => n + hrs(r) * r.items.filter(i => i.eq === id).reduce((q, i) => q + i.qty, 0), 0);
  const totalHours = equipment.reduce((n, e) => n + hours(e.id), 0);
  return {
    head: ['Equipment ID', 'Equipment', 'Reservations', 'Units reserved', 'Times borrowed', 'Unit-hours reserved', 'Share of usage'],
    rows: equipment.map(e => [e.id, e.name, effective.filter(r => r.items.some(i => i.eq === e.id)).length, lineQ(effective, e.id), borrowings.filter(b => b.items.some(i => i.eq === e.id)).length, hours(e.id).toFixed(1), totalHours ? (hours(e.id) / totalHours * 100).toFixed(1) + '%' : '0%']).sort((a, b) => b[2] - a[2])
  };
};

function reportStatusOptions(type) {
  if (type === 'Reservation Report' || type === 'Equipment Utilization Report') return ['PENDING', 'APPROVED', 'BORROWED', 'COMPLETED', 'REJECTED', 'CANCELLED'];
  if (type === 'Borrowing Report') return ['BORROWED', 'OVERDUE', 'RETURNED'];
  if (type === 'Return Report') return ['RETURNED'];
  return CONDS.map(c => c.toUpperCase());
}

AV.reports = function() {
  const type = REP ? REP.t : REPORTS[0], filters = REP ? REP.filters || {} : {};
  return panel('Generate Report', `<div class="form-grid"><div><label for="rt">Report type</label><select id="rt">${opts(REPORTS, type)}</select></div><div><label for="rf">From</label><input id="rf" type="date" value="${REP ? REP.a : addDays(-60)}"></div><div><label for="rto">To</label><input id="rto" type="date" value="${REP ? REP.z : today()}"></div><div><label for="rcat">Category</label><select id="rcat"><option value="">All categories</option>${opts(db.cats.map(c => c.name), filters.cat)}</select></div><div><label for="req">Equipment</label><select id="req"><option value="">All equipment</option>${db.equipment.map(e => `<option value="${e.id}" ${filters.eq === e.id ? 'selected' : ''}>${esc(e.name)} (${e.id})</option>`).join('')}</select></div><div><label for="rst">Status / condition</label><select id="rst"><option value="">All statuses</option>${opts(reportStatusOptions(type), filters.st)}</select></div></div><div id="rerr" class="err" role="alert"></div><div class="exp"><button class="btn ok" data-a="gen">View Report</button><button class="btn ghost" data-a="print">Print / Save PDF</button><button class="btn ghost" data-a="csv">Export CSV</button></div>`) + panel('Report Preview', `<div id="rep">${repHtml()}</div>`);
};
A.gen = function(d, el) {
  const t = val('rt'), a = val('rf'), z = val('rto'), filters = { cat: val('rcat'), eq: val('req'), st: val('rst') };
  if (!validDate(a) || !validDate(z) || a > z) { $('#rerr').textContent = 'Choose a valid date range with the start on or before the end.'; return; }
  $('#rerr').textContent = '';
  $('#rep').innerHTML = loading('Generating report...');
  busy(el, 'Generating...', () => { REP = { t, a, z, filters, ...reportRows(t, a, z, filters) }; $('#rep').innerHTML = repHtml(); toast('Report generated from system transactions.'); }, 400);
};
A.csv = function() {
  if (!REP) return toast('View a report first, then export it.', true);
  const cell = value => { let s = String(value); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  download(REP.t.replace(/\s+/g, '_') + '.csv', 'text/csv;charset=utf-8', '\uFEFF' + [REP.head, ...REP.rows].map(r => r.map(cell).join(',')).join('\r\n'));
  toast('Report exported as CSV.');
};
document.addEventListener('change', e => {
  if (e.target.id === 'rt') $('#rst').innerHTML = '<option value="">All statuses</option>' + opts(reportStatusOptions(e.target.value));
});
