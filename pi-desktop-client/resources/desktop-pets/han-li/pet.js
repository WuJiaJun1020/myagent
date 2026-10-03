(() => {
  'use strict';
  const api = window.desktopPet;
  const canvas = document.getElementById('pet-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const menu = document.getElementById('pet-menu');
  let state, images = [], revision = -1, token = 0, started = performance.now();
  let raf, lastIndex = -1, drag = null, interactive = false, ready = false, revealTimer;
  const report = error => {
    const el = document.getElementById('pet-error');
    el.textContent = error.message || String(error);
    el.hidden = false;
  };
  const run = promise => promise.catch(report);
  function setInteractive(value) {
    if (value === interactive) return;
    interactive = value;
    clearTimeout(revealTimer);
    if (value) document.body.dataset.interactive = 'true';
    else revealTimer = setTimeout(() => {
      if (!interactive && !drag && menu.hidden) document.body.dataset.interactive = 'false';
    }, 800);
    run(api.interactive(value));
  }
  function menuOpen(open) {
    menu.hidden = !open;
    document.body.dataset.menu = String(open);
    document.getElementById('actions-toggle').setAttribute('aria-expanded', String(open));
    if (open) setInteractive(true);
  }
  function at(elapsed) {
    const frames = state.animation.frames;
    const total = frames.reduce((sum, frame) => sum + frame.durationMs, 0);
    if (!state.animation.loop && elapsed >= total) return frames.length - 1;
    let time = Math.max(0, elapsed) % total;
    for (let i = 0; i < frames.length; i++) {
      if (time < frames[i].durationMs) return i;
      time -= frames[i].durationMs;
    }
    return 0;
  }
  function draw() {
    cancelAnimationFrame(raf);
    if (!ready) return;
    const index = at(performance.now() - started);
    if (index !== lastIndex) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      const b = state.animation.contentBounds;
      ctx.drawImage(images[index], b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
      lastIndex = index;
      canvas.dataset.frame = String(index + 1);
    }
    if (state.animation.loop || index < images.length - 1) raf = requestAnimationFrame(draw);
  }
  async function accept(next) {
    const load = ++token;
    const reset = next.revision !== revision || next.animation.id !== state?.animation.id;
    state = next;
    if (reset) {
      ready = false;
      cancelAnimationFrame(raf);
      const loaded = await Promise.all(next.animation.frames.map(async frame => {
        const img = new Image();
        img.src = frame.url;
        await img.decode();
        return img;
      }));
      if (load !== token) return;
      images = loaded;
      canvas.width = next.animation.contentBounds.width;
      canvas.height = next.animation.contentBounds.height;
      started = performance.now();
      revision = next.revision;
      lastIndex = -1;
      ready = true;
    }
    const scale = next.settings.scales[next.animation.id];
    canvas.style.width = `${Math.max(1, Math.round(next.animation.contentBounds.width * scale))}px`;
    canvas.style.height = `${Math.max(1, Math.round(next.animation.contentBounds.height * scale))}px`;
    canvas.dataset.action = next.animation.id;
    canvas.dataset.revision = String(revision);
    document.getElementById('actions-toggle').textContent = `${next.animation.title} ▾`;
    for (const button of menu.querySelectorAll('[data-action]')) {
      button.setAttribute('aria-pressed', String(button.dataset.action === next.animation.id));
    }
    document.getElementById('pet-error').hidden = true;
    draw();
  }
  api.onPlayback(next => run(accept(next)));
  api.onDragEnd(() => {
    const active = drag;
    drag = null;
    canvas.dataset.dragging = 'false';
    if (active && canvas.hasPointerCapture(active.pointerId)) canvas.releasePointerCapture(active.pointerId);
  });
  run(api.playback().then(accept));
  document.getElementById('actions-toggle').onclick = () => menuOpen(menu.hidden);
  document.getElementById('hide').onclick = () => run(api.configure({ enabled: false }));
  for (const button of menu.querySelectorAll('[data-action]')) {
    button.onclick = () => {
      menuOpen(false);
      run(api.configure({ action: button.dataset.action }));
    };
  }
  document.addEventListener('contextmenu', event => {
    event.preventDefault();
    menuOpen(menu.hidden);
  });
  function hitImage(event) {
    if (!ready) return false;
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - r.left) * canvas.width / r.width);
    const y = Math.floor((event.clientY - r.top) * canvas.height / r.height);
    return x >= 0 && y >= 0 && x < canvas.width && y < canvas.height && ctx.getImageData(x, y, 1, 1).data[3] > 8;
  }
  document.addEventListener('pointermove', event => {
    if (drag) {
      if (!(event.buttons & 1)) {
        end({ pointerId: drag.pointerId, type: 'pointercancel' });
        return;
      }
      const active = drag;
      if (active.started && !active.pending) {
        active.pending = true;
        run(api.dragMove().then(moved => {
          if (drag === active) canvas.dataset.dragging = String(moved);
        }).finally(() => { active.pending = false; }));
      }
      return;
    }
    setInteractive(!menu.hidden || !!event.target.closest?.('button') || hitImage(event));
  });
  canvas.onpointerdown = event => {
    if (event.button !== 0 || !hitImage(event)) return;
    menuOpen(false);
    setInteractive(true);
    const active = { pointerId: event.pointerId, started: false, pending: false };
    drag = active;
    canvas.dataset.dragging = 'false';
    canvas.setPointerCapture(event.pointerId);
    active.start = api.dragStart().then(() => { if (drag === active) active.started = true; });
    run(active.start);
    event.preventDefault();
  };
  function end(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const active = drag;
    drag = null;
    canvas.dataset.dragging = 'false';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    run(active.start.then(async () => {
      if (event.type === 'pointerup') await api.dragMove();
      await api.dragEnd();
    }));
  }
  canvas.onpointerup = end;
  canvas.onpointercancel = end;
  // Moving a native window can interrupt DOM pointer capture. Native mouse-up also
  // ends the drag in the main process, so losing capture alone must not end it early.
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest?.('#pet-menu') && !event.target.closest?.('#actions-toggle')) menuOpen(false);
  });
  document.addEventListener('pointerleave', () => {
    if (!drag) { menuOpen(false); setInteractive(false); }
  });
})();
