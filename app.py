#!/usr/bin/env python3
"""
Markdown Viewer - A Flask application for browsing and displaying markdown files
with customizable CSS theme profiles.
"""

import os
import json
import logging
import secrets
from pathlib import Path
from functools import wraps
from flask import Flask, render_template, jsonify, request, send_from_directory, session
from datetime import datetime

app = Flask(__name__)

# Application Configuration (before logging setup)
HOME_DIR = Path.home()
THEMES_DIR = Path(__file__).parent / "static" / "css" / "themes"
DEFAULT_START_DIR = HOME_DIR / "Documents"
MAX_THEME_SIZE = 100 * 1024  # 100KB max theme size
MAX_MARKDOWN_SIZE = 10 * 1024 * 1024  # 10MB max markdown file size
LOG_FILE = Path(__file__).parent / "security.log"

# Setup security logging (before using logger)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Security Configuration
# Enforce SECRET_KEY as mandatory environment variable in production
if 'SECRET_KEY' not in os.environ:
    # Generate a warning and use a random key (insecure for production)
    secret_key = secrets.token_hex(32)
    logger.warning("="*60)
    logger.warning("SECURITY WARNING: SECRET_KEY environment variable not set!")
    logger.warning("Using a randomly generated key. Sessions will not persist across restarts.")
    logger.warning("For production, set SECRET_KEY environment variable to a secure random value:")
    logger.warning(f"  export SECRET_KEY='{secret_key}'")
    logger.warning("="*60)
    app.config['SECRET_KEY'] = secret_key
else:
    app.config['SECRET_KEY'] = os.environ['SECRET_KEY']
    logger.info("SECRET_KEY loaded from environment variable")

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max request size
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('FLASK_ENV') == 'production'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # 1 hour session lifetime


# Security Headers
@app.after_request
def add_security_headers(response):
    """Add security headers to all responses."""
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response


# CSRF Protection with token rotation and expiration
from datetime import datetime, timedelta

def generate_csrf_token():
    """Generate a CSRF token for the session with expiration."""
    current_time = datetime.utcnow()

    # Check if token exists and is still valid (within 1 hour)
    if 'csrf_token' in session and 'csrf_token_time' in session:
        token_time = datetime.fromisoformat(session['csrf_token_time'])
        if current_time - token_time < timedelta(hours=1):
            return session['csrf_token']

    # Generate new token (expired or doesn't exist)
    session['csrf_token'] = secrets.token_hex(32)
    session['csrf_token_time'] = current_time.isoformat()
    session.permanent = True  # Enable session expiration
    logger.info(f"New CSRF token generated for session from {request.remote_addr if request else 'unknown'}")
    return session['csrf_token']


def validate_csrf_token():
    """Validate CSRF token from request and check expiration."""
    token = request.headers.get('X-CSRF-Token') or request.form.get('csrf_token')

    if not token or token != session.get('csrf_token'):
        logger.warning(f"CSRF validation failed from {request.remote_addr}")
        return False

    # Check token expiration
    if 'csrf_token_time' in session:
        token_time = datetime.fromisoformat(session['csrf_token_time'])
        current_time = datetime.utcnow()
        if current_time - token_time >= timedelta(hours=1):
            logger.warning(f"CSRF token expired from {request.remote_addr}")
            return False

    return True


# Rate limiting helper (simple in-memory implementation)
from collections import defaultdict
from time import time

rate_limit_storage = defaultdict(list)
RATE_LIMIT_REQUESTS = 100
RATE_LIMIT_WINDOW = 60  # seconds


