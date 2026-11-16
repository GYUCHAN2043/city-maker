// ST 메이커 — 데이터 길 (넘김 4절 · 10절). 화면은 하나, 데이터를 가져오는 길만 셋이다:
//   launcher  PC 의 런처 서버 — python Tools/Pipeline/<이름>.py 를 tasks/maker.bat 으로 부르고, Cards/ 를 바로 읽고 쓴다
//   github    밖(폰 · 다른 PC) — 저장소의 색인 Cards/_index/{plan,cards,shapes}.json 을 읽고, 주문 · 줄거리는 커밋, 고르기는 대기열 Cards/_inbox/ 에 커밋
//   fixtures  가짜 응답 Tools/Maker/fixtures/*.json — 명령이 없는 곳 · 시험
// 화면(store.js · view-*.js)은 아래 꼴만 안다 — 그 뒤가 런처냐 GitHub 냐는 모른다:
//   init() · shapes() · plan() · cards() · pick(ids, to) · orders() · stories() · saveOrders(owner, obj) · saveStory(story)
//   tree() · words() · stFiles(owner, cat)          (없으면 null — 화면이 일감 표에서 어림한다)
//   run(name, args, title)                           (긴 명령 gen · bake 를 바로 돌린다 — 런처)
//   fill(cells | null) · last()                      (채우기를 대기열에 넣는다 · 저장소의 자동 작업이 방금 한 일 — GitHub)
//   caps = { fill, bake, key, deferred }   deferred = 고르기 · 채우기가 늦게 반영됨(대기열) — 화면이 먼저 반영된 것처럼 보여 준다
// 쓰는 곳은 Cards/ 아래뿐이다 (canWritePath). 화면은 내용을 모른다 — 카드의 칸은 받은 그대로 넘긴다.

