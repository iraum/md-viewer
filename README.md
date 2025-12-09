# Markdown Viewer

A lightweight, self-hosted markdown file browser and viewer with beautiful themes.

![Markdown Viewer Screenshot](md-viewer.png)

---

## Overview

Markdown Viewer is a web-based application that lets you browse directories, discover markdown files, and view their contents with customizable visual themes. Perfect for documentation browsing, personal knowledge bases, or note-taking systems.

### Highlights

- **Zero Build Process** - Just install and run
- **7 Beautiful Themes** - Dark, Light, Nord, Solarized, and more
- **Syntax Highlighting** - Code blocks with automatic language detection
- **Raw Mode** - View markdown source with syntax highlighting
- **Secure** - Path validation prevents directory traversal attacks

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-username/md-viewer.git
cd md-viewer

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py
```

Open your browser to **http://localhost:5000**

---

## Prerequisites

- Python 3.6 or higher
- pip (Python package manager)

---

## Installation

### Option 1: Using pip

```bash
pip install -r requirements.txt
```

### Option 2: Manual Installation

```bash
pip install flask>=2.0.0
```

---

## Usage

### Starting the Server

```bash
python app.py
```

The server starts on `http://0.0.0.0:5000` by default, making it accessible from any device on your network.

### Configuration

The application uses sensible defaults but can be customized by modifying `app.py`:

| Setting | Default | Description |
|---------|---------|-------------|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `5000` | Server port |
| `DEBUG` | `True` | Enable debug mode |
| `START_DIR` | `~/Documents` | Initial directory to browse |

---

## Features

### File Browser

- Navigate directories from your Documents folder
- See file sizes at a glance
- Breadcrumb navigation for quick path jumping
- Collapsible sidebar for focused reading

### Markdown Rendering

- Full GitHub Flavored Markdown (GFM) support
- Automatic syntax highlighting for code blocks
- Line break preservation for better readability

### Dual View Modes

| Mode | Description |
|------|-------------|
| **Formatted** | Beautifully rendered HTML with proper styling |
| **Raw** | Markdown source with line numbers and syntax highlighting |

### Theme System

Switch between 7 carefully crafted themes:

| Theme | Description |
|-------|-------------|
| **Dark** | Sleek dark theme for eye comfort |
| **High Contrast** | Maximum readability with strong contrast |
| **Nord** | Arctic, north-bluish color palette |
| **Oracle** | Inspired by Oracle's brand colors |
| **Sepia** | Warm, book-like reading experience |
| **Solarized Light** | Ethan Schoonover's precision color scheme |
| **Raw** | For viewing raw markdown source |

Theme preferences persist across sessions.

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Serve the main application |
| `GET` | `/api/browse?path=<dir>` | List directory contents |
| `GET` | `/api/file?path=<file>` | Get markdown file content |
| `GET` | `/api/themes` | List available themes |
| `POST` | `/api/themes` | Create or update a theme |

### Example: Browse Directory

```bash
curl "http://localhost:5000/api/browse?path=Documents/notes"
```

### Example: Get File Content

```bash
curl "http://localhost:5000/api/file?path=Documents/notes/readme.md"
```

---

## Project Structure

```
md-viewer/
├── app.py                 # Flask backend application
├── requirements.txt       # Python dependencies
├── README.md             # This file
├── templates/
│   └── index.html        # Main HTML template
└── static/
    ├── js/
    │   └── app.js        # Frontend application logic
    └── css/
        ├── main.css      # Base styles and layout
        └── themes/       # Theme CSS files
            ├── dark.css
            ├── high-contrast.css
            ├── nord.css
            ├── oracle.css
            ├── raw.css
            ├── sepia.css
            └── solarized-light.css
```

---

## Security

Markdown Viewer includes several security measures:

- **Path Validation** - Prevents directory traversal attacks
- **Home Directory Restriction** - Cannot access files outside your home directory
- **File Type Filtering** - Only serves `.md` files
- **HTML Escaping** - Prevents XSS in filenames and content
- **Hidden File Exclusion** - Skips files starting with `.`

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Python 3 + Flask |
| Frontend | Vanilla JavaScript (ES6+) |
| Markdown | Marked.js |
| Syntax Highlighting | Highlight.js |
| Styling | CSS3 with CSS Variables |

---

## Creating Custom Themes

Add a new CSS file to `static/css/themes/` with this format:

```css
/*
My Custom Theme
A description of your theme
*/

:root {
    --bg-primary: #ffffff;
    --bg-secondary: #f5f5f5;
    --sidebar-bg: #fafafa;
    --text-primary: #333333;
    --text-secondary: #666666;
    --text-muted: #999999;
    --border-color: #e0e0e0;
    --accent-color: #007bff;
    --code-bg: #f4f4f4;
    --link-color: #0066cc;
}
```

The theme will automatically appear in the theme selector.

---

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

Requires JavaScript enabled and LocalStorage support.

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Made with Python and vanilla JavaScript
</p>
