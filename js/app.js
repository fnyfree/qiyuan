/* 栖园 — an ordinary property marketing site that does not stay ordinary. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const html = document.documentElement;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const d = b - a, t = clamp((x - a) / (Math.abs(d) < 1e-9 ? 1e-9 : d), 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const pad2 = (n) => String(n).padStart(2, '0');
  const now = () => performance.now() / 1000;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const DEBUG_P = parseFloat(new URLSearchParams(location.search).get('p'));   // ?p=0.42 jumps straight to that scroll depth

  // ---------------------------------------------------------------- state
  const S = {
    y: 0, p: 0, maxP: 0, vh: innerHeight, vw: innerWidth, maxScroll: 1, st: 0, mode: null,
    calm: matchMedia('(prefers-reduced-motion: reduce)').matches, sound: false, gl: true, quality: 1,
    mx: 0.5, my: 0.5, lastInput: performance.now(), finale: false, lock: false, hidden: document.hidden,
    idleSaid: false, upAcc: 0, upCool: 0, watch: 0,
  };
  if (S.calm) html.classList.add('calm');
  const snd = new QYAudio();
  snd.reduced = S.calm;
  const SEC = {}, TR = {};

  // ---------------------------------------------------------------- floor plans
  const PLANS = {
    A: { w: 12, h: 10, rooms: [
      { x: 0, y: 0, w: 4.6, h: 3.6, n: '主卧', a: '13.5㎡', t: 'self-0.45|主人的房间||foot|它的房间' },
      { x: 4.6, y: 0, w: 3.8, h: 3.6, n: '次卧', a: '9.8㎡', t: 'cctv|没人住' },
      { x: 8.4, y: 0, w: 3.6, h: 3.6, n: '书房', a: '7.6㎡', t: 'self-0.6|不要打开' },
      { x: 0, y: 3.6, w: 2.4, h: 2.2, n: '卫生间', a: '4.2㎡', t: 'reviews|别照镜子' },
      { x: 2.4, y: 3.6, w: 9.6, h: 4.4, n: '客餐厅', a: '24.6㎡', t: 'foot|灵堂' },
      { x: 0, y: 5.8, w: 2.4, h: 2.2, n: '玄关', a: '4.0㎡', t: 'reviews|它进来的地方' },
      { x: 8, y: 8, w: 4, h: 2, n: '厨房', a: '6.4㎡' }],
      balc: [2.4, 8, 5.6, 2], wins: [[0, 0, 4.6, 0], [4.6, 0, 8.4, 0], [8.4, 0, 12, 0]], fig: [10.2, 1.4], figOn: 'self-0.6|on' },
    B: { w: 12, h: 10, rooms: [
      { x: 0, y: 0, w: 5.2, h: 4.4, n: '主卧', a: '17.8㎡', t: 'foot|它的房间' },
      { x: 5.2, y: 0, w: 2.6, h: 2.4, n: '主卫', a: '4.6㎡' },
      { x: 7.8, y: 0, w: 4.2, h: 3.8, n: '次卧', a: '11.2㎡', t: 'cctv|没人住' },
      { x: 5.2, y: 2.4, w: 2.6, h: 2, n: '客卫', a: '3.4㎡', t: 'reviews|别照镜子' },
      { x: 0, y: 4.4, w: 7.8, h: 3.8, n: '客厅', a: '22.5㎡' },
      { x: 7.8, y: 3.8, w: 4.2, h: 1.6, n: '走廊', a: '4.0㎡', t: 'foot|没有尽头' },
      { x: 0, y: 8.2, w: 4.6, h: 1.8, n: '餐厅', a: '6.0㎡' },
      { x: 4.6, y: 8.2, w: 3.2, h: 1.8, n: '厨房', a: '4.6㎡' }],
      balc: [7.8, 5.4, 4.2, 4.6], wins: [[0, 0, 5.2, 0], [5.2, 0, 7.8, 0], [7.8, 0, 12, 0], [0, 4.4, 0, 8.2]], fig: [1.3, 2.3], figOn: 'cctv+0.03|on' },
    C: { w: 13.6, h: 10.6, rooms: [
      { x: 0, y: 0, w: 4.8, h: 4.6, n: '主卧', a: '16.2㎡', t: 'self-0.6|主人的房间||foot|它的房间' },
      { x: 4.8, y: 0, w: 2.4, h: 2.2, n: '衣帽间', a: '3.2㎡' },
      { x: 4.8, y: 2.2, w: 2.4, h: 2.4, n: '主卫', a: '3.6㎡' },
      { x: 7.2, y: 0, w: 3.6, h: 3.6, n: '次卧', a: '8.4㎡', t: 'cctv|没人住' },
      { x: 10.8, y: 0, w: 2.8, h: 3.6, n: '儿童房', a: '7.2㎡', t: 'reviews|一直是空的' },
      { x: 10.8, y: 3.6, w: 2.8, h: 2.6, n: '保姆间', a: '5.4㎡', t: 'self-0.5|不要打开' },
      { x: 7.2, y: 3.6, w: 3.6, h: 1.8, n: '客卫', a: '4.6㎡' },
      { x: 0, y: 4.6, w: 7.2, h: 3.6, n: '客厅', a: '18.5㎡' },
      { x: 7.2, y: 5.4, w: 3.6, h: 2.8, n: '玄关', a: '7.2㎡', t: 'reviews|它进来的地方' },
      { x: 0, y: 8.2, w: 5, h: 2.4, n: '餐厅', a: '8.6㎡' },
      { x: 5, y: 8.2, w: 3.2, h: 2.4, n: '厨房', a: '5.6㎡' },
      { x: 10.8, y: 6.2, w: 2.8, h: 2, n: '过道', a: '—', t: 'foot|它在门后' }],
      balc: [10.8, 8.2, 2.8, 2.4], wins: [[0, 0, 4.8, 0], [4.8, 0, 7.2, 0], [7.2, 0, 10.8, 0], [10.8, 0, 13.6, 0]], fig: [12.2, 5.2], figOn: 'self-0.72|on' },
  };
  function buildPlans() {
    const NS = 'http://www.w3.org/2000/svg', X = (v) => v * 10;
    const el = (tag, attrs, parent, text) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text !== undefined) e.textContent = text;
      parent.appendChild(e);
      return e;
    };
    $$('svg[data-plan]').forEach((svg) => {
      const plan = PLANS[svg.dataset.plan];
      el('rect', { x: 0, y: 0, width: X(plan.w), height: X(plan.h), class: 'wall', 'stroke-width': 2.4, fill: 'none' }, svg);
      plan.rooms.forEach((r) => {
        el('rect', { x: X(r.x), y: X(r.y), width: X(r.w), height: X(r.h), class: 'wall', 'stroke-width': 1.3, fill: 'none' }, svg);
        const cx = X(r.x + r.w / 2), cy = X(r.y + r.h / 2);
        const t = el('text', { x: cx, y: cy - 1.4 }, svg, r.n);
        if (r.t) t.setAttribute('data-x', r.t);
        el('text', { x: cx, y: cy + 3.2, class: 'ar' }, svg, r.a);
      });
      const b = plan.balc;
      el('rect', { x: X(b[0]), y: X(b[1]), width: X(b[2]), height: X(b[3]), class: 'balc', 'stroke-width': 1, fill: 'none' }, svg);
      el('text', { x: X(b[0] + b[2] / 2), y: X(b[1] + b[3] / 2) }, svg, '阳台').setAttribute('data-x', 'visit|别往下看');
      plan.wins.forEach((w) => el('path', { d: 'M' + X(w[0]) + ' ' + X(w[1]) + 'L' + X(w[2]) + ' ' + X(w[3]), class: 'win' }, svg));
      if (plan.fig) {
        const g = el('g', { class: 'pfig' }, svg);
        el('circle', { cx: X(plan.fig[0]), cy: X(plan.fig[1]), r: 1.5 }, g);
        el('rect', { x: X(plan.fig[0]) - 1.7, y: X(plan.fig[1]) + 1.2, width: 3.4, height: 6.6, rx: 1.5 }, g);
        svg.setAttribute('data-xc', plan.figOn);
      }
    });
  }

  // ---------------------------------------------------------------- triggers
  function topOf(el) { return el.getBoundingClientRect().top + scrollY; }
  function resolve(key, el) {
    let m = /^self([+-]?\d*\.?\d+)?$/.exec(key);
    if (m) return clamp((topOf(el) - S.vh * (0.9 + (m[1] ? parseFloat(m[1]) : 0))) / S.maxScroll, 0, 1.001);
    m = /^([a-z]+)([+-]?\d*\.?\d+)?$/.exec(key);
    if (m && TR[m[1]] !== undefined) return TR[m[1]] + (m[2] ? parseFloat(m[2]) : 0);
    return 2;
  }
  function measure() {
    S.vh = innerHeight; S.vw = innerWidth;
    S.maxScroll = Math.max(1, html.scrollHeight - S.vh);
    const at = (id, f) => clamp((topOf($('#' + id)) - S.vh * f) / S.maxScroll, 0, 1.001);
    // stages turn on the moment the real content is on screen, not when the section header peeks in
    TR.plans = at('plans', 0.92); TR.cctv = at('mon', 0.55); TR.reviews = at('quotes', 0.6); TR.visit = at('form', 0.7);
    TR.foot = at('foot', 0.5); TR.below = at('below', 0.35); TR.night = at('night', 0); TR.hall = at('hall', 0);
    ['hero', 'night', 'hall', 'after'].forEach((id) => { const el = $('#' + id); SEC[id] = { top: topOf(el), h: el.offsetHeight }; });
    if (S.pinAfter) scrollTo(0, SEC.after.top);
    PENDING.concat(DWELL, ONCE).forEach((it) => { it.t = resolve(it.key, it.el); });
    PENDING.sort((a, b) => a.t - b.t);
    ONCE.sort((a, b) => a.t - b.t);
  }

  // ---------------------------------------------------------------- corruptibles
  const PENDING = [], DWELL = [], ONCE = [];
  function parseSpec(str) {
    return String(str).split('||').map((part) => { const i = part.indexOf('|'); return i < 0 ? null : { key: part.slice(0, i).trim(), val: part.slice(i + 1) }; }).filter(Boolean);
  }
  function register() {
    const add = (el, key, val, kind, extra) => PENDING.push(Object.assign({ el, key, val, kind, t: 2 }, extra));
    $$('[data-x]').forEach((el) => {
      const specs = parseSpec(el.dataset.x);
      specs.forEach((s, i) => {
        if (el.dataset.dwell && i === 0) DWELL.push({ el, key: s.key, val: s.val, need: parseFloat(el.dataset.dwell), seen: 0, t: 2 });
        else add(el, s.key, s.val, 'text');
      });
    });
    $$('[data-xh]').forEach((el) => parseSpec(el.dataset.xh).forEach((s) => add(el, s.key, s.val, 'html')));
    $$('[data-xa]').forEach((el) => parseSpec(el.dataset.xa).forEach((s) => { const parts = s.val.split('|'); add(el, s.key, parts[2], 'attr', { attr: parts[1] }); }));
    $$('[data-xc]').forEach((el) => parseSpec(el.dataset.xc).forEach((s) => add(el, s.key, s.val, 'class')));
  }
  function inView(el) { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < S.vh && r.right > 0 && r.left < S.vw; }
  function apply(it) {
    const live = it.kind !== 'class' && inView(it.el);
    if (it.kind === 'text') it.el.textContent = it.val;
    else if (it.kind === 'html') it.el.innerHTML = it.val;
    else if (it.kind === 'attr') it.el.setAttribute(it.attr, it.val);
    else it.el.classList.add(...it.val.split(/\s+/));
    if (live) bump(it.el);
  }
  function tickDwell(dt) {
    for (const it of DWELL) {
      if (it.done || S.maxP < it.t || !inView(it.el)) continue;
      it.seen += dt;
      if (it.seen >= it.need) { it.done = true; it.el.textContent = it.val; bump(it.el); }
    }
  }
  let glitchUntil = 0;
  function pageGlitch(strong) {
    if (S.calm) return;
    html.classList.add('pglitch');
    glitchUntil = performance.now() + (strong ? 150 : 75);
  }
  function bump(el) {
    el.classList.remove('xhit'); void el.offsetWidth; el.classList.add('xhit');
    clearTimeout(el._xt); el._xt = setTimeout(() => el.classList.remove('xhit'), 700);
    if (S.st >= 2) pageGlitch();
    if (snd.ok()) snd.glitch(S.st >= 2 ? 0.09 : 0.03);
  }
  // hover over a heading and, sometimes, the next version of it leaks through for a blink
  function peek(el) {
    if (S.calm || S.st < 1) return;
    const next = PENDING.find((it) => it.el === el && it.t > S.maxP && (it.kind === 'text' || it.kind === 'html'));
    if (!next || Math.random() > 0.42) return;
    const cur = el.innerHTML;
    el.innerHTML = next.val; el.classList.add('peek');
    if (snd.ok()) snd.glitch(0.03);
    setTimeout(() => { if (PENDING.includes(next)) el.innerHTML = cur; el.classList.remove('peek'); }, rand(70, 170));
  }

  // ---------------------------------------------------------------- stages, title, favicon
  function stageOf(p) { return p < TR.plans ? 0 : p < TR.cctv ? 1 : p < TR.reviews ? 2 : p < TR.visit ? 3 : p < TR.below ? 4 : p < TR.night ? 5 : p < TR.hall ? 6 : 7; }
  function setStage(n) {
    S.st = n;
    for (let i = 1; i <= n; i++) html.classList.add('st' + i);
    favicon();
    const meta = $('meta[name=theme-color]');
    if (meta) meta.content = n < 3 ? '#f4efe6' : n < 4 ? '#cfd0c7' : '#050505';
    if (n >= 2) $('#calmBtn').hidden = false;
    if (n >= 2 && snd.ok()) snd.creak(0.06 + 0.03 * n);
    if (n === 3) console.log('%c你也在看吗？', 'font:500 18px serif;color:#9b1d16');
  }
  const favC = document.createElement('canvas'); favC.width = favC.height = 64;
  function favicon() {
    const c = favC.getContext('2d');
    c.clearRect(0, 0, 64, 64);
    if (S.st < 4) {
      c.fillStyle = S.st === 0 ? '#1c1b19' : S.st < 3 ? '#2c211d' : '#5c130f';
      c.beginPath(); c.moveTo(14, 0); c.lineTo(50, 0); c.quadraticCurveTo(64, 0, 64, 14); c.lineTo(64, 50); c.quadraticCurveTo(64, 64, 50, 64); c.lineTo(14, 64); c.quadraticCurveTo(0, 64, 0, 50); c.lineTo(0, 14); c.quadraticCurveTo(0, 0, 14, 0); c.fill();
      c.fillStyle = S.st === 0 ? '#f4efe6' : S.st < 3 ? '#d8cfc0' : '#7a1a14';
      c.font = '36px "Noto Serif SC","Songti SC","SimSun",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(S.st < 3 ? '栖' : '墓', 32, 35);
    } else {
      c.fillStyle = '#000'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#d9d6c8';
      c.beginPath(); c.arc(22, 32, 5.5, 0, 7); c.fill();
      c.beginPath(); c.arc(43, 31, 4.6, 0, 7); c.fill();
    }
    $('#favicon').href = favC.toDataURL('image/png');
  }
  const HAUNT = ['别翻了', '回去', '1301', '它在看', '还往下吗'];
  let hauntIdx = 0;
  function baseTitle() {
    if (S.finale) return '安静了。';
    if (S.maxP >= TR.hall) return '别停';
    if (S.maxP >= TR.night) return '它在上面';
    if (S.maxP >= TR.below) return '别翻了';
    if (S.maxP >= TR.visit) return '栖园 | 13 层 · 1301 室';
    return '栖园 | 城市中的静谧栖居 — 恒晖置业';
  }
  function tickTitle() {
    let t = baseTitle();
    if (!S.finale && S.st >= 5) t = HAUNT[hauntIdx++ % HAUNT.length];
    if (!S.hidden && document.title !== t) document.title = t;
  }

  // ---------------------------------------------------------------- toast & fourth wall
  let toastTimer = 0;
  function toast(msg, ms) {
    if (S.st >= 5) return;
    const el = $('#toast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), ms || 4200);
  }
  function later(msg, ms, dur) { setTimeout(() => { if (!S.finale && !S.lock) toast(msg, dur); }, ms); }
  function timeLine(d) {
    const h = d.getHours();
    if (h < 5) return '你为什么还醒着？';
    if (h < 9) return '这么早。你一夜没睡吗？';
    if (h < 18) return '现在是白天。没关系的。';
    return '天黑了。你一个人吗？';
  }
  function browser() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'Edge'; if (/Firefox\//.test(ua)) return 'Firefox'; if (/Chrome\//.test(ua)) return 'Chrome'; if (/Safari\//.test(ua)) return 'Safari';
    return '浏览器';
  }
  ONCE.push(
    { key: 'plans+0.02', fn: () => chat.push({ text: '您好，我是置业顾问小周 😊 想了解栖园的户型和价格吗？', quick: ['看一下户型', '问问价格', '暂时不用'] }) },
    { key: 'plans+0.06', fn: () => chat.push({ typing: 2600, text: '悄悄说一句：右下角把声音打开，看房体验更好哦 😌' }) },
    { key: 'cctv+0.06', fn: () => chat.push({ typing: 5000, text: '您还在看吗？' }) },
    { key: 'reviews+0.05', fn: () => { const d = new Date(); toast('现在是 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + '。'); later(timeLine(d), 4300); } },
    { key: 'visit+0.04', fn: () => toast('你的屏幕有 ' + screen.width + '×' + screen.height + ' 个像素。都看得清。') },
    { key: 'visit+0.13', fn: () => toast('你用的是 ' + browser() + '。它挡不住。') },
    { key: 'foot+0.01', fn: () => { if (navigator.getBattery) navigator.getBattery().then((b) => { if (!b.charging && b.level < 0.9) toast('你的电量还剩 ' + Math.round(b.level * 100) + '%。够看到结尾吗？'); }).catch(() => {}); } },
  );
  let leftAt = 0;
  document.addEventListener('visibilitychange', () => {
    S.hidden = document.hidden;
    if (document.hidden) {
      leftAt = performance.now();
      if (S.maxP >= TR.cctv && !S.finale) document.title = pick(['回来。', '别走。', '你还回来吗']);
    } else {
      const n = Math.round((performance.now() - leftAt) / 1000);
      if (n >= 2 && S.maxP >= TR.reviews && !S.finale && !S.lock) { toast('你离开了 ' + n + ' 秒。'); if (S.st >= 4) later('它没走。', 3800); }
    }
  });

  // ---------------------------------------------------------------- sales assistant
  const chat = (() => {
    const root = $('#chat'), panel = $('#chatPanel'), fab = $('#chatFab'), msgs = $('#chMsgs'), typingEl = $('#chTyping'),
      teaser = $('#chatTeaser'), badge = $('#chatBadge'), quick = $('#chQuick'), nameEl = $('#chName'), statEl = $('#chStat');
    let unread = 0, open = false, queue = [], busy = false, shown = false;
    function add(from, text) {
      const div = document.createElement('div');
      div.className = 'msg ' + from; div.textContent = text;
      msgs.appendChild(div); msgs.scrollTop = msgs.scrollHeight;
      if (from === 'them') { teaser.textContent = text; unread++; badge.textContent = Math.min(99, unread); badge.hidden = open; }
    }
    function setQuick(list) {
      quick.innerHTML = '';
      (list || []).forEach((label) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
        b.onclick = () => { add('me', label); setQuick([]); setTimeout(() => add('them', reply(label)), 1100); };
        quick.appendChild(b);
      });
    }
    function reply(label) {
      const dark = S.st >= 3;
      if (label === '看一下户型') return dark ? '哪一户都行。1301 已经给您留好了。' : '栖园在售 A89㎡ / B119㎡ / C139㎡ 三种户型，往下翻就能看到户型图了 😊';
      if (label === '问问价格') return dark ? '不要钱。住进来就不用走了。' : '均价 26,800 元/㎡，本周认筹有 98 折优惠哦～';
      return dark ? '您已经不需要了。' : '好的，您慢慢看，有需要随时叫我 :)';
    }
    function run() {
      if (busy || !queue.length) return;
      const item = queue.shift(); busy = true;
      if (item.name) nameEl.textContent = item.name;
      if (item.stat) statEl.textContent = item.stat;
      if (item.from === 'sys') { setTimeout(() => { add('sys', item.text); busy = false; run(); }, 500); return; }
      const wait = item.typing === undefined ? 1300 : item.typing;
      if (wait > 0) typingEl.textContent = (item.who || '小周') + ' 正在输入…';
      setTimeout(() => { typingEl.textContent = ''; add('them', item.text); if (item.quick) setQuick(item.quick); busy = false; run(); }, wait);
    }
    fab.onclick = () => { open = !open; panel.hidden = !open; if (open) { unread = 0; badge.hidden = true; } };
    return { push: (item) => { if (!shown) { shown = true; root.hidden = false; } queue.push(item); run(); } };
  })();
  [
    { at: 'reviews+0.04', typing: 1600, text: '您看到下面的监控画面了吗' },
    { at: 'reviews+0.04', typing: 4200, text: '那一路不是我们装的' },
    { at: 'visit+0.01', typing: 2000, name: '小周（已离线）', stat: '离线', text: '别去13层' },
    { at: 'visit+0.07', typing: 14000, text: '它在我后面' },
    { at: 'foot', typing: 900, text: '别 回 头' },
    { at: 'foot+0.03', from: 'sys', text: '小周 已断开连接' },
    { at: 'foot+0.03', typing: 2600, name: '未知用户', stat: '未知', text: '让我来接替她。' },
    { at: 'below+0.05', typing: 1500, text: '你为什么还要往下看？' },
    { at: 'night+0.02', typing: 1200, text: '1301 的门开着。' },
  ].forEach((item) => ONCE.push({ key: item.at, fn: () => chat.push(item) }));

  // ---------------------------------------------------------------- security feeds
  const FEEDS = [];
  let noiseFrames = null, faceC = null;
  function feedAssets() {
    const w = 384, h = 216;
    noiseFrames = [];
    for (let f = 0; f < 6; f++) {
      const img = new ImageData(w, h), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const v = (Math.random() * 255) | 0; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
      noiseFrames.push(img);
    }
    faceC = document.createElement('canvas'); faceC.width = 96; faceC.height = 128;
    const c = faceC.getContext('2d');
    c.fillStyle = '#8f8b82';
    c.beginPath(); c.ellipse(48, 60, 28, 42, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(31, 86); c.quadraticCurveTo(48, 126, 65, 86); c.closePath(); c.fill();
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(37, 50, 9.5, 8.5, 0.15, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(60, 48, 8, 10.5, -0.1, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(48, 88, 8, 20, 0, 0, Math.PI * 2); c.fill();
  }
  function drawStatic(ctx, t, k) {
    const w = 384, h = 216;
    ctx.putImageData(noiseFrames[((t * 12) | 0) % 6], 0, 0);
    const s = (0.85 + 0.3 * k) * (1 + 0.03 * Math.sin(t * 1.3)), fw = 96 * s * 1.4, fh = 128 * s * 1.4, fx = w / 2 - fw / 2, fy = h / 2 - fh / 2 + 8;
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.45 + 0.5 * k;
    ctx.drawImage(faceC, fx, fy, fw, fh);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 * k; ctx.fillStyle = '#8a8a8a';
    const ex = (S.mx - 0.5) * 12, ey = (S.my - 0.5) * 10;
    ctx.beginPath(); ctx.arc(fx + (37 / 96) * fw + ex, fy + (50 / 128) * fh + ey, 2.4 * s, 0, 7); ctx.arc(fx + (60 / 96) * fw + ex, fy + (48 / 128) * fh + ey, 2.4 * s, 0, 7); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(0, ((t * 70) % (h + 30)) - 30, w, 26);
  }
  const k0For = (z) => Math.floor((z - 2.75) / 5.5) - 1;
  function flickerLevel(k0, t, f, amount) {
    const a = [];
    for (let i = 0; i < 8; i++) {
      let lv = 1 - amount * 0.3 * (0.5 + 0.5 * Math.sin(t * (11 + i * 3.1) + i * 5.7)) * (0.5 + 0.5 * Math.sin(t * 1.7 + i));
      if (i === 2 && Math.sin(t * 0.9 + f.phase) > 0.94) lv *= 0.05;
      a.push(lv);
    }
    return a;
  }
  function feedPost(ir, g, track, lift) {
    return { u_dist: 0.09, u_ca: 1.5, u_grain: 0.09, u_scan: 0.8, u_static: 0.025 + 0.32 * g, u_vig: 0.5, u_flash: 0, u_glitch: g, u_ir: ir, u_fade: 0,
      u_gain: 1.15, u_bar: 0, u_track: track, u_invert: 0, u_tint: [0.95, 1.02, 0.98], u_lift: [lift || 0.008, 0.01, 0.008], u_sat: 0.75 };
  }
  const FIG0 = { u_figYaw: 0, u_figPose: [0.25, 0, 1], u_eyes: 1 };
  function feedGate(t, f) {
    const M = S.maxP + S.watch * 0.0005;
    const night = smooth(TR.cctv + 0.04, TR.cctv + 0.14, M), far = smooth(TR.reviews, TR.reviews + 0.07, M), near = smooth(TR.visit + 0.02, TR.visit + 0.07, M);
    const yaw = 0.27, ro = [1.5, 5.2, 43], fx = lerp(10, 5.2, near), fz = lerp(26, 33, near);
    return { scene: 'ext', p: Object.assign({}, FIG0, {
      u_ro0: ro, u_ta0: [ro[0] + Math.sin(yaw) * 10, 1.4, ro[2] - Math.cos(yaw) * 10], u_camT: 0, u_night: night, u_one: far, u_winFig: far, u_lamp: night,
      u_fog: lerp(0.0015, 0.009, night), u_exp: 1, u_focal: 1.25, u_shift: [0, 0], u_ir: night * 1.5, u_figOn: far > 0.02 ? 1 : 0, u_fig: [fx, fz],
      u_figYaw: Math.atan2(-(ro[0] - fx), -(ro[2] - fz)), u_figPose: [0.25 + 0.2 * near, 0.75 * near, 1], u_eyes: far, u_anim: t }),
      post: feedPost(0.78 * night, f.g, S.st >= 3 ? 0.4 : 0) };
  }
  function feedLobby(t, f) {
    const M = S.maxP + S.watch * 0.0005;
    const old = clamp(lerp(0.12, 0.5, smooth(TR.plans + 0.02, TR.cctv + 0.05, M)) + 0.5 * smooth(TR.cctv + 0.05, TR.reviews + 0.06, M), 0, 1);
    const near = smooth(TR.reviews + 0.04, TR.visit + 0.06, M), ro = [0.62, 2.26, 2], k0 = k0For(ro[2]), li = lerp(3.2, 1.7, old);
    return { scene: 'int', p: Object.assign({}, FIG0, {
      u_ro: ro, u_ang: [-0.03, -0.1], u_roll: 0, u_focal: 1.22, u_shift: [0, 0], u_mode: 0, u_old: old, u_fog: lerp(0.012, 0.032, old), u_exp: 1, u_k0: k0,
      u_lm: flickerLevel(k0, t, f, S.st >= 1 ? 0.5 + old * 0.5 : 0.05), u_lcol: [0.82 * li, 0.95 * li, 0.86 * li],
      u_end: lerp(1.3, 0.12, smooth(TR.cctv, TR.visit + 0.05, M)), u_corr: S.st >= 3 ? 1 : 0, u_door: 0, u_figIn: 0, u_led: 1,
      u_figOn: near > 0 || M > TR.reviews + 0.04 ? 1 : 0, u_fig: [0, ro[2] + lerp(20, 4.6, near)], u_figPose: [0.25 + 0.25 * near, 0, 1], u_anim: t }),
      post: feedPost(0, f.g, S.st >= 3 ? 0.35 : 0) };
  }
  function feedLift(t, f) {
    const M = S.maxP + S.watch * 0.0005;
    const open = smooth(TR.cctv + 0.04, TR.visit, M), out = smooth(TR.visit + 0.05, TR.visit + 0.09, M);
    const ro = [0.25, 2.2, 7.5], k0 = k0For(ro[2]), old = lerp(0.12, 0.95, smooth(TR.cctv, TR.foot, M)), inside = open > 0.55 && out < 0.5;
    const li = lerp(3.2, 1.6, old);
    return { scene: 'int', p: Object.assign({}, FIG0, {
      u_ro: ro, u_ang: [0.02, -0.1], u_roll: 0, u_focal: 1.3, u_shift: [0, 0], u_mode: 1, u_old: old, u_fog: lerp(0.012, 0.035, open), u_exp: 1, u_k0: k0,
      u_lm: flickerLevel(k0, t, f, S.st >= 1 ? 0.4 + old * 0.5 : 0.05), u_lcol: [0.82 * li, 0.95 * li, 0.86 * li], u_end: 0, u_corr: 0,
      u_door: out > 0.5 ? 1 : open, u_figIn: inside ? 1 : 0, u_led: S.st >= 2 ? 13 : (S.st === 1 && Math.sin(t * 0.7) > 0.992 ? 13 : 1),
      u_figOn: inside || out > 0.5 ? 1 : 0, u_fig: [0, inside ? 16.7 : 9.4], u_figPose: [0.3 + 0.35 * out, 0.8 * out, 1], u_anim: t }),
      post: feedPost(0, f.g, S.st >= 3 ? 0.45 : 0) };
  }
  function feedPark(t, f) {
    const M = S.maxP + S.watch * 0.0005;
    const ro = [-0.6, 2.1, 1], k0 = k0For(ro[2]), dark = smooth(TR.cctv + 0.05, TR.reviews + 0.05, M), near = smooth(TR.reviews + 0.05, TR.visit + 0.05, M);
    const yaw = 0.42, fx = 0.5 - 1.1 * near, fz = lerp(15, 6.4, near), li = lerp(6, 2.4, dark);
    const base = flickerLevel(k0, t, f, S.st >= 1 ? 0.45 : 0.05).map((lv, i) => {
      if (dark > 0 && i % 2 === 1) lv *= lerp(1, 0.08, dark);
      if (near > 0.5 && i !== 2 && i !== 3) lv *= lerp(1, 0.12, near);
      return lv;
    });
    return { scene: 'int', p: Object.assign({}, FIG0, {
      u_ro: ro, u_ang: [yaw, -0.09], u_roll: 0, u_focal: 1.3, u_shift: [0, 0], u_mode: 2, u_old: 0.6, u_fog: 0.03, u_exp: 1, u_k0: k0, u_lm: base,
      u_lcol: [0.82 * li, 0.95 * li, 0.86 * li], u_end: 0, u_corr: 0, u_door: 0, u_figIn: 0, u_led: 1,
      u_figOn: dark > 0.5 ? 1 : 0, u_fig: [fx, fz], u_figYaw: Math.atan2(-(ro[0] - fx), -(ro[2] - fz)), u_figPose: [0.3 + 0.25 * near, 0, 1], u_eyes: dark, u_anim: t }),
      post: feedPost(0, f.g, S.st >= 3 ? 0.4 : 0) };
  }
  const FEED_FN = { gate: feedGate, lobby: feedLobby, lift: feedLift, park: feedPark };
  function initFeeds() {
    feedAssets();
    $$('.feed').forEach((fig, i) => FEEDS.push({ name: fig.dataset.feed, fig, cv: $('canvas', fig), ts: $('.ts', fig), last: 0, phase: i * 1.7, g: 0, gEnd: 0 }));
  }
  function tsFor(f) {
    const d = new Date(), real = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    if (S.st < 3 || (S.st === 3 && f.name !== 'park')) return real;
    if (S.st < 5) return f.name === 'park' ? '1958-06-03 03:13:13' : real.replace(/^\d{4}-\d{2}-\d{2}/, '1958-06-03');
    return '1958-06-03 03:13:13';
  }
  function renderFeeds(t, tms, dt) {
    const box = $('#mon');
    if (!box || S.hidden) return;
    if (!S.glFull) { if (box.getBoundingClientRect().top < S.vh * 1.5) warmRest(true); return; }
    if (S.st >= 1) S.watch = Math.min(60, S.watch + dt);
    const f = FEEDS[feedIdx++ % FEEDS.length];
    if (tms - f.last < 70) return;
    f.last = tms;
    if (tms > f.gEnd) {
      f.g = 0;
      if (Math.random() < 0.004 * S.st) { f.g = rand(0.45, 0.9); f.gEnd = tms + rand(100, 320); }
    }
    const ctx = f.cv.getContext('2d');
    if (f.name === 'park' && S.maxP + S.watch * 0.0005 >= TR.visit + 0.06) {
      drawStatic(ctx, t, smooth(TR.visit + 0.06, TR.visit + 0.13, S.maxP + S.watch * 0.0005));
    } else {
      const v = FEED_FN[f.name](t + f.phase, f);
      offEng.render(v.scene, Object.assign({ u_time: t }, v.p), Object.assign({ u_seed: Math.random() }, v.post), t, 1);
      ctx.drawImage(offEng.canvas, 0, 0);
    }
    if (tms > tsAt) {
      tsAt = tms + 250;
      FEEDS.forEach((x) => { if (inView(x.fig)) x.ts.textContent = tsFor(x); });
      const clock = $('#monClock'), d = new Date();
      clock.textContent = S.st < 3 ? pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) : '03:13:1' + ((Math.random() * 4) | 0);
      $('#monDot').classList.toggle('bad', S.st >= 3);
    }
  }

  // ---------------------------------------------------------------- the renderer behind the page
  let stageEng = null, offEng = null;
  const HERO = { ro: [-6, 9, 62] };
  function initGL() {
    try {
      stageEng = new QYEngine($('#stage'), { programs: [] });
      const oc = document.createElement('canvas'); oc.width = 384; oc.height = 216;
      offEng = new QYEngine(oc, { preserve: true, programs: [] });
    } catch (e) { noGL(e); return; }
    // let the browser paint the page first, then build the hero's shaders; the corridor shaders are big, so they are
    // built while the visitor is standing still (and forced through if they reach the monitors before that)
    requestAnimationFrame(() => setTimeout(() => {
      try { stageEng.warm(['ext', 'post']); } catch (e) { noGL(e); return; }
      S.glReady = true; html.classList.add('gl');
      setTimeout(() => warmRest(false), 1200);
    }, 0));
  }
  function warmRest(force) {
    if (S.glFull || !S.glReady) return;
    if (!force && performance.now() - S.lastInput < 1500) { setTimeout(() => warmRest(false), 400); return; }
    try { stageEng.warm(['int']); offEng.warm(['ext', 'int', 'post']); S.glFull = true; } catch (e) { noGL(e); }
  }
  function noGL(e) {
    S.gl = false; S.glReady = false; html.classList.add('no-gl'); $('#stage').style.display = 'none'; console.warn(e && e.message);
  }
  const wobble = (t, s) => (Math.sin(t * 0.9 + 1.3) * 0.5 + Math.sin(t * 1.7 + 0.4) * 0.3 + Math.sin(t * 3.1 + 2.2) * 0.2) * s;
  const POST0 = { u_flash: 0, u_glitch: 0, u_ir: 0, u_bar: 0, u_track: 0, u_invert: 0, u_lift: [0, 0, 0] };
  function heroView(t) {
    const back1 = smooth(TR.plans, TR.reviews, S.maxP), back2 = smooth(TR.visit, TR.night, S.maxP);
    const night = S.st === 0 ? 0 : clamp(0.5 * back1 + 0.5 * back2, 0, 1), seen = S.maxP >= TR.night;
    const mob = S.vw < 760, yaw = mob ? 0.2 : 0.1;
    return { scene: 'ext',
      p: Object.assign({}, FIG0, { u_ro0: HERO.ro, u_ta0: [HERO.ro[0] + Math.sin(yaw) * 10, HERO.ro[1], HERO.ro[2] - Math.cos(yaw) * 10], u_camT: 0, u_night: night,
        u_one: seen ? 1 : 0, u_winFig: seen ? 1 : 0, u_lamp: smooth(0.25, 0.6, night), u_fog: lerp(0.0012, 0.008, night), u_exp: 1, u_focal: mob ? 1.45 : 2.0,
        u_shift: [(mob ? -0.1 : -0.2) + (S.mx - 0.5) * 0.02, (mob ? 0.46 : 0.5) + (S.my - 0.5) * 0.01], u_figOn: 0, u_fig: [0, 0], u_anim: t, u_ir: 0 }),
      post: Object.assign({}, POST0, { u_dist: 0, u_ca: 0.4, u_grain: 0.03 + 0.05 * night, u_scan: 0, u_static: 0, u_vig: 0.25 + 0.45 * night, u_fade: 0,
        u_gain: lerp(1, 1.6, night), u_tint: [1, 1, 1], u_sat: lerp(1.2, 1.05, night) }) };
  }
  function nightView(t) {
    const n = clamp((scrollY - SEC.night.top) / Math.max(1, SEC.night.h - S.vh), 0, 1), e = n * n * (3 - 2 * n);
    const twitch = n > 0.62 && n < 0.635 ? 0 : 1;
    $$('#night .cap').forEach((c, i) => c.classList.toggle('on', n >= [0.06, 0.3, 0.54, 0.78][i]));
    return { scene: 'ext',
      p: Object.assign({}, FIG0, { u_ro0: HERO.ro, u_ta0: [HERO.ro[0] + Math.sin(0.1) * 10, HERO.ro[1], HERO.ro[2] - Math.cos(0.1) * 10], u_camT: 1.28 * e, u_night: 1,
        u_one: 1, u_winFig: smooth(0.3, 0.5, n) * twitch, u_lamp: 1, u_fog: lerp(0.009, 0.002, n), u_exp: 1, u_focal: 2.0, u_shift: [0, 0.35 * (1 - smooth(0, 0.5, n))],
        u_figOn: 0, u_fig: [0, 0], u_anim: t, u_ir: 0 }),
      post: Object.assign({}, POST0, { u_dist: 0.02, u_ca: 0.6, u_grain: 0.06, u_scan: 0.12, u_static: 0, u_vig: 0.55, u_fade: smooth(0.94, 1, n),
        u_gain: lerp(2.2, 1.4, n), u_track: 0.1, u_tint: [0.95, 1, 0.98], u_sat: 1.05 }) };
  }

  // ---------------------------------------------------------------- 13F
  const H = { z: 0, fig: 1e9, q: 0, seq: null, t0: 0, lastY: 0, flickEnd: 0, nextFlick: 1.5, lm: null, tilt: 0.25, mouth: 0.5, reach: 0, end: 0.5, strobe: false, white: false, quiet: false, breath: false, bob: 0, shake: 0, clight: 0, fade: 0, said: {}, afterAt: 0 };
  const DARK = [0, 0, 0, 0, 0, 0, 0, 0];
  const SUBS = [[0.02, 0.17, '7 号楼 · 13 层'], [0.17, 0.3, '本楼共 12 层。'], [0.4, 0.53, '你还在往下滚。'], [0.56, 0.69, '请往上滚。'], [0.72, 0.8, '别停。']];
  let sayUntil = 0;
  function say(text, cls, sec) { const el = $('#sub'); el.textContent = text; el.className = 'sub on' + (cls ? ' ' + cls : ''); sayUntil = now() + sec; }
  function setSub(text) { const el = $('#sub'); if (el.textContent !== text) el.textContent = text; el.className = 'sub' + (text ? ' on' : ''); }
  const stutter = (t) => 0.55 + 0.45 * (Math.sin(t * 37) > -0.3 ? 1 : 0) * (Math.sin(t * 7.3) > -0.8 ? 1 : 0.2);
  function lockScroll(on) { S.lock = on; html.classList.toggle('locked', on); }
  function startStare(tms) {
    if (H.seq) return;
    lockScroll(true);
    setSub('');
    H.t0 = tms / 1000;
    H.seq = (t, dt, nowMs) => {
      // the tubes are dead; the only light left is the one on the camera, pointed at its face
      const e = nowMs / 1000 - H.t0, calm = S.calm, lm = new Array(8).fill(0);
      H.shake = 0;
      if (e < 0.55) { H.clight = 0; H.fade = 1; H.fig = H.z + 0.72; H.tilt = 0.5; H.mouth = 0.9; H.reach = 0; }
      else if (e < 3.0) { H.fade = 0; H.clight = (calm ? 0.8 : stutter(t)) * 0.95; H.tilt = 0.5 + 0.5 * smooth(0.55, 3.0, e); H.mouth = 0.9 + 0.45 * smooth(0.55, 3.0, e); H.breath = true; }
      else if (e < 3.7) { H.clight = 0; H.fade = 1; H.breath = false; }
      else if (e < 4.5) {
        const k = smooth(3.7, 4.0, e);
        H.fig = H.z + lerp(0.72, 0.4, k); H.reach = k; H.mouth = 1.8; H.tilt = 1.05;
        H.clight = calm ? 1.1 : (((e * 2.8) | 0) % 2 === 0 ? 1.7 : 0);
        H.fade = 0; H.strobe = true; H.shake = calm ? 0.004 : 0.035;
        if (!H.said.sting) { H.said.sting = true; snd.sting(); }
      }
      else if (e < 4.62) { H.clight = 0; H.strobe = false; H.white = !calm && e < 4.52; H.fade = H.white ? 0 : 1; }
      else if (e < 7.0) {
        H.white = false; H.fade = 1;
        if (!H.said.silence) { H.said.silence = true; H.quiet = true; snd.silence(); }
        if (e > 5.9 && !H.said.drip) { H.said.drip = true; snd.revive(); snd.drip(); }
      } else { endFinale(); return; }
      H.lm = lm; H.end = 0;
    };
  }
  function hallTick(t, dt, tms) {
    if (H.seq) { H.seq(t, dt, tms); return; }
    if (S.finale) {
      if (!H.afterAt) H.afterAt = t;
      const a = t - H.afterAt;
      setSub(a < 4.5 ? '走廊里什么都没有。' : a < 9 ? '你确定吗？' : '');
      return;
    }
    H.q = clamp((scrollY - SEC.hall.top) / Math.max(1, SEC.hall.h - S.vh), 0, 1);
    const dy = scrollY - H.lastY;
    H.z = Math.max(H.z, 30 * H.q);
    H.bob = Math.max(0, H.bob - dt * 3) + Math.min(0.5, Math.abs(dy) / 600);
    if (dy < -4 && H.q > 0.3) {              // trying to back away only encourages it
      H.fig = Math.min(H.fig, H.fig - Math.min(5, (-dy / S.vh) * 7));
      if (!H.said.up) { H.said.up = true; say('上面也有。', '', 2.6); }
    }
    H.lastY = scrollY;
    if (H.q > 0.24 && H.fig > 1e8) H.fig = H.z + 31;     // first appearance, far down the hall
    const target = H.z + lerp(30, 2.1, smooth(0.24, 0.8, H.q));
    if (tms / 1000 > H.nextFlick) {                      // it only moves when the lights are out
      H.flickEnd = tms + rand(90, 260);
      H.nextFlick = tms / 1000 + rand(1.5, 3.4) * (1 - 0.45 * H.q);
      if (H.q > 0.26) { H.fig = Math.min(H.fig, target); if (H.q > 0.4 && snd.ok()) snd.knock(1, 0.1 + 0.3 * H.q); }
    }
    if (H.q > 0.3 && H.fig < 1e8) {
      const idle = (tms - S.lastInput) / 1000;
      H.fig = Math.min(H.fig, H.fig - (0.04 + 0.9 * smooth(0.5, 4, idle)) * dt);   // stand still and it keeps coming
      if (idle > 2.5 && H.q > 0.5 && !H.said.idle) { H.said.idle = true; say('我说了，别停。', 'red', 2.8); }
    }
    H.tilt = 0.25 + 0.12 * Math.sin(t * 0.4) + 0.5 * smooth(0.6, 0.8, H.q);
    H.mouth = 0.5 + 0.5 * smooth(0.55, 0.78, H.q);
    H.reach = 0;
    H.end = 0.5 * (1 - smooth(0.5, 0.75, H.q));
    if (H.q >= 0.8) { startStare(tms); return; }
    if (t > sayUntil) { const a = SUBS.find((s) => H.q >= s[0] && H.q < s[1]); setSub(a ? a[2] : ''); }
  }
  function hallView(t, dt, tms) {
    hallTick(t, dt, tms);
    $('#blackout').classList.toggle('on', H.fade >= 1);
    const k0 = k0For(H.z);
    let lm = H.lm || DARK;
    if (!H.seq) {
      lm = new Array(8).fill(0);
      const behind = smooth(0.45, 0.72, H.q);
      for (let i = 0; i < 8; i++) {
        const zk = (k0 + i) * 5.5 + 2.75;
        let lv = H.z - zk > 11 - 12 * behind ? 0 : 1;                  // the dark catches up from behind
        lv *= 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(t * (13 + i * 2.7) + i * 7.1) * Math.sin(t * (5.3 + i * 1.9) + i * 3.3));
        if (tms < H.flickEnd) lv *= 0.02;
        lm[i] = S.finale ? 0.7 : lv;
      }
      H.lm = lm;
    }
    const dist = Math.max(0.3, H.fig - H.z), near = S.finale ? 0 : smooth(5, 0.9, dist), sh = H.shake ? rand(-H.shake, H.shake) : 0, li = 1.9;
    const view = { scene: 'int',
      p: Object.assign({}, FIG0, { u_ro: [0, 1.55 + Math.sin(H.bob * 14) * 0.012 * Math.min(1, H.bob), H.z],
        u_ang: [wobble(t, 0.003) + sh, -0.012 + wobble(t * 1.13 + 3, 0.0025) + 0.34 * near + (H.shake ? rand(-H.shake, H.shake) : 0)],
        u_roll: wobble(t * 0.77 + 1, 0.006) + (H.shake ? rand(-H.shake, H.shake) * 0.6 : 0), u_focal: 1.6 + (H.strobe ? rand(-0.08, 0.08) : 0), u_shift: [0, 0],
        u_mode: 0, u_old: 1, u_fog: 0.028 + 0.012 * H.q, u_exp: 1, u_k0: k0, u_lm: lm, u_lcol: [0.8 * li, 0.95 * li, 0.86 * li], u_end: H.end,
        u_corr: H.q > 0.5 ? 1 : 0, u_door: 0, u_figIn: 0, u_led: 1, u_clight: [H.clight * 0.9, H.clight * 0.95, H.clight], u_figOn: S.finale || H.fig < 1e8 ? 1 : 0, u_fig: [0, S.finale ? 1e6 : H.fig],
        u_figPose: [H.tilt, H.reach, H.mouth], u_eyes: smooth(0.34, 0.5, H.q) * (H.seq ? 0.6 : 1), u_anim: t }),
      post: Object.assign({}, POST0, { u_dist: 0.035, u_ca: 0.7 + 7 * (H.strobe ? 1 : 0) + H.shake * 40, u_grain: 0.07 + 0.2 * near, u_scan: 0.45,
        u_static: H.strobe ? (S.calm ? 0.12 : rand(0, 0.55)) : 0, u_vig: 0.62, u_flash: H.white ? 1 : 0,
        u_glitch: H.strobe ? (S.calm ? 0.25 : 1) : near > 0.6 ? 0.15 : 0,
        u_fade: Math.max(S.finale ? 0 : 1 - smooth(0, 0.05, H.q), H.fade), u_gain: 1, u_bar: 1, u_track: H.strobe && !S.calm ? 1 : 0,
        u_invert: H.strobe && !S.calm && ((t * 7) | 0) % 3 === 0 ? 1 : 0, u_tint: [0.92, 1.02, 0.96], u_sat: 0.9 }) };
    return view;
  }
  function renderStage(t, dt, tms) {
    if (!S.glReady) return;
    const c = stageEng.canvas, y = scrollY;
    let mode = null;
    if (!S.lock && y + S.vh <= SEC.night.top + 4) { if (y < SEC.hero.h - 2) mode = 'hero'; }
    else if (y < SEC.hall.top - 2) mode = 'night';
    else if (y < SEC.after.top + 2) mode = 'hall';
    S.mode = mode;
    if (mode !== 'hall') $('#blackout').classList.remove('on');
    if (!mode || S.hidden) { c.classList.remove('on'); return; }
    c.classList.add('on');
    const dpr = Math.min(devicePixelRatio || 1, 1.5) * S.quality;
    c.width = Math.max(2, Math.round(S.vw * dpr)); c.height = Math.max(2, Math.round(S.vh * dpr));
    const v = mode === 'hero' ? heroView(t) : mode === 'night' ? nightView(t) : hallView(t, dt, tms);
    stageEng.render(v.scene, Object.assign({ u_time: t }, v.p), Object.assign({ u_seed: Math.random() }, v.post), t, 1);
  }

  // ---------------------------------------------------------------- afterwards
  const AFTER = ['你到页面底部了。', '栖园不存在。恒晖置业也不存在。', '这里是页面的最下面，什么都没有了。', '不过——', '你刚才往上翻的时候，', '有没有回头看一眼首页？', '天色，好像变了。'];
  function endFinale() {
    H.seq = null; S.finale = true; H.strobe = false; H.white = false; H.clight = 0; H.fade = 0; H.afterAt = 0;
    $('#blackout').classList.remove('on');
    lockScroll(false);
    S.pinAfter = true;
    scrollTo(0, topOf($('#after')));
    $('#sub').className = 'sub';
    document.title = '安静了。';
    const box = $('#afterLines'), credits = $('#credits');
    const d = new Date(), h = d.getHours();
    $('#afterClock').textContent = '现在是 ' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + '。' + (h >= 23 || h < 5 ? '这么晚了，一个人看这个，不太好吧。' : '外面天还亮着。真好。');
    AFTER.forEach((line, i) => setTimeout(() => { if (!S.finale) return; const p = document.createElement('p'); p.textContent = line; box.appendChild(p); }, 1400 + i * 1500));
    setTimeout(() => { if (!S.finale) return; credits.classList.add('on'); H.quiet = false; if (snd.ok()) snd.whisper(0.05); }, 1400 + AFTER.length * 1500 + 1000);
  }
  $('#btnTop').onclick = () => scrollTo({ top: 0, behavior: 'smooth' });
  $('#btnAgain').onclick = () => { location.href = location.pathname; };

  // ---------------------------------------------------------------- booking form
  (function form() {
    const f = $('#form'), tel = $('#f-tel'), inputs = ['#f-name', '#f-tel', '#f-type', '#f-date'].map((s) => $(s)), date = $('#f-date');
    const d = new Date(); date.value = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    let typing = false;
    tel.addEventListener('focus', () => {
      if (S.st < 4 || tel.value || typing) return;
      typing = true;
      let i = 0;
      const step = () => { if (document.activeElement !== tel) { typing = false; return; } tel.value = '1301'.slice(0, ++i); if (snd.ok()) snd.click(0.05); if (i < 4) setTimeout(step, rand(220, 420)); else typing = false; };
      setTimeout(step, 700);
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', f), fine = $('.fine', f);
      if (S.st < 4) { fine.textContent = '✓ 预约成功！置业顾问将在 10 分钟内与您联系。'; fine.style.color = 'var(--accent)'; if (snd.ok()) snd.chime(); return; }
      if (btn.dataset.done) return;
      btn.dataset.done = '1';
      inputs.forEach((i) => { i.disabled = true; });
      ['预约成功', '1301 室已为您保留', '欢迎入住', '欢迎回家', '你已经在家里了'].forEach((l, i) => setTimeout(() => { btn.textContent = l; bump(btn); if (i === 2) pageGlitch(true); }, 500 + i * 1300));
      fine.textContent = '购房合同已自动签署。甲方：你。乙方：它。';
    });
  })();

  // ---------------------------------------------------------------- controls
  function setCalm(on, announce) {
    S.calm = on; html.classList.toggle('calm', on); snd.reduced = on;
    $('#calmState').textContent = on ? '开' : '关'; $('#calmBtn').setAttribute('aria-pressed', String(on));
    if (announce) toast(on ? '已开启减弱模式：不再有频闪、画面抖动和刺耳的突发音效。' : '已关闭减弱模式。');
  }
  $('#calmLink').onclick = (e) => { e.preventDefault(); setCalm(true, true); };
  $('#calmBtn').onclick = () => setCalm(!S.calm, true);
  $('#sndBtn').onclick = () => {
    S.sound = !S.sound;
    $('#sndState').textContent = S.sound ? '开' : '关'; $('#sndBtn').setAttribute('aria-pressed', String(S.sound));
    if (S.sound) { snd.enable(); if (S.st < 2) snd.chime(); } else snd.disable();
  };
  ['mousemove', 'keydown', 'wheel', 'touchstart', 'pointerdown'].forEach((ev) => addEventListener(ev, (e) => {
    S.lastInput = performance.now(); S.idleSaid = false;
    if (ev !== 'mousemove') S.pinAfter = false;
    if (e.clientX !== undefined) { S.mx = e.clientX / S.vw; S.my = e.clientY / S.vh; }
    if (ev === 'keydown' && e.key === 'Escape') setCalm(true, true);
  }, { passive: true }));
  let peekEl = null;
  addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-peek]'); if (el && el !== peekEl) peek(el); peekEl = el; });

  // ---------------------------------------------------------------- audio per frame
  let nextCreak = 0, nextWhisper = 0;
  function audioTick(t, tms) {
    if (!snd.ctx) return;
    const inHall = S.mode === 'hall' && !S.finale, dread = S.finale ? 0.08 : smooth(TR.plans, TR.visit, S.maxP);
    let bpm = 0, breath = 0, light = 0;
    if (S.maxP > TR.reviews) bpm = lerp(44, 66, smooth(TR.reviews, TR.visit + 0.05, S.maxP));
    if (inHall) {
      bpm = H.seq ? (H.strobe ? 150 : 118) : lerp(66, 128, H.q);
      breath = H.seq ? (H.strobe ? 1.3 : 1) : 0.45 * smooth(10, 3, H.fig - H.z);
      light = H.lm ? Math.max(H.lm[1] || 0, H.lm[2] || 0) : 0;
      if (tms > nextWhisper && H.q > 0.45 && !H.seq) { snd.whisper(0.05 + 0.04 * H.q); nextWhisper = tms + rand(7000, 16000); }
    }
    if (!H.quiet) {
      snd.update({ dread, hall: inHall ? 1 : 0, light, breath: breath * (0.5 + 0.5 * Math.sin(t * 1.75)), tape: S.st >= 2 && inView($('.mon')) ? 0.5 : 0, bpm });
      if (S.st >= 3 && tms > nextCreak) { snd.creak(0.04 + 0.05 * dread); nextCreak = tms + rand(9000, 22000); }
    }
  }

  // ---------------------------------------------------------------- main loop
  let feedIdx = 0, tsAt = 0, prevY = 0, lastFrame = performance.now(), titleAt = 0, crashed = false;
  function tick() {
    try { frame(); }
    catch (e) { if (!crashed) { crashed = true; console.error(e); } }
    requestAnimationFrame(tick);
  }
  function frame() {
    const t = now(), tms = performance.now(), dt = Math.min(0.1, (tms - lastFrame) / 1000);
    lastFrame = tms;
    const y = scrollY;
    S.y = y;
    S.p = clamp(y / S.maxScroll, 0, 1);
    if (S.p > S.maxP) S.maxP = S.p;
    if (PENDING.length && S.maxP >= PENDING[0].t) {
      while (PENDING.length && S.maxP >= PENDING[0].t) apply(PENDING.shift());
      remeasure();
    }
    tickDwell(dt);
    for (const it of ONCE) if (!it.done && S.maxP >= it.t) { it.done = true; it.fn(); }
    const st = stageOf(S.maxP);
    if (st !== S.st) setStage(st);
    if (tms > glitchUntil) html.classList.remove('pglitch');
    $('#nav').classList.toggle('scrolled', y > 30 || S.st >= 3);
    if (!S.finale && S.st >= 2 && tms - S.lastInput > 12000 && !S.idleSaid && !S.lock) {
      S.idleSaid = true; toast('你已经 ' + Math.round((tms - S.lastInput) / 1000) + ' 秒没有动了。'); later('它也没有。', 4200);
    }
    if (y < prevY - 4) S.upAcc += prevY - y; else S.upAcc = 0;
    if (S.upAcc > S.vh * 0.6 && S.st >= 4 && tms > S.upCool) { toast('上面没有出口。'); S.upCool = tms + 25000; S.upAcc = 0; }
    prevY = y;
    if (!S.gl && !S.finale && y >= SEC.hall.top) { S.finale = true; scrollTo(0, SEC.after.top); }
    renderStage(t, dt, tms);
    renderFeeds(t, tms, dt);
    audioTick(t, tms);
    adapt(dt);
    if (tms > titleAt) { titleAt = tms + 2600; tickTitle(); }
  }
  // if the machine cannot keep up, the renderer drops resolution rather than frames
  let costAcc = 0, costN = 0;
  function adapt(dt) {
    if (S.quality <= 0.56) return;
    costAcc += dt; costN++;
    if (costN >= 120) { if (S.mode && costAcc / costN > 0.031) S.quality = Math.max(0.55, S.quality - 0.15); costAcc = 0; costN = 0; }
  }

  // ---------------------------------------------------------------- boot
  const belowObs = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) en.target.classList.add('in'); }), { threshold: 0.6 });
  const countObs = new IntersectionObserver((es, ob) => es.forEach((en) => { if (en.isIntersecting) { countUp(en.target); ob.unobserve(en.target); } }), { threshold: 0.6 });
  function countUp(el) {
    const target = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 1600), v = target * (1 - Math.pow(1 - k, 3)); el.textContent = v.toFixed(dec); if (k < 1) requestAnimationFrame(step); };
    step();
  }
  function init() {
    buildPlans();
    register();
    initFeeds();
    initGL();
    const d = new Date();
    $('#todayYear').textContent = d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
    $$('[data-count]').forEach((el) => countObs.observe(el));
    $$('#below p').forEach((p) => belowObs.observe(p));
    measure();
    scrollTo(0, 0);
    if (!isNaN(DEBUG_P)) scrollTo(0, DEBUG_P * S.maxScroll);
    favicon();
    requestAnimationFrame(tick);
  }
  let rsTimer = 0;
  const remeasure = () => { clearTimeout(rsTimer); rsTimer = setTimeout(measure, 120); };
  addEventListener('resize', remeasure);
  addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  init();
})();