def rate_limit(func):
    """Simple rate limiting decorator."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        client_ip = request.remote_addr
        now = time()

        # Clean old requests
        rate_limit_storage[client_ip] = [
            req_time for req_time in rate_limit_storage[client_ip]
            if now - req_time < RATE_LIMIT_WINDOW
        ]

        # Check rate limit
        if len(rate_limit_storage[client_ip]) >= RATE_LIMIT_REQUESTS:
            logger.warning(f"Rate limit exceeded for {client_ip}")
            return jsonify({"error": "Rate limit exceeded"}), 429

        rate_limit_storage[client_ip].append(now)
        return func(*args, **kwargs)

    return wrapper


@app.route("/")
def index():
    """Serve the main application page."""
    return render_template("index.html")


@app.route("/api/csrf-token")
def get_csrf_token():
    """Get CSRF token for the session."""
    return jsonify({"csrf_token": generate_csrf_token()})


@app.route("/api/browse")
@rate_limit
def browse():
    """
    Browse directory and return markdown files and subdirectories.
    Query params:
        path: Directory path to browse (defaults to ~/Documents)
    """
    path = request.args.get("path", str(DEFAULT_START_DIR))

    # Security: Ensure path is within home directory and not a symlink
    try:
        requested_path = Path(path).resolve()

        # Check for symlinks in the path
        if requested_path.is_symlink():
            logger.warning(f"Symlink access attempt: {path} from {request.remote_addr}")
            return jsonify({"error": "Access denied"}), 403

        # Ensure path is within home directory
        if not str(requested_path).startswith(str(HOME_DIR)):
            logger.warning(f"Path traversal attempt: {path} from {request.remote_addr}")
            return jsonify({"error": "Access denied"}), 403

    except Exception as e:
        logger.error(f"Invalid path error: {path} - {type(e).__name__}")
        return jsonify({"error": "Invalid path"}), 400

    if not requested_path.exists():
        return jsonify({"error": "Path not found"}), 404

    if not requested_path.is_dir():
        return jsonify({"error": "Not a directory"}), 400

    items = []
    try:
        for item in sorted(requested_path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            if item.name.startswith("."):
                continue  # Skip hidden files

            # Skip symlinks
            if item.is_symlink():
                continue

            if item.is_dir():
                # Check if directory contains any .md files (recursively, but shallow check)
                has_md = any(item.glob("*.md")) or any(item.glob("**/*.md"))
                items.append({
                    "name": item.name,
                    "path": str(item),
                    "type": "directory",
                    "has_markdown": has_md
                })
            elif item.suffix.lower() == ".md":
                try:
                    file_size = item.stat().st_size
                    items.append({
                        "name": item.name,
                        "path": str(item),
                        "type": "file",
                        "size": file_size
                    })
                except Exception:
                    # Skip files we can't stat
                    continue
    except PermissionError:
        logger.warning(f"Permission denied accessing: {requested_path} from {request.remote_addr}")
        return jsonify({"error": "Permission denied"}), 403
    except Exception as e:
        logger.error(f"Error browsing directory: {requested_path} - {type(e).__name__}")
        return jsonify({"error": "An error occurred"}), 500

    # Get parent directory (if not at home)
    parent = None
    if requested_path != HOME_DIR:
        parent = str(requested_path.parent)

    logger.info(f"Browse: {requested_path} from {request.remote_addr}")
    return jsonify({
        "current_path": str(requested_path),
        "parent": parent,
        "items": items
    })


@app.route("/api/file")
@rate_limit
def get_file():
    """
    Get contents of a markdown file.
    Query params:
        path: Path to the markdown file
    """
    path = request.args.get("path")
    if not path:
        return jsonify({"error": "Path required"}), 400

    # Security: Ensure path is within home directory and not a symlink
    try:
        file_path = Path(path).resolve()

        # Check for symlinks
        if file_path.is_symlink():
            logger.warning(f"Symlink file access attempt: {path} from {request.remote_addr}")
            return jsonify({"error": "Access denied"}), 403

        # Ensure path is within home directory
        if not str(file_path).startswith(str(HOME_DIR)):
            logger.warning(f"Path traversal file access attempt: {path} from {request.remote_addr}")
            return jsonify({"error": "Access denied"}), 403

    except Exception as e:
        logger.error(f"Invalid file path error: {path} - {type(e).__name__}")
        return jsonify({"error": "Invalid path"}), 400

    if not file_path.exists():
        return jsonify({"error": "File not found"}), 404

    if file_path.suffix.lower() != ".md":
        logger.warning(f"Non-markdown file access attempt: {path} from {request.remote_addr}")
        return jsonify({"error": "Not a markdown file"}), 400

    # Check file size before reading to prevent memory exhaustion
    try:
        file_size = file_path.stat().st_size
        if file_size > MAX_MARKDOWN_SIZE:
            logger.warning(f"File too large: {file_path} ({file_size} bytes) from {request.remote_addr}")
            return jsonify({
                "error": f"File too large. Maximum size is {MAX_MARKDOWN_SIZE / (1024*1024):.1f}MB"
            }), 413
    except Exception as e:
        logger.error(f"Error checking file size: {file_path} - {type(e).__name__}")
        return jsonify({"error": "Error accessing file"}), 500

    try:
        content = file_path.read_text(encoding="utf-8")
        logger.info(f"File accessed: {file_path} ({file_size} bytes) from {request.remote_addr}")
        return jsonify({
            "path": str(file_path),
            "name": file_path.name,
            "content": content,
            "size": file_size
        })
    except PermissionError:
        logger.warning(f"Permission denied reading file: {file_path} from {request.remote_addr}")
        return jsonify({"error": "Permission denied"}), 403
    except UnicodeDecodeError:
        logger.warning(f"Invalid UTF-8 encoding: {file_path} from {request.remote_addr}")
        return jsonify({"error": "File contains invalid UTF-8 encoding"}), 400
    except Exception as e:
        logger.error(f"Error reading file: {file_path} - {type(e).__name__}")
        return jsonify({"error": "An error occurred"}), 500


@app.route("/api/themes")
@rate_limit
def get_themes():
    """Get list of available CSS themes."""
    themes = []

    if THEMES_DIR.exists():
        for theme_file in sorted(THEMES_DIR.glob("*.css")):
            try:
                # Read theme metadata from first comment block if present
                content = theme_file.read_text(encoding="utf-8")
                name = theme_file.stem.replace("-", " ").replace("_", " ").title()
                description = ""

                # Try to extract description from CSS comment
                if content.startswith("/*"):
                    end = content.find("*/")
                    if end != -1:
                        comment = content[2:end].strip()
                        lines = comment.split("\n")
                        if lines:
                            name = lines[0].strip()
                            if len(lines) > 1:
                                description = " ".join(line.strip() for line in lines[1:])

                themes.append({
                    "id": theme_file.stem,
                    "name": name,
                    "description": description,
                    "file": f"/static/css/themes/{theme_file.name}"
                })
            except Exception as e:
                logger.error(f"Error reading theme {theme_file}: {type(e).__name__}")
                continue

    return jsonify({"themes": themes})


@app.route("/api/themes", methods=["POST"])
@rate_limit
def save_theme():
    """
    Save a new theme or update existing one.
    Body: { "id": "theme-id", "name": "Theme Name", "description": "...", "css": "..." }
    """
    # CSRF Protection
    if not validate_csrf_token():
        return jsonify({"error": "Invalid CSRF token"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    theme_id = data.get("id", "").strip()
    css_content = data.get("css", "")
    name = data.get("name", theme_id)
    description = data.get("description", "")

    if not theme_id:
        return jsonify({"error": "Theme ID required"}), 400

    # Sanitize theme ID (only alphanumeric, hyphens, underscores)
    theme_id = "".join(c for c in theme_id if c.isalnum() or c in "-_").lower()

    if not theme_id:
        return jsonify({"error": "Invalid theme ID"}), 400

    # Sanitize name and description to prevent CSS comment injection
    name = name.replace("*/", "* /").replace("/*", "/ *")
    description = description.replace("*/", "* /").replace("/*", "/ *")

    # Create theme file with metadata comment
    header = f"/*\n{name}\n{description}\n*/\n\n"
    full_css = header + css_content

    # Validate theme size
    if len(full_css) > MAX_THEME_SIZE:
        logger.warning(f"Theme too large: {len(full_css)} bytes from {request.remote_addr}")
        return jsonify({"error": f"Theme exceeds maximum size of {MAX_THEME_SIZE} bytes"}), 400

    theme_path = THEMES_DIR / f"{theme_id}.css"
    try:
        # Ensure themes directory exists
        THEMES_DIR.mkdir(parents=True, exist_ok=True)

        theme_path.write_text(full_css, encoding="utf-8")
        logger.info(f"Theme saved: {theme_id} from {request.remote_addr}")
        return jsonify({"success": True, "id": theme_id})
    except Exception as e:
        logger.error(f"Error saving theme {theme_id}: {type(e).__name__}")
        return jsonify({"error": "Failed to save theme"}), 500


if __name__ == "__main__":
    import sys

    print(f"Starting Markdown Viewer...")
    print(f"Themes directory: {THEMES_DIR}")
    print(f"Browse starting at: {DEFAULT_START_DIR}")
    print(f"Security log: {LOG_FILE}")

    # Get configuration from environment or command line
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    host = os.environ.get('FLASK_HOST', '127.0.0.1')
    port = int(os.environ.get('FLASK_PORT', '5000'))

    if debug_mode:
        print("\n" + "="*60)
        print("WARNING: Debug mode is enabled!")
        print("This should NEVER be used in production!")
        print("Set FLASK_DEBUG=False in production environments.")
        print("="*60 + "\n")

    if host == "0.0.0.0":
        print("\n" + "="*60)
        print("WARNING: Binding to all interfaces (0.0.0.0)")
        print("This exposes the application to your entire network!")
        print("Use FLASK_HOST=127.0.0.1 for localhost-only access.")
        print("="*60 + "\n")

    logger.info(f"Starting application on {host}:{port} (debug={debug_mode})")

    app.run(debug=debug_mode, host=host, port=port)
