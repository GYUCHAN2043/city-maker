// 작업대의 AI 한 겹 (넘김-3 4절 · 4-2절): ai.briefs() · ai.novels() · ai.redo() · ai.match() · ai.suggest()
// 바로 부름 — 브라우저가 그록을. 열쇠는 이 브라우저의 localStorage 'maker.xai' 에만 (페이지 · 저장소 · 기록 어디에도 적지 않는다).
// 요청문은 화면이 짓지 않는다 — 색인의 prompts.json(총괄의 prompts.py 가 만듦)의 틀글에 빈칸만 채운다 (넘김-3 4-4):
//   user = tasks.<일>(글 하나)의 {category} {cat_brief} {target} {topic} {n} {taken} {brief} {examples} {rejected} {shape} {card} {note} ({library} {text} {kind})
//   system = world · who · rules · shapes · levels 를 잇는다 · 대상의 글 = target_line 의 꼴 · 수위의 풀이가 비어 있는 수위는 만들지 않는다
//   답의 꼴: brief = {"briefs":["글",…]} · 소설 · 다시 = {"fields":{…}} — 칸이 없거나 비면 "그록의 답을 읽지 못했습니다" + 받은 답의 앞부분
// 저장은 대기열의 cards (4-2): 자동 작업이 검사해 카드 파일로 — 같은 id 를 다시 보내면 새 판, 이전 판은 versions.
// 느린 길(대기열의 briefs · novels · redo — 자동 작업이 그록을 부름)은 아직 없다 → 열쇠가 없거나 막히면 대기열에 넣지 않고 "열쇠를 넣거나 PC 에서 채우기"를 알린다.

const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 막힌 브라우저 */ } } };
export const aiKey = { has: () => !!ls.get('maker.xai'), set: (v) => ls.set('maker.xai', v ? String(v).trim() : null), clear: () => { ls.set('maker.xai', null); } };
export const aiModel = { get: () => ls.get('maker.xai.model') ?? '', set: (v) => ls.set('maker.xai.model', v) };

// 틀글의 {이름} 을 채운다 — 글이 아닌 값은 JSON 으로 · 모르는 빈칸은 그대로 둔다
export function fill(tpl, vars) {
  return String(tpl ?? '').replace(/\{([a-z_]+)\}/g, (m, k) => (k in vars && vars[k] != null ? (typeof vars[k] === 'string' ? vars[k] : JSON.stringify(vars[k])) : m));
}

// 대상 → 사람 말 한 줄 (화면의 표시)
export function targetText(T, infoName, roleName) {
  const side = (s) => `${s.c.map((c) => infoName(c.id ?? c) + (c.n ? `(${c.n})` : '')).join(' · ')}${s.c.length ? ' ' : ''}${roleName(s.role)}`.trim();
  return `${side(T.f)} → ${side(T.t)}`;
}
// 대상 → 요청문의 대상 줄 (prompts.target_line 의 꼴: "WHO: {from}{f} → {to}{t}" + 방금 있었던 일이면 context 줄)
export function targetLine(P, T, info) {
  const TL = P?.target_line ?? {}, role = (r) => TL.roles?.[r] ?? r;
  // 정도가 있으면 level_names 의 그 단계 — 단계 이름만으로 뜻이 서지 않으면("많이") 이름을 앞에: "호색 (많이)"
  const names = (cs) => cs.filter((c) => !info(c.id).word).map((c) => { const i = info(c.id), ln = i.levels && c.n ? i.level_names?.[c.n - 1] : null; return !ln ? i.name : ln.includes(i.name) ? ln : `${i.name} (${ln})`; });
  const br = (xs) => (xs.length ? ` [${xs.join(', ')}]` : '');
  let line = fill(TL.line ?? 'WHO: {from}{f} → {to}{t}', { from: role(T.f.role), to: role(T.t.role), f: br(names(T.f.c)), t: br(names(T.t.c)) });
  const words = [...T.f.c, ...T.t.c].filter((c) => info(c.id).word).map((c) => info(c.id).about || info(c.id).name);
  if (words.length && TL.context) line += `\n${fill(TL.context, { words: words.join(' · ') })}`;
  return line;
}

// 그록의 답에 기대한 칸이 없을 때 — 돈은 나갔는데 까닭을 모르는 상태가 없게, 받은 답의 앞부분을 같이 (화면이 접어서 보여 준다)
const unread = (raw, what) => Object.assign(new Error(`그록의 답을 읽지 못했습니다 — ${what}`), { raw: String(raw ?? '').slice(0, 1200) });
const list = (xs, sep = '\n\n') => (Array.isArray(xs) ? (xs.length ? xs.join(sep) : '(none)') : xs == null || xs === '' ? '(none)' : xs);

