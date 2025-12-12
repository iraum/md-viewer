/**
 * Markdown Viewer - Frontend Application
 */

(function() {
    'use strict';

    // State
    let currentPath = null;
    let currentTheme = localStorage.getItem('md-viewer-theme') || '';
    let csrfToken = null;

    // DOM Elements
    const fileTree = document.getElementById('file-tree');
    const breadcrumb = document.getElementById('breadcrumb');
    const markdownContent = document.getElementById('markdown-content');
    const contentHeader = document.getElementById('content-header');
    const themeSelect = document.getElementById('theme-select');
    const themeStylesheet = document.getElementById('theme-stylesheet');

    // Configure marked (with safe hljs check)
    marked.setOptions({
        highlight: function(code, lang) {
            if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (e) {}
            }
            return code;
        },
        breaks: true,
        gfm: true
    });

    /**
     * Fetch CSRF token from the server
     */
    async function fetchCsrfToken() {
        try {
            const response = await fetch('/api/csrf-token');
            if (!response.ok) {
                throw new Error(`Failed to fetch CSRF token: ${response.statusText}`);
            }
            const data = await response.json();
            csrfToken = data.csrf_token;
            console.log('CSRF token acquired');
            return csrfToken;
        } catch (error) {
            console.error('Failed to acquire CSRF token:', error);
            // Display user-friendly error message
            const fileTree = document.getElementById('file-tree');
            if (fileTree) {
                fileTree.innerHTML = '<div class="error">Security error: Failed to initialize application. Please refresh the page.</div>';
            }
            throw error;
        }
    }

    /**
     * Make a POST request with CSRF token protection
     */
    async function postWithCsrf(url, data) {
        if (!csrfToken) {
            throw new Error('CSRF token not available. Please refresh the page.');
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify(data)
            });

            if (response.status === 403) {
                // CSRF token is invalid or expired
                console.error('CSRF token validation failed');
                throw new Error('Security validation failed. Your session may have expired. Please refresh the page.');
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('POST request failed:', error);
            throw error;
        }
    }

    /**
     * Save a custom theme
     */
    async function saveTheme(themeData) {
        try {
            const result = await postWithCsrf('/api/themes', themeData);
            console.log('Theme saved successfully:', result);
            return result;
        } catch (error) {
            console.error('Failed to save theme:', error);
            showNotification('Error: ' + error.message, 'error');
            throw error;
        }
    }

    /**
     * Show notification message to user
     */
    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background-color: ${type === 'error' ? '#f8d7da' : type === 'success' ? '#d4edda' : '#d1ecf1'};
            color: ${type === 'error' ? '#721c24' : type === 'success' ? '#155724' : '#0c5460'};
            border: 1px solid ${type === 'error' ? '#f5c6cb' : type === 'success' ? '#c3e6cb' : '#bee5eb'};
            border-radius: 4px;
            z-index: 10000;
            max-width: 400px;
            word-wrap: break-word;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.style.transition = 'opacity 0.3s ease-out';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    /**
     * Initialize the application
     */
    async function init() {
        // Fetch CSRF token early for protected endpoints
        try {
            await fetchCsrfToken();
        } catch (error) {
            console.error('Failed to initialize CSRF protection. Some features may not work.');
            return;
        }

        await loadThemes();
        await browse();

        // Apply saved theme
        if (currentTheme) {
            themeSelect.value = currentTheme;
            applyTheme(currentTheme);
        }

        // Theme selector event
        themeSelect.addEventListener('change', (e) => {
            currentTheme = e.target.value;
            localStorage.setItem('md-viewer-theme', currentTheme);
            applyTheme(currentTheme);
        });

        // Sidebar toggle
        const sidebar = document.querySelector('.sidebar');
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const sidebarCollapsed = localStorage.getItem('md-viewer-sidebar-collapsed') === 'true';

        if (sidebarCollapsed) {
            sidebar.classList.add('collapsed');
        }

        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('md-viewer-sidebar-collapsed', sidebar.classList.contains('collapsed'));
        });
    }

    /**
     * Load available themes
     */
    async function loadThemes() {
        try {
            const response = await fetch('/api/themes');
            const data = await response.json();

            data.themes.forEach(theme => {
                const option = document.createElement('option');
                option.value = theme.id;
                option.textContent = theme.name;
                option.title = theme.description;
                themeSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load themes:', error);
        }
    }

    // Track raw mode and current file content
    let rawMode = false;
    let currentFileContent = '';
    let currentFileName = '';

    /**
     * Apply a theme by ID
     */
    function applyTheme(themeId) {
        if (themeId === 'raw') {
            rawMode = true;
            themeStylesheet.href = `/static/css/themes/raw.css`;
            // Re-render current file in raw mode if one is loaded
            if (currentFileContent) {
                renderContent(currentFileContent, currentFileName, true);
            }
        } else {
            rawMode = false;
            if (themeId) {
                themeStylesheet.href = `/static/css/themes/${themeId}.css`;
            } else {
                themeStylesheet.href = '';
            }
            // Re-render current file in normal mode if one is loaded
            if (currentFileContent) {
                renderContent(currentFileContent, currentFileName, false);
            }
        }
    }

    /**
     * Apply markdown syntax highlighting to a line
     */
    function highlightMarkdown(line) {
        let html = escapeHtml(line);

        // Headers (must be at start of line)
        if (/^#{1,6}\s/.test(line)) {
            const level = line.match(/^(#{1,6})/)[1].length;
            html = `<span class="md-h${level}">${html}</span>`;
            return html;
        }

        // Code blocks (``` or ~~~)
        if (/^```|^~~~/.test(line)) {
            return `<span class="md-code-block">${html}</span>`;
        }

        // Blockquotes
        if (/^>\s/.test(line)) {
            return `<span class="md-blockquote">${html}</span>`;
        }

        // Horizontal rules
        if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            return `<span class="md-hr">${html}</span>`;
        }

        // List items
        if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
            html = html.replace(/^(\s*)([-*+]|\d+\.)(\s)/, '$1<span class="md-list">$2</span>$3');
        }

        // Table rows
        if (/^\|.*\|/.test(line)) {
            return `<span class="md-table">${html}</span>`;
        }

        // Inline elements (bold, italic, code, links)
        // Bold **text** or __text__
        html = html.replace(/(\*\*|__)([^*_]+)(\*\*|__)/g, '<span class="md-bold">$1$2$3</span>');

        // Italic *text* or _text_ (not inside bold)
        html = html.replace(/(?<!\*)(\*|_)([^*_]+)(\*|_)(?!\*)/g, '<span class="md-italic">$1$2$3</span>');

        // Inline code `code`
        html = html.replace(/`([^`]+)`/g, '<span class="md-code">`$1`</span>');

        // Links [text](url)
        html = html.replace(/(\[)([^\]]+)(\]\()([^)]+)(\))/g,
            '<span class="md-link">$1$2$3</span><span class="md-url">$4</span><span class="md-link">$5</span>');

        // Images ![alt](url)
        html = html.replace(/(!\[)([^\]]*)(]\()([^)]+)(\))/g,
            '<span class="md-image">$1$2$3$4$5</span>');

        return html;
    }

    /**
     * Render content (raw or formatted)
     */
    function renderContent(content, name, isRaw) {
        if (isRaw) {
            // Show raw markdown with line numbers and syntax highlighting
            const lines = content.split('\n');
            const numberedLines = lines.map((line, i) => {
                const num = i + 1;
                return `<div class="raw-line"><span class="line-num">${num}</span><span class="line-content">${highlightMarkdown(line)}</span></div>`;
            }).join('');
            markdownContent.innerHTML = `<div class="raw-source">${numberedLines}</div>`;
        } else {
            // Render as formatted markdown with HTML sanitization
            const html = marked.parse(content);

            // Sanitize HTML to prevent XSS attacks from malicious markdown
            // DOMPurify config: Allow safe HTML, links, images, but remove dangerous elements
            const sanitizedHtml = DOMPurify.sanitize(html, {
                ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li',
                               'blockquote', 'code', 'pre', 'strong', 'em', 'del', 'img', 'table',
                               'thead', 'tbody', 'tr', 'th', 'td', 'br', 'hr', 'div', 'span'],
                ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id'],
                ALLOW_DATA_ATTR: false,
                FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link'],
                FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
                KEEP_CONTENT: true
            });

            markdownContent.innerHTML = sanitizedHtml;

            // Apply syntax highlighting only to code blocks with explicit language
            if (typeof hljs !== 'undefined') {
                markdownContent.querySelectorAll('pre code').forEach((block) => {
                    const hasLang = Array.from(block.classList).some(c =>
                        c.startsWith('language-') && c !== 'language-undefined' && c !== 'language-'
                    );
                    if (hasLang) {
                        hljs.highlightElement(block);
                    }
                });
            }
        }
    }

    /**
     * Browse directory
     */
    async function browse(path = null) {
        fileTree.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse';
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                fileTree.innerHTML = `<div class="error">${data.error}</div>`;
                return;
            }

            currentPath = data.current_path;
            renderBreadcrumb(data.current_path, data.parent);
            renderFileTree(data.items, data.parent);
        } catch (error) {
            fileTree.innerHTML = `<div class="error">Failed to browse: ${error.message}</div>`;
        }
    }

    /**
     * Render breadcrumb navigation
     */
    function renderBreadcrumb(path, parent) {
        const parts = path.split('/').filter(Boolean);
        let html = '';
        let accumulated = '';

        parts.forEach((part, index) => {
            accumulated += '/' + part;
            const isLast = index === parts.length - 1;

            if (isLast) {
                html += `<span class="breadcrumb-current">${escapeHtml(part)}</span>`;
            } else {
                html += `<a href="#" class="breadcrumb-link" data-path="${escapeHtml(accumulated)}">${escapeHtml(part)}</a>`;
                html += '<span class="breadcrumb-sep">/</span>';
            }
        });

        breadcrumb.innerHTML = html;

        // Add click handlers
        breadcrumb.querySelectorAll('.breadcrumb-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                browse(e.target.dataset.path);
            });
        });
    }

    /**
     * Render file tree
     */
    function renderFileTree(items, parent) {
        let html = '';

        // Parent directory link
        if (parent) {
            html += `
                <div class="file-item directory parent" data-path="${escapeHtml(parent)}">
                    <span class="icon">&#128194;</span>
                    <span class="name">..</span>
                </div>
            `;
        }

        // Items
        items.forEach(item => {
            if (item.type === 'directory') {
                html += `
                    <div class="file-item directory" data-path="${escapeHtml(item.path)}">
                        <span class="icon">${item.has_markdown ? '&#128194;' : '&#128193;'}</span>
                        <span class="name">${escapeHtml(item.name)}</span>
                        ${item.has_markdown ? '<span class="badge">md</span>' : ''}
                    </div>
                `;
            } else {
                html += `
                    <div class="file-item file" data-path="${escapeHtml(item.path)}">
                        <span class="icon">&#128196;</span>
                        <span class="name">${escapeHtml(item.name)}</span>
                        <span class="size">${formatSize(item.size)}</span>
                    </div>
                `;
            }
        });

        if (items.length === 0 && !parent) {
            html = '<div class="empty">No markdown files found</div>';
        }

        fileTree.innerHTML = html;

        // Add click handlers
        fileTree.querySelectorAll('.file-item.directory').forEach(el => {
            el.addEventListener('click', () => browse(el.dataset.path));
        });

        fileTree.querySelectorAll('.file-item.file').forEach(el => {
            el.addEventListener('click', () => loadFile(el.dataset.path));
        });
    }

    /**
     * Load and display a markdown file
     */
    async function loadFile(path) {
        markdownContent.innerHTML = '<div class="loading">Loading...</div>';

        // Update active state in file tree
        fileTree.querySelectorAll('.file-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.path === path) {
                el.classList.add('active');
            }
        });

        try {
            const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
            const data = await response.json();

            if (data.error) {
                markdownContent.innerHTML = `<div class="error">${data.error}</div>`;
                return;
            }

            // Update header (preserve the toggle button)
            // Show directory path without the filename (since filename is already displayed)
            const dirPath = data.path.substring(0, data.path.lastIndexOf('/'));
            contentHeader.innerHTML = `
                <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar">&#9776;</button>
                <span class="file-name">${escapeHtml(data.name)}</span>
                <span class="file-path">${escapeHtml(dirPath)}/</span>
            `;
            // Re-attach toggle event
            document.getElementById('sidebar-toggle').addEventListener('click', () => {
                const sidebar = document.querySelector('.sidebar');
                sidebar.classList.toggle('collapsed');
                localStorage.setItem('md-viewer-sidebar-collapsed', sidebar.classList.contains('collapsed'));
            });

            // Store content for theme switching
            currentFileContent = data.content;
            currentFileName = data.name;

            // Render content (raw or formatted based on current mode)
            renderContent(data.content, data.name, rawMode);

            // Scroll to top
            markdownContent.scrollTop = 0;

        } catch (error) {
            markdownContent.innerHTML = `<div class="error">Failed to load file: ${error.message}</div>`;
        }
    }

    /**
     * Escape HTML entities
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format file size
     */
    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
