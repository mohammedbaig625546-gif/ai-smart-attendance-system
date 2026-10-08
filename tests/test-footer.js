const http = require('http');
const assert = require('assert');

const paths = ['/', '/student/feedback'];

async function checkPath(p) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000' + p, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        const hasText = (body.includes('Designed & Developed by') || body.includes('Powered by')) && body.includes('Baig');
        const hasClass = body.includes('app-footer');
        console.log(`Path: ${p} | Status: ${res.statusCode} | Has "Designed & Developed by Baig": ${hasText} | Has .app-footer: ${hasClass}`);
        assert.strictEqual(res.statusCode, 200, `Expected 200 for ${p}`);
        assert.strictEqual(hasText, true, `Missing "Designed & Developed by Baig" on ${p}`);
        assert.strictEqual(hasClass, true, `Missing .app-footer on ${p}`);
        resolve();
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Testing footer across pages...');
  for (const p of paths) {
    await checkPath(p);
  }
  console.log('✅ All footer assertions passed!');
}

run().catch(err => {
  console.error('❌ Footer check failed:', err);
  process.exit(1);
});
