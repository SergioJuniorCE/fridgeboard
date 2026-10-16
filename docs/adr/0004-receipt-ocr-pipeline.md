# Tesseract.js default + opt-in DeepSeek Flash for receipts

Pure PWA offline OCR can only use Tesseract.js (ML Kit/Vision need native wrappers), which gives text dumps not reliable receipt structure, while cloud VLMs give structure at privacy/cost. We pre-fill total/date on-device with Tesseract.js and only on explicit tap send a downscaled photo to `deepseek-flash` (not `deepseek-v4.1`), logging consent, deferring line-item auto-check to v2.
