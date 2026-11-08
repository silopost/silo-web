# silo-web

**Web client of Silopost**, the open-source, self-hosted Gmail alternative: a Gmail-like
single-page app and PWA in React 19, TypeScript (strict), Vite and Tailwind CSS 4, talking to
[`silo-server`](https://github.com/silopost/silo-server) through `/api/v1/*`.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/badge/release-v0.4.0-informational.svg)](https://github.com/silopost/silo-web/releases)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933.svg)](.nvmrc)
[![CI](https://github.com/silopost/silo-web/actions/workflows/ci.yml/badge.svg)](https://github.com/silopost/silo-web/actions/workflows/ci.yml)

## Contents

- [What is Silopost?](#what-is-silopost)
- [Features](#features)
- [Repositories](#repositories)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Running in production](#running-in-production)
- [Development](#development)
- [Feature reference](#feature-reference)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Testing](#testing)
- [End-to-end tests](#end-to-end-tests)
- [API contract](#api-contract)
- [Status and roadmap](#status-and-roadmap)
- [Contributing](#contributing)
- [License](#license)

## What is Silopost?

Silopost gives you the Gmail experience on your own server and **without Gmail's limits**: no
15 GB cap shared with Drive and Photos, no ads, several mailboxes from any providers side by side,
and nobody who can lock you out. It is a **mail client** (like Roundcube or Thunderbird with
Gmail's UX), not a mail server: it connects to any IMAP/SMTP server, and storage is bounded only by
that server's disk. The overview, the Gmail comparison and the deployment stack are in the
[`silo`](https://github.com/silopost/silo) repository.

## Features

- Gmail layout: left navigation with counters and folders, conversation list with virtualisation
  (5000 threads), selection, hover actions, pending-sync icons, sync and offline banners.
- Thread view: sanitised HTML in a sandboxed iframe without scripts, remote images blocked until
  allowed, attachments with thumbnails, bodies loaded on demand.
- Instant actions with **Undo** (archive, trash, spam, read/unread, star, labels, move).
- Compose in several windows (normal, minimised, full screen): TipTap editor, address suggestions,
  attachments with progress, inline images, server autosave, reply / reply all / forward,
  **undo send**, **scheduled send**.
- Search with Gmail operators, suggestions, chips and an advanced search form.
- Snooze, Scheduled list, filters, user labels (nested, coloured, stored as IMAP keywords), settings
  shared across clients, desktop notifications.
- Multiple accounts with an account switcher, unread badges, a "From" picker, **Add account** with
  autoconfiguration and **Sign in with Google / Microsoft** (OAuth2).
- Mode `local`: Silo sign-in with TOTP, Settings → Security (password, TOTP, signed-in devices) and
  an Administration panel (users, accounts, jobs).
- Real-time updates over SSE with a polling fallback.
- **PWA**: installable, offline reading of cached lists and messages, update banner.
- Accessible (axe, WCAG 2.2 AA, without violations in the e2e suite) and fully keyboard-driven
  (Gmail shortcuts).
- UI in **English** (default) and **Polish**, chosen in Settings → General
  ([ADR 0015](https://github.com/silopost/silo/blob/main/docs/adr/0015-i18n-typed-dictionaries.md)).

## Repositories

| Repository | License | Contents |
|---|---|---|
| [`silo`](https://github.com/silopost/silo) | MIT | Orchestration (Docker Compose, Caddy, scripts), documentation, ADRs |
| [`silo-server`](https://github.com/silopost/silo-server) | AGPL-3.0 | Go backend: API, SSE, IMAP sync, SMTP, workers |
| [`silo-web`](https://github.com/silopost/silo-web) (this one) | AGPL-3.0 | React/TypeScript web client and PWA |
| [`silo-mobile`](https://github.com/silopost/silo-mobile) | AGPL-3.0 | React Native/Expo Android client |

`silo-web` 0.4.0 requires `silo-server` 0.5.0 or newer (see the
[compatibility matrix](https://github.com/silopost/silo/blob/main/docs/compat-matrix.md)).

## Requirements

- Node.js 22 or newer (`.nvmrc`: 22) and npm.
- A running `silo-server` with a mail server, normally the dev stack of the
  [`silo`](https://github.com/silopost/silo) repository (Docker).
- For end-to-end tests: Playwright's Chromium (`npx playwright install chromium`).

## Quick start

With the backend from the `silo` repository cloned next to this one:

```sh
# in ../silo: Postgres, mail server and silo-server, plus sample mail (once)
scripts/dev-up.sh postgres mailserver silo-server
scripts/seed-mail.sh --all

# here
npm ci
npm run dev
```

Open <http://localhost:5173> and sign in as `dev1@silo.test` / `devpass1` (more test mailboxes in
the [silo README](https://github.com/silopost/silo#dev-mail-server-and-test-mailboxes)).

The dev server proxies `/api` to `http://localhost:8080`. Point it elsewhere with
`VITE_API_PROXY`:

```sh
VITE_API_PROXY=http://localhost:8090 npm run dev
```

The full dev stack (`silo/scripts/dev-up.sh` without arguments) also runs this app in a `node:22`
container on port `SILO_DEV_WEB_PORT` (default 5173).

## Configuration

silo-web has no runtime configuration file: everything instance-specific (server version,
`minWebVersion`, sign-in mode, OAuth2 providers, custom servers, attachment limit) comes from
`GET /api/v1/meta`. The production build expects the API on the same origin under `/api`.

Build and dev-time environment variables:

| Variable | Default | Description |
|---|---|---|
| `VITE_API_PROXY` | `http://localhost:8080` | Target of the `/api` proxy of `npm run dev` and `vite preview`. The browser's `Host` is kept, so silo-server accepts the `Origin` on any port. |
| `VITE_USE_POLLING` | unset | Any value makes Vite poll for file changes (the dev Compose stack sets it: Docker Desktop on Windows does not forward file events through bind mounts). |

`package.json` declares the targeted server release as `silo.serverRef` (currently `v0.5.0`), see
[API contract](#api-contract). The variables of the end-to-end tests are listed under
[End-to-end tests](#end-to-end-tests).

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Vite dev server on port 5173 with HMR and the `/api` proxy |
| `npm run build` | Type check, then production build into `dist/` (with the service worker) |
| `npm run preview` | Serve `dist/` with `vite preview` (the PWA works here: HTTPS or `localhost`) |
| `npm run typecheck` | `tsc --noEmit` for the app and for `e2e/` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm test` / `test:watch` | Vitest unit and component tests |
| `npm run e2e` | Playwright end-to-end tests against a running backend |
| `npm run gen:api` | Regenerate `src/api/schema.d.ts` from silo-server's OpenAPI document |
| `npm run gen:icons` | Rasterise the PWA icons from `public/icons/icon.svg` |

## Running in production

The image is a static build served by nginx:

```sh
docker build -t silo-web .
docker run --rm -p 8081:80 silo-web
```

`nginx.conf` serves hashed assets as immutable and falls back to `index.html` for every SPA route.
The image does not proxy the API: in production run it behind a reverse proxy that sends `/api/*`
to silo-server on the same origin. The production stack of the
[`silo`](https://github.com/silopost/silo) repository does exactly that with Caddy (published
image `ghcr.io/silopost/silo-web`, tag `SILO_WEB_TAG`) and sets the security headers and CSP of the
SPA in its `Caddyfile`. If you use your own proxy, copy those headers, and keep `/api/v1/events`
unbuffered (SSE).

The service worker registers only over HTTPS (or on `localhost`).

## Development

### Structure

| Path | Contents |
| --- | --- |
| `src/routes/` | TanStack Router file routes: `login`, `_app` (session guard, AppShell), `_app.u.$account.$label[.$threadId]`, `_app.u.$account.search[.$threadId]`, `_app.u.$account.settings.{general,labels,filters,accounts,security}`, `_app.u.$account.admin.{users,accounts,jobs}` |
| `src/routeTree.gen.ts` | generated by `@tanstack/router-plugin` on `dev`/`build`; committed so that `typecheck` works without a build |
| `src/api/` | `client.ts` (openapi-fetch, CSRF, `X-Silo-Client` per tab), `queries/`, `mutations/` (optimistic thread actions and undo), `events.ts` (SSE with polling fallback), `schema.d.ts` (generated) |
| `src/state/` | zustand: UI state, preferences in localStorage, snackbar, connection |
| `src/shortcuts/` | `keymap.ts`, `useShortcuts.ts`, `ShortcutsHelpDialog.tsx` |
| `src/features/` | `account`, `admin`, `security`, `nav`, `topbar`, `search`, `snooze`, `settings`, `labels`, `notifications`, `sync`, `threadlist`, `thread`, `compose`, `toasts` |
| `src/pwa/`, `src/sw.ts` | manifest, service worker and its cache rules, offline session snapshot, registration |
| `src/components/`, `src/lib/` | icons, buttons, avatar; dates, UI strings, message HTML sanitising |
| `src/test/` | msw fake server, fake `EventSource`, fake upload `XMLHttpRequest`, render helpers |
| `e2e/` | Playwright tests and their support code |

### URLs

URLs follow Gmail: `/u/<account index>/<label>` with system slugs (`inbox`, `starred`, `snoozed`,
`important`, `sent`, `scheduled`, `drafts`, `archive`, `all`, `spam`, `trash`) or a label id
(`l_…`), `/u/<n>/<label>/<threadId>` and `/u/<n>/search?q=`. The account index is the account's
`position`.

### UI strings and languages

UI strings live in typed dictionaries: English is the source (`src/lib/messages/en.ts`), and
`src/lib/messages/pl.ts` must provide every key (the compiler checks it). `src/lib/i18n.ts`
follows `settings.language` of the server (`en` until the user chooses), switches without a
reload and remembers the last language in the browser for the sign-in page.

### Thin client

The server owns the domain logic: it parses search queries, computes snooze presets, autosaves
drafts, runs filters and schedules sends. The client renders, caches (TanStack Query), applies
optimistic updates and keeps only presentation preferences locally.

## Feature reference

### Compose

`src/features/compose`: `ComposeDock` with Gmail-like windows (`state/compose.ts`: open drafts and
their mode – normal, minimised, full screen; at most three expanded), `ComposeWindow`,
`RecipientInput` (chips, `GET /contacts/autocomplete`), `Editor` (TipTap; pasted HTML is reduced to
its formats with DOMPurify) and `AttachmentList`. `session.ts` keeps the editing state of an open
draft outside React: `PUT /drafts/{id}` with `version` after 2 s of idle time, on blur and on
close; a `409` offers to reload the other version or overwrite it. Uploads use `XMLHttpRequest`
for progress, three at a time. Sending is `POST /drafts/{id}/send` after the last save; Undo is
`POST /outbound/{id}/cancel`, whose `Draft` reopens the window. The server owns autosave,
deduplication and the send queue; the browser keeps no copy of drafts and only warns on leaving
the page with unsaved edits.

With more than one account, new messages get a **From** picker: the draft is created in the
account of `/u/<n>`; another choice is `PUT /drafts/{id} {accountId}`, whose answer carries new
`id`/`messageId`/`threadId` – the window follows the new id without remounting and the Drafts lists
of both accounts refresh; `409 draft_account_locked` restores the choice. `draft.updated` with
`previousDraftId` moves an open window in another tab.

### Attachments and inline images

- Files are attached with the paperclip, by drag and drop or by paste: `POST /uploads` (multipart,
  three at a time); `413 upload_too_large` names the limit. The ids go to `PUT /drafts/{id}` as
  `attachmentIds`.
- Pictures pasted or dropped into the text are inline uploads: the form field `inline=true` goes
  before the file and the server generates the Content-ID (`UploadInfo.cid`); the client never
  makes one up. While uploading, the editor shows a local preview; afterwards it shows the upload
  itself (`GET /attachments/{u_…}?inline=1`) and keeps the cid in `data-cid`. `bodyHtml` carries
  `<img src="cid:…">`; a draft loaded from the server is converted back (`lib/inlineImages.ts`).
  Inline pictures are not listed in `AttachmentList`, and removing one from the text unpins its
  upload.
- Thumbnails: when the server says `thumbnail: true`, the chip (thread and compose) loads
  `GET /attachments/{id}/thumbnail?size=s` lazily; otherwise, or on error, the type icon.
- Forward (`POST /drafts {mode: forward}`) gets the original attachments from the server; its
  `warnings` (`quote_unavailable`, `attachments_unavailable`, `attachments_too_large`) are shown in
  a snackbar.
- PDFs open in a new tab through `?inline=1`; the server sends them as `attachment`, so the browser
  downloads them. There is no PDF viewer and there are no PDF thumbnails.

### Search

`src/features/search`. The client has no query parser: the text in the box is sent as `q` to
`GET /threads` and the server parses it. The operators (`from:`, `to:`, `subject:`, `label:`,
`in:`, `is:`, `has:`, `before:`/`after:`, `older_than:`, `larger:`, `OR`, `-`, brackets, phrases…)
are described in the [silo-server README](https://github.com/silopost/silo-server#api-behaviour)
and in `api/openapi.yaml`.

- `SearchBox`: a combobox (`aria-autocomplete="list"`, a listbox grouped as Recent / Contacts /
  Labels / Operators) fed by `GET /search/suggest` 150 ms after typing; accepting a suggestion puts
  its `text` (the whole query) in the box, a recent query searches at once. History entries are
  removed with their × button or Shift+Delete (`DELETE /search/history?query=`), all of them with
  Clear history. Enter opens `/u/<n>/search?q=`; `/` focuses the box, Esc leaves it.
- `SearchChips` (`SearchHeader.tsx`): the query split at spaces outside quotes and brackets, for
  display only; removing a chip removes that text from `q`.
- `AdvancedSearchPopover`: Gmail's options (from, to, subject, words, without, attachment, size,
  date range, where) joined into the text of `q` (`lib/searchText.ts`). Create filter opens
  `/u/<n>/settings/filters?criteria=<q>` with a new filter.
- Results show an indexing notice while `indexing.done < 1`, a notice when the search hit the
  server's time limit (`approximate`), the result estimate and `422 invalid_query` under the box.

### Snooze and scheduled send

- `src/features/snooze`: `SnoozeMenu` lists `GET /snooze/presets` (computed by the server in the
  user's time zone; the menu translates the label by `key` and formats `until`) and a custom date
  and time (a `datetime-local` field sent as RFC 3339). It is offered by the row (hover), the list
  toolbar for the selection (one `POST /threads/{id}/snooze` per thread, at most 50), the thread
  view and the `b` shortcut. The threads leave the Inbox at once; Undo undoes every operation
  (`POST /operations/{id}/undo`). The Snoozed view shows the wake time, a wake-now action
  (`DELETE /threads/{id}/snooze`) and Change time; a snoozed thread says until when.
- The arrow next to Send opens Schedule send: the server's `tomorrow` and `next_week` presets
  (Tomorrow morning, Monday morning) or a picked date and time, sent as
  `POST /drafts/{id}/send {sendAt}`; the snackbar's Undo cancels it. The Scheduled view lists the
  messages with their `scheduledAt`; Cancel send is `POST /outbound/{outboundId}/cancel`, whose
  draft opens in a compose window.

### Settings, labels and filters

`/u/<n>/settings/…` (`src/features/settings`), each tab its own route:

- **General** (`GeneralSettings`): language, density, undo-send seconds, signature, time zone,
  keyboard shortcuts on/off, conversation view and desktop notifications. Every change is one
  `PATCH /settings` with one field (JSON merge); the answer replaces the cache and the session's
  copy, `422 invalid_setting` / `invalid_timezone` show a snackbar. Desktop notifications ask for
  the browser's permission first and are shown on `message.new` events.
- **Labels** (`LabelsPanel`): user labels (IMAP keywords) and server folders, both from
  `GET /labels`, as trees by `parentId`, with colours (`colorBg` / `colorText`), visibility in the
  label list and counts. Create is `POST /labels` (`type: user` or `folder`), rename / colour /
  visibility `PATCH /labels/{id}`, delete `DELETE /labels/{id}` (a folder only when empty). The
  parent of a user label (Nest under) is set at creation and changed with `PATCH /labels/{id}
  {parentId}` (`null` = top level; the label itself and its descendants are not offered, and
  `422 invalid_parent` is shown under the field). `keywordState` `local_only` / `partial` shows a
  warning next to the label, in the settings and in the navigation. Threads are labelled from the
  toolbar or with `l`, moved with Move to or `v` (a folder label is a folder change in the Gmail
  model: the target is added, `INBOX` and the other folder labels removed; the server moves the
  messages after the undo window).
- **Filters** (`FiltersPanel`, `FilterEditor`): `GET/POST/PUT/DELETE /filters`; criteria are a
  query of the search syntax (parsed and evaluated only by the server), actions are archive, mark
  read, star, important, trash, add labels and forward. `POST /filters/{id}/apply` runs a filter on
  existing mail and shows the server's estimate. `422 invalid_query` / `invalid_filter` /
  `invalid_label` are shown in the editor.
- **Accounts** (`AccountsPanel`): the accounts in `position` order with their state and errors;
  Rebuild cache is `POST /accounts/{id}/resync {mode: rebuild}` (`409 rebuild_blocked` while a
  send or a write-back waits); add account, OAuth2 re-authorisation, password change
  (`PATCH /accounts/{id}`) and removal (`DELETE`, confirmed); failed operations of an account
  (`sync-status.deadOps`) with a link to Administration for admins; a note on what the metadata
  backup contains (administrator scripts `scripts/backup.sh metadata|full`).
- **Security** (`SecurityPanel.tsx`, mode `local` only; in mode `imap` the tab is hidden and its
  URL says it is not available): change password (`POST /session/password`, at least 10
  characters, the other sessions are signed out); turn TOTP on (`POST /totp/setup` → a QR code of
  `otpauthUrl` drawn in the browser with `uqr`, the secret to type in, the code →
  `POST /totp/enable`, `422 invalid_totp_code` under the field) with the backup codes shown once
  (copy, download `.txt`, a confirmation before closing); turn TOTP off and generate new backup
  codes after password + code (`DELETE /totp`, `POST /totp/backup-codes`); signed-in devices
  (`GET /sessions`) with Sign out per session and Sign out everywhere else.

### Accounts and sign-in

- **AccountSwitcher** (`src/features/account/AccountSwitcher.tsx`, the avatar in the top bar):
  every account of the user with its INBOX unread count (one `GET /labels?accountId=` per account,
  kept current by `label.counts` of any account and refetched on `account.status`), its sync
  problem (`auth_failed`, `backoff`) as an icon with a tooltip, Add account, Manage accounts and
  Sign out; the badge on the avatar sums the other accounts' unread threads. Choosing an account
  opens `/u/<position>/<view>` (system views are kept, a user label falls back to `inbox`) and
  stores `PATCH /settings {activeAccountId}`; `g 1`…`g 9` do the same for the n-th account.
  `document.title` follows the tab's account (for example `Inbox (3) – dev1@silo.test – Silo`).
- **Add account** (`AddAccountDialog.tsx`, Settings → Accounts, also `?add`): address and password
  → `POST /accounts/discover` (the source is shown: ISPDB, autoconfig, SRV, guessed or default
  server; Advanced with host/port/TLS opens when nothing was found, and is read-only and not sent
  when `allowCustomServers=false`) → Test connection (`POST /accounts/test`, with per-step results)
  → Add (`POST /accounts`; `422 account_test_failed` shows the steps) → the new account's inbox.
  Sign in with Google / Microsoft is offered for `meta.oauthProviders`
  (`POST /oauth/{provider}/start {returnTo}`, then the provider); back on `?oauth=ok|error&…` a
  snackbar or the localised error is shown and the URL is cleaned. OAuth2 accounts in
  `auth_failed` get a Sign in again action (also in the account banner).
- **Mode `local` sign-in** (`src/routes/login.tsx`, `GET /meta authMode`): a user with TOTP gets
  `401 totp_required` after the right password; the page then asks for the 6-digit app code
  (`one-time-code`, autofocus) or a backup code and posts `POST /session {email, password,
  totpCode}` again (the password stays in component state only). Every `401` shows one generic
  message; `429` shows `Retry-After`. A user without mail accounts is offered Add account.
- **Session and limits**: SSE `session.expired` is handled like a `401` (session dropped,
  `/login?redirect=<page>`). With more than 8 open streams per user, `GET /events` answers with a
  `stream.limit` event (`retryAfter` seconds) and closes: the tab polls `/events/poll`, explains
  that too many tabs are open and retries SSE after `retryAfter`. Any other `429 rate_limited`
  shows one snackbar with the `Retry-After` time.
- **Version banner** (`VersionBanner.tsx`): `__APP_VERSION__` (from `package.json`) older than
  `meta.minWebVersion` asks to refresh; a different `serverVersion` after an SSE reconnect or the
  15-minute `/meta` check says the server was updated. The app keeps working until the reload.

### Administration

`src/features/admin/`, `/u/<n>/admin/{users,accounts,jobs}`, in the account menu for
`user.isAdmin` only (others and a `403 forbidden` see a no-permission page):

- **Users**: accounts with their states, admin, blocked, TOTP, created; Add user (mode `local`; an
  empty password gives a `temporaryPassword`, shown once), block/unblock and admin rights
  (`PATCH`), Reset password (mode `local`), Reset TOTP, delete after typing the address;
  `409 admin_self_change` has its own message and the admin's own row disables those actions.
- **Accounts**: every account with owner, host, coloured sync state, last sync, error, pending and
  dead operations (a link to the account's jobs).
- **Jobs**: `dead` (default) or `pending`, per account, refreshed every 30 s while the tab is
  visible; retry or delete after confirmation.

### PWA and offline

`vite-plugin-pwa` with `injectManifest` and `src/sw.ts`: `manifest.webmanifest` (Silo, standalone,
icons 192/512, maskable, SVG; the PNGs are rasterised from `public/icons/icon.svg` by
`npm run gen:icons`) and a precache of the build with `index.html` for every SPA route (never
`/api/*`). The runtime cache `silo-api-v1` is `NetworkFirst` with a 3 s timeout, 200 entries and 7
days, for `GET /threads`, `/threads/{id}`, `/labels` and `/messages/{id}/html` only
(`src/pwa/cacheRules.ts`, unit-tested): never the session, `/meta`, `/events` or a mutation.
Queries run with `networkMode: "offlineFirst"` so that the worker can answer offline; mutations
need the network. Offline reload: the `_app` guard uses a snapshot of user, accounts and settings
(localStorage, no CSRF token) only when the server is unreachable, and refetches `GET /session`
when the browser is back online. Sign-out, session loss and sign-in clear the API cache and the
snapshot. A waiting new build is announced in the version banner (`registerType: "prompt"`). The
worker runs in the production build only (`npm run build && npx vite preview`).

## Keyboard shortcuts

`src/shortcuts/keymap.ts` is the only list; the `?` dialog is generated from it. Keys are matched by
`event.key` (so `#`, `!`, `?` and `*` also work on non-US layouts). The dispatcher ignores keys typed
in `input`, `textarea`, `select` and `[contenteditable]`, inside dialogs, menus and popovers (they
have their own keys), during IME composition and with Ctrl/Alt/Meta. Sequences (`g …`, `* …`) wait
1500 ms for the second key. Turning keyboard shortcuts off in the settings
(`keyboardShortcutsEnabled`) turns the dispatcher off; the keys handled by components themselves
(Esc, Ctrl/⌘+Enter in compose, the keys of fields and menus) keep working.

| Keys | Action | Scope |
| --- | --- | --- |
| `c` | New message | global |
| `Shift+C` | New message in full screen | global |
| `/` | Search | global |
| `?` | List of shortcuts | global |
| `z` | Undo the last action | global |
| `j` / `k` | Next / previous conversation | list, thread |
| `o`, `Enter` | Open conversation | list |
| `u` | Back to list | thread |
| `x` | Select conversation | list |
| `s` | Star | list, thread |
| `e` | Archive | list, thread |
| `#` | Move to Trash | list, thread |
| `!` | Report spam | list, thread |
| `Shift+I` / `Shift+U` | Mark as read / unread | list, thread |
| `n` / `p` | Next / previous message in the conversation | thread |
| `l` | Label as | list, thread |
| `v` | Move to folder | list, thread |
| `b` | Snooze | list, thread |
| `r` / `a` / `f` | Reply / Reply all / Forward | thread |
| `g i` / `g s` / `g t` / `g d` / `g a` | Go to: Inbox / Starred / Sent / Drafts / All Mail | global |
| `g l` | Go to: label or folder (picker) | global |
| `g 1` … `g 9` | Go to account number n (`position` order, `/u/<position>/inbox`) | global |
| `* a` / `* n` | Select all / deselect all | list |
| `* r` / `* u` | Select read / unread | list |
| `* s` / `* t` | Select starred / unstarred | list |
| `Ctrl+Enter` (`⌘+Enter`) | Send | compose (also in fields) |
| `Esc` | Close the window or menu, leave the search box | everywhere (also in fields) |

In the list, `l` and `v` act on the selection or, without one, on the row under the cursor.

## Testing

```sh
npm test            # vitest, once
npm run test:watch  # vitest in watch mode
npm run typecheck && npm run lint && npm run format:check && npm run build   # what CI runs besides the tests
```

Tests render the whole app with msw handlers: `src/test/mockMail.ts` is a stateful fake server with
threads, drafts, uploads, sending, contacts, search, snooze and several accounts; `mockLocal.ts`
and `mockAdmin.ts` add mode `local`, TOTP, sessions and `/admin/*`. A fake `EventSource`
(`src/test/fakeEventSource.ts`) and a fake upload `XMLHttpRequest` (`src/test/fakeUploadXhr.ts`)
replace the browser APIs.

## End-to-end tests

`e2e/` holds Playwright tests that run against a real backend (silo-server, Postgres and
docker-mailserver from the `silo` repository) and check the mail server's state over IMAP
(`imapflow`), as a second client would.

```sh
# in ../silo: backend, mail server and sample mail (once)
scripts/dev-up.sh postgres mailserver silo-server
scripts/seed-mail.sh --all
# here
npx playwright install chromium   # once
npm run e2e                       # all tests; e.g. `npm run e2e -- archive` for one file
npm run e2e -- --grep-invert @slow   # skip the tests that wait 2–4 minutes
```

`npm run e2e` builds the app and serves it with `vite preview` on port 5180, proxying `/api` to
silo-server. Tests run one at a time on the shared dev mailboxes; each marks its mail with a unique
tag in the subject and deletes it afterwards. Labels, filters and settings changed by a test are
removed or restored afterwards through the API (`e2e/support/api.ts`, a bearer session).
Measurements are printed as `[measure]` lines. In CI the `e2e` job runs on demand
(`workflow_dispatch`).

| Variable | Default | Description |
|---|---|---|
| `SILO_E2E_WEB_PORT` | `5180` | Port of `vite preview` |
| `SILO_E2E_WEB_URL` | `http://localhost:$SILO_E2E_WEB_PORT` | Test an already running instance instead of building one |
| `SILO_E2E_API` | `http://localhost:$SILO_DEV_SERVER_PORT` | silo-server URL for the proxy and the API helpers |
| `SILO_DIR` | `../silo` | Checkout of the `silo` repository; `SILO_DEV_*` ports are read from its `.env` |
| `SILO_DEV_SERVER_PORT`, `SILO_DEV_IMAP_PORT` | from `silo/.env` (`8080`, `1143`) | Ports of the dev stack |
| `SILO_E2E_IMAP_HOST` | `localhost` | IMAP host for the server-side checks |
| `SILO_UNDO_WINDOW` | `10s` | Must match the server's undo window (set `1s` on a server started with it) |
| `SILO_E2E_BULK_THREADS` | `5000` | Size of the large-list corpus appended once to `dev3@silo.test` |
| `SILO_E2E_ADMIN_EMAIL`, `SILO_E2E_ADMIN_PASSWORD` | `admin@silo.test`, `admin-e2e-password` | First admin for `local-auth.e2e.ts` |

| File | Checks |
| --- | --- |
| `reply.e2e.ts`, `archive.e2e.ts`, `undo-send.e2e.ts`, `drafts.e2e.ts` | reply delivered with `In-Reply-To`/`References`; archive and its undo; undo send; drafts in the server's Drafts folder |
| `offline.e2e.ts` | the mail server going offline (stops and starts the `mailserver` container) |
| `large-list.e2e.ts` | a 5000-thread list without long tasks |
| `xss.e2e.ts`, `a11y.e2e.ts`, `shortcuts.e2e.ts` | hostile HTML, axe (`@axe-core/playwright`), keyboard shortcuts |
| `search.e2e.ts` | `from:`, `has:attachment`, `is:unread`, `subject:`, words, `-word`, `OR`, `label:` on mail seeded over IMAP; history and contact suggestions, chips, the advanced search, `422` for a stray `)`, the indexing banner when shown |
| `snooze.e2e.ts` | snooze "in a minute": in `Snoozed` on the server and not in INBOX, back in INBOX without `\Seen` within 90 s and on top of the list (`@slow`); undo, the Snoozed view and wake now |
| `filters.e2e.ts` | `from:x` → skip the Inbox + label Y: a new message lands in Archive with the keyword Y; an older one only after saving with apply |
| `schedule-send.e2e.ts` | a message scheduled about 2 minutes ahead is in no folder of the sender nor in the recipient's INBOX before its time and arrives within ±30 s (`@slow`); the Scheduled view and cancel send |
| `labels-keywords.e2e.ts` | a label from Silo is a keyword on the server; a keyword stored by another client is a label on the row within 5 s |
| `settings.e2e.ts` | density, undo-send period, time zone and signature survive a reload; shortcuts off stop `e` |
| `multi-account.e2e.ts` | dev1 adds `dev2@silo.test` (discovery, connection test, axe on the dialog); the switcher shows both accounts with unread counts; `g 1`/`g 2`; a message from dev2 reaches `dev3@` with `From: dev2@` and its copy is in dev2's Sent only |
| `pwa.e2e.ts` | service worker and manifest; after going offline, a reload shows the shell, the cached list and thread body and the offline banner |
| `local-auth.e2e.ts` | mode `local`: TOTP on, sign-in with a code, a user created in Administration signs in with the temporary password, adds `dev1@silo.test` and sees its INBOX; cleanup with a backup code |

`multi-account` and `pwa` run on the dev stack or on the `silo-bt` stack of the `silo` repository:

```sh
# in silo
docker compose -p silo-bt -f docker-compose.backup-test.yml up -d --build
SILO_COMPOSE_FILE=docker-compose.backup-test.yml scripts/seed-mail.sh
SILO_COMPOSE_FILE=docker-compose.backup-test.yml scripts/seed-mail.sh --to dev2@silo.test
# in silo-web
SILO_E2E_API=http://localhost:18080 SILO_DEV_IMAP_PORT=11143 SILO_E2E_WEB_PORT=15180 \
  SILO_UNDO_WINDOW=1s npm run e2e -- multi-account
# in silo, afterwards
docker compose -p silo-bt -f docker-compose.backup-test.yml down -v
```

`local-auth` needs silo-server in mode `local` and a first admin, on a fresh database
(`dev1@silo.test` must not belong to a user of mode `imap`):

```sh
# in silo
docker compose -p silo-bt -f docker-compose.backup-test.yml -f docker-compose.local-auth.yml up -d --build
echo 'admin-e2e-password' | docker compose -p silo-bt -f docker-compose.backup-test.yml \
  -f docker-compose.local-auth.yml exec -T silo-server /silo-server user add \
  --email admin@silo.test --admin --password-stdin
SILO_COMPOSE_FILE=docker-compose.backup-test.yml scripts/seed-mail.sh
# in silo-web
SILO_E2E_API=http://localhost:18080 SILO_DEV_IMAP_PORT=11143 SILO_E2E_WEB_PORT=15180 npm run e2e -- local-auth
# in silo, afterwards
docker compose -p silo-bt -f docker-compose.backup-test.yml -f docker-compose.local-auth.yml down -v
```

Notes:

- The `local_only` / `partial` keyword warnings are not exercised end to end (they need a server
  without keywords or a folder with 26 keywords; silo-server covers them against Dovecot).
- Dovecot may keep keywords in a maildir folder's keyword list after the messages are gone, so many
  runs against the same dev mailbox can reach the 26-keyword limit; recreate the dev mail server
  volume when labels start showing `partial`.
- The `drafts` test waits for the server's draft append (30 s after the last save plus up to 5 s of
  job polling), so it runs close to its 35 s threshold.

## API contract

Types in `src/api/schema.d.ts` are generated by `openapi-typescript` from `api/openapi.yaml` of
[`silo-server`](https://github.com/silopost/silo-server) and committed. The server release this
build targets is declared in `package.json` as `silo.serverRef` (a git tag or branch; currently
`v0.5.0`).

```sh
npm run gen:api                          # fetch the file at silo.serverRef
npm run gen:api -- --server-ref v0.4.0   # fetch from another ref
npm run gen:api -- --local               # read ../silo-server/api/openapi.yaml
npm run gen:api -- --local path/to/openapi.yaml
```

After changing `silo.serverRef`, regenerate and commit the schema. The `api-contract` CI job checks
out `silo-server` at that ref, regenerates the schema and fails on any diff; until
`silopost/silo-server` is public, that job is expected to fail at the checkout step.

## Status and roadmap

`silo-web` 0.4.0 covers the 1.0 scope of the web client and is verified by the unit tests and the
Playwright suite above. Known gaps:

- No folder role mapping UI (`PUT /accounts/{id}/folders` exists on the server).
- No PDF viewer or PDF thumbnails; no bounce/DSN display.
- Gmail and Microsoft 365 sign-in (OAuth2) has not been tested against live accounts.

## Contributing

The main contribution guide lives in the
[`silo` repository](https://github.com/silopost/silo/blob/main/CONTRIBUTING.md); a short summary is
in [CONTRIBUTING.md](CONTRIBUTING.md). Use Conventional Commits, run
`npm run lint && npm test` before opening a pull request (CI also runs `typecheck`, `format:check`
and `build`), keep PRs focused and describe the user-visible change. New UI strings go into
`en.ts` and `pl.ts`.

## License

[GNU Affero General Public License v3.0](LICENSE).
