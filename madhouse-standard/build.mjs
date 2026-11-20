// Bundles src/app.jsx into one inline script and writes dist/madhouse-standard.html.
// React and ReactDOM load as UMD globals from cdnjs (see src/index.template.html).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = await build({
  entryPoints: ['src/app.jsx'], bundle: true, write: false, format: 'iife', target: 'es2019', minify: true,
  jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', legalComments: 'none', tsconfigRaw: { compilerOptions: { jsx: 'react' } },
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('src/index.template.html', 'utf8').replace('/*APP_JS*/', () => js);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/madhouse-standard.html', html);
console.log(`dist/madhouse-standard.html  ${(html.length / 1024).toFixed(1)} KB`);
