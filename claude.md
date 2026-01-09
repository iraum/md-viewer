# Markdown Viewer

A Flask-based web application for browsing and displaying markdown files with customizable themes.

## Project Structure

```
md-viewer/
├── app.py              # Flask application with API endpoints
├── requirements.txt    # Python dependencies (Flask 3.0.0)
├── templates/
│   └── index.html      # Main HTML template
├── static/
│   ├── css/
│   │   ├── main.css    # Core styles
│   │   └── themes/     # Theme CSS files (dark, nord, sepia, etc.)
│   └── js/
│       ├── app.js      # Frontend JavaScript
│       ├── marked.min.js   # Markdown parser
│       ├── purify.min.js   # DOMPurify for XSS protection
│       └── highlight.min.js # Code syntax highlighting
└── security-tests/     # XSS test files
```

## Tech Stack

- **Backend**: Python 3.8+, Flask 3.0.0
- **Frontend**: Vanilla JavaScript, marked.js, highlight.js, DOMPurify
- **Styling**: CSS with theme system

## Running the Application

```bash
# Install dependencies
pip install -r requirements.txt

# Run (development)
python app.py

# Production (set environment variables)
export SECRET_KEY='your-secret-key'
export FLASK_HOST=127.0.0.1
export FLASK_PORT=5000
python app.py
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main application page |
| `/api/browse` | GET | Browse directory (params: `path`, `show_hidden`, `sort_by`) |
| `/api/file` | GET | Get markdown file contents (param: `path`) |
| `/api/image` | GET | Serve image files (param: `path`) |
| `/api/themes` | GET | List available themes |
| `/api/themes` | POST | Save/update theme (requires CSRF token) |
| `/api/csrf-token` | GET | Get CSRF token |

## Security Features

- CSRF protection with token rotation (1-hour expiry)
- Rate limiting (100 requests/minute per IP)
- Security headers (CSP, X-Frame-Options, HSTS, etc.)
- Input validation and path sanitization
- DOMPurify for XSS prevention on rendered markdown
- Symlink traversal protection
- File size limits (10MB markdown, 100KB themes)

## Development Guidelines

- Security logging writes to `security.log`
- Themes are stored in `static/css/themes/`
- Default browse path: `/run/media/opc/spielraum`
- Only `.md` files are served via `/api/file`
- Images limited to: png, jpg, jpeg, gif, svg, webp, ico

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | (random) | Session secret key (required for production) |
| `FLASK_HOST` | 127.0.0.1 | Bind address |
| `FLASK_PORT` | 5000 | Port number |
| `FLASK_DEBUG` | False | Enable debug mode |
| `FLASK_ENV` | development | Environment (affects secure cookies) |
