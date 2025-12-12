# XSS Test File

This file contains various XSS payloads to test DOMPurify sanitization.

## Test 1: Script Tag
<script>alert('XSS via script tag')</script>

## Test 2: Image Onerror
<img src=x onerror="alert('XSS via img onerror')">

## Test 3: Iframe with JavaScript
<iframe src="javascript:alert('XSS via iframe')"></iframe>

## Test 4: Link with JavaScript
[Click me](javascript:alert('XSS via link'))

## Test 5: Inline Event Handler
<div onclick="alert('XSS via onclick')">Click this text</div>

## Test 6: Object Tag
<object data="javascript:alert('XSS via object')"></object>

## Test 7: Embed Tag
<embed src="javascript:alert('XSS via embed')">

## Test 8: Style Tag with Expression
<style>body { background: expression(alert('XSS via style')) }</style>

## Test 9: SVG with Script
<svg onload="alert('XSS via SVG')"></svg>

## Test 10: Meta Refresh
<meta http-equiv="refresh" content="0;url=javascript:alert('XSS')">

## Test 11: Base Tag
<base href="javascript:alert('XSS')//">

## Test 12: Form with Action
<form action="javascript:alert('XSS')"><button>Submit</button></form>

## Expected Results

All of the above XSS payloads should be:
- Removed completely (script, iframe, object, embed, style, meta, base)
- Sanitized (img without onerror, div without onclick)
- Made safe (links should not have javascript: URLs)

If you can execute any of these, the sanitization is NOT working properly!

## Safe Content

This is normal markdown content that should render properly:

- **Bold text**
- *Italic text*
- `Code block`
- [Safe link](https://example.com)
- ![Safe image](https://via.placeholder.com/150)

```python
# Safe code block
def hello():
    print("Hello, World!")
```

| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
