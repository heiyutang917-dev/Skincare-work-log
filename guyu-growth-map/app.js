(() => {
  'use strict';

  const STORE = 'guyu-growth-map-v1';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayAt = (offset) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
  const today = () => dateKey(new Date());
  const dateLabel = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
  let state = { records: {} };
  let mirrorStream = null;
  let scanStream = null;
  let scanTimer = null;
  let arSession = null;
  let cameraRun = 0;
  let eventTimer = null;
  let selectedStep = 0;
  let selectedZone = 'cheek';
  let activeTab = 'today';
  let previousFocus = null;
  let draftRatings = {};
  const stage = $('camera-stage');
  const overlay = document.createElement('canvas');
  overlay.className = 'ar-overlay'; overlay.setAttribute('aria-hidden', 'true'); stage.append(overlay);
  const arEvent = document.createElement('div');
  arEvent.className = 'ar-event'; arEvent.hidden = true; arEvent.setAttribute('aria-live', 'polite');
  const arEventTitle = document.createElement('strong');
  const arEventCopy = document.createElement('small');
  arEvent.append(arEventTitle, arEventCopy); stage.append(arEvent);
  $('page-mirror').querySelector('.page-heading p').textContent = '打开前置摄像头，把脸和食指放进画面。食指靠近脸颊、额头等区域并短暂停留时，局部会出现对应的机制动画。识别的是画面位置接近，单个摄像头不能确认真实触碰或检测皮肤内部。';
  stage.querySelector('.camera-caption').textContent = '把脸和食指放进画面 · 也可点选区域体验';
  stage.parentElement.querySelector('.camera-foot > span').textContent = '◈ 通过面部与手指关键点判断画面位置；动画是产品机制示意。';

  try {
    const stored = JSON.parse(localStorage.getItem(STORE));
    if (stored && stored.records && typeof stored.records === 'object') state = stored;
  } catch (_) { /* The prototype still works if browser storage is blocked. */ }

  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {} }
  function record(key = today()) { return state.records[key] || {}; }
  function updateToday(change) {
    const key = today();
    state.records[key] = { ...record(key), ...change };
    save(); render();
  }

  function showTab(tab, scrollId) {
    activeTab = tab;
    document.querySelectorAll('.page').forEach((el) => el.classList.toggle('active', el.id === `page-${tab}`));
    document.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('active', el.dataset.tab === tab && (el.classList.contains('nav-item') || el.closest('.mobile-nav'))));
    if (tab !== 'mirror') stopMirror();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (scrollId) setTimeout(() => $(scrollId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }

  function renderWhy() {
    const feeling = record().feeling;
    const content = {
      comfortable: ['状态平稳时，把护理做得有规律。', '这款面霜的品牌资料以焕亮和修护为护理目标。今天可以按你平时的步骤使用，并留意真实肤感。', '好状态也值得记录；光泽或色泽变化需要更长时间观察。'],
      dry: ['今天，先关注干燥与紧绷。', '面霜中的保湿、修护相关成分是配方的一部分。你可以记录涂抹后的肤感，并观察干燥感是否随时间变化。', '若干燥持续或加重，调整使用方式并寻求专业意见。'],
      irritated: ['出现刺痛或明显泛红时，先暂停。', '暂时不要为了完成打卡继续使用。停止可疑产品；若反应持续或严重，请咨询皮肤科专业人士。', '今天的图谱可以留下一条感受记录，无需完成产品使用。']
    };
    const [title, copy, bottom] = content[feeling] || ['今天，先照顾好肌肤的感受。', '规律护理是一个过程。先记录今天的肤感，再决定是否继续使用这款面霜。', '你的选择会改变今日提示；这不是皮肤诊断。'];
    $('why-title').textContent = title;
    $('why-copy').textContent = copy;
    $('why-bottom').textContent = bottom;
    document.querySelectorAll('[data-feeling]').forEach((btn) => {
      const chosen = btn.dataset.feeling === feeling;
      btn.classList.toggle('selected', chosen);
      btn.setAttribute('aria-pressed', String(chosen));
    });
  }

  function renderRitual() {
    const r = record();
    for (const part of ['am', 'pm']) {
      $(`log-${part}`).classList.toggle('done', !!r[part]);
      $(`log-${part}`).setAttribute('aria-pressed', String(!!r[part]));
      $(`status-${part}`).textContent = r[part] ? '已完成 ✓' : '标记完成 +';
    }
  }

  function recentDays(count) { return Array.from({ length: count }, (_, i) => dayAt(i - count + 1)); }
  function hasUse(r) { return !!(r?.am || r?.pm); }
  function renderGrowth() {
    const days = recentDays(14);
    const used = days.filter((d) => hasUse(record(dateKey(d)))).length;
    $('logged-days').textContent = String(used);
    $('range-label').textContent = `${dateLabel(days[0])} — ${dateLabel(days[13])}`;
    $('day-grid').replaceChildren(...days.map((d) => {
      const key = dateKey(d); const cell = document.createElement('div');
      cell.className = `day-cell${hasUse(record(key)) ? ' done' : ''}${key === today() ? ' today' : ''}`;
      const circle = document.createElement('span'); circle.textContent = hasUse(record(key)) ? '✦' : '·';
      const number = document.createElement('small'); number.textContent = String(d.getDate());
      cell.title = `${dateLabel(d)}：${hasUse(record(key)) ? '有护理记录' : '无护理记录'}`;
      cell.append(circle, number); return cell;
    }));
    const plant = $('plant-art');
    plant.style.setProperty('--leaf-opacity', used === 0 ? '.18' : used < 3 ? '.52' : used < 7 ? '.78' : '1');
    plant.querySelector('.stem').style.transform = `scaleY(${used === 0 ? .4 : Math.min(1, .5 + used / 16)})`;
    $('plant-title').textContent = used === 0 ? '从今天开始，慢慢生长。' : used < 4 ? '新的叶子，正在展开。' : '你把护理写成了自己的故事。';
    $('plant-copy').textContent = used === 0 ? '每一次记录，都是你愿意关注自己的证据。' : `过去 14 天里，你有 ${used} 天留下使用记录。植物只代表记录的积累。`;

    for (const [kind, id] of [['dry', 'dry-rating'], ['dull', 'dull-rating']]) {
      const selected = Number.isInteger(draftRatings[kind]) ? draftRatings[kind] : record()[kind];
      $(id).replaceChildren(...Array.from({ length: 5 }, (_, score) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = String(score);
        button.dataset.rating = kind; button.dataset.score = String(score);
        button.title = `${kind === 'dry' ? '干燥紧绷' : '暗沉'}程度 ${score}`;
        button.className = selected === score ? 'selected' : '';
        button.setAttribute('aria-pressed', String(selected === score));
        return button;
      }));
    }

    const recent = recentDays(28).reverse().map((d) => ({ d, r: record(dateKey(d)) })).filter(({ r }) => hasUse(r) || r.feeling || Number.isInteger(r.dry) || Number.isInteger(r.dull));
    const timeline = $('timeline-list'); timeline.replaceChildren();
    if (!recent.length) {
      const empty = document.createElement('div'); empty.className = 'empty-timeline'; empty.textContent = '还没有记录。完成一次今日护理，或保存一次肤感，这里就会长出第一条时间线。'; timeline.append(empty);
    } else recent.forEach(({ d, r }) => {
      const row = document.createElement('div'); row.className = 'timeline-row';
      const when = document.createElement('div'); when.className = 'timeline-date'; when.textContent = dateLabel(d);
      const weekday = document.createElement('small'); weekday.textContent = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(d); when.append(weekday);
      const body = document.createElement('div'); body.className = 'timeline-text';
      const title = document.createElement('strong'); title.textContent = hasUse(r) ? `${r.am ? '晨间' : ''}${r.am && r.pm ? ' + ' : ''}${r.pm ? '夜间' : ''}护理` : '今日肤感';
      const notes = [];
      if (r.feeling) notes.push({ comfortable: '状态平稳', dry: '有些干燥', irritated: '刺痛 / 明显泛红' }[r.feeling]);
      if (Number.isInteger(r.dry)) notes.push(`干燥 ${r.dry}/4`);
      if (Number.isInteger(r.dull)) notes.push(`暗沉 ${r.dull}/4`);
      const p = document.createElement('p'); p.textContent = notes.length ? notes.join(' · ') : '已记录使用，尚未留下肤感。';
      body.append(title, p); row.append(when, body); timeline.append(row);
    });

    const reflections = recent.filter(({ r }) => Number.isInteger(r.dry) && Number.isInteger(r.dull));
    if (reflections.length >= 3) {
      const first = reflections[reflections.length - 1].r; const last = reflections[0].r;
      const direction = (a, b) => a === b ? '持平' : a < b ? '较低' : '较高';
      $('insight-text').textContent = `最近与最早一次记录相比，干燥自评${direction(last.dry, first.dry)}，暗沉自评${direction(last.dull, first.dull)}。这只是主观感受的对照，不能证明由这款产品造成；防晒、睡眠和环境也可能影响体验。`;
    } else if (reflections.length) {
      $('insight-text').textContent = `已保存 ${reflections.length} 次完整肤感自评。继续在相近的时间与条件下记录，之后才能更有意义地回看趋势。`;
    } else {
      $('insight-text').textContent = '有了几天连续记录之后，这里会帮助你回顾使用与自评。记录之间的关联不能单独证明因果，还需考虑防晒、睡眠、环境等因素。';
    }
  }

  function render() { renderWhy(); renderRitual(); renderGrowth(); }

  const stepInfo = [
    ['这一步，在做什么？', '面霜在洁面和精华之后使用。涂抹后的柔润感可以立即感受到，但这不能证明深层皮肤状态已经改变。'],
    ['成分与皮肤，如何关联？', '品牌资料将极光甘草复配成分用于焕亮护理，并列出神经酰胺 NP、泛醇等修护保湿相关成分。图中光点仅表示配方作用的概念。'],
    ['长期变化，要如何判断？', '持续记录使用、同条件照片与主观感受，再观察几周的趋势。单独一次自拍或动画，不能证明功效或建立因果。']
  ];
  function renderStep() {
    $('step-title').textContent = stepInfo[selectedStep][0]; $('step-text').textContent = stepInfo[selectedStep][1];
    $('zone-label').textContent = ({ cheek: '脸颊区域', forehead: '额头区域', chin: '下巴区域', center: '面部中央' })[selectedZone] || '面部区域';
    document.querySelectorAll('[data-step]').forEach((b) => { b.classList.toggle('active', Number(b.dataset.step) === selectedStep); b.setAttribute('aria-selected', String(Number(b.dataset.step) === selectedStep)); });
    document.querySelectorAll('[data-zone]').forEach((b) => b.classList.toggle('active', b.dataset.zone === selectedZone));
  }

  const mechanism = {
    cheek: ['脸颊 · 焕亮护理示意', '极光甘草是这款面霜的核心复配成分；光点展示配方设计，不代表此刻测得了美白效果。'],
    forehead: ['额头 · 表层润泽示意', '面霜中的保湿与修护相关成分用于日常护理；动画表示作用原理，真实肤感由你记录。'],
    chin: ['下巴 · 屏障护理示意', '配方包含神经酰胺 NP、泛醇等修护保湿相关成分；这里展示的是知识解释。'],
    center: ['面部中央 · 温和护理示意', '轻柔涂抹并留意当下肤感。产品的长期效果需结合规范记录观察。']
  };
  function triggerMechanism(zone, point) {
    selectedZone = zone; selectedStep = 1; renderStep();
    const [title, copy] = mechanism[zone] || mechanism.cheek;
    arEventTitle.textContent = title; arEventCopy.textContent = copy;
    arEvent.hidden = false; arEvent.classList.remove('fade');
    if (eventTimer) clearTimeout(eventTimer);
    eventTimer = setTimeout(() => { arEvent.classList.add('fade'); setTimeout(() => { if (arEvent.classList.contains('fade')) arEvent.hidden = true; }, 400); }, 4600);
    const x = Math.max(25, Math.min(stage.clientWidth - 25, point?.x ?? stage.clientWidth / 2));
    const y = Math.max(25, Math.min(stage.clientHeight - 25, point?.y ?? stage.clientHeight / 2));
    const bloom = document.createElement('div'); bloom.className = 'ar-bloom';
    bloom.style.left = `${x}px`; bloom.style.top = `${y}px`;
    for (let i = 0; i < 5; i++) bloom.append(document.createElement('span'));
    stage.append(bloom); setTimeout(() => bloom.remove(), 2200);
  }
  async function toggleMirror() {
    if (mirrorStream) { stopMirror(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      $('camera-message').textContent = '请在 HTTPS 手机网页或本机 localhost 打开，才能使用摄像头。'; return;
    }
    const run = ++cameraRun;
    $('camera-toggle').disabled = true;
    $('camera-message').textContent = '正在请求前置摄像头…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (run !== cameraRun) { stream.getTracks().forEach((track) => track.stop()); return; }
      mirrorStream = stream;
      const video = $('camera-video'); video.srcObject = stream; await video.play();
      stage.classList.add('camera-on');
      $('camera-toggle').textContent = '关闭摄像头';
      $('camera-message').textContent = '正在加载面部与手部识别模型，首次打开需要片刻…';
      const { startARMirror } = await import('./ar-mirror.mjs');
      const session = await startARMirror({ video, stage, canvas: overlay,
        onApproach: triggerMechanism, onStatus: (message) => { if (run === cameraRun) $('camera-message').textContent = message; }
      });
      if (run !== cameraRun) { session.stop(); return; }
      arSession = session; stage.classList.add('ar-ready');
    } catch (error) {
      $('camera-message').textContent = mirrorStream ? '实时识别未能启动；可点选画面区域体验机制动画。' : '无法打开摄像头；请检查权限或使用 HTTPS 页面。';
      console.warn('AR mirror unavailable:', error);
    } finally { if (run === cameraRun) $('camera-toggle').disabled = false; }
  }
  function stopMirror() {
    cameraRun += 1;
    arSession?.stop(); arSession = null;
    mirrorStream?.getTracks().forEach((track) => track.stop()); mirrorStream = null;
    $('camera-video').srcObject = null; stage.classList.remove('camera-on', 'ar-ready');
    overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
    $('camera-toggle').disabled = false; $('camera-toggle').textContent = '开启摄像头';
  }

  async function openScanner() {
    stopMirror(); previousFocus = document.activeElement;
    $('scan-modal').hidden = false; $('scan-close').focus();
    $('scan-feedback').textContent = '正在准备摄像头…';
    if (!navigator.mediaDevices?.getUserMedia) { $('scan-feedback').textContent = '当前浏览器不支持摄像头；可点击下方示例。'; return; }
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      $('scan-video').srcObject = scanStream; await $('scan-video').play();
      if (!('BarcodeDetector' in window)) { $('scan-feedback').textContent = '当前浏览器不支持二维码识别；可点击下方示例。'; return; }
      const formats = await BarcodeDetector.getSupportedFormats();
      if (!formats.includes('qr_code')) { $('scan-feedback').textContent = '当前浏览器不支持二维码识别；可点击下方示例。'; return; }
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      $('scan-feedback').textContent = '请扫描谷雨官网产品二维码。';
      scanTimer = setInterval(async () => {
        if (!scanStream || $('scan-video').readyState < 2) return;
        try {
          const codes = await detector.detect($('scan-video'));
          if (!codes.length) return;
          const value = codes[0].rawValue || '';
          if (/guyu\.com\.cn\/item\/8\.html/i.test(value)) { closeScanner(); showTab('mirror', 'lab-section'); }
          else $('scan-feedback').textContent = '这个二维码尚未收录。当前可体验美白奶罐 Pro 示例。';
        } catch (_) { /* Keep the scan view active. */ }
      }, 700);
    } catch (_) { $('scan-feedback').textContent = '无法打开摄像头；可点击下方示例。'; }
  }
  function closeScanner() {
    if (scanTimer) clearInterval(scanTimer); scanTimer = null;
    scanStream?.getTracks().forEach((track) => track.stop()); scanStream = null;
    $('scan-video').srcObject = null; $('scan-modal').hidden = true;
    previousFocus?.focus();
  }

  $('date-label').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.tab, button.dataset.scroll)));
  $('hero-explore').addEventListener('click', () => $('today-focus').scrollIntoView({ behavior: 'smooth' }));
  $('open-lab').addEventListener('click', () => showTab('mirror', 'lab-section'));
  $('open-scanner').addEventListener('click', openScanner);
  $('scan-close').addEventListener('click', closeScanner);
  $('scan-sample').addEventListener('click', () => { closeScanner(); showTab('mirror', 'lab-section'); });
  $('scan-modal').addEventListener('click', (event) => { if (event.target === $('scan-modal')) closeScanner(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('scan-modal').hidden) closeScanner(); });
  document.querySelectorAll('[data-feeling]').forEach((button) => button.addEventListener('click', () => updateToday({ feeling: button.dataset.feeling })));
  for (const part of ['am', 'pm']) $(`log-${part}`).addEventListener('click', () => {
    if (record().feeling === 'irritated' && !record()[part]) { $('why-bottom').textContent = '已选择“刺痛 / 明显泛红”：建议暂停使用，先处理不适。'; $('today-focus').scrollIntoView({ behavior: 'smooth' }); return; }
    updateToday({ [part]: !record()[part] });
  });
  $('camera-toggle').addEventListener('click', toggleMirror);
  document.querySelectorAll('[data-zone]').forEach((button) => button.addEventListener('click', () => {
    const target = button.getBoundingClientRect(), bounds = stage.getBoundingClientRect();
    triggerMechanism(button.dataset.zone, { x: target.left + target.width / 2 - bounds.left, y: target.top + target.height / 2 - bounds.top });
  }));
  document.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => { selectedStep = Number(button.dataset.step); renderStep(); }));
  $('mirror-to-growth').addEventListener('click', () => showTab('growth'));
  document.querySelectorAll('.rating-options').forEach((container) => container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rating]'); if (!button) return;
    const key = button.dataset.rating; const score = Number(button.dataset.score);
    draftRatings[key] = score; renderGrowth(); $('reflection-feedback').textContent = '已选择，点击保存今日感受。';
  }));
  $('save-reflection').addEventListener('click', () => {
    const dry = Number.isInteger(draftRatings.dry) ? draftRatings.dry : record().dry;
    const dull = Number.isInteger(draftRatings.dull) ? draftRatings.dull : record().dull;
    if (Number.isInteger(dry) && Number.isInteger(dull)) {
      updateToday({ dry, dull }); draftRatings = {};
      $('reflection-feedback').textContent = '已保存今日感受 ✓';
    } else $('reflection-feedback').textContent = '请先选择两项感受的程度。';
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopMirror(); if (!$('scan-modal').hidden) closeScanner(); } });
  renderStep(); render();
})();
