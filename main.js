// 따로 여는 ST 메이커의 시작 (index.html). 데이터 길을 고른다:
//   런처 서버에서 열렸으면(http://localhost:8791/extensions/maker/) → 런처 길 · ?demo → 가짜 응답 · 그 밖(밖 · 폰) → GitHub 길
// GitHub 길의 토큰은 사용자가 한 번 붙여 넣고, 이 브라우저의 localStorage 에만 둔다 — 페이지 · 저장소 어디에도 적지 않는다.
import { mountMaker } from './app.js';
import { createStore } from './store.js';
import { launcherBackend, githubBackend, fixturesBackend, lenient } from './backends.js';
import { esc } from './ui.js';

const el = document.getElementById('app');
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 저장소가 막힌 브라우저 */ } } };
const settings = { get: (k, d) => { try { return JSON.parse(ls.get(`maker.set.${k}`)) ?? d; } catch { return d; } }, set: (k, v) => ls.set(`maker.set.${k}`, JSON.stringify(v)) };
let unmount = null;

function start(backend, extra = {}) {
  unmount?.();
  const store = createStore(backend);
  window.cityMaker = store;
  unmount = mountMaker(el, store, { settings, ...extra });
}
function logout() { ls.set('maker.token', null); unmount?.(); unmount = null; login(); }

// 들어가기: 저장소 · 브랜치 · 토큰. 토큰은 그 저장소 하나의 내용(Contents)을 읽고 쓰는 것이면 된다
function login(msg = '') {
  const cfg = JSON.parse(ls.get('maker.github') ?? '{}');
  el.innerHTML = `<form class="mk-login">
    <h1>ST 메이커</h1>
    <p>밖에서 쓰는 길 — GitHub 저장소로 읽고 쓴다. 토큰은 이 브라우저에만 남는다.</p>
    ${msg ? `<div class="mk-warn">${esc(msg)}</div>` : ''}
    <label>저장소<input class="a-input" name="repo" placeholder="주인/저장소" value="${esc(cfg.repo ?? '')}" autocapitalize="off" autocomplete="off" spellcheck="false" required pattern="[^/\\s]+/[^/\\s]+"></label>
    <label>브랜치<input class="a-input" name="branch" value="${esc(cfg.branch ?? 'main')}" autocapitalize="off" autocomplete="off" spellcheck="false" required></label>
    <label>토큰<input class="a-input" name="token" type="password" placeholder="그 저장소의 Contents 읽기 · 쓰기 토큰" autocomplete="off" required></label>
    <button class="a-btn a-primary" type="submit">들어가기</button>
  </form>`;
  el.firstChild.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target), next = { repo: String(f.get('repo')).trim(), branch: String(f.get('branch')).trim() || 'main' };
    ls.set('maker.github', JSON.stringify(next)); ls.set('maker.token', String(f.get('token')).trim());
    github();
  });
}
function github() {
  const cfg = JSON.parse(ls.get('maker.github') ?? '{}'), token = ls.get('maker.token');
  if (!cfg.repo || !token) return login();
  start(githubBackend({ ...cfg, token }), { logout });
}
async function isLauncher() {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) return false;
  try { const r = await fetch('/host/ping', { cache: 'no-store' }); return r.ok && (await r.text()) === 'anorak'; } catch { return false; }
}

if (new URLSearchParams(location.search).has('demo')) start(fixturesBackend((n) => fetch(`../../../Maker/fixtures/${n}.json`, { cache: 'no-store' }).then((r) => r.text()).then(lenient)));
else if (await isLauncher()) start(launcherBackend());
else github();
