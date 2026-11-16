// maker 확장 — 런처의 패널로 붙는 ST 메이커 (D-052). 화면은 app.js (밖의 브라우저에서도 같은 것이 돈다 — index.html), 여기는 런처에 꽂는 자리만.
//   데이터 길: 런처 서버 (python Tools/Pipeline/<이름>.py 를 tasks/maker.bat 으로 · Cards/ 를 바로 읽고 씀). 긴 명령(gen · bake)은 작업 패널로 — 기록이 남게.
import { mountMaker } from './app.js';
import { createStore } from './store.js';
import { launcherBackend } from './backends.js';

export async function activate(ctx) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 작업 패널로 돌리고, 끝나면 그 작업의 기록(작업 확장이 남긴 것)을 읽어 돌려준다
  async function jobs(title, args, key) {
    const r = await ctx.commands.run('jobs.run', { title, mount: 'app', path: 'tasks/maker.bat', args, key, source: 'maker' });
    let log = '';
    for (let i = 0; i < 6 && !log; i++) { log = await ctx.fs.read('data', `jobs/logs/${r.id}.txt`).catch(() => ''); if (!log) await sleep(250); }
    return { status: r.status, code: r.code, job: r.id, log };
  }
  const store = createStore(launcherBackend({ jobs }));
  window.cityMaker = store;                                   // 콘솔 · 시험에서 만져 볼 수 있게 (window.anorak 과 같은 뜻)
  ctx.commands.register('maker.open', { title: 'ST 메이커 열기', run: () => ctx.panels.open('maker.main') });
  ctx.panels.register({
    id: 'maker.main',
    title: 'ST 메이커',
    render(el, api) {
      api.onDispose(mountMaker(el, store, { settings: ctx.settings, openJobs: (id) => ctx.commands.run('jobs.open', id ? { id } : undefined) }));
    },
  });
}
