/**
 * Markdown Viewer - Frontend Application
 */

(function() {
    'use strict';

    // State
    let currentPath = null;
    let currentTheme = localStorage.getItem('md-viewer-theme') || '';
    let csrfToken = null;
    let showHidden = localStorage.getItem('md-viewer-show-hidden') === 'true' || false;
    let sortOrder = localStorage.getItem('md-viewer-sort-order') || 'date'; // 'date' or 'name'
    const MAX_RECENT_FILES = 15;
    let recentFiles = JSON.parse(localStorage.getItem('md-viewer-recent-files') || '[]');
    let bookmarks = JSON.parse(localStorage.getItem('md-viewer-bookmarks') || '[]');
    let currentFilePath = null;

    // Auto-refresh state
    let autoRefreshEnabled = localStorage.getItem('md-viewer-auto-refresh') !== 'false'; // Default: enabled
    let autoRefreshIntervalId = null;
    let lastKnownMtime = null;
    let currentPollInterval = 3000;  // Start at 3 seconds
    const MIN_POLL_INTERVAL = 2000;   // 2 seconds minimum
    const MAX_POLL_INTERVAL = 30000;  // 30 seconds maximum (backoff ceiling)
    let isTabVisible = true;
    let refreshDebounceTimer = null;

    // Path display configuration
    const BASE_PATH = '/run/media/opc/spielraum';
    const DISPLAY_ROOT = '/spielraum';
    const HOME_DIR = '/home/opc';

    // DOM Elements
    const fileTree = document.getElementById('file-tree');
    const breadcrumb = document.getElementById('breadcrumb');
    const markdownContent = document.getElementById('markdown-content');
    const contentHeader = document.getElementById('content-header');
    const themeSelect = document.getElementById('theme-select');
    const themeStylesheet = document.getElementById('theme-stylesheet');
    const homeBtn = document.getElementById('home-btn');
    const spielraumBtn = document.getElementById('spielraum-btn');
    const sortToggleBtn = document.getElementById('sort-toggle-btn');
    const sortIcon = document.getElementById('sort-icon');

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

        // Setup collapsible sections
        setupCollapsibleSections();
        renderRecentFiles();
        renderBookmarks();

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

        // Home button
        homeBtn.addEventListener('click', () => {
            browse(HOME_DIR);
        });

        // Spielraum button
        spielraumBtn.addEventListener('click', () => {
            browse(BASE_PATH);
        });

        // Sort toggle button
        sortToggleBtn.addEventListener('click', () => {
            toggleSortOrder();
        });

        // Update sort button icon on init
        updateSortIcon();

        // Keyboard shortcut: Ctrl+H to toggle hidden files
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault();
                toggleHiddenFiles();
            }
        });

        // Scroll to top button
        const scrollToTopBtn = document.getElementById('scroll-to-top');
        let scrollTimeout;

        markdownContent.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                if (markdownContent.scrollTop > 300) {
                    scrollToTopBtn.classList.add('visible');
                } else {
                    scrollToTopBtn.classList.remove('visible');
                }
            }, 100);
        });

        scrollToTopBtn.addEventListener('click', () => {
            markdownContent.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    /**
     * Toggle showing hidden files
     */
    function toggleHiddenFiles() {
        showHidden = !showHidden;
        localStorage.setItem('md-viewer-show-hidden', showHidden);
        browse(currentPath);
    }

    /**
     * Toggle sort order between date and name
     */
    function toggleSortOrder() {
        sortOrder = sortOrder === 'date' ? 'name' : 'date';
        localStorage.setItem('md-viewer-sort-order', sortOrder);
        updateSortIcon();
        browse(currentPath);
    }

    /**
     * Update sort button icon based on current sort order
     */
    function updateSortIcon() {
        if (sortOrder === 'date') {
            sortIcon.textContent = '↓';
            sortToggleBtn.title = 'Sort: Newest first (click for A-Z)';
        } else {
            sortIcon.textContent = 'A-Z';
            sortToggleBtn.title = 'Sort: A-Z (click for Newest)';
        }
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
    let currentFileDir = '';

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
     * Add copy buttons to code blocks
     */
    function addCopyButtons() {
        markdownContent.querySelectorAll('pre').forEach((preBlock) => {
            // Skip if button already exists
            if (preBlock.querySelector('.copy-button')) {
                return;
            }

            const button = document.createElement('button');
            button.className = 'copy-button';
            button.textContent = 'Copy';
            button.title = 'Copy code to clipboard';

            button.addEventListener('click', async () => {
                const codeBlock = preBlock.querySelector('code');
                const code = codeBlock ? codeBlock.textContent : preBlock.textContent;

                try {
                    await navigator.clipboard.writeText(code);
                    button.textContent = '✓ Copied';
                    button.classList.add('copied');

                    setTimeout(() => {
                        button.textContent = 'Copy';
                        button.classList.remove('copied');
                    }, 2000);
                } catch (error) {
                    console.error('Failed to copy code:', error);
                    button.textContent = '✗ Failed';
                    setTimeout(() => {
                        button.textContent = 'Copy';
                    }, 2000);
                }
            });

            preBlock.appendChild(button);
        });
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

            // Transform relative image URLs to use the /api/image endpoint
            markdownContent.querySelectorAll('img').forEach((img) => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('http://') && !src.startsWith('https://') &&
                    !src.startsWith('/') && !src.startsWith('data:') && currentFileDir) {
                    // Relative path - resolve against current file's directory
                    const absolutePath = currentFileDir + '/' + src;
                    img.setAttribute('src', `/api/image?path=${encodeURIComponent(absolutePath)}`);
                }
            });

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

            // Add copy buttons to code blocks
            addCopyButtons();
        }
    }

    /**
     * Browse directory
     */
    async function browse(path = null) {
        fileTree.innerHTML = `
            <div class="skeleton-tree">
                ${Array(8).fill(0).map(() => `
                    <div class="skeleton-tree-item">
                        <div class="skeleton skeleton-tree-icon"></div>
                        <div class="skeleton skeleton-tree-name"></div>
                    </div>
                `).join('')}
            </div>
        `;

        try {
            let url = path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse';
            if (showHidden) {
                url += (url.includes('?') ? '&' : '?') + 'show_hidden=true';
            }
            // Add sort order parameter
            url += (url.includes('?') ? '&' : '?') + `sort_by=${sortOrder}`;
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
        // Convert to display path for showing to user
        const displayPath = toDisplayPath(path);
        const parts = displayPath.split('/').filter(Boolean);
        let html = '';
        let accumulatedDisplay = '';
        let accumulatedReal = '';

        // Determine if truncation is needed (show ellipsis + last 3 if > 3 segments)
        const needsTruncation = parts.length > 3;
        let segmentsToShow = [];

        if (needsTruncation) {
            // Ellipsis indicator with all segments except last 3 as hidden
            segmentsToShow.push({ index: -1, part: '...', type: 'ellipsis', hidden: parts.slice(0, -3) });
            // Third to last segment (grandparent)
            segmentsToShow.push({ index: parts.length - 3, part: parts[parts.length - 3], type: 'link' });
            // Second to last segment (parent)
            segmentsToShow.push({ index: parts.length - 2, part: parts[parts.length - 2], type: 'link' });
            // Last segment (current)
            segmentsToShow.push({ index: parts.length - 1, part: parts[parts.length - 1], type: 'current' });
        } else {
            // Show all segments
            parts.forEach((part, index) => {
                const type = index === parts.length - 1 ? 'current' : 'link';
                segmentsToShow.push({ index, part, type });
            });
        }

        // Build HTML with truncation support
        segmentsToShow.forEach((segment, showIndex) => {
            if (segment.type === 'ellipsis') {
                // Render ellipsis with tooltip showing hidden segments
                const hiddenParts = segment.hidden.map(p => p).join(' / ');
                html += `<span class="breadcrumb-ellipsis" title="Hidden: ${escapeHtml(hiddenParts)}">...</span>`;
                html += '<span class="breadcrumb-sep">/</span>';
            } else if (segment.type === 'current') {
                html += `<span class="breadcrumb-current">${escapeHtml(segment.part)}</span>`;
            } else {
                // Build accumulated path for this segment
                if (segment.index === 0) {
                    accumulatedDisplay = '/' + segment.part;
                } else {
                    // Find the correct accumulated path
                    accumulatedDisplay = '/' + parts.slice(0, segment.index + 1).join('/');
                }
                accumulatedReal = toRealPath(accumulatedDisplay);
                html += `<a href="#" class="breadcrumb-link" data-path="${escapeHtml(accumulatedReal)}">${escapeHtml(segment.part)}</a>`;
                if (showIndex < segmentsToShow.length - 1) {
                    html += '<span class="breadcrumb-sep">/</span>';
                }
            }
        });

        // Set title attribute on breadcrumb container with full path
        breadcrumb.title = displayPath;
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
        markdownContent.innerHTML = `
            <div class="skeleton-content">
                <div class="skeleton skeleton-content-title"></div>
                ${Array(12).fill(0).map(() => `
                    <div class="skeleton skeleton-content-line"></div>
                `).join('')}
            </div>
        `;

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
                <span class="file-path">${escapeHtml(toDisplayPath(dirPath))}/</span>
                <button class="bookmark-button" id="bookmark-btn">
                    <span>☆</span><span>Bookmark</span>
                </button>
                <div class="metadata-display">
                    <span class="metadata-loading">Loading metadata...</span>
                </div>
            `;
            // Re-attach toggle event
            document.getElementById('sidebar-toggle').addEventListener('click', () => {
                const sidebar = document.querySelector('.sidebar');
                sidebar.classList.toggle('collapsed');
                localStorage.setItem('md-viewer-sidebar-collapsed', sidebar.classList.contains('collapsed'));
            });

            // Attach bookmark event
            currentFilePath = path;
            const bookmarkBtn = document.getElementById('bookmark-btn');
            bookmarkBtn.addEventListener('click', () => {
                toggleBookmark(path, data.name);
            });
            updateBookmarkButton();

            // Load metadata asynchronously
            loadFileMetadata(path).then(renderMetadata);

            // Store content for theme switching
            currentFileContent = data.content;
            currentFileName = data.name;
            currentFileDir = data.path.substring(0, data.path.lastIndexOf('/'));

            // Render content (raw or formatted based on current mode)
            renderContent(data.content, data.name, rawMode);

            // Add to recent files
            addToRecentFiles(path, data.name);

            // Scroll to top
            markdownContent.scrollTop = 0;

        } catch (error) {
            markdownContent.innerHTML = `<div class="error">Failed to load file: ${error.message}</div>`;
        }
    }

    /**
     * Convert real filesystem path to display path
     */
    function toDisplayPath(realPath) {
        if (realPath.startsWith(BASE_PATH)) {
            return DISPLAY_ROOT + realPath.substring(BASE_PATH.length);
        }
        return realPath;
    }

    /**
     * Convert display path to real filesystem path
     */
    function toRealPath(displayPath) {
        if (displayPath.startsWith(DISPLAY_ROOT)) {
            return BASE_PATH + displayPath.substring(DISPLAY_ROOT.length);
        }
        return displayPath;
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

    /**
     * Load and display file metadata
     */
    async function loadFileMetadata(path) {
        try {
            const response = await fetch(`/api/file-metadata?path=${encodeURIComponent(path)}`);
            const data = await response.json();

            if (data.error) {
                console.error('Failed to load metadata:', data.error);
                return null;
            }

            // Format modified date
            const modifiedDate = new Date(data.mtime * 1000);
            const formattedDate = modifiedDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            return {
                modified: formattedDate,
                size: formatSize(data.size),
                words: data.word_count.toLocaleString(),
                lines: data.line_count.toLocaleString()
            };
        } catch (error) {
            console.error('Failed to load metadata:', error);
            return null;
        }
    }

    /**
     * Render metadata in content header
     */
    function renderMetadata(metadata) {
        const metadataContainer = contentHeader.querySelector('.metadata-display');
        if (!metadataContainer) return;

        if (!metadata) {
            metadataContainer.innerHTML = '<span class="metadata-loading">Metadata unavailable</span>';
            return;
        }

        metadataContainer.innerHTML = `
            <div class="metadata-item" title="Last modified">
                <span>${escapeHtml(metadata.modified)}</span>
            </div>
            <div class="metadata-item" title="File size">
                <span>${escapeHtml(metadata.size)}</span>
            </div>
            <div class="metadata-item" title="Word count">
                <span>${escapeHtml(metadata.words)} words</span>
            </div>
            <div class="metadata-item" title="Line count">
                <span>${escapeHtml(metadata.lines)} lines</span>
            </div>
        `;
    }

    /**
     * Add file to recent files list
     */
    function addToRecentFiles(path, name) {
        // Remove if already exists
        recentFiles = recentFiles.filter(f => f.path !== path);

        // Add to beginning
        recentFiles.unshift({ path, name, timestamp: Date.now() });

        // Limit to MAX_RECENT_FILES
        if (recentFiles.length > MAX_RECENT_FILES) {
            recentFiles = recentFiles.slice(0, MAX_RECENT_FILES);
        }

        // Save to localStorage
        try {
            localStorage.setItem('md-viewer-recent-files', JSON.stringify(recentFiles));
        } catch (error) {
            console.error('Failed to save recent files:', error);
        }

        // Update UI
        renderRecentFiles();
    }

    /**
     * Remove file from recent files list
     */
    function removeFromRecentFiles(path) {
        recentFiles = recentFiles.filter(f => f.path !== path);
        try {
            localStorage.setItem('md-viewer-recent-files', JSON.stringify(recentFiles));
        } catch (error) {
            console.error('Failed to save recent files:', error);
        }
        renderRecentFiles();
    }

    /**
     * Render recent files list
     */
    function renderRecentFiles() {
        const recentList = document.getElementById('recent-list');

        if (recentFiles.length === 0) {
            recentList.innerHTML = '<div class="sidebar-section-empty">No recent files</div>';
            return;
        }

        // Group files by parent folder
        const groupedByFolder = {};
        recentFiles.forEach(file => {
            const lastSlashIndex = file.path.lastIndexOf('/');
            const parentPath = lastSlashIndex > 0 ? file.path.substring(0, lastSlashIndex) : '/';
            const folderName = parentPath.substring(parentPath.lastIndexOf('/') + 1) || parentPath;

            if (!groupedByFolder[parentPath]) {
                groupedByFolder[parentPath] = { folderName, files: [] };
            }
            groupedByFolder[parentPath].files.push(file);
        });

        // Sort groups by most recent file timestamp, files within groups by timestamp
        const sortedGroups = Object.entries(groupedByFolder)
            .map(([folderPath, group]) => {
                const sortedFiles = group.files.sort((a, b) => b.timestamp - a.timestamp);
                return {
                    folderPath,
                    folderName: group.folderName,
                    files: sortedFiles.slice(0, 3), // Only keep top 3 most recent files
                    mostRecentTimestamp: sortedFiles[0].timestamp
                };
            })
            .sort((a, b) => b.mostRecentTimestamp - a.mostRecentTimestamp);

        // Render grouped recent files
        const html = sortedGroups.map(group => `
            <div class="recent-group">
                <div class="recent-group-header">${escapeHtml(group.folderName)}</div>
                ${group.files.map(file => `
                    <div class="recent-item" data-path="${escapeHtml(file.path)}">
                        <span class="icon">📄</span>
                        <span class="name" title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</span>
                        <span class="remove-btn" data-path="${escapeHtml(file.path)}" title="Remove from recent">×</span>
                    </div>
                `).join('')}
            </div>
        `).join('');

        recentList.innerHTML = html;

        // Add click handlers
        recentList.querySelectorAll('.recent-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (!e.target.classList.contains('remove-btn')) {
                    const filePath = el.dataset.path;
                    // Extract parent directory and navigate to it first
                    const lastSlashIndex = filePath.lastIndexOf('/');
                    const parentDir = lastSlashIndex > 0 ? filePath.substring(0, lastSlashIndex) : '/';
                    browse(parentDir);
                    loadFile(filePath);
                }
            });
        });

        recentList.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFromRecentFiles(btn.dataset.path);
            });
        });
    }

    /**
     * Check if file is bookmarked
     */
    function isBookmarked(path) {
        return bookmarks.some(b => b.path === path);
    }

    /**
     * Toggle bookmark for current file
     */
    function toggleBookmark(path, name) {
        if (isBookmarked(path)) {
            // Remove bookmark
            bookmarks = bookmarks.filter(b => b.path !== path);
        } else {
            // Add bookmark
            bookmarks.push({ path, name, timestamp: Date.now() });
            // Sort by name
            bookmarks.sort((a, b) => a.name.localeCompare(b.name));
        }

        try {
            localStorage.setItem('md-viewer-bookmarks', JSON.stringify(bookmarks));
        } catch (error) {
            console.error('Failed to save bookmarks:', error);
        }
        renderBookmarks();
        updateBookmarkButton();
    }

    /**
     * Remove bookmark
     */
    function removeBookmark(path) {
        bookmarks = bookmarks.filter(b => b.path !== path);
        try {
            localStorage.setItem('md-viewer-bookmarks', JSON.stringify(bookmarks));
        } catch (error) {
            console.error('Failed to save bookmarks:', error);
        }
        renderBookmarks();
        updateBookmarkButton();
    }

    /**
     * Render bookmarks list
     */
    function renderBookmarks() {
        const bookmarksList = document.getElementById('bookmarks-list');

        if (bookmarks.length === 0) {
            bookmarksList.innerHTML = '<div class="sidebar-section-empty">No bookmarks</div>';
            return;
        }

        const html = bookmarks.map(bookmark => `
            <div class="bookmark-item" data-path="${escapeHtml(bookmark.path)}">
                <span class="icon">⭐</span>
                <span class="name" title="${escapeHtml(bookmark.path)}">${escapeHtml(bookmark.name)}</span>
                <span class="remove-btn" data-path="${escapeHtml(bookmark.path)}" title="Remove bookmark">×</span>
            </div>
        `).join('');

        bookmarksList.innerHTML = html;

        // Add click handlers
        bookmarksList.querySelectorAll('.bookmark-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (!e.target.classList.contains('remove-btn')) {
                    const filePath = el.dataset.path;
                    // Extract parent directory and navigate to it first
                    const lastSlashIndex = filePath.lastIndexOf('/');
                    const parentDir = lastSlashIndex > 0 ? filePath.substring(0, lastSlashIndex) : '/';
                    browse(parentDir);
                    loadFile(filePath);
                }
            });
        });

        bookmarksList.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeBookmark(btn.dataset.path);
            });
        });
    }

    /**
     * Update bookmark button state
     */
    function updateBookmarkButton() {
        const bookmarkBtn = document.getElementById('bookmark-btn');
        if (!bookmarkBtn || !currentFilePath) return;

        if (isBookmarked(currentFilePath)) {
            bookmarkBtn.classList.add('bookmarked');
            bookmarkBtn.innerHTML = '<span>⭐</span><span>Bookmarked</span>';
            bookmarkBtn.title = 'Remove bookmark';
        } else {
            bookmarkBtn.classList.remove('bookmarked');
            bookmarkBtn.innerHTML = '<span>☆</span><span>Bookmark</span>';
            bookmarkBtn.title = 'Add bookmark';
        }
    }

    /**
     * Setup collapsible sections
     */
    function setupCollapsibleSections() {
        const sections = [
            { header: 'recent-header', content: 'recent-list', storageKey: 'md-viewer-recent-collapsed' },
            { header: 'bookmarks-header', content: 'bookmarks-list', storageKey: 'md-viewer-bookmarks-collapsed' }
        ];

        sections.forEach(({ header, content, storageKey }) => {
            const headerEl = document.getElementById(header);
            const contentEl = document.getElementById(content);
            const storedState = localStorage.getItem(storageKey);

            // Only apply stored state if it exists, otherwise keep HTML default (collapsed)
            if (storedState !== null) {
                const isCollapsed = storedState === 'true';
                if (isCollapsed) {
                    headerEl.classList.add('collapsed');
                    contentEl.classList.add('collapsed');
                } else {
                    headerEl.classList.remove('collapsed');
                    contentEl.classList.remove('collapsed');
                }
            }

            headerEl.addEventListener('click', () => {
                const collapsed = headerEl.classList.toggle('collapsed');
                contentEl.classList.toggle('collapsed');
                try {
                    localStorage.setItem(storageKey, collapsed);
                } catch (error) {
                    console.error('Failed to save section state:', error);
                }
            });
        });
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
