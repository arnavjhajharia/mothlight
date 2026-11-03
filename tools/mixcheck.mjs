// node tools/mixcheck.mjs <url> : renders each Mothlight groove + each SFX offline and prints RMS/peak dBFS per layer.
// Used to keep the sampled instruments at the same loudness as the old synth mix.
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const url = process.argv[2], DBG = 9300 + Math.floor(Math.random() * 600);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-chrome-'));
const ch = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tgt; for (let i = 0; i < 50 && !tgt; i++) { await sleep(200); try { tgt = (await (await fetch(`http://127.0.0.1:${DBG}/json`)).json()).find(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; const exc = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } if (d.method === 'Runtime.exceptionThrown') exc.push(d.params.exceptionDetails.exception?.description?.split('\n')[0]); };
const send = (method, params = {}) => new Promise(r => { pend[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable'); await send('Page.navigate', { url }); await sleep(2500);
const expr = `(async () => {
  const SR = 44100, out = {};
  const jobs = { music: null, musicHot: 'hot', eat: () => sfx.eat(0, 3), pop: () => sfx.pop(1), count: () => sfx.count(), win: () => sfx.win(), fanfare: () => sfx.fanfare() };
  for (const [k, fn] of Object.entries(jobs)) {
    const off = new OfflineAudioContext(1, SR * 4, SR); let fake = 0; Object.defineProperty(off, 'currentTime', { get: () => fake });
    window.AudioContext = function () { return off; }; window.setInterval = () => 0;
    ac = null; ctxA(); if (typeof loadSamples === 'function') { smpReady = null; await loadSamples(); }
    if (typeof fn === 'function') fn();
    else { phase = fn === 'hot' ? 'play' : 'lobby'; if (fn === 'hot') tRound = SHRINK_AT; nextBeat = 0.1; beat = 0; for (fake = 0; fake < 3.5; fake += 0.05) sched(); fake = 0; }
    const b = (await off.startRendering()).getChannelData(0);
    let ss = 0, pk = 0; for (const v of b) { ss += v * v; pk = Math.max(pk, Math.abs(v)); }
    out[k] = [+(10 * Math.log10(ss / b.length + 1e-12)).toFixed(1), +(20 * Math.log10(pk + 1e-12)).toFixed(1)];
  }
  return out; })()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result?.result?.value ?? r.result), exc.length ? 'EXC ' + exc.join(' | ') : '');
ws.close(); ch.kill(); await sleep(300); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
