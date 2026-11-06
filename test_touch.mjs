// 실행: PLAYWRIGHT_MODULE=<playwright 모듈 경로> node test_touch.mjs
// 실제 사용자 저장 데이터 대신 독립 브라우저 컨텍스트와 로컬 파일 응답을 쓴다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { webkit, chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = await readFile(process.env.TEST_HTML || new URL('./index.html', import.meta.url), 'utf8');
for (const [name, engine] of [['webkit', webkit], ['chromium', chromium]]) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.request().resourceType() === 'document'
      ? route.fulfill({ contentType: 'text/html', body: source }) : route.abort());
    await page.goto('https://wod-test.invalid/');
    await page.evaluate(() => { S.set.sound = false; S.set.vib = false; });
    const tap = async () => {
      const r = await page.locator('#play').boundingBox(); assert.ok(r);
      await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
    };
    let taps = 0;
    for (const mode of ['tabata', 'rounds', 'stopwatch']) {
      await page.evaluate(m => { reset(); S.mode = m; if (m === 'rounds') S.cfg.rounds.rounds = 99; draw(); }, mode);
      await tap(); taps++;
      for (const seconds of [0, 5, 65, 600, 1800, 3600]) {
        // 한 시간을 기다리는 대신 시작 시각을 옮겨 실제 frame()을 실행한다.
        await page.evaluate(sec => { T.t0 = now() - sec; T.acc = 0; frame(); }, seconds);
        assert.equal(await page.evaluate(() => T.run), true, `${name} ${mode} ${seconds}s running`);
        await tap(); taps++;
        assert.equal(await page.evaluate(() => T.run), false, `${name} ${mode} ${seconds}s pause`);
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => T.run), false, '자동 click으로 다시 시작하지 않음');
        await tap(); taps++;
        assert.equal(await page.evaluate(() => T.run), true, `${name} resume`);
      }
      // 같은 초 안의 20번 갱신에서 DOM을 다시 만들지 않는다.
      const mutations = await page.evaluate(() => {
        clearInterval(loop); T.run = false; frame();
        let n = 0; const o = new MutationObserver(rs => { n += rs.filter(r => r.type === 'childList').length; });
        o.observe(document.querySelector('#app'), { subtree: true, childList: true });
        for (let i = 0; i < 20; i++) frame();
        return new Promise(resolve => queueMicrotask(() => { o.disconnect(); resolve(n); }));
      });
      assert.equal(mutations, 0, '같은 초에는 자식 요소 재생성 없음');
    }
    // 가로로 돌렸다 돌아와도 같은 시작·일시정지 버튼이 동작한다.
    for (const size of [{ width: 874, height: 402 }, { width: 402, height: 874 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(100);
      await page.evaluate(() => { reset(); S.mode = 'stopwatch'; draw(); });
      await tap(); await tap(); taps += 2;
      assert.equal(await page.evaluate(() => T.run), false);
    }
    // Chromium 실제 터치를 누르고 운동에서 휴식으로 바뀐 뒤 뗀다.
    if (name === 'chromium') {
      await page.evaluate(() => { reset(); S.mode = 'rounds'; S.cfg.rounds.prep = 0; S.cfg.rounds.work = 1; S.cfg.rounds.rest = 2; S.cfg.rounds.rounds = 2; draw(); });
      await tap();
      await page.evaluate(() => { T.t0 = now() - .92; frame(); });
      const r = await page.locator('#play').boundingBox();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }] });
      await page.waitForTimeout(180);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await page.evaluate(() => T.run), false, '구간 전환 중에도 정지');
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => T.run), false, '중복 실행 없음');
    }
    // 소리 엔진에서 예외가 나도 일시정지는 가능해야 한다.
    await page.evaluate(() => {
      reset(); S.mode = 'stopwatch'; toggle();
      AC = { state: 'interrupted', resume() { throw new Error('시험용 소리 중단'); } };
    });
    await tap();
    assert.equal(await page.evaluate(() => T.run), false, '소리 오류가 버튼을 막지 않음');
    await page.evaluate(() => { AC = null; });
    // 여섯 소리를 오프라인으로 끝까지 재생하고 연결이 모두 해제되는지 검사한다.
    const connections = await page.evaluate(async () => {
      const counts = {};
      for (const kind of Object.keys(SND)) {
        AC = new OfflineAudioContext(1, 48000 * 3, 48000);
        const create = AC.createGain.bind(AC); let live = 0;
        AC.createGain = () => { const n = create(), stop = n.disconnect.bind(n); live++; n.disconnect = () => { live--; stop(); }; return n; };
        tone(...SND[kind].go); await AC.startRendering();
        await new Promise(r => setTimeout(r, 30)); counts[kind] = live;
      }
      AC = null; return counts;
    });
    assert.ok(Object.values(connections).every(n => n === 0), JSON.stringify(connections));
    await page.screenshot({ path: `/private/tmp/wod-touch-${name}.png` });
    assert.deepEqual(errors, []);
    console.log(`${name}: ${taps} touch taps, 0/5/65/600/1800/3600s, rotation, DOM stability passed`);
  } finally { await browser.close(); }
}
