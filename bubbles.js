// 카드 한 장을 말풍선으로 — 누가 말하나 · 선택 갈림이 읽히게.
// 화면은 내용을 모른다: 칸의 글은 받은 그대로 보여 준다 (연출 꼬리표 {이름:글} 의 껍데기만 벗긴다 — bake.py 의 strip_tags 와 같은 뜻).
import { esc } from './ui.js';

const META = new Set(['title', 'to', 'fun', 'need', 'risk', 'small', 'brief']);   // 말풍선이 아닌 칸 (값 · 조건 · brief 한 줄 — 아래에 작은 꼬리표로)
const plain = (s) => String(s ?? '').replace(/\{[a-z0-9_]+:([^}]*)\}/g, '$1').replace(/\{\/?[a-z0-9_]*\}/g, '');
const stem = (k) => k.replace(/_?\d+$/, '');
const isChoice = (k) => /^(choice|opt|option|pick|yes|no|accept|refuse)/.test(k);
const CHOICE = { yes: '리나의 선택 · 받음', no: '리나의 선택 · 물림' };

// 틀마다 말하는 사람의 이름표. 모르는 틀은 칸 이름을 그대로 쓴다 (틀의 칸은 shapes 명령이 알려 준다)
const SPEAKERS = { pair: { a: '손님 ①', b: '손님 ②', chorus: '자리 모두' }, jab: { line: '손님' }, ask: { line: '손님', after_yes: '손님 · 받은 뒤', after_no: '손님 · 물린 뒤' } };

export function cardHtml(card, { compact = false } = {}) {
  const f = card.fields ?? {};
  const order = (card.order?.length ? card.order : Object.keys(f)).filter((k) => !META.has(k) && f[k] != null && f[k] !== '');
  const names = SPEAKERS[card.shape] ?? {};
  const sides = new Map();                                        // 말하는 사람 → 왼쪽 · 오른쪽 (처음 나온 차례로 번갈아)
  const rows = order.map((k) => {
    const who = names[k] ? k : stem(k);
    if (isChoice(k)) return `<div class="mk-bub is-choice"><span class="mk-who">${esc(CHOICE[k] ?? `선택 · ${k}`)}</span><span class="mk-say">${esc(plain(f[k]))}</span></div>`;
    if (who === 'chorus') return `<div class="mk-bub is-all"><span class="mk-who">${esc(names.chorus ?? '모두')}</span><span class="mk-say">${esc(plain(f[k]))}</span></div>`;
    if (!sides.has(who)) sides.set(who, names[who]?.startsWith('손님 ·') ? 'l' : sides.size % 2 ? 'r' : 'l');
    const to = k === order[0] && f.to ? `<span class="mk-to">→ ${f.to === 'table' ? '자리에 대고' : f.to === 'hall' ? '홀에 대고' : esc(f.to)}</span>` : '';
    return `<div class="mk-bub is-${sides.get(who)}"><span class="mk-who">${esc(names[who] ?? who)}${to}</span><span class="mk-say">${esc(plain(f[k]))}</span></div>`;
  }).join('');
  const prev = (Array.isArray(card.prev) ? card.prev : []).filter(Boolean);
  const tags = [card.act && ['동작', card.act], ...['need', 'risk', 'small'].filter((k) => f[k] != null && f[k] !== '').map((k) => [k, f[k]])].filter(Boolean);
  const foot = tags.length && !compact ? `<div class="mk-card-tags">${tags.map(([k, v]) => `<span class="mk-chip">${esc(k)}: ${esc(v)}</span>`).join('')}</div>` : '';
  const head = `<div class="mk-card-head"><span class="mk-card-title">${esc(f.title ?? card.id)}</span><span class="a-faint a-mono">${esc(card.id)}</span>
    ${prev.length ? `<span class="a-badge is-info" title="앞 맥락 (prev)">${esc(prev.join(' · '))}</span>` : ''}</div>`;
  return `${compact ? `<div class="mk-card-head"><span class="mk-card-title">${esc(f.title ?? card.id)}</span></div>` : head}<div class="mk-bubs">${rows || '<span class="a-faint">말풍선 칸이 없음</span>'}</div>${foot}`;
}