export const STATUSES = ['live', 'picked', 'draft', 'checked', 'dropped'];
const CMDS = ['plan', 'cards', 'pick', 'shapes', 'gen', 'bake'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// JSON 을 너그럽게: BOM · 줄 머리의 // 풀이를 걷어 냄 (콘텐츠 파일이 그렇게 쓴다)
export const lenient = (t) => { const s = String(t).replace(/^﻿/, ''); try { return JSON.parse(s); } catch { return JSON.parse(s.replace(/^\s*\/\/.*$/gm, '')); } };
export const pretty = (o) => JSON.stringify(o, null, 2) + '\n';
// 쓰기는 이 꼴의 경로뿐 (Cards/ 기준). .cards 는 화면이 직접 고치지 않는다 — pick 으로
const WRITABLE = [/^[^/_][^/]*(\/[^/]+)*\/orders\.json$/, /^[^/_][^/]*\/_story\/[a-z][a-z0-9_]*\.json$/, /^_inbox\/[a-z0-9-]+\.json$/];
export const canWritePath = (rel) => !rel.split('/').some((p) => p === '..' || p === '.' || p === '') && !rel.startsWith('_index/') && WRITABLE.some((r) => r.test(rel));
const storyOf = (path, d) => { const m = path.match(/^([^/]+)\/_story\/([^/]+)\.json$/); return { pack: m[1], data: { ...d, id: d.id ?? m[2], scenes: d.scenes ?? [] } }; };

// ───────────────────────── 가짜 응답 ─────────────────────────
// load(name) → 가짜 응답 파일의 내용. 고르기는 받기만 한다(바꿀 카드 파일이 없다).
export function fixturesBackend(load) {
  return {
    kind: 'fixtures', label: '가짜 응답', caps: { fill: false, bake: false, key: null, deferred: true },
    async init() {},
    shapes: () => load('shapes'), plan: () => load('plan'), cards: () => load('cards'),
    async pick(ids) { return { changed: ids.map((id) => ({ id })) }; },
    async orders() { return {}; }, async stories() { return []; },
    async saveOrders() {}, async saveStory() {},
    async tree() { return null; }, async words() { return null; }, async stFiles() { return null; },
  };
}

// ───────────────────────── 런처 (PC) ─────────────────────────
// env.jobs(title, args) 가 있으면 긴 명령을 그것으로 돌린다 (런처의 작업 패널 — 기록이 남는다). 없으면(따로 연 페이지) 조용히 돌리고 출력을 받는다.
export function launcherBackend(env = {}) {
  const H = { 'X-Anorak': '1' };
  const url = (mount, path = '') => `/fs/${encodeURIComponent(mount)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const get = async (u) => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw Object.assign(new Error(`${r.status} ${u}`), { status: r.status }); return r; };
  const read = async (mount, path) => (await (await get(url(mount, path))).text()).replace(/^﻿/, '');
  const list = async (mount, path, glob, depth) => (await get(`${url(mount, path)}?list=${encodeURIComponent(glob)}&depth=${depth}`)).json();
  const dir = async (mount, path) => (await get(`${url(mount, path)}?dir=1`)).json();
  const host = async (action, body) => {
    const r = await fetch(`/host/${action}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...H } });
    if (!r.ok) throw new Error(`${action}: ${r.status} ${await r.text()}`);
    return r.json();
  };
  async function write(rel, text) {
    if (!canWritePath(rel)) throw new Error(`쓸 수 없는 곳: Cards/${rel}`);
    const r = await fetch(url('cards', rel), { method: 'PUT', body: text, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...H } });
    if (!r.ok) throw new Error(`쓰기 Cards/${rel}: ${r.status} ${await r.text()}`);
  }
  // 조용한 작업: tasks/maker.bat <이름> … → 출력 전부
  async function job(name, args) {
    const st = await host('jobStart', { mount: 'app', path: 'tasks/maker.bat', args: [name, ...args] });
    let from = 0, text = '';
    for (;;) {
      const r = await host('job', { id: st.id, from });
      text += r.text ?? ''; from = r.next;
      if (r.done) return { code: r.code, text, status: r.cancelled ? 'cancelled' : r.code === 0 ? 'ok' : 'fail' };
      await sleep(120);
    }
  }
  const B = {
    kind: 'launcher', label: '런처', caps: { fill: true, bake: true, key: null, deferred: false },
    real: Object.fromEntries(CMDS.map((c) => [c, false])),      // 그 명령이 있나 (없으면 가짜 응답으로)
    calls: [],                                                  // 부른 명령의 기록 (돌리기 화면)
  };
  const fake = fixturesBackend((name) => read('city', `Tools/Maker/fixtures/${name}.json`).then(lenient));
  async function cmd(name, args) {
    const call = { at: Date.now(), name, args, fake: !B.real[name], ok: null };
    B.calls.unshift(call); B.calls.splice(200);
    try {
      let out;
      if (call.fake) out = name === 'pick' ? await fake.pick(args.slice(1)) : await fake[name]();
      else {
        const r = await job(name, args);
        if (r.code !== 0) throw new Error(`${name}.py 실패 (코드 ${r.code}) ${r.text.trim().slice(-300)}`);
        const a = r.text.indexOf('{'), b = r.text.lastIndexOf('}');
        if (a < 0 || b < a) throw new Error(`${name}.py 가 JSON 을 내지 않음`);
        out = JSON.parse(r.text.slice(a, b + 1));
      }
      call.ok = true; return out;
    } catch (e) { call.ok = false; call.error = e.message; throw e; }
  }
  Object.assign(B, {
    async init() {
      const info = await (await get('/host/info')).json();
      if (!info.mounts?.cards?.write) throw new Error('연결 "cards"(Cards/ 쓰기)가 없습니다 — anorak.app.json 이 바뀌었으니 런처를 껐다 켜 주세요');
      const py = await list('city', 'Tools/Pipeline', '*.py', 0).catch(() => []);
      const names = new Set(py.map((f) => f.path.split('/').pop().replace(/\.py$/, '')));
      for (const c of CMDS) B.real[c] = names.has(c);
      B.caps.deferred = !B.real.pick;
      B.caps.key = (await dir('city', 'Tools/Pipeline').catch(() => [])).some((f) => f.name === '.key');   // 이름만 본다 — 내용은 읽지 않는다
    },
    shapes: () => cmd('shapes', ['--json']), plan: () => cmd('plan', ['--json']), cards: () => cmd('cards', ['--json']),
    pick: (ids, to) => cmd('pick', [to, ...ids]),               // pick.py <상태 | one> <id> …
    async orders() {
      const out = {};
      await Promise.all((await list('cards', '', 'orders.json', 12)).map(async (f) => { out[f.path.replace(/\/orders\.json$/, '')] = lenient(await read('cards', f.path)); }));
      return out;
    },
    async stories() {
      const files = (await list('cards', '', '*.json', 3)).filter((f) => /^[^/]+\/_story\/[^/]+\.json$/.test(f.path));
      return Promise.all(files.map(async (f) => storyOf(f.path, lenient(await read('cards', f.path)))));
    },
    saveOrders: (owner, obj) => write(`${owner}/orders.json`, pretty(obj)),
    saveStory: (story) => write(`${story.pack}/_story/${story.data.id}.json`, pretty(story.data)),
    // 카테고리 나무 · 패턴 (Game/Content — 읽기만)
    async tree() {
      const files = await list('city', 'Game/Content', '_category.json', 12);
      const owners = new Map();
      await Promise.all(files.map(async (f) => {
        const m = f.path.match(/^Game\/Content\/(.+?)\/st\/(.+)\/_category\.json$/);
        if (!m || m[1].startsWith('_dev')) return;             // _dev 는 시험용 팩 (출시 제외)
        let meta = {};
        try { meta = lenient(await read('city', f.path)); } catch { /* 깨진 파일은 이름만 */ }
        if (!owners.has(m[1])) owners.set(m[1], { id: m[1], pack: m[1].split('/')[0], categories: [], patterns: [] });
        owners.get(m[1]).categories.push({ id: m[2], pick: meta.pick ?? '' });
      }));
      await Promise.all([...owners.values()].map(async (o) => {
        const d = await dir('city', `Game/Content/${o.id}/patterns`).catch(() => []);
        o.patterns = (await Promise.all(d.filter((f) => !f.dir && f.name.endsWith('.json')).map(async (f) => {
          try {
            const p = lenient(await read('city', `Game/Content/${o.id}/patterns/${f.name}`));
            return { id: p.id ?? f.name.replace(/\.json$/, ''), steps: (p.steps ?? []).filter((s) => typeof s === 'string'), when: p.when ?? [] };
          } catch { return null; }
        }))).filter((p) => p && p.steps.length);
      }));
      return [...owners.values()];
    },
    async words() {
      const keys = (o) => Object.keys(o ?? {}).filter((k) => !k.startsWith('//'));
      const w = { situations: [], readOnly: [], values: [] };
      try { const s = lenient(await read('city', 'Game/Content/_base/World/situations.json')); w.situations = keys(s.words); w.readOnly = keys(s.read_only); } catch { /* 사전이 없으면 빈 채로 */ }
      try { w.values = keys(lenient(await read('city', 'Game/Content/_base/World/values.json')).values); } catch { /* 위와 같음 */ }
      return w;
    },
    // 그 폴더에 있는 ST 의 이름 (파일 이름만 — 본문은 읽지 않는다)
    stFiles: (owner, cat) => dir('city', `Game/Content/${owner}/st/${cat}`).then((d) => d.filter((f) => !f.dir && f.name.endsWith('.json') && !f.name.startsWith('_')).map((f) => f.name.replace(/\.json$/, '')), () => []),
    async run(name, args, title) {
      if (!B.real[name]) throw new Error(`Tools/Pipeline/${name}.py 가 없습니다`);
      B.calls.unshift({ at: Date.now(), name, args, fake: false, ok: true });
      if (env.jobs) return env.jobs(title, [name, ...args], `maker-${name}`);
      const r = await job(name, args);
      return { status: r.status, code: r.code, log: r.text };
    },
    loadRuns: () => read('data', 'maker/runs.json').then(JSON.parse, () => []),
    saveRuns: (runs) => fetch(url('data', 'maker/runs.json'), { method: 'PUT', body: JSON.stringify(runs), headers: H }).catch(() => {}),
  });
  return B;
}

