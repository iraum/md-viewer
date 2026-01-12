# Markdown Viewer - Quick Reference

**Version**: 2.1 | **Updated**: 2026-01-12 | **Status**: ✅ Ready

---

## Quick Start

```bash
cd /run/media/opc/spielraum/dev-code/md-viewer
python app.py
# Open http://localhost:5000
```

---

## Key Features (v2.1)

- 📁 **Recent Files** - Last 15 files, collapsible
- ⭐ **Bookmarks** - Star favorites, quick access
- 📊 **Metadata** - Date, size, words, lines
- 📋 **Copy Code** - Click to copy code blocks
- ⬆️ **Scroll Top** - Smooth scroll button
- 👁️ **View Toggle** - Formatted ↔ Raw mode
- 🎨 **7 Themes** - Including Oracle with dark sidebar
- 🖨️ **Print Ready** - Clean PDF export (Ctrl+P)
- ✨ **Smooth UX** - Skeleton loading animations

---

## File Organization

```
md-viewer/
├── README.md              # User documentation
├── claude.md              # Dev guidelines
├── PROJECT_STATUS.md      # Technical status
├── QUICK_REFERENCE.md     # This file
├── app.py                 # Backend (398 lines)
├── templates/index.html   # UI structure
├── static/
│   ├── js/app.js         # Frontend (1053 lines)
│   └── css/main.css      # Styles (802 lines)
└── static/css/themes/    # 7 theme files
```

---

## Important Files

| File | Purpose | Lines | Notes |
|------|---------|-------|-------|
| `app.py` | Backend API | 398 | Security-hardened Flask app |
| `static/js/app.js` | Frontend logic | 1053 | Vanilla JS, no frameworks |
| `static/css/main.css` | Base styles | 802 | CSS variables for theming |
| `templates/index.html` | HTML structure | 89 | Single-page app |
| `claude.md` | Dev guidelines | 84 | Code style, security rules |
| `README.md` | User docs | 420 | Features, setup, API |
| `PROJECT_STATUS.md` | Tech details | 350+ | Status, architecture |

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/browse` | GET | List directory |
| `/api/file` | GET | Get file content |
| `/api/file-metadata` | GET | Get file stats ⭐ NEW |
| `/api/image` | GET | Serve images |
| `/api/themes` | GET/POST | Theme management |
| `/api/csrf-token` | GET | Get CSRF token |

All endpoints rate-limited: 100 req/60s per IP

---

## localStorage Keys

| Key | Data | Size |
|-----|------|------|
| `md-viewer-recent-files` | Array[15] | ~2 KB |
| `md-viewer-bookmarks` | Array | ~10 KB |
| `md-viewer-theme` | String | ~20 B |
| `md-viewer-*-collapsed` | Boolean | ~5 B each |

Total: ~12-15 KB (limit: 5-10 MB)

---

## Security Checklist

- ✅ CSRF tokens (POST only)
- ✅ Rate limiting (100/60s)
- ✅ Path validation + symlink checks
- ✅ DOMPurify sanitization
- ✅ Security headers (CSP, HSTS, etc.)
- ✅ Security logging
- ✅ No external CDNs

---

## Common Tasks

### Start App
```bash
python app.py
```

### Hard Refresh Browser
```
Ctrl + Shift + R
```

### Check Security Log
```bash
tail -f security.log
```

### Test Print Layout
```
Ctrl + P (in browser)
```

### Clear localStorage
```javascript
// In browser console
localStorage.clear()
```

---

## Theme Customization

**Add new theme**:
1. Create `static/css/themes/mytheme.css`
2. Add CSS variables (see existing themes)
3. Restart app
4. Select from dropdown

**Oracle theme sections**: Dark background (#312d3a) for Recent/Bookmarks

---

## Development Rules

**Security First**:
- Always validate file paths
- Check for symlinks
- Use CSRF for POST
- Log security events
- Never expose stack traces

**Code Style**:
- Vanilla JS (no frameworks)
- No external CDNs
- Try-catch for localStorage
- Keep it simple

**Testing**:
- Test with all 7 themes
- Check security.log
- Hard refresh after changes

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+H` | Toggle hidden files |
| `Ctrl+P` | Print preview |
| `Ctrl+Shift+R` | Hard refresh |

---

## Known Behaviors

- Sections collapsed by default
- localStorage is client-side only
- May need hard refresh after code changes
- Recent files max 15 (FIFO)
- Bookmarks sorted alphabetically

---

## Next Session Prep

**Ready to**:
- Add new features (follow security patterns)
- Modify themes
- Enhance UI/UX
- Debug issues

**Check**:
- `claude.md` for guidelines
- `PROJECT_STATUS.md` for details
- `README.md` for user features

---

## Version History

- **2.1** (2026-01-12): UI improvements (9 features)
- **2.0**: Security hardening
- **1.0**: Initial release

---

**Status**: All features working. Ready for next session. 🚀
