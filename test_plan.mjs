// 구간 목록 확인: node test_plan.mjs  (index.html 의 plan:start ~ plan:end 를 꺼내 돌린다)
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const code = src.slice(src.indexOf('/* plan:start'), src.indexOf('/* plan:end */'));
const { MODES, plan, totalOf, fmt } = new Function(code + '; return { MODES, plan, totalOf, fmt };')();
const tot = (m, c = {}) => fmt(totalOf(plan(m, { ...MODES[m].def, ...c })));
assert.equal(tot('tabata'), '63:05');                 // TimerPlus 화면의 합계와 같다
assert.equal(tot('rounds'), '40:35');
assert.equal(tot('tabata', { prep: 0, work: 20, rest: 10, rounds: 8, cycles: 1, cool: 0 }), '03:50');   // 고전 타바타: 마지막 휴식 없음
const t = plan('tabata', MODES.tabata.def);
assert.deepEqual(t.slice(0, 4).map(s => s.k), ['prep', 'work', 'rest', 'work']);
assert.equal(t.filter(s => s.k === 'cycleRest').length, 11);
assert.equal(t.filter(s => s.k === 'work').length, 48);
assert.ok(t.find(s => s.last).k === 'work' && t.at(-1).k === 'cool');
assert.deepEqual([t[1].leftR, t[1].leftY, t[2].leftR], [4, 12, 3]);
assert.equal(plan('rounds', { ...MODES.rounds.def, rest: 0 }).some(s => s.k === 'rest'), false);
const sw = plan('stopwatch', MODES.stopwatch.def);
assert.deepEqual(sw.map(s => s.k), ['prep', 'lap']);
assert.equal(fmt(3725), '62:05');
console.log('plan ok');
