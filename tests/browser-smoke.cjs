const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function findBrowserExecutable() {
  const found = browserCandidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new Error('Chrome or Edge executable was not found. Set CHROME_PATH to run browser tests.');
  return found;
}

function createServer() {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(requestUrl.pathname);
    const safePath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.normalize(path.join(root, safePath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function decodeHtml(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function runHeadlessRunner(baseUrl) {
  const executable = findBrowserExecutable();
  const userDataDir = fs.mkdtempSync(path.join(root, 'work', 'headless-test-'));
  const url = `${baseUrl}/tests/browser-runner.html`;

  const child = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--disable-accelerated-2d-canvas',
    '--use-angle=swiftshader',
    '--use-gl=swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-gpu-shader-disk-cache',
    '--disable-features=CanvasOopRasterization,VizDisplayCompositor,SkiaGraphite,DawnGraphite',
    '--dump-dom',
    '--virtual-time-budget=12000',
    `--user-data-dir=${userDataDir}`,
    url,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });

  const code = await new Promise(resolve => {
    const timer = setTimeout(() => {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      resolve(124);
    }, 25000);
    child.on('close', exitCode => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });

  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  if (userDataDir.startsWith(path.join(root, 'work')) && fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  if (code !== 0) {
    throw new Error(`Headless browser exited with ${code}\n${stderr}`);
  }
  if (!stdout.includes('data-status="pass"')) {
    const resultMatch = stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
    const result = resultMatch ? decodeHtml(resultMatch[1]) : stdout.slice(-2000);
    throw new Error(`Browser smoke tests failed:\n${result}\n${stderr}`);
  }
}

async function main() {
  const distIndex = path.join(root, 'dist', 'index.html');
  assert.equal(fs.existsSync(distIndex), true, `Run the build before tests: ${distIndex}`);

  const { server, baseUrl } = await createServer();
  try {
    await runHeadlessRunner(baseUrl);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('Browser smoke tests passed');
  console.log(`Standalone file URL: ${pathToFileURL(distIndex).href}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
