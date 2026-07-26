# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A self-hosted Flask app that browses and renders local markdown files in the browser. No build step, no database, no external CDNs.

## Commands

Dependencies live in a local `venv/` (gitignored). `DEFAULT_START_DIR` is hardcoded to `/mnt/spielraum`; `HOME_DIR` is `Path.home()` of whoever runs the process (passed to the template and read by `app.js` from a data attribute, so the 🏠 button and the sidebar footer follow the Linux user). Run these **as the `opc` user** — the user has a separate opc session for this, so hand them the commands rather than running them yourself:

```bash
# One-time setup
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt

# Run (start.sh prints a banner, honors env overrides, then exec's app.py)
PYTHON=./venv/bin/python ./start.sh
```

`start.sh` env overrides: `FLASK_HOST` (default `127.0.0.1`), `FLASK_PORT` (default `5000`), `PYTHON`, `SECRET_KEY`. App also reads `FLASK_DEBUG` (default off). Binding to `0.0.0.0` or enabling debug prints loud warnings — both are intentional footguns.

Open http://localhost:5000.

There is no automated test suite. Verify changes manually in the browser, then check `security.log` for warnings (see Testing below).

## Architecture

**Backend — `app.py` (single file).** Flask serving one HTML shell plus a small JSON API. Every request flows through layered security middleware rather than business logic:

- `@rate_limit` — in-memory per-IP sliding window (100 req / 60s). State is a module-level dict, so it resets on restart and is not multi-process safe.
- `validate_csrf_token()` — required on the only POST endpoint (`/api/themes`). Tokens are session-bound, expire after 1 hour, and rotate via `generate_csrf_token()`.
- Path handling on every file/dir endpoint: `Path(path).resolve()`, then **reject symlinks** and enforce size caps (10MB markdown, 10MB images, 100KB themes). Filesystem access is intentionally *unrestricted* to any path the opc user can read — there is no home-directory jail. Errors return sanitized messages; full detail (with `request.remote_addr`) goes to `security.log` only.
- `add_security_headers()` — CSP (`script-src 'self'`, no inline JS), `X-Frame-Options: DENY`, HSTS, etc. applied to all responses.

API: `/api/browse`, `/api/file`, `/api/file-metadata`, `/api/file-mtime`, `/api/image`, `GET|POST /api/themes`, `/api/csrf-token`.

**Frontend — `static/js/app.js` (single IIFE, no framework).** On `init()` it fetches a CSRF token, loads themes, and restores state. All client state persists in `localStorage` under `md-viewer-*` keys; reads/writes are wrapped in try-catch. POSTs go through `postWithCsrf()`, which attaches the `X-CSRF-Token` header.

**Known gap — auto-refresh is not wired up.** `/api/file-mtime` (stat-only) exists server-side, and `app.js` lines 20–27 declare the polling state (`autoRefreshEnabled`, `autoRefreshIntervalId`, `currentPollInterval`, 2s→30s backoff bounds, `refreshDebounceTimer`), but nothing reads them — there is no `setInterval` and no fetch of `/api/file-mtime`. Live-reload on disk change does not work. Either implement the poll loop or delete the dead state; do not assume it works.

**Rendering pipeline (order matters for security):** Marked.js parses markdown → DOMPurify sanitizes the HTML → Highlight.js colorizes code blocks. Never reorder so that unsanitized HTML reaches the DOM.

**Themes** are plain CSS files in `static/css/themes/` that override `:root` variables. The server derives each theme's name/description from the first `/* ... */` comment block; the POST endpoint sanitizes `*/` sequences to prevent comment-injection. New themes only appear after a server restart. Frontend swaps them by switching a `<link>`'s href — no rebuild.

## Security Rules

This app has intentional security hardening. When modifying code:

- Never bypass CSRF validation on POST endpoints
- Always validate/sanitize file paths before filesystem access
- Use `Path.resolve()` and check for symlinks
- Log security events to `logger` (writes to `security.log`)
- Sanitize user input in error messages (no stack traces to client)
- Keep DOMPurify sanitization on rendered markdown

## Do Not Modify

Vendored libraries (self-hosted, no CDN):

- `static/js/purify.min.js` — DOMPurify
- `static/js/marked.min.js` — Marked.js
- `static/js/highlight.min.js` — Highlight.js

## Adding Features

### Backend (app.py)
- New endpoints use the `@rate_limit` decorator
- POST endpoints require CSRF via `validate_csrf_token()`
- Follow existing patterns for path validation and symlink checks

### Frontend
- JavaScript: `static/js/app.js`
- CSS: `static/css/main.css`
- Themes: `static/css/themes/*.css`
- Use `localStorage` with try-catch for client-side persistence

### State (app.js)
- `recentFiles` — max 8, FIFO queue
- `bookmarks` — unlimited, sorted alphabetically
- All state persists via `localStorage`

## Testing

- Run the app (see Commands), test at http://localhost:5000
- Check `security.log` for warnings after testing
- Test with all 6 themes (especially Oracle for sidebar sections)
- Hard refresh (Ctrl+Shift+R) after code changes

## Preferences

- Keep dependencies minimal (currently just Flask)
- No external CDNs; all JS/CSS libraries are self-hosted
- Prefer simple solutions over complex abstractions
- No emojis in code unless explicitly requested
