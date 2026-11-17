// 작업대의 AI 한 겹 (넘김-3 4절): ai.briefs() · ai.novels() · ai.redo() · ai.match() · ai.suggest()
// 구현이 둘 — 바로 부름(브라우저가 그록을) · 대기열(Cards/_inbox → 저장소의 자동 작업). 화면은 어느 쪽인지 모른다.
//   열쇠: 사용자가 한 번 붙여 넣고 이 브라우저의 localStorage 'maker.xai' 에만. 페이지 · 저장소 · 기록 어디에도 적지 않는다.
//   요청문은 화면이 짓지 않는다 — 색인의 prompts.json 의 틀에 빈칸({topic} · {n} · {target} …)만 채운다.
//   막히면(CORS · 네트워크) 스스로 대기열 길로 떨어지고 한 줄로 알린다.
//   돌아온 것은 화면에 바로 보이고, 저장은 대기열의 "cards" 로 (저장소의 자동 작업이 검사해서 카드 파일로 적는다).

const API = 'https://api.x.ai/v1';
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 막힌 브라우저 */ } } };
export const aiKey = { has: () => !!ls.get('maker.xai'), set: (v) => ls.set('maker.xai', v ? String(v).trim() : null), clear: () => { ls.set('maker.xai', null); } };
export const aiModel = { get: () => ls.get('maker.xai.model') ?? '', set: (v) => ls.set('maker.xai.model', v) };

// 틀 글의 {이름} 을 채운다 — 글이 아닌 값은 JSON 으로
export function fill(tpl, vars) {
  return String(tpl ?? '').replace(/\{([a-z_]+)\}/g, (m, k) => (k in vars ? (typeof vars[k] === 'string' ? vars[k] : JSON.stringify(vars[k])) : m));
}

// 대상 → 사람 말 한 줄 (요청문의 {target} 칸 · 화면의 표시)
export function targetText(T, infoName, roleName) {
  const side = (s) => `${s.c.map((c) => infoName(c.id ?? c) + (c.n ? `(${c.n})` : '')).join(' · ')}${s.c.length ? ' ' : ''}${roleName(s.role)}`.trim();
  return `${side(T.f)} → ${side(T.t)}`;
}

