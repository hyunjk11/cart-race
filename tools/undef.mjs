// Reports identifiers used in js/*.js that are neither imported/declared nor browser globals (catches missing imports).
// Usage: node tools/undef.mjs js/*.js   (needs espree@9 + eslint-scope@7; exits 1 if anything is undefined)
import fs from 'fs'; import * as espree from 'espree'; import * as es from 'eslint-scope';
const known = new Set(Object.getOwnPropertyNames(globalThis).concat(['window','document','location','localStorage','performance','navigator','history','addEventListener','innerWidth','innerHeight','matchMedia','devicePixelRatio','requestAnimationFrame','getComputedStyle','RTCPeerConnection','AudioContext','webkitAudioContext','Image','HTMLCanvasElement','screen','alert','visualViewport','speechSynthesis','SpeechSynthesisUtterance','OffscreenCanvas','ResizeObserver','PointerEvent']));
let bad = 0;
for (const f of process.argv.slice(2)) {
  const ast = espree.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 2022, sourceType: 'module', range: true });
  const sm = es.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
  const u = [...new Set([...sm.globalScope.through].map(r => r.identifier.name).filter(n => !known.has(n)))];
  if (u.length) { bad++; console.log('UNDEFINED', f, u); }
}
console.log(bad ? 'UNDEF CHECK FAIL' : 'UNDEF CHECK PASS'); process.exit(bad ? 1 : 0);
