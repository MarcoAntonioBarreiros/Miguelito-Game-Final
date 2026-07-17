const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'src', 'main.js');
const dist = path.join(root, 'dist');
const seen = new Set();

function resolveImport(fromFile, request) {
  const resolved = path.resolve(path.dirname(fromFile), request);
  return path.extname(resolved) ? resolved : `${resolved}.js`;
}

function bundleModule(file) {
  const normalized = path.normalize(file);
  if (seen.has(normalized)) return '';
  seen.add(normalized);

  let source = fs.readFileSync(normalized, 'utf8');
  const dependencies = [];
  source = source.replace(/^import\s+[^'"]+\s+from\s+['"]([^'"]+)['"];\s*$/gm, (_match, request) => {
    dependencies.push(resolveImport(normalized, request));
    return '';
  });
  source = source.replace(/^export\s+/gm, '');

  const relativeName = path.relative(root, normalized).replaceAll(path.sep, '/');
  return [
    ...dependencies.map(bundleModule),
    `\n// ${relativeName}\n${source.trim()}\n`,
  ].join('\n');
}

function build() {
  seen.clear();
  fs.mkdirSync(dist, { recursive: true });
  const htmlPath = path.join(root, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const bundle = bundleModule(entry);
  const scriptTag = '<script type="module" src="./src/main.js"></script>';
  if (!html.includes(scriptTag)) {
    throw new Error(`Expected module script tag not found in ${htmlPath}`);
  }

  const standalone = html.replace(scriptTag, `<script>\n(() => {\n'use strict';\n${bundle}\n})();\n</script>`);
  const outIndex = path.join(dist, 'index.html');
  const outNamed = path.join(dist, 'beans_living_soil_prototype_vertical_v3.html');
  fs.writeFileSync(outIndex, standalone, 'utf8');
  fs.writeFileSync(outNamed, standalone, 'utf8');
  console.log(`Built ${path.relative(root, outIndex)} and ${path.relative(root, outNamed)}`);
}

build();