// ───────────────────────── GitHub (밖 · 폰) ─────────────────────────
// cfg = { repo: '주인/저장소', branch, token }. 토큰은 부르는 쪽(main.js)이 이 브라우저의 localStorage 에서 꺼내 준다 — 페이지 · 저장소 어디에도 적지 않는다.
// 읽기: 색인 Cards/_index/{plan,cards,shapes,last}.json (저장소의 자동 작업 Tools/Pipeline/sync.py 가 만든다)
// 쓰기: 주문 · 줄거리는 그 파일을 커밋 · 고르기와 채우기는 대기열 Cards/_inbox/<이름>.json 을 커밋 → 자동 작업이 pick · gen · bake 를 돌리고 색인을 다시 만든다.
export function githubBackend(cfg) {
  const api = `https://api.github.com/repos/${cfg.repo}`;
  const head = (accept) => ({ Authorization: `Bearer ${cfg.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' });
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
  const b64 = (text) => { const b = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
  const sha = new Map();                                        // 경로 → 마지막으로 본 sha (고쳐 쓸 때 필요)
  async function call(path, opts = {}, accept = 'application/vnd.github+json') {
    const r = await fetch(`${api}/${path}`, { cache: 'no-store', ...opts, headers: { ...head(accept), ...(opts.headers ?? {}) } });
    if (r.status === 401) throw Object.assign(new Error('GitHub 가 토큰을 받지 않습니다 — 토큰을 다시 넣어 주세요'), { status: 401 });
    if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status}: ${path.split('?')[0]}`), { status: r.status });
    return r;
  }
  const ref = `ref=${encodeURIComponent(cfg.branch)}`;
  // 큰 파일도 되는 읽기 (색인) — 날것 그대로
  const raw = async (path) => (await call(`contents/${enc(path)}?${ref}`, {}, 'application/vnd.github.raw+json')).text();
  // 고쳐 쓸 파일의 읽기 — sha 를 같이 받아 둔다. 없으면 null
  async function file(path) {
    try { const d = await (await call(`contents/${enc(path)}?${ref}`)).json(); sha.set(path, d.sha); return unb64(d.content ?? ''); }
    catch (e) { if (e.status === 404) { sha.delete(path); return null; } throw e; }
  }
  async function put(rel, text, message) {
    if (!canWritePath(rel)) throw new Error(`쓸 수 없는 곳: Cards/${rel}`);
    const path = `Cards/${rel}`;
    const send = () => call(`contents/${enc(path)}`, { method: 'PUT', body: JSON.stringify({ message, content: b64(text), branch: cfg.branch, ...(sha.has(path) ? { sha: sha.get(path) } : {}) }) });
    let r;
    try { r = await send(); }
    catch (e) { if (e.status !== 409 && e.status !== 422) throw e; await file(path); r = await send(); }   // 그사이 바뀌었으면 sha 를 다시 받아 한 번 더
    sha.set(path, (await r.json()).content?.sha);
  }
  const index = async (name) => { try { return lenient(await raw(`Cards/_index/${name}.json`)); } catch (e) { if (e.status === 404) throw new Error(`색인이 아직 없습니다: Cards/_index/${name}.json (저장소의 자동 작업이 만든다)`); throw e; } };
  let owners = [], tree = null; const pats = {};
  // 저장소의 파일 목록 (한 번만) — 나무 · 폴더의 ST 이름을 여기서 뽑는다
  const paths = async () => (tree ??= call(`git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`).then((r) => r.json()).then((d) => (d.tree ?? []).filter((x) => x.type === 'blob').map((x) => x.path)));
  // 대기열 파일의 이름: 겹치지 않게 시각으로
  const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').replace('Z', '') + '-' + Math.random().toString(36).slice(2, 6);
  return {
    kind: 'github', label: `GitHub ${cfg.repo}@${cfg.branch}`, caps: { fill: true, bake: false, key: null, deferred: true },
    async init() { await call(`branches/${encodeURIComponent(cfg.branch)}`); },     // 토큰 · 저장소 · 브랜치가 맞는지
    shapes: () => index('shapes'), cards: () => index('cards'),
    async plan() { const p = await index('plan'); owners = [...new Set((p.cells ?? []).map((c) => c.owner).filter(Boolean))]; return p; },
    // 고르기 → 대기열. 저장소의 자동 작업이 pick.py · bake.py 를 돌리고 색인을 다시 만든다 (1분쯤 늦음)
    async pick(ids, to) {
      await put(`_inbox/picks-${stamp()}.json`, pretty({ picks: ids.map((id) => ({ id, to })) }), `maker: 고르기 ${to} ${ids.length}장`);
      return { changed: ids.map((id) => ({ id, to })) };
    },
    // 채우기 → 대기열. cells 가 없으면 모자란 칸 전부 (fill_missing). 열쇠는 저장소의 비밀 값 — 화면은 모른다
    async fill(cells) {
      const body = cells ? { fills: cells.map((c) => ({ category: c.category, prev: c.prev, level: c.level, n: c.n })) } : { fill_missing: true, max: 12 };
      await put(`_inbox/fill-${stamp()}.json`, pretty(body), `maker: 채우기 ${cells ? `${cells.length}칸` : '모자란 칸 전부'}`);
    },
    // 자동 작업이 방금 한 일 (반영됨 · 몇 장 통과 · 얼마 씀 · 문제) — 없으면 null
    async last() { try { return lenient(await raw('Cards/_index/last.json')); } catch (e) { if (e.status === 404) return null; throw e; } },
    async orders() {
      const out = {};
      await Promise.all(owners.map(async (o) => { const t = await file(`Cards/${o}/orders.json`); if (t != null) out[o] = lenient(t); }));
      return out;
    },
    async stories() {
      const packs = [...new Set(owners.map((o) => o.split('/')[0]))], out = [];
      await Promise.all(packs.map(async (pack) => {
        let d = [];
        try { d = await (await call(`contents/Cards/${enc(pack)}/_story?${ref}`)).json(); } catch (e) { if (e.status !== 404) throw e; }
        await Promise.all((Array.isArray(d) ? d : []).filter((f) => f.type === 'file' && f.name.endsWith('.json')).map(async (f) => {
          const t = await file(f.path); if (t != null) out.push(storyOf(f.path.replace(/^Cards\//, ''), lenient(t)));
        }));
      }));
      return out;
    },
    saveOrders: (owner, obj) => put(`${owner}/orders.json`, pretty(obj), `maker: 주문 ${owner}`),
    saveStory: (story) => put(`${story.pack}/_story/${story.data.id}.json`, pretty(story.data), `maker: 줄거리 ${story.pack}/${story.data.id}`),
    // 카테고리 나무 · 패턴 · 사전 (Game/Content — 읽기만): 저장소의 파일 목록 한 번 + 작은 파일 몇 개. 런처 길과 같은 꼴로 — 없는 이름을 밖에서도 빨갛게
    async tree() {
      const owners = new Map();
      for (const p of await paths()) {
        let m = p.match(/^Game\/Content\/(.+?)\/st\/(.+)\/_category\.json$/);
        if (m && !m[1].startsWith('_dev')) { if (!owners.has(m[1])) owners.set(m[1], { id: m[1], pack: m[1].split('/')[0], categories: [], patterns: [], files: [] }); owners.get(m[1]).categories.push({ id: m[2], pick: '' }); continue; }
        m = p.match(/^Game\/Content\/(.+?)\/patterns\/([^/]+\.json)$/);
        if (m && !m[1].startsWith('_dev')) (pats[m[1]] ??= []).push(p);
      }
      await Promise.all([...owners.values()].map(async (o) => {
        o.patterns = (await Promise.all((pats[o.id] ?? []).map(async (p) => {
          try { const d = lenient(await raw(p)); return { id: d.id ?? p.split('/').pop().replace(/\.json$/, ''), steps: (d.steps ?? []).filter((s) => typeof s === 'string'), when: d.when ?? [] }; } catch { return null; }
        }))).filter((x) => x && x.steps.length);
      }));
      return [...owners.values()];
    },
    async words() {
      const keys = (o) => Object.keys(o ?? {}).filter((k) => !k.startsWith('//'));
      const w = { situations: [], readOnly: [], values: [] };
      try { const s = lenient(await raw('Game/Content/_base/World/situations.json')); w.situations = keys(s.words); w.readOnly = keys(s.read_only); } catch { /* 없으면 빈 채로 */ }
      try { w.values = keys(lenient(await raw('Game/Content/_base/World/values.json')).values); } catch { /* 위와 같음 */ }
      return w;
    },
    async stFiles(owner, cat) { const pre = `Game/Content/${owner}/st/${cat}/`; return (await paths()).filter((p) => p.startsWith(pre) && !p.slice(pre.length).includes('/') && p.endsWith('.json') && !p.split('/').pop().startsWith('_')).map((p) => p.split('/').pop().replace(/\.json$/, '')); },
    // 아직 색인에 반영되지 않은 고르기 — 이 브라우저에 적어 둔다 (다시 열어도 먼저 반영된 것처럼 보이게)
    loadPending: () => { try { return JSON.parse(localStorage.getItem(`maker.pending.${cfg.repo}`) ?? '{}'); } catch { return {}; } },
    savePending: (p) => { try { localStorage.setItem(`maker.pending.${cfg.repo}`, JSON.stringify(p)); } catch { /* 저장소가 막힌 브라우저 */ } },
  };
}
