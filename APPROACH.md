# Approach

I built a React + TypeScript (Vite) frontend with a thin Express API, sharing one framework-agnostic core so the
Express route, Vercel function, and Netlify function behave identically.

The main decision was to extract text **in the browser**. `pdfjs-dist` reads the text layer and `tesseract.js`
handles scans, so files never leave the user's machine and only extracted text reaches the server. That removes
upload handling and serverless size limits, and is a genuine privacy win; the cost is client-side CPU for OCR, which
I offset with real per-phase progress and a working cancel.

pdf.js emits positioned runs in content-stream order, not reading order, so a pure, unit-tested layout pass regroups
them into lines and paragraphs by geometry. A PDF with no usable text layer is re-rendered to images and routed
through the same OCR path.

The server exists only to hold the API key. Document text is fenced as untrusted data the model is told never to
obey, and the reply must satisfy a zod contract of `summary`, `keyPoints`, and `improvementSuggestions`; malformed
output gets one repair retry, then an honest error.

Without a key the app returns a configuration error — it never fabricates a summary.

*(196 words)*
