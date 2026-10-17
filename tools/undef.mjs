// Reports identifiers used in js/**/*.js that are neither imported/declared nor browser globals (catches missing imports),
// and named imports of local modules that the target module does not export.
// Usage: node tools/undef.mjs js/*.js js/config/*.js   (needs espree@9 + eslint-scope@7; exits 1 on any problem)
import fs from 'fs'; import path from 'path'; import * as espree from 'espree'; import * as es from 'eslint-scope';
const known = new Set(Object.getOwnPropertyNames(globalThis).concat(['window','document','location','localStorage','performance','navigator','history','addEventListener','innerWidth','innerHeight','matchMedia','devicePixelRatio','requestAnimationFrame','getComputedStyle','RTCPeerConnection','AudioContext','webkitAudioContext','Image','HTMLCanvasElement','screen','alert','visualViewport','speechSynthesis','SpeechSynthesisUtterance','OffscreenCanvas','ResizeObserver','PointerEvent']));
const parse = f => espree.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 2022, sourceType: 'module', range: true });
const exportsOf = f => { const s = new Set(); for (const n of parse(f).body) if (n.type === 'ExportNamedDeclaration') {
  const d = n.declaration; if (d) (d.declarations ? d.declarations.map(x => x.id.name) : [d.id.name]).forEach(x => s.add(x));
  n.specifiers.forEach(x => s.add(x.exported.name)); } return s; };
let bad = 0;
for (const f of process.argv.slice(2)) {
  const ast = parse(f);
  const sm = es.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
  const u = [...new Set([...sm.globalScope.through].map(r => r.identifier.name).filter(n => !known.has(n)))];
  if (u.length) { bad++; console.log('UNDEFINED', f, u); }
  for (const im of ast.body.filter(n => n.type === 'ImportDeclaration' && n.source.value.startsWith('.'))) {
    const t = path.resolve(path.dirname(f), im.source.value); if (!fs.existsSync(t)) { bad++; console.log('MISSING MODULE', f, im.source.value); continue; }
    const ex = exportsOf(t); const miss = im.specifiers.filter(s => s.type === 'ImportSpecifier' && !ex.has(s.imported.name)).map(s => s.imported.name);
    if (miss.length) { bad++; console.log('NOT EXPORTED', f, im.source.value, miss); }
  }
}
console.log(bad ? 'UNDEF CHECK FAIL' : 'UNDEF CHECK PASS'); process.exit(bad ? 1 : 0);