export function createAi({ getPrompts, onCost, fetchImpl }) {
  const F = fetchImpl ?? ((...a) => fetch(...a));
  const usd = (j) => (j?.usage?.cost_in_usd_ticks ?? 0) / 1e10;

  async function call(P, system, user) {
    const key = ls.get('maker.xai');
    if (!key) throw Object.assign(new Error('그록 열쇠가 없습니다 — 위 줄에 넣거나, PC 에서 채우기(런처 · 돌리기)를 쓰세요'), { nokey: true });
    let r;
    try {
      r = await F(P.api?.url ?? 'https://api.x.ai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: aiModel.get() || undefined, temperature: P.api?.temperature, response_format: P.api?.response_format ?? { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
    } catch { throw new Error('브라우저에서 그록에 닿지 못했습니다 (CORS · 네트워크) — PC 에서 채우기(런처 · 돌리기)를 쓰세요'); }
    if (r.status === 401 || r.status === 403) throw new Error('그록이 열쇠를 받지 않습니다 — 열쇠를 다시 넣어 주세요');
    if (!r.ok) throw new Error(`그록 ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
    const j = await r.json();
    const cost = usd(j); if (cost) onCost?.(cost);
    const raw = j.choices?.[0]?.message?.content ?? '';
    let out; try { out = JSON.parse(raw || 'null'); } catch { throw Object.assign(unread(raw, 'JSON 이 아님'), { usd: cost }); }
    if (!out || typeof out !== 'object') throw Object.assign(unread(raw, '빈 답'), { usd: cost });
    return { out, raw, usd: cost, model: j.model ?? aiModel.get() };
  }
  // 일 하나의 요청문 (4-4): 사용자 쪽 = tasks.<일>(글 하나)의 빈칸만 · 시스템 쪽 = world · who · rules · shapes · levels (prompts.py 의 머리말 · gen.py 와 같은 차례)
  async function task(name, cat, level, extra) {
    const P = (await getPrompts()) ?? {};
    const T = P.tasks?.[name]; if (typeof T !== 'string' || !T) throw new Error(`요청문 표에 "${name}" 이 없습니다`);
    const C = (cat && P.categories?.[cat]) || null;
    if (cat && !C) throw new Error(`요청문 표에 카테고리 "${cat}" 이 없어 만들지 않습니다 (손으로 쓰는 ST)`);
    if (level != null && !String(P.levels?.[level] ?? '').trim()) throw new Error(`수위 ${level} 의 풀이가 요청문 표에 없어 만들지 않습니다`);
    const BL = (C && (C.by_level?.[level] ?? { examples: C.examples, rejected: C.rejected })) ?? {};      // 수위별 본보기 · 없으면 examples
    const system = (C ? [P.world, P.who?.[C.who], P.rules, P.shapes?.[C.shape], level != null && P.levels?.[level] ? `CONTENT LEVEL: ${P.levels[level]}` : ''] : [P.world]).filter(Boolean).join('\n\n');
    const vars = { category: cat ?? '', cat_brief: C?.brief || '(none)', shape: C?.shape ?? '', taken: list(C?.taken ?? [], ' / '),
      examples: list(BL.examples ?? []), rejected: list(BL.rejected ?? []), ...extra };
    return { P, C, system, user: fill(T, vars) };
  }
  const idOk = (P, id) => new RegExp(P.limits?.id ?? '^[a-z][a-z0-9_]*$').test(id ?? '');
  const newId = (P, C, used) => { let k = 1, id; const pre = (C?.prefix || 'card').replace(/[^a-z0-9_]/g, '_'); do { id = `${pre}_${Date.now().toString(36)}${k++}`; } while (used.has(id) || !idOk(P, id)); return id; };
  // 카드 한 장의 칸 — {"fields":{…}} (4-4) · 예전 꼴 {"cards":[{…}]} 도 받는다
  const fieldsOf = (out) => { const f = out.fields ?? out.cards?.[0]?.fields ?? out.cards?.[0] ?? out.card ?? null; return f && typeof f === 'object' && Object.keys(f).some((k) => k !== 'id' && f[k]) ? Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'id')) : null; };

  return {
    // 주제 · 개수 → { items:[{ id, brief }] } — id 는 그 카테고리의 머리글(prefix)로 화면이 붙인다 (저장소의 카드 id)
    async briefs({ category, target, topic, n, level = 'general', used = new Set() }) {
      const { P, C, system, user } = await task('briefs', category, level, { target, topic: topic || '(none)', n: String(n) });
      const r = await call(P, system, user);
      const got = (Array.isArray(r.out.briefs) ? r.out.briefs : []).map((b) => (typeof b === 'string' ? b : b?.brief ?? '')).map((b) => String(b).trim()).filter(Boolean).slice(0, n);
      if (!got.length) throw Object.assign(unread(r.raw, '"briefs" 가 없거나 비었음'), { usd: r.usd });
      const items = got.map((brief) => { const id = newId(P, C, used); used.add(id); return { id, brief }; });
      return { items, usd: r.usd, model: r.model };
    },
    // brief 들 → 카드들 [{ id, brief, fields }] — brief 하나에 한 번씩 부른다 (틀글이 "ONE card"). 중간에 막히면 거기까지 + err
    async novels({ category, target, briefs, level = 'general', onOne }) {
      const cards = []; let spent = 0, model = '', err = null;
      for (const b of briefs) {
        try {
          const { P, system, user } = await task('novels', category, level, { target, brief: b.brief });
          const r = await call(P, system, user); spent += r.usd; model = r.model;
          const fields = fieldsOf(r.out);
          if (!fields) throw Object.assign(unread(r.raw, '"fields" 가 없거나 비었음'), { usd: r.usd });
          const card = { id: b.id, brief: b.brief, fields }; cards.push(card); onOne?.(card);
        } catch (e) { err = e; break; }
      }
      return { cards, usd: spent, model, err };
    },
    // 카드 한 장 + 피드백 → 다시 쓴 카드 { card:{ fields } }
    async redo({ category, target, card, note, level = 'general' }) {
      const text = typeof card === 'string' ? card : Object.entries(card ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
      const { P, system, user } = await task('redo', category, level, { target, card: text, note });
      const r = await call(P, system, user);
      const fields = fieldsOf(r.out);
      if (!fields) throw Object.assign(unread(r.raw, '"fields" 가 없거나 비었음'), { usd: r.usd });
      return { card: { fields }, usd: r.usd, model: r.model };
    },
    // 말 → 정보 제안. 열쇠가 있으면 그록이 라이브러리에서 고르기만 (없는 id 는 버림) · 없으면 화면 안의 맞추기
    async match(text, lib, roles) {
      if (!aiKey.has()) return localMatch(text, lib, roles);
      const library = lib.info.map((i) => [i.id, i.name, i.kind, i.who, i.levels ? `yes (${(i.level_names ?? []).join(' / ')})` : 'no'].join(' | ')).join('\n');
      const { P, system, user } = await task('match', null, null, { library, text });
      const r = await call(P, system, user), ok = new Set(lib.info.map((i) => i.id)), picks = [], out = {};
      for (const side of ['from', 'to']) {
        const s = r.out[side] ?? {}, k = side === 'from' ? 'f' : 't';
        if (roles[s.role]) out[k] = s.role;
        for (const c of s.conds ?? []) if (ok.has(c.id)) picks.push({ id: c.id, side: k, n: c.n ?? null });
      }
      const missing = (r.out.missing ?? []).join(' · ');
      return { picks, roles: out, missing: picks.length ? missing : (missing || text), usd: r.usd, by: 'ai' };
    },
    // 이름 짓기 · 맞는 것 찾기 (패턴 · 카테고리)
    async suggest(kind, text, library, target) {
      if (!aiKey.has()) return { matches: [], name: String(text ?? '').trim() };
      const lines = Array.isArray(library) ? library.map((x) => (typeof x === 'string' ? x : [x.id, x.name, x.about ?? ''].join(' | '))).join('\n') : library;
      const { P, system, user } = await task('suggest', null, null, { kind, text, library: lines, target });
      const r = await call(P, system, user);
      return { matches: r.out.matches ?? [], name: r.out.new?.name ?? r.out.new ?? String(text).trim(), usd: r.usd };
    },
    idOk: async (id) => idOk((await getPrompts()) ?? {}, id),
    async models() {
      const key = ls.get('maker.xai'), P = (await getPrompts()) ?? {}; if (!key) return [];
      try { const r = await F(P.api?.models_url ?? 'https://api.x.ai/v1/models', { headers: { Authorization: `Bearer ${key}` } }); if (!r.ok) return []; return ((await r.json()).data ?? []).map((m) => m.id); } catch { return []; }
    },
  };
}

// 화면 안의 맞추기 (견본의 방식): "…이 …에게" 를 둘로 갈라, 정보의 이름 · 찾기 낱말이 겹치는 것을 그 쪽에 제안. 못 찾은 것은 missing (→ 정보 추가 요청)
export function localMatch(text, lib, roles) {
  const q = String(text ?? '').trim(); if (!q) return { picks: [], roles: {}, missing: '' };
  const end = q.search(/에게|한테/), head = end > 0 ? q.slice(0, end) : q;
  const m = Math.max(head.lastIndexOf('이 '), head.lastIndexOf('가 '));
  const left = m > 0 ? q.slice(0, m + 1) : q, right = m > 0 ? q.slice(m + 1) : '';
  const flat = (x) => x.replace(/\s/g, '');
  const picks = [];
  for (const i of lib.info) {
    const keys = [flat(i.name), ...(i.keys ?? []).filter((k) => k.length > 1)];
    for (const side of ['f', 't']) { const part = flat(side === 'f' ? left : right); if (part && keys.some((k) => part.includes(k))) picks.push({ id: i.id, side }); }
  }
  const out = {};
  for (const side of ['f', 't']) {
    const part = side === 'f' ? left : right;
    for (const [r, ko] of Object.entries(roles)) if (part.includes(ko) || (r === 'staff' && /리나|주인공/.test(part))) out[side] = r;
  }
  return { picks, roles: out, missing: picks.length ? '' : q, by: 'local' };
}
