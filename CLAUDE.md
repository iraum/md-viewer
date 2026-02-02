# Claude Code Guidelines

## Security Rules

This app has intentional security hardening. When modifying code:

- Never bypass CSRF validation on POST endpoints
- Always validate/sanitize file paths before filesystem access
- Use `Path.resolve()` and check for symlinks
- Log security events to `logger` (writes to security.log)
- Sanitize user input in error messages (no stack traces to client)
- Keep DOMPurify sanitization on rendered markdown

## Do Not Modify

- `static/js/purify.min.js` - Vendor library (DOMPurify)
- `static/js/marked.min.js` - Vendor library (Marked.js)
- `static/js/highlight.min.js` - Vendor library (Highlight.js)

## Adding Features

### Backend (app.py)
- New endpoints use `@rate_limit` decorator
- POST endpoints require CSRF via `validate_csrf_token()`
- Follow existing patterns for path validation and symlink checks

### Frontend
- JavaScript: `static/js/app.js`
- CSS: `static/css/main.css`
- Themes: `static/css/themes/*.css`
- Use localStorage with try-catch for client-side persistence

### State (app.js)
- `recentFiles` - max 8, FIFO queue
- `bookmarks` - unlimited, sorted alphabetically
- All state persists via localStorage

## Testing

- Run `python app.py`, test at http://localhost:5000
- Check `security.log` for warnings after testing
- Test with all 6 themes (especially Oracle for sidebar sections)
- Hard refresh (Ctrl+Shift+R) after code changes

## Preferences

- Keep dependencies minimal (currently just Flask)
- No external CDNs; all JS/CSS libraries are self-hosted
- Prefer simple solutions over complex abstractions
- No emojis in code unless explicitly requested
