# CMU Equipment Reservation, Management and Utilization Analytics

A browser-only demonstration application built with HTML, CSS, and vanilla JavaScript. It starts with no users, categories, equipment, reservations, transactions, notifications, or history.

## Run

Open `index.html` in a modern browser, or serve this folder from a local web server. Use the same browser profile and origin to retain records. There are no package installation or database setup steps.

## First use and roles

1. An authorized local operator can select **Set up first administrator** on the login page, then enter their own account details and choose a password. Setup asks for explicit confirmation and is hidden once an administrator exists. The application cannot verify the operator's identity; anyone with access before the first administrator is set up can claim this role.
2. Members can select **Create account** to register. Public registration creates member accounts only and cannot assign the administrator role.

This browser-only bootstrap is for local demonstration use, not secure provisioning. Client-side role checks can be bypassed; do not expose the app as a production system or treat this as authorization.

## Demonstrate the workflow

1. The application starts with empty categories and equipment. An administrator can create categories and equipment records using the management pages. Existing custom inventory is preserved during updates. The update clears only the exact, untouched sample catalogs that were briefly added by previous versions.
2. As a registered member, select equipment, choose a future schedule, add multiple items and quantities, review the request, and submit it.
3. As an administrator, approve the request or reject it with a reason. Approval creates a QR code tied to that reservation.
4. As the member, open the approved reservation to display its QR code. At release, the administrator may enter the reservation ID or paste the QR value; camera scanning is not implemented.
5. Confirm the borrower, schedule, equipment, and quantities, then release the equipment. The borrowing transaction references its reservation and reserved items.
6. At return, the administrator verifies the borrowing/reservation ID or check-in QR, confirms the transaction, and records each item's condition. Non-good conditions require remarks. Returns update availability and append linked condition history.
7. Review the resulting notifications, dashboard counts, analytics, reports, and CSV exports. They are derived only from records currently stored in the browser.

Reservation stock and schedule checks, conflict validation, approval/rejection history, QR validation, borrowing, return inspection, maintenance, and member/admin views remain connected. Password recovery displays a verification code in the browser; no email is sent.

## Existing browser data and reset

The application stores its data in LocalStorage under `cmu_eq_db_v4` and its login session under `cmu_eq_session_v4`. Passwords are stored in browser data. There is no server, MySQL database, API, email service, or server-side authentication.

The current schema is version 11. Exact, untouched sample catalogs from recent versions are removed so the inventory returns to an empty state; customized equipment and categories are preserved. Databases older than version 7 are not loaded into the interface or silently overwritten. The app pauses and asks the operator to download a JSON backup or explicitly confirm clearing the old database and saved session. The confirmed reset starts a new empty database. Review and retain the backup before confirming if any older records may be legitimate.

The administrator **Settings → Reset all browser data** action requires confirmation and removes all current browser records, including accounts. It does not recreate sample content.

## Project files

```text
index.html             Application shell, login and registration forms
style.css              Shared components and responsive layouts
css/final.css          Final visual system, mobile navigation and print layout
script.js              Reservation, approval, borrowing, return and management logic
js/storage.js          Empty initial state, schema handling and relationship adapter
js/reports.js          Transaction-based reports, CSV export and report UI
js/interface.js        Additional views, accessibility, guards and startup
js/vendor/qrcode.min.js Local QRCode.js dependency
tests/browser-workflow.cjs Browser regression test (Node.js and Chrome; no npm packages)
```

`relationalSnapshot()` exposes derived relational tables for future integration work; it does not connect to or create a MySQL database. Any production use needs a backend, server-side authentication and authorization, secure password hashing, validation, and atomic stock operations.

## Verification

Run `node tests/browser-workflow.cjs` on Windows with Chrome installed. The test starts a temporary local server and headless Chrome with a temporary isolated browser profile. It covers empty initialization, signup, role boundaries, inventory, reservation approval, QR validation, borrowing, returns, reports, persistence, legacy reset, and desktop/tablet/mobile layouts. The test summary is written to `tests/last-run.json`.

## Dependency license

`js/vendor/qrcode.min.js` is QRCode.js by David Shim, distributed under the MIT license. See `js/vendor/LICENSE.txt`.
