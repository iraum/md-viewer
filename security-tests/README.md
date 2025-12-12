# Security Testing Guide

This directory contains test files for verifying the security fixes in md-viewer.

## Quick Start

1. Start the application with proper security settings:
```bash
cd /home/opc/Documents/orcl-code/md-viewer
export SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
python3 app.py
```

2. Open your browser to http://127.0.0.1:5000

3. Navigate to this security-tests directory

4. Open the test files and verify the security fixes work

## Test Files

### xss-test.md
Contains 12 different XSS attack vectors to verify DOMPurify sanitization.

**Expected Behavior**:
- No JavaScript alerts should execute
- All malicious tags should be removed
- Safe markdown content should render normally

**How to Test**:
1. Open xss-test.md in the viewer
2. Verify NO alerts pop up
3. Verify content displays but without dangerous elements
4. Check browser console for sanitization messages

## Manual Security Tests

### Test 1: DOM-based XSS via File Path

**Test**: Create a directory with XSS payload in the name

```bash
cd /home/opc/Documents/orcl-code/md-viewer/security-tests
mkdir -p 'test"><script>alert(1)</script><div class="'
echo "# Test" > 'test"><script>alert(1)</script><div class="/test.md'
```

**Expected**: The payload should be HTML-encoded in data-path attributes and NOT execute.

**Verification**:
1. Browse to the directory in md-viewer
2. Right-click and "Inspect Element" on the file entry
3. Verify the data-path attribute contains escaped HTML entities like `&lt;script&gt;`
4. No alert should appear

### Test 2: Markdown HTML Injection

**Test**: Open xss-test.md (already created)

**Expected**: All XSS payloads sanitized by DOMPurify

**Verification**:
1. Open xss-test.md in the viewer
2. No alerts should appear
3. Check the rendered HTML (inspect element)
4. Verify dangerous tags like `<script>`, `<iframe>` are removed
5. Verify event handlers like `onerror`, `onclick` are stripped

### Test 3: CSRF Protection

**Test**: Attempt to save a theme without CSRF token

```bash
curl -X POST http://127.0.0.1:5000/api/themes \
  -H "Content-Type: application/json" \
  -d '{"id":"malicious","css":".body{}"}'
```

**Expected**: 403 Forbidden response

**Verification**:
```bash
# Should return: {"error": "Invalid CSRF token"}
# Check security.log for CSRF validation failure
```

### Test 4: File Size Limit

**Test**: Create a file larger than 10MB

```bash
cd /home/opc/Documents/orcl-code/md-viewer/security-tests
dd if=/dev/zero of=large-file.md bs=1M count=15
```

**Expected**: 413 Payload Too Large error

**Verification**:
1. Try to open large-file.md in the viewer
2. Should see error: "File too large. Maximum size is 10.0MB"
3. Check security.log for warning about file size

### Test 5: Session Security

**Test**: Verify secure session cookie flags

**Verification**:
1. Open browser DevTools (F12)
2. Go to Application/Storage → Cookies
3. Check the session cookie has:
   - HttpOnly: ✓ (prevents JavaScript access)
   - SameSite: Lax (prevents CSRF)
   - Secure: ✓ (only if using HTTPS)

### Test 6: CSRF Token Expiration

**Test**: Verify tokens expire after 1 hour

```python
# In Python shell
import requests
s = requests.Session()

# Get initial token
r1 = s.get('http://127.0.0.1:5000/api/csrf-token')
token1 = r1.json()['csrf_token']
print(f"Token 1: {token1[:16]}...")

# Wait or simulate time passing
# After 1+ hour, token should rotate
```

### Test 7: Path Traversal Prevention

**Test**: Try to access files outside home directory

```bash
curl "http://127.0.0.1:5000/api/file?path=/etc/passwd"
```

**Expected**: 403 Access Denied

**Verification**: Check security.log for path traversal attempt warning

## Automated Testing

Run the comprehensive test suite:

```bash
cd /home/opc/Documents/orcl-code/md-viewer
python3 test_security_fixes.py
```

**Expected Output**: All 5/5 tests should pass

## Security Monitoring

Monitor the security log in real-time:

```bash
tail -f /home/opc/Documents/orcl-code/md-viewer/security.log
```

Look for:
- CSRF validation failures
- Path traversal attempts
- Rate limit violations
- File size violations
- Authentication failures

## Clean Up Test Files

After testing, clean up dangerous test directories:

```bash
cd /home/opc/Documents/orcl-code/md-viewer/security-tests
rm -rf 'test"><script>alert(1)</script><div class="'
rm -f large-file.md
```

## Production Deployment Checklist

Before deploying to production:

- [ ] Set SECRET_KEY environment variable
- [ ] Set FLASK_ENV=production
- [ ] Enable HTTPS (required for secure cookies)
- [ ] Review and tune rate limits
- [ ] Set up log monitoring/alerting
- [ ] Run security test suite
- [ ] Test with actual malicious payloads
- [ ] Verify DOMPurify is loaded locally (not CDN)
- [ ] Configure firewall rules
- [ ] Set up intrusion detection

## Reporting Security Issues

If you find a security vulnerability:

1. DO NOT create a public GitHub issue
2. Email the maintainer directly
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)
- [Flask Security Best Practices](https://flask.palletsprojects.com/en/latest/security/)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