export function createAi({ backend, getPrompts, onCost, onNote, fetchImpl }) {
  const F = fetchImpl ?? ((...a) => fetch(...a));
  let fellBack = false;
  const usd = (j) => (j?.usage?.cost_in_usd_ticks ?? 0) / 1e10;

  // 바로 부름 — 실패하면 { fallback:true }
  async function call(system, user) {
    const key = ls.get('maker.xai');
    if (!key) return { fallback: true, why: '열쇠 없음' };
    let r;
    try {
      r = await F(`${API}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: aiModel.get() || undefined, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
    } catch (e) { return { fallback: true, why: '브라우저에서 그록에 닿지 못함' }; }
    if (r.status === 401 || r.status === 403) throw new Error('그록이 열쇠를 받지 않습니다 — 열쇠를 다시 넣어 주세요');
    if (!r.ok) throw new Error(`그록 ${r.status}`);
    const j = await r.json();
    const cost = usd(j); if (cost) onCost?.(cost);
    let out; try { out = JSON.parse(j.choices?.[0]?.message?.content ?? '{}'); } catch { throw new Error('그록의 답이 JSON 이 아님'); }
    return { out, usd: cost, model: j.model };
  }
  const fall = (why) => { if (!fellBack) { fellBack = true; onNote?.(`${why} — 대기열 길로 넘깁니다 (저장소의 자동 작업이 만든다 · 1분쯤)`); } };

  // 요청문의 바탕: world · rules · who · 틀 · 수위의 풀이 (빈 수위는 만들지 않는다)
  async function base(cat, shape, level, who) {
    const P = (await getPrompts()) ?? {};
    const lv = P.levels?.[level];
    if (!lv) throw new Error(`수위 ${level} 의 풀이가 요청문 표에 없어 만들지 않습니다`);
    const C = P.categories?.[cat] ?? {};
    const sys = [P.world, P.rules, P.who?.[who ?? C.who], P.shapes?.[shape ?? C.shape], lv].filter(Boolean).join('\n\n');
    return { P, C, sys };
  }
  const vars = (C, extra) => ({ category: extra.category, shape: extra.shape ?? C.shape ?? '', who: C.who ?? '', cat_brief: C.brief ?? '',
    examples: C.examples ?? [], rejected: C.rejected ?? [], taken: C.taken ?? [], ...extra });

  return {
    get fellBack() { return fellBack; },
    // brief n 줄 → { items:[글], usd } · 대기열이면 { queued:true }
    async briefs({ owner, category, target, targetObj, topic, n, level = 'general' }) {
      if (aiKey.has() && !fellBack) {
        const { P, C, sys } = await base(category, null, level);
        const r = await call(sys, fill(P.tasks?.briefs, vars(C, { category, target, topic, n, level })));
        if (!r.fallback) return { items: (r.out.briefs ?? []).map((b) => (typeof b === 'string' ? b : b.brief ?? b.text ?? '')).filter(Boolean).slice(0, n), usd: r.usd, model: r.model };
        fall(r.why);
      }
      await backend.queue({ briefs: [{ owner, category, target: targetObj, topic, n }] }, `brief ${category} ${n}`);
      return { queued: true };
    },
    // brief 하나 → 소설(틀의 칸) { fields, usd } · 대기열이면 ids 로
    async novel({ category, shape, target, brief, level = 'general' }) {
      if (aiKey.has() && !fellBack) {
        const { P, C, sys } = await base(category, shape, level);
        const r = await call(sys, fill(P.tasks?.novels, vars(C, { category, shape, target, brief, level })));
        if (!r.fallback) return { fields: r.out.fields ?? r.out, usd: r.usd, model: r.model };
        fall(r.why);
      }
      return { queued: true };
    },
    async novelsQueued(ids) { await backend.queue({ novels: [{ ids }] }, `소설 ${ids.length}`); },
    // 피드백으로 다시 → { fields } · 대기열이면 { queued }
    async redo({ id, category, shape, card, note, level = 'general' }) {
      if (aiKey.has() && !fellBack) {
        const { P, C, sys } = await base(category, shape, level);
        const r = await call(sys, fill(P.tasks?.redo, vars(C, { category, shape, card, note, level })));
        if (!r.fallback) return { fields: r.out.fields ?? r.out, usd: r.usd, model: r.model };
        fall(r.why);
      }
      await backend.queue({ redo: [{ id, note }] }, `다시 ${id}`);
      return { queued: true };
    },
    // 말 → 정보 제안. 첫 판은 화면 안에서 (이름 · 찾기 낱말이 겹치는 것 — 견본의 방식). AI 로 맞추는 길은 이 자리에
    match: (text, lib, roles) => localMatch(text, lib, roles),
    // 이름 짓기 — 첫 판은 적은 말 그대로
    suggest: async (kind, text) => ({ name: String(text ?? '').trim() }),
    // 화면에서 만든 것을 저장: 대기열의 cards (자동 작업이 검사해서 카드 파일로)
    save: (cards) => backend.queue({ cards }, `카드 ${cards.length}`),
    async models() {
      const key = ls.get('maker.xai'); if (!key) return [];
      try { const r = await F(`${API}/models`, { headers: { Authorization: `Bearer ${key}` } }); if (!r.ok) return []; return ((await r.json()).data ?? []).map((m) => m.id); } catch { return []; }
    },
  };
}

// 견본의 맞추기: "…이 …에게" 를 둘로 갈라, 정보의 이름 · 찾기 낱말이 겹치는 것을 그 쪽에 제안한다. 역할 낱말이 있으면 역할도.
// 없는 조건을 지어내지 않는다 — 못 찾은 것은 missing 으로 (→ 정보 추가 요청)
export function localMatch(text, lib, roles) {
  const q = String(text ?? '').trim(); if (!q) return { picks: [], roles: {}, missing: '' };
  const end = q.search(/에게|한테/), head = end > 0 ? q.slice(0, end) : q;
  const m = Math.max(head.lastIndexOf('이 '), head.lastIndexOf('가 '));
  const left = m > 0 ? q.slice(0, m + 1) : q, right = m > 0 ? q.slice(m + 1) : '';
  const flat = (x) => x.replace(/\s/g, '');
  const picks = [];
  for (const i of lib.info) {
    const keys = [flat(i.name), ...(i.keys ?? []).filter((k) => k.length > 1 || /[취옆밤]/.test(k))];
    for (const side of ['f', 't']) { const part = flat(side === 'f' ? left : right); if (part && keys.some((k) => part.includes(k))) picks.push({ id: i.id, side }); }
  }
  const out = {};
  for (const side of ['f', 't']) {
    const part = side === 'f' ? left : right;
    for (const [r, ko] of Object.entries(roles)) if (part.includes(ko) || (r === 'staff' && /리나|주인공/.test(part))) out[side] = r;
  }
  return { picks, roles: out, missing: picks.length ? '' : q };
}
