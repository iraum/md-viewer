#!/usr/bin/env python3
"""
Markdown Viewer - A Flask application for browsing and displaying markdown files
with customizable CSS theme profiles.
"""

import os
import json
from pathlib import Path
from flask import Flask, render_template, jsonify, request, send_from_directory

app = Flask(__name__)

# Configuration
HOME_DIR = Path.home()
THEMES_DIR = Path(__file__).parent / "static" / "css" / "themes"
DEFAULT_START_DIR = HOME_DIR / "Documents"


@app.route("/")
def index():
    """Serve the main application page."""
    return render_template("index.html")


@app.route("/api/browse")
def browse():
    """
    Browse directory and return markdown files and subdirectories.
    Query params:
        path: Directory path to browse (defaults to ~/Documents)
    """
    path = request.args.get("path", str(DEFAULT_START_DIR))

    # Security: Ensure path is within home directory
    try:
        requested_path = Path(path).resolve()
        if not str(requested_path).startswith(str(HOME_DIR)):
            return jsonify({"error": "Access denied"}), 403
    except Exception:
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
                items.append({
                    "name": item.name,
                    "path": str(item),
                    "type": "file",
                    "size": item.stat().st_size
                })
    except PermissionError:
        return jsonify({"error": "Permission denied"}), 403

    # Get parent directory (if not at home)
    parent = None
    if requested_path != HOME_DIR:
        parent = str(requested_path.parent)

    return jsonify({
        "current_path": str(requested_path),
        "parent": parent,
        "items": items
    })


@app.route("/api/file")
def get_file():
    """
    Get contents of a markdown file.
    Query params:
        path: Path to the markdown file
    """
    path = request.args.get("path")
    if not path:
        return jsonify({"error": "Path required"}), 400

    # Security: Ensure path is within home directory
    try:
        file_path = Path(path).resolve()
        if not str(file_path).startswith(str(HOME_DIR)):
            return jsonify({"error": "Access denied"}), 403
    except Exception:
        return jsonify({"error": "Invalid path"}), 400

    if not file_path.exists():
        return jsonify({"error": "File not found"}), 404

    if file_path.suffix.lower() != ".md":
        return jsonify({"error": "Not a markdown file"}), 400

    try:
        content = file_path.read_text(encoding="utf-8")
        return jsonify({
            "path": str(file_path),
            "name": file_path.name,
            "content": content
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/themes")
def get_themes():
    """Get list of available CSS themes."""
    themes = []

    if THEMES_DIR.exists():
        for theme_file in sorted(THEMES_DIR.glob("*.css")):
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

    return jsonify({"themes": themes})


@app.route("/api/themes", methods=["POST"])
def save_theme():
    """
    Save a new theme or update existing one.
    Body: { "id": "theme-id", "name": "Theme Name", "description": "...", "css": "..." }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    theme_id = data.get("id", "").strip()
    css_content = data.get("css", "")
    name = data.get("name", theme_id)
    description = data.get("description", "")

    if not theme_id:
        return jsonify({"error": "Theme ID required"}), 400

    # Sanitize theme ID
    theme_id = "".join(c for c in theme_id if c.isalnum() or c in "-_").lower()

    # Create theme file with metadata comment
    header = f"/*\n{name}\n{description}\n*/\n\n"
    full_css = header + css_content

    theme_path = THEMES_DIR / f"{theme_id}.css"
    try:
        theme_path.write_text(full_css, encoding="utf-8")
        return jsonify({"success": True, "id": theme_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print(f"Starting Markdown Viewer...")
    print(f"Themes directory: {THEMES_DIR}")
    print(f"Browse starting at: {DEFAULT_START_DIR}")
    app.run(debug=True, host="0.0.0.0", port=5000)
