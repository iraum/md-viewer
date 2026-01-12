# Claude Code Guidelines

Project overview and setup instructions are in README.md.

## Current Status (2026-01-12)

**Version**: 2.1 (UI Improvements Complete)

**Recent Changes**:
- ✅ Added 9 UI usability improvements (see README.md changelog)
- ✅ New backend endpoint: `/api/file-metadata` for file stats
- ✅ Recent files tracking (localStorage, max 15)
- ✅ Bookmarks/favorites system (localStorage)
- ✅ Enhanced UX with copy buttons, scroll-to-top, metadata display
- ✅ Print-friendly CSS for browser print-to-PDF

**Active App**: Running on http://localhost:5000

## Code Style

- **Python**: Follow PEP 8, use type hints where helpful
- **JavaScript**: Vanilla ES6+, no frameworks, no build step
- **CSS**: Use CSS custom properties (variables) defined in themes

## Security Requirements

This app has intentional security hardening. When modifying code:

- Never bypass CSRF validation on POST endpoints
- Always validate/sanitize file paths before filesystem access
- Use `Path.resolve()` and check for symlinks
- Log security events to `logger` (writes to security.log)
- Sanitize user input in error messages (no stack traces to client)
- Keep DOMPurify sanitization on rendered markdown

## Files to Be Careful With

- `app.py` - Contains security middleware; test thoroughly after changes
- `static/js/purify.min.js` - Do not modify; vendor library for XSS protection
- `static/js/marked.min.js` - Do not modify; vendor library
- `static/js/highlight.min.js` - Do not modify; vendor library

## Adding New Features

### Backend (app.py)
- New API endpoints go in `app.py` with `@rate_limit` decorator
- POST endpoints require CSRF validation via `validate_csrf_token()`
- Follow existing patterns for path validation and symlink checks
- All endpoints must log security events

### Frontend
- JavaScript changes go in `static/js/app.js`
- CSS changes go in `static/css/main.css`
- Theme-specific overrides go in `static/css/themes/*.css`
- Use localStorage for client-side persistence
- Always include try-catch for localStorage operations

### State Management
- Current state tracked in app.js: `recentFiles`, `bookmarks`, `currentFilePath`, `rawMode`
- Recent files: max 15, FIFO queue
- Bookmarks: unlimited, sorted alphabetically
- All state persists via localStorage with graceful fallback

## Testing

- Run `python app.py` and test at http://localhost:5000
- Check `security.log` for warnings after testing
- XSS test files are in `security-tests/`
- Test with all 7 themes (especially Oracle theme for sidebar sections)
- Hard refresh browser (Ctrl+Shift+R) after code changes

## Known Behavior

- Recent Files & Bookmarks sections collapsed by default
- Browser caching: may need hard refresh (Ctrl+Shift+R) after updates
- localStorage quota: ~5-10MB limit (sufficient for current features)

## Preferences

- Keep dependencies minimal (currently just Flask)
- No external CDNs; all JS/CSS libraries are self-hosted
- Prefer simple solutions over complex abstractions
- No emojis in code unless explicitly requested
