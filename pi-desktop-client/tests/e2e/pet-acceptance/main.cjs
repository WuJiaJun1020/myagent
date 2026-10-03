const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const out = path.resolve(process.argv[2]), root = path.resolve(__dirname, '../../..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.setPath('userData', path.join(out, 'profile'));
const timeout = setTimeout(() => { console.error('PET_QA_TIMEOUT'); app.exit(1); }, 90000);
let service, main, cursor = { x: 500, y: 400 };
async function until(check) {
  for (let i = 0; i < 180; i++) { if (await check()) return; await wait(50); }
  throw Error('Timed out');
}
async function shot(win, name) {
  await wait(180);
  fs.writeFileSync(path.join(out, name), (await win.capturePage()).toPNG());
}
async function run() {
  await app.whenReady();
  const { DesktopPetService } = require(path.join(out, 'service.cjs'));
  main = new BrowserWindow({ show: false, width: 1200, height: 850, webPreferences: { preload: path.join(root, 'dist/preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  const options = { dataDirectory: path.join(out, 'settings'), resourceDirectory: path.join(root, 'resources/desktop-pets/han-li'), preloadFile: path.join(root, 'dist/preload/desktop-pet.cjs'), getMainWindow: () => main, getCursorPosition: () => ({ ...cursor }) };
  service = new DesktopPetService(options);
  await service.initialize();
  assert.equal(service.snapshot().settings.enabled, false);
  assert.deepEqual(service.snapshot().settings.scales, { reading: .2, chess: 1, bamboo: .2 });
  const manifest = JSON.parse(fs.readFileSync(path.join(options.resourceDirectory, 'manifest.json')));
  assert.deepEqual(manifest.actions.map(a => a.frames.length), [8, 8, 12]);
  for (const action of manifest.actions) for (const frame of action.frames) {
    const bytes = fs.readFileSync(path.join(options.resourceDirectory, frame.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), frame.sha256);
    assert.equal(bytes.readUInt32BE(16), action.width);
    assert.equal(bytes.readUInt32BE(20), action.height);
  }
  await main.loadFile(path.join(out, 'index.html'));
  main.showInactive();
  const js = code => main.webContents.executeJavaScript(code);
  await until(() => js(`!!document.querySelector('[aria-label="桌宠"]')`));
  assert.equal(await js(`(() => { const a = document.querySelector('[aria-label="桌宠"]').getBoundingClientRect(), b = document.querySelector('[aria-label="打开设置"]').getBoundingClientRect(); return a.right <= b.left + 1 && a.bottom > innerHeight - 70; })()`), true);
  await js(`document.querySelector('[aria-label="桌宠"]').click()`);
  await until(() => js(`document.querySelectorAll('.desktop-pet-actions button').length === 3`));
  assert.equal(await js(`!!Array.from(document.querySelectorAll('#desktop-pet-panel button')).find(b => /暂停|继续|重播/.test(b.textContent))`), false);
  assert.equal(await js(`document.querySelector('[aria-label="桌宠大小"]').max`), '100');
  await shot(main, 'desktop-entry-dark.png');
  const selectAction = async action => {
    await js(`Array.from(document.querySelectorAll('.desktop-pet-actions button')).find(b => b.textContent.includes('${action.title}')).click()`);
    await until(() => service.snapshot().settings.action === action.id && service.snapshot().settings.enabled && js(`!!document.querySelector('.desktop-pet-actions button.selected:not(:disabled)')`));
  };
  const assertScaleDisplay = async percent => {
    await until(() => js(`document.querySelector('[aria-label="桌宠大小"]').value === '${percent}' && document.querySelector('.desktop-pet-scale output').textContent === '${percent}%'`));
    assert.equal(await js(`document.querySelector('.desktop-pet-actions button.selected small').textContent.endsWith('· ${percent}%')`), true);
  };
  // Reproduce the reported stale output: change reading, then select chess.
  await selectAction(manifest.actions.find(action => action.id === 'reading'));
  await service.configure({ scale: .35 });
  await assertScaleDisplay(35);
  await js(`(() => { const el = document.querySelector('[aria-label="桌宠大小"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '20'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await until(() => js(`document.querySelector('.desktop-pet-scale output').textContent === '20%'`));
  assert.equal(service.snapshot().settings.scales.reading, .35, 'draft updates before committing the size');
  await js(`document.querySelector('[aria-label="桌宠大小"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`);
  await until(() => service.snapshot().settings.scales.reading === .2 && js(`!document.querySelector('[aria-label="桌宠大小"]').disabled`));
  await assertScaleDisplay(20);
  await selectAction(manifest.actions.find(action => action.id === 'chess'));
  await assertScaleDisplay(100);
  const chessWindow = BrowserWindow.getAllWindows().find(w => w !== main);
  const chessAction = manifest.actions.find(action => action.id === 'chess');
  await until(() => chessWindow.webContents.executeJavaScript(`document.getElementById('pet-canvas').dataset.action === 'chess' && document.getElementById('pet-canvas').getBoundingClientRect().width === ${chessAction.contentBounds.width}`));
  await shot(main, 'scale-switch-chess-100.png');
  await selectAction(manifest.actions.find(action => action.id === 'reading'));
  await assertScaleDisplay(20);
  const scales = { reading: .25, chess: .7, bamboo: .3 };
  for (const action of manifest.actions) {
    await js(`Array.from(document.querySelectorAll('.desktop-pet-actions button')).find(b => b.textContent.includes('${action.title}')).click()`);
    await until(() => service.snapshot().settings.action === action.id && service.snapshot().settings.enabled && js(`!!document.querySelector('.desktop-pet-actions button.selected:not(:disabled)')`));
    await until(() => BrowserWindow.getAllWindows().some(w => w !== main));
    const pet = BrowserWindow.getAllWindows().find(w => w !== main);
    const pjs = code => pet.webContents.executeJavaScript(code);
    await until(() => pjs(`document.getElementById('pet-canvas').dataset.action === '${action.id}' && document.getElementById('pet-canvas').dataset.revision === '${service.playback().revision}'`));
    assert.equal(pet.isAlwaysOnTop(), true);
    assert.equal(await pjs(`document.getElementById('pet-canvas').width`), action.contentBounds.width);
    assert.equal(await pjs(`document.getElementById('pet-canvas').height`), action.contentBounds.height);
    assert.equal(await pjs(`!!document.getElementById('pause') || !!document.getElementById('replay')`), false);
    if (action.id === 'chess') assert.equal(await pjs(`document.getElementById('pet-canvas').getBoundingClientRect().width`), action.contentBounds.width);
    await shot(pet, `${action.id}-transparent.png`);
    await service.configure({ scale: .01 });
    await until(() => pjs(`document.getElementById('pet-canvas').getBoundingClientRect().width === ${Math.max(1, Math.round(action.contentBounds.width * .01))}`));
    await pjs(`document.getElementById('actions-toggle').click()`);
    assert.equal(await pjs(`(() => { const r = document.getElementById('pet-menu').getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.right <= innerWidth; })()`), true, 'menu remains usable at the smallest size');
    await pjs(`document.getElementById('actions-toggle').click()`);
    await service.configure({ scale: 1 });
    await until(() => pjs(`document.getElementById('pet-canvas').getBoundingClientRect().width === ${action.contentBounds.width}`));
    assert.equal(await pjs(`document.getElementById('pet-canvas').getBoundingClientRect().height`), action.contentBounds.height);
    const otherScales = { ...service.snapshot().settings.scales };
    await js(`(() => { const el = document.querySelector('[aria-label="桌宠大小"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '${Math.round(scales[action.id] * 100)}'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); })()`);
    await until(() => service.snapshot().settings.scales[action.id] === scales[action.id] && js(`!document.querySelector('[aria-label="桌宠大小"]').disabled`));
    await assertScaleDisplay(Math.round(scales[action.id] * 100));
    for (const id of Object.keys(scales)) if (id !== action.id) assert.equal(service.snapshot().settings.scales[id], otherScales[id]);
    await until(() => pjs(`document.getElementById('pet-canvas').getBoundingClientRect().width === ${Math.round(action.contentBounds.width * scales[action.id])}`));
    await service.configure({ action: action.id });
    await until(() => pjs(`document.getElementById('pet-canvas').dataset.revision === '${service.playback().revision}' && document.getElementById('pet-canvas').dataset.frame === '1'`));
    await wait(action.frames.reduce((sum, f) => sum + f.durationMs, 0) + 100);
    assert.equal(Number(await pjs(`document.getElementById('pet-canvas').dataset.frame`)), action.loop ? 1 : action.frames.length);
    if (action.id === 'chess') {
      // Send actual browser mouse-down/up events to exercise pointer capture. Native
      // cursor positions are injected so this test never moves the user's mouse.
      pet.setPosition(600, 400);
      const point = await pjs(`(() => { const c = document.getElementById('pet-canvas'), r = c.getBoundingClientRect(), data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let i = 0; search: for(let y=2;y<c.height-2;y++)for(let x=2;x<c.width-2;x++){let solid=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(data[((y+dy)*c.width+x+dx)*4+3]<200)solid=false;if(solid){i=y*c.width+x;break search;}} if(!i)throw Error('No solid drag pixel'); return { x: Math.round(r.left + (i % c.width + .5) * r.width / c.width), y: Math.round(r.top + (Math.floor(i / c.width) + .5) * r.height / c.height) }; })()`);
      await pjs(`window.petQaErrors = []; addEventListener('error', e => window.petQaErrors.push(e.message));`);
      await pjs(`document.getElementById('hide').dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))`);
      assert.equal(await pjs(`document.body.dataset.interactive`), 'true');
      pet.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
      await until(() => !!service.dragOrigin);
      const before = pet.getPosition();
      for (let i = 0; i < 12; i++) {
        await pjs(`document.getElementById('pet-canvas').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, screenX: ${500 + i * 30}, screenY: ${400 + i * 20} }))`);
        await wait(35);
      }
      assert.deepEqual(pet.getPosition(), before, 'holding still cannot drift despite changing renderer screen coordinates');
      cursor = { x: 502, y: 401 };
      assert.equal(await pjs(`window.desktopPet.dragMove()`), false);
      assert.deepEqual(pet.getPosition(), before, 'small motion stays below drag threshold');
      cursor = { x: 455, y: 370 };
      await pjs(`document.getElementById('pet-canvas').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, screenX: 9999, screenY: 9999 }))`);
      await until(() => Math.abs(pet.getPosition()[0] - (before[0] - 45)) <= 1);
      const moved = pet.getPosition();
      assert.ok(Math.abs(moved[1] - (before[1] - 30)) <= 1);
      for (let i = 0; i < 20; i++) await pjs(`window.desktopPet.dragMove()`);
      assert.deepEqual(pet.getPosition(), moved, 'native cursor stays fixed: window cannot drift');
      // Losing DOM capture while the native window moves must not cancel the drag.
      await pjs(`document.getElementById('pet-canvas').dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }))`);
      assert.ok(service.dragOrigin);
      cursor = { x: 330, y: 245 };
      await pjs(`window.desktopPet.dragMove()`);
      assert.ok(Math.abs(pet.getPosition()[0] - (before[0] - 170)) <= 1);
      assert.ok(Math.abs(pet.getPosition()[1] - (before[1] - 155)) <= 1);
      for (let i = 0; i < 40; i++) {
        cursor = { x: 330 - i * 2, y: 245 - i * 2 };
        await pjs(`window.desktopPet.dragMove()`);
        const bounds = pet.getBounds();
        assert.ok(Math.abs(bounds.width - service.boundsSize().width) <= 2, 'window width cannot grow while dragging');
        assert.ok(Math.abs(bounds.height - service.boundsSize().height) <= 2, 'window height cannot grow while dragging '+JSON.stringify({bounds,expected:service.boundsSize(),step:i}));
      }
      const beforeInvalid = pet.getPosition();
      cursor = { x: -1145324672, y: -1145324672 };
      assert.equal(await pjs(`window.desktopPet.dragMove()`), false);
      assert.deepEqual(pet.getPosition(), beforeInvalid, 'failed cursor read cannot push the pet into a boundary');
      cursor = { x: 230, y: 145 };
      await pjs(`window.desktopPet.dragMove()`);
      moved.splice(0, moved.length, ...pet.getPosition());
      pet.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
      await until(() => service.dragOrigin === null);
      await until(() => fs.existsSync(path.join(options.dataDirectory, 'settings.json')) && JSON.parse(fs.readFileSync(path.join(options.dataDirectory, 'settings.json'))).position?.x === moved[0]);
      assert.deepEqual(service.snapshot().settings.position, { x: moved[0], y: moved[1] });
      cursor = { x: 400, y: 320 };
      await pjs(`document.getElementById('pet-canvas').dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))`);
      await wait(100);
      assert.deepEqual(pet.getPosition(), moved, 'released pointer cannot move the pet');
      assert.equal(await pjs(`window.petQaErrors.length`), 0);
      // Even a tiny sprite in a wider transparent window reaches the screen edges.
      await service.configure({ scale: .1 });
      await pjs(`window.desktopPet.dragStart()`);
      const origin = service.dragOrigin;
      cursor = { x: 0, y: 0 };
      await pjs(`window.desktopPet.dragMove()`);
      const edge = pet.getBounds(), expected = service.clampPosition({ x: origin.x - origin.cursor.x, y: origin.y - origin.cursor.y });
      assert.ok(Math.abs(edge.x - expected.x) <= 1);
      assert.ok(Math.abs(edge.y - expected.y) <= 1);
      assert.ok(edge.x < 0 && edge.y < 0, 'transparent window padding may cross screen edges');
      await pjs(`window.desktopPet.dragEnd()`);
      await service.configure({ scale: scales.chess });
      pet.setBounds({ ...service.boundsSize(), x: 500, y: 400 });
      cursor = { x: 500, y: 400 };
      pet.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
      await until(() => !!service.dragOrigin);
      const releasePosition = pet.getPosition();
      await pjs(`document.getElementById('pet-canvas').dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }))`);
      await pjs(`document.getElementById('pet-canvas').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 0 }))`);
      await until(() => !service.dragOrigin);
      assert.deepEqual(pet.getPosition(), releasePosition, 'missed mouse-up cannot leave a drag running');
      pet.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
      await pjs(`document.getElementById('actions-toggle').click()`);
      assert.equal(await pjs(`document.getElementById('pet-menu').hidden`), false);
      await shot(pet, 'chess-menu.png');
      await pjs(`document.getElementById('actions-toggle').click()`);
      await pjs(`document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 1, clientY: 1 }))`);
      await wait(900);
      assert.equal(await pjs(`document.body.dataset.interactive`), 'false');
    }
  }
  assert.deepEqual(service.snapshot().settings.scales, scales);
  for (const id of ['reading', 'chess', 'bamboo']) {
    await service.configure({ action: id });
    assert.equal(service.snapshot().settings.scales[id], scales[id]);
    await assertScaleDisplay(Math.round(scales[id] * 100));
  }
  await js(`window.qa.theme('light')`);
  await shot(main, 'desktop-entry-light.png');
  main.setSize(900, 620);
  await wait(150);
  assert.equal(await js(`document.documentElement.scrollWidth > innerWidth`), false);
  assert.equal(await js(`(() => { const r = document.getElementById('desktop-pet-panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()`), true);
  await shot(main, 'desktop-entry-narrow.png');
  await js(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  assert.equal(await js(`!!document.getElementById('desktop-pet-panel')`), false);
  await js(`document.querySelector('[aria-label="桌宠"]').click()`);
  await assertScaleDisplay(30);
  await js(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await service.configure({ action: 'chess', enabled: true });
  const saved = service.snapshot().settings;
  service.dispose();
  service = new DesktopPetService(options);
  await service.initialize();
  assert.deepEqual(service.snapshot().settings, saved);
  assert.equal(BrowserWindow.getAllWindows().length, 2);
  await service.configure({ enabled: false });
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  assert.equal(await js(`window.qa.errors.length`), 0, await js(`JSON.stringify(window.qa.errors)`));
  service.dispose();
  const legacyDirectory = path.join(out, 'legacy-settings');
  fs.mkdirSync(legacyDirectory);
  fs.writeFileSync(path.join(legacyDirectory, 'settings.json'), JSON.stringify({ enabled: false, action: 'reading', scale: 1.2, paused: true, position: { x: 100, y: 100 } }));
  service = new DesktopPetService({ ...options, dataDirectory: legacyDirectory });
  await service.initialize();
  const migrated = service.snapshot().settings;
  assert.equal(migrated.enabled, false);
  assert.deepEqual(migrated.position, { x: 100, y: 100 });
  assert.equal('paused' in migrated, false);
  for (const action of manifest.actions) assert.equal(migrated.scales[action.id], Math.min(1, 1.2 * action.displayWidth / action.width));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ passed: true, checks: ['frame-hashes-unchanged-8-8-12', 'bottom-entry-left-of-settings', 'pause-replay-buttons-removed', 'original-resolution-at-100-percent-all-actions', 'independent-scales-and-slider-restored', 'saved-frame-timing-and-loop', 'native-cursor-drag-no-feedback', 'hold-no-drift', 'drag-threshold', 'pointer-capture-and-release', 'transparent-hover-and-menu', 'light-dark-narrow-popover', 'escape-close', 'settings-restart-restoration', 'legacy-scale-migration', 'hide-keeps-main-alive', 'no-renderer-errors'] }, null, 2));
  console.log('DESKTOP_PET_OK', out);
  clearTimeout(timeout);
  service.dispose(); main.destroy(); app.exit(0);
}
run().catch(error => {
  console.error(error);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ passed: false, error: String(error), stack: error.stack }, null, 2));
  service?.dispose(); clearTimeout(timeout); app.exit(1);
});
