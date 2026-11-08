(() => {
  'use strict';

  const STORE = 'guyu-growth-map-v1';
  const CATALOG = window.GUYU_CATALOG || { checkedAt: '未加载', directory: '', products: [] };
  const products = CATALOG.products;
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
  let activeTab = 'welcome';
  let previousFocus = null;
  let draftRatings = {};
  let catalogFamily = 'all';
  const stage = $('camera-stage');
  const overlay = document.createElement('canvas');
  overlay.className = 'ar-overlay'; overlay.setAttribute('aria-hidden', 'true'); stage.append(overlay);
  const arEvent = document.createElement('div');
  arEvent.className = 'ar-event'; arEvent.hidden = true; arEvent.setAttribute('aria-live', 'polite');
  const arEventTitle = document.createElement('strong');
  const arEventCopy = document.createElement('small');
  arEvent.append(arEventTitle, arEventCopy); stage.append(arEvent);
  const skin = new window.GUYU_SKIN.SkinExperience({ panel: document.querySelector('.mirror-panel'), stage,
    onStep: (step) => { selectedStep = step; renderStep(); }
  });
  stage.parentElement.querySelector('.camera-top > span').innerHTML = '<span class="camera-indicator"></span> <span id="camera-mode">点选体验</span>';
  stage.parentElement.querySelector('.camera-foot').insertAdjacentHTML('beforebegin', '<div class="camera-guide"><span id="camera-guidance">先点一个区域，看看作用示意</span><div class="camera-zones" role="group" aria-label="不用相机也可体验"><button type="button" data-zone="cheek">脸颊</button><button type="button" data-zone="forehead">额头</button><button type="button" id="camera-help" aria-expanded="false">手势指引</button></div><div id="camera-help-copy" hidden>① 开启摄像头，让面部与食指进入画面<br>② 抬起食指，看到光点跟随指尖<br>③ 靠近脸颊或额头，光圈从当前位置展开<br>同一款产品只自动播放一次原理，移动时继续显示涟漪<br>手机判断画面位置接近，无法确认真实触碰</div></div>');
  $('camera-help').addEventListener('click', () => {
    const expanded = $('camera-help').getAttribute('aria-expanded') !== 'true';
    $('camera-help').setAttribute('aria-expanded', String(expanded)); $('camera-help-copy').hidden = !expanded;
  });
  $('page-mirror').querySelector('.page-heading p').textContent = '让光点跟随指尖，靠近肌肤，看见护理的作用';
  stage.querySelector('.camera-caption').textContent = '点选脸颊或额头 · 先体验配方示意';
  stage.parentElement.querySelector('.camera-foot > span').textContent = '◈ 通过面部与手指关键点判断画面位置；动画是产品机制示意。';
  $('page-products').insertAdjacentHTML('afterbegin', '<div class="journey-bar"><button type="button" data-journey="welcome">← 首页</button><span class="journey-progress">01 <i></i> 02 <i></i> 03</span></div>');
  $('page-mirror').insertAdjacentHTML('afterbegin', '<div class="journey-bar"><button type="button" data-journey="products">← 产品</button><span class="journey-progress">第 2 步 / 共 3 步</span><button type="button" data-journey="today">去记录 →</button></div>');
  $('page-mirror').querySelector('.page-heading').insertAdjacentHTML('afterend', '<div class="journey-current">本次护理 <strong class="journey-product"></strong><span>作用示意</span></div>');
  $('page-mirror').querySelector('.mirror-layout').insertAdjacentHTML('afterend', '<div class="journey-actions"><button type="button" class="primary-btn" data-journey="today">下一步，记录感受 ↗</button><button type="button" class="journey-link" data-journey="products">更换产品</button></div>');
  $('page-today').insertAdjacentHTML('afterbegin', '<div class="journey-bar"><button type="button" data-journey="mirror">← AR 护理</button><span class="journey-progress">第 3 步 / 共 3 步</span><button type="button" data-journey="growth">稍后记录 →</button></div><div class="journey-current">本次护理 <strong class="journey-product"></strong></div>');
  $('page-today').querySelector('.note-bar').insertAdjacentHTML('afterend', '<div class="journey-actions"><button type="button" class="primary-btn" data-journey="growth">查看护理日记 ↗</button><button type="button" class="journey-link" data-journey="products">再选一款</button></div>');
  $('page-growth').insertAdjacentHTML('afterbegin', '<div class="journey-bar"><button type="button" data-journey="welcome">← 首页</button><span class="journey-progress">每一天，都算数</span><button type="button" data-journey="products">开始护理 →</button></div>');
  $('page-growth').insertAdjacentHTML('beforeend', '<div class="journey-actions"><button type="button" class="primary-btn" data-journey="products">再选一款产品 ↗</button><button type="button" class="journey-link" data-journey="welcome">结束，回到首页</button></div>');
  document.querySelector('.three-grid')?.previousElementSibling?.classList.add('feature-heading');
  $('page-products').querySelector('h1').textContent = '今天，用哪一款？';
  $('page-products').querySelector('.page-heading p').innerHTML = '选择手边的产品，一起看看它如何起作用。<span class="catalog-size">已收录 <strong id="catalog-total">16</strong> 款谷雨产品</span>';
  $('mirror-title').textContent = '看懂这一次护理';
  $('growth-title').textContent = '你的护理日记';
  $('page-growth').querySelector('.page-heading p').textContent = '每一次记录，都是照顾自己的痕迹。';
  $('today-focus').querySelector('h2').textContent = '记录今天的护理';
  $('welcome-date').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date());

  // The drag gesture has an ordinary button alternative for touch and keyboard access.
  const slideTrack = $('slide-entry');
  const slideThumb = $('slide-thumb');
  let slideDrag = null;
  let suppressSlideClick = false;
  function resetSlide() {
    slideDrag = null;
    slideTrack.classList.remove('is-dragging');
    slideTrack.style.setProperty('--slide-x', '0px');
    $('slide-label').textContent = '向右滑动，开始护理';
  }
  slideThumb.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressSlideClick = false;
    slideDrag = { pointer: event.pointerId, start: event.clientX, moved: false, progress: 0 };
    slideThumb.setPointerCapture(event.pointerId);
    slideTrack.classList.add('is-dragging');
  });
  slideThumb.addEventListener('pointermove', (event) => {
    if (!slideDrag || slideDrag.pointer !== event.pointerId) return;
    const distance = event.clientX - slideDrag.start;
    if (Math.abs(distance) > 6) slideDrag.moved = true;
    const travel = Math.max(1, slideTrack.clientWidth - slideThumb.offsetWidth - 12);
    const offset = Math.max(0, Math.min(travel, distance));
    slideDrag.progress = offset / travel;
    slideTrack.style.setProperty('--slide-x', `${offset}px`);
    $('slide-label').textContent = slideDrag.progress >= .85 ? '松开，开始护理' : '向右滑动，开始护理';
  });
  slideThumb.addEventListener('pointerup', (event) => {
    if (!slideDrag || slideDrag.pointer !== event.pointerId) return;
    const complete = slideDrag.progress >= .85;
    suppressSlideClick = slideDrag.moved;
    resetSlide();
    if (slideThumb.hasPointerCapture(event.pointerId)) slideThumb.releasePointerCapture(event.pointerId);
    if (complete) showTab('products');
  });
  const cancelSlide = () => { if (slideDrag) { suppressSlideClick = true; resetSlide(); } };
  slideThumb.addEventListener('pointercancel', cancelSlide);
  slideThumb.addEventListener('lostpointercapture', cancelSlide);
  slideThumb.addEventListener('click', (event) => {
    if (event.detail === 0 || !suppressSlideClick) { resetSlide(); showTab('products'); }
    suppressSlideClick = false;
  });

  try {
    const stored = JSON.parse(localStorage.getItem(STORE));
    if (stored && stored.records && typeof stored.records === 'object' && !Array.isArray(stored.records)) state = stored;
  } catch (_) { /* The prototype still works if browser storage is blocked. */ }

  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {} }
  const lifestyle = window.GUYU_LIFESTYLE.create({
    readAll: () => state.lifestyle && typeof state.lifestyle === 'object' && !Array.isArray(state.lifestyle) ? state.lifestyle : {},
    writeAll: (entries) => {
      const next = { ...state, lifestyle: entries };
      try { localStorage.setItem(STORE, JSON.stringify(next)); state = next; return true; } catch (_) { return false; }
    },
    today, navigate: (tab) => showTab(tab), refresh: () => render()
  });
  function productById(id) { return products.find((product) => product.id === id); }
  function activeProduct() { return productById(state.selectedProductId) || productById('cream-pro') || products[0]; }
  function makeChip(value) { const chip = document.createElement('span'); chip.textContent = value; return chip; }
  function record(key = today()) { return state.records[key] || {}; }
  function updateToday(change) {
    const key = today();
    state.records[key] = { ...record(key), ...change };
    save(); render();
  }

  function selectProduct(id, goToToday = true) {
    if (!productById(id)) return;
    skin.stop(); clearTimeout(eventTimer); arEvent.hidden = true; selectedStep = 0; selectedZone = 'cheek';
    state.selectedProductId = id;
    save(); render(); renderStep(); renderCatalog();
    if (goToToday) showTab('mirror');
  }

  function renderTodayProduct() {
    const product = activeProduct(); if (!product) return;
    $('today-product-family').textContent = product.family === '双效护理' ? '谷雨双效护理产品' : `谷雨${product.family}系列`;
    $('today-product-short').textContent = product.short;
    $('today-product-name').textContent = product.name;
    document.querySelectorAll('.journey-product').forEach((element) => { element.textContent = product.short; });
    $('today-bottle-name').textContent = product.short;
    const visual = document.querySelector('.product-bottle');
    let photo = visual.querySelector('.today-product-photo');
    if (!photo) {
      photo = document.createElement('img');
      photo.id = 'today-product-image';
      photo.className = 'today-product-photo';
      photo.onload = () => visual.classList.add('has-photo');
      photo.onerror = () => visual.classList.remove('has-photo');
      visual.append(photo);
    }
    photo.src = product.image;
    photo.alt = `谷雨${product.short}官方产品图`;
    $('today-product-tags').replaceChildren(...[...product.ingredients.slice(0, 2), ...product.effects.slice(0, 1)].map(makeChip));
    $('today-product-source').href = product.source;
    $('today-product-source').textContent = `查看${product.sourceType} ↗`;
    $('today-product-use').textContent = `${product.use} 首次使用可先局部测试；如有不适，请停止使用。`;
    $('today-use-source').href = product.source;
    for (const part of ['am', 'pm']) {
      $(`log-${part}`).querySelector('.ritual-main small').textContent = `当前选择：${product.short}`;
    }
  }

  function renderLab() {
    const product = activeProduct(); if (!product) return;
    for (const [id, label] of [['lab-origin', '所属系列'], ['lab-active', '公开核心成分'], ['lab-formula', '产品特点'], ['lab-goal', '官网功效']]) {
      $(id).previousElementSibling.textContent = label;
    }
    $('lab-product-name').textContent = `当前产品：${product.short}`;
    $('lab-origin').textContent = product.family;
    $('lab-active').textContent = product.ingredients.slice(0, 2).join(' · ');
    $('lab-formula').textContent = product.feature;
    $('lab-goal').textContent = product.effects.slice(0, 2).join(' + ');
    $('lab-evidence-title').textContent = `${product.short}为什么这样设计？`;
    $('lab-evidence-copy').textContent = window.GUYU_SKIN.profile(product).pending ? '本次读取的详情与目录名称不一致，此处仅保留历史产品资料；专属成分机制待复核。请以包装与品牌最新说明为准。' : `${product.mechanism} ${product.evidence}`;
    $('lab-evidence-tags').replaceChildren(...[product.sourceType, ...product.effects.slice(0, 2), '实际效果因人而异'].map(makeChip));
    $('lab-evidence-source').href = product.source;
    $('lab-evidence-source').textContent = `阅读${product.sourceType} ↗`;
  }

  function renderCatalog() {
    $('catalog-total').textContent = String(products.length);
    $('catalog-date').textContent = CATALOG.checkedAt;
    const query = $('catalog-search').value.trim().toLocaleLowerCase('zh-CN');
    const filtered = products.filter((product) => (catalogFamily === 'all' || product.family === catalogFamily) &&
      (!query || [product.name, product.short, product.family, product.type, product.feature, ...product.ingredients, ...product.effects].join(' ').toLocaleLowerCase('zh-CN').includes(query)));
    $('catalog-count').textContent = `共 ${filtered.length} 款产品`;
    const grid = $('catalog-grid'); grid.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement('div'); empty.className = 'catalog-empty';
      empty.textContent = '没有找到匹配的产品。试试产品昵称、成分或功效。'; grid.append(empty); return;
    }
    for (const product of filtered) {
      const card = document.createElement('article'); card.className = `catalog-card${state.selectedProductId === product.id ? ' selected' : ''}`;
      const figure = document.createElement('figure'); figure.className = 'catalog-photo';
      const photo = document.createElement('img'); photo.src = product.image; photo.alt = `${product.short}产品外观`;
      photo.loading = 'lazy'; photo.decoding = 'async';
      const credit = document.createElement('figcaption');
      const imageSource = document.createElement('a'); imageSource.href = product.imageSource;
      imageSource.target = '_blank'; imageSource.rel = 'noopener'; imageSource.textContent = '图片来自谷雨官网 ↗';
      credit.append(imageSource); figure.append(photo, credit);
      const top = document.createElement('div'); top.className = 'catalog-card-top';
      const family = document.createElement('span'); family.className = 'catalog-family'; family.textContent = product.family;
      const kind = document.createElement('span'); kind.className = 'catalog-kind'; kind.textContent = product.type; top.append(family, kind);
      const title = document.createElement('h3'); title.textContent = product.short;
      const fullName = document.createElement('small'); fullName.textContent = product.name; title.append(fullName);
      const feature = document.createElement('p'); feature.className = 'catalog-benefit'; feature.textContent = product.effects.slice(0, 2).join(' · ');
      const ingredientWrap = document.createElement('div'); ingredientWrap.className = 'catalog-chips'; ingredientWrap.replaceChildren(...product.ingredients.map(makeChip));
      const ingredientLabel = document.createElement('div'); ingredientLabel.className = 'catalog-label'; ingredientLabel.textContent = '官网公开核心成分';
      const effectWrap = document.createElement('div'); effectWrap.className = 'catalog-chips effects'; effectWrap.replaceChildren(...product.effects.map(makeChip));
      const effectLabel = document.createElement('div'); effectLabel.className = 'catalog-label'; effectLabel.textContent = '官网公开功效';
      const ingredients = document.createElement('div'); ingredients.className = 'catalog-info'; ingredients.append(ingredientLabel, ingredientWrap);
      const effects = document.createElement('div'); effects.className = 'catalog-info'; effects.append(effectLabel, effectWrap);
      const details = document.createElement('details'); details.className = 'catalog-details';
      const summary = document.createElement('summary'); summary.textContent = '成分与功效';
      const detailBody = document.createElement('div'); detailBody.className = 'catalog-detail-body';
      if (window.GUYU_SKIN.profile(product).pending) {
        const notice = document.createElement('p'); notice.className = 'source-pending'; notice.textContent = '资料待复核：本次详情名称与目录不一致。以下为历史快照，专属机制暂不展示。'; detailBody.append(notice);
      }
      detailBody.append(ingredients, effects);
      for (const [label, value] of [['产品特点', product.feature], ['使用方式', product.use], ['作用解释', product.mechanism], ['公开依据', product.evidence]]) {
        const line = document.createElement('p'); const strong = document.createElement('strong'); strong.textContent = `${label}：`;
        line.append(strong, document.createTextNode(value)); detailBody.append(line);
      }
      const source = document.createElement('a'); source.href = product.source; source.target = '_blank'; source.rel = 'noopener'; source.textContent = `查看${product.sourceType} ↗`; detailBody.append(source);
      details.append(summary, detailBody);
      const actions = document.createElement('div'); actions.className = 'catalog-card-actions';
      const select = document.createElement('button'); select.className = 'catalog-select'; select.type = 'button'; select.dataset.selectProduct = product.id;
      select.textContent = '用这一款 ↗';
      select.setAttribute('aria-label', `选择${product.short}，进入 AR 护理`);
      actions.append(select); card.append(figure, top, title, feature, details, actions); grid.append(card);
    }
  }

  function showTab(tab, scrollId) {
    activeTab = tab;
    document.body.classList.toggle('is-welcome', tab === 'welcome');
    document.querySelectorAll('.page').forEach((el) => el.classList.toggle('active', el.id === `page-${tab}`));
    const navTab = tab === 'lifestyle' ? 'growth' : ['mirror', 'today'].includes(tab) ? 'products' : tab;
    document.querySelectorAll('.mobile-nav [data-tab], .nav-item[data-tab]').forEach((el) => {
      const current = el.dataset.tab === navTab;
      el.classList.toggle('active', current);
      if (current) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    if (tab === 'welcome') resetSlide();
    if (tab !== 'mirror') { stopMirror(); skin.stop(); clearTimeout(eventTimer); arEvent.hidden = true; }
    window.scrollTo({ top: 0, behavior: 'instant' });
    const heading = $(`page-${tab}`).querySelector('h1, h2');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    if (scrollId) setTimeout(() => $(scrollId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }

  function renderWhy() {
    const feeling = record().feeling;
    const product = activeProduct();
    const content = {
      comfortable: ['状态平稳时，把护理做得有规律。', `官网公开资料将${product.short}用于${product.effects.slice(0, 2).join('、')}护理。按产品说明使用，并留意真实肤感。`, '好状态也值得记录；可观察变化需要更长时间和相近条件。'],
      dry: ['今天，先关注干燥与紧绷。', `${product.short}的公开资料列有${product.effects.includes('保湿') ? '保湿' : product.effects[0]}功效。先观察使用后的实际肤感，不用动画推断屏障状态。`, '若干燥持续或加重，调整使用方式并寻求专业意见。'],
      irritated: ['出现刺痛或明显泛红时，先暂停。', '暂时不要为了完成打卡继续使用。停止可疑产品；若反应持续或严重，请咨询皮肤科专业人士。', '今天的图谱可以留下一条感受记录，无需完成产品使用。']
    };
    const [title, copy, bottom] = content[feeling] || ['今天，先照顾好肌肤的感受。', `已选${product.short}。先记录今天的肤感，再决定是否按说明使用。`, '你的选择会改变今日提示；这不是皮肤诊断。'];
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
      if (r[part]) $(`log-${part}`).querySelector('.ritual-main small').textContent = r[`${part}ProductId`] ? `已记录：${productById(r[`${part}ProductId`])?.short || '产品已更新'}` : '旧版记录：未标注产品';
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

    const recent = recentDays(lifestyle.getRange()).reverse().map((d) => ({ d, r: record(dateKey(d)) })).filter(({ d, r }) => hasUse(r) || r.feeling || Number.isInteger(r.dry) || Number.isInteger(r.dull) || lifestyle.hasEntry(dateKey(d)));
    const timeline = $('timeline-list'); timeline.replaceChildren();
    if (!recent.length) {
      const empty = document.createElement('div'); empty.className = 'empty-timeline'; empty.textContent = '还没有记录。完成一次今日护理，或保存一次肤感，这里就会长出第一条时间线。'; timeline.append(empty);
    } else recent.forEach(({ d, r }) => {
      const row = document.createElement('div'); row.className = 'timeline-row';
      const when = document.createElement('div'); when.className = 'timeline-date'; when.textContent = dateLabel(d);
      const weekday = document.createElement('small'); weekday.textContent = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(d); when.append(weekday);
      const body = document.createElement('div'); body.className = 'timeline-text';
      const title = document.createElement('strong'); title.textContent = hasUse(r) ? `${r.am ? '晨间' : ''}${r.am && r.pm ? ' + ' : ''}${r.pm ? '夜间' : ''}护理` : r.feeling || Number.isInteger(r.dry) || Number.isInteger(r.dull) ? '护理时的肤感' : '生活记录';
      const notes = [];
      if (r.am || r.pm) {
        const usedProducts = [...new Set([r.am && r.amProductId, r.pm && r.pmProductId].filter(Boolean))].map((id) => productById(id)?.short).filter(Boolean);
        notes.push(usedProducts.length ? `使用：${usedProducts.join('、')}` : '旧版护理记录：未标注产品');
      }
      if (r.feeling) notes.push({ comfortable: '状态平稳', dry: '有些干燥', irritated: '刺痛 / 明显泛红' }[r.feeling]);
      if (Number.isInteger(r.dry)) notes.push(`干燥 ${r.dry}/4`);
      if (Number.isInteger(r.dull)) notes.push(`暗沉 ${r.dull}/4`);
      const p = document.createElement('p'); p.textContent = notes.length ? notes.join(' · ') : hasUse(r) ? '已记录使用，尚未留下肤感。' : '当天尚无护理打卡。';
      body.append(title, p); lifestyle.appendTimeline(body, dateKey(d)); row.append(when, body); timeline.append(row);
    });

    const reflections = recent.filter(({ r }) => Number.isInteger(r.dry) && Number.isInteger(r.dull));
    if (reflections.length >= 3) {
      const first = reflections[reflections.length - 1].r; const last = reflections[0].r;
      const direction = (a, b) => a === b ? '持平' : a < b ? '较低' : '较高';
      $('insight-text').textContent = `最近与最早一次记录相比，干燥自评${direction(last.dry, first.dry)}，暗沉自评${direction(last.dull, first.dull)}。这只是主观感受的对照，不能证明由某款产品造成；防晒、睡眠和环境也可能影响体验。`;
    } else if (reflections.length) {
      $('insight-text').textContent = `已保存 ${reflections.length} 次完整肤感自评。继续在相近的时间与条件下记录，之后才能更有意义地回看趋势。`;
    } else {
      $('insight-text').textContent = '有了几天连续记录之后，这里会帮助你回顾使用与自评。记录之间的关联不能单独证明因果，还需考虑防晒、睡眠、环境等因素。';
    }
  }

  function render() { renderTodayProduct(); renderWhy(); renderRitual(); renderGrowth(); renderLab(); lifestyle.render(); }

  function renderStep() {
    const product = activeProduct();
    skin.render(product, selectedStep);
    $('camera-guidance').textContent = product.area === 'eye' ? '眼周产品：点选查看原理，无需触碰眼周' : mirrorStream ? '光点跟随食指，首次靠近时展开原理' : '先轻点一个区域，原理只自动展开一次';
    document.querySelectorAll('[data-zone]').forEach((b) => b.classList.toggle('active', b.dataset.zone === selectedZone));
  }

  function triggerMechanism(zone, point) {
    selectedZone = zone;
    if (!point?.camera) {
      const ripple = document.createElement('div'); ripple.className = 'ar-touch'; ripple.setAttribute('aria-hidden', 'true');
      ripple.style.left = `${point?.x ?? stage.clientWidth * .29}px`; ripple.style.top = `${point?.y ?? stage.clientHeight * .58}px`; stage.append(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      stage.querySelectorAll('.ar-touch').forEach((el, index, list) => { if (index < list.length - 6) el.remove(); });
    }
    if (!skin.trigger(point)) return;
    const product = activeProduct();
    const zoneName = ({ cheek: '脸颊', forehead: '额头', chin: '下巴', center: '面部中央' })[zone] || '面部';
    arEventTitle.textContent = `${zoneName} · ${window.GUYU_SKIN.profile(product).title}`;
    arEventCopy.textContent = product.area === 'eye' ? '此处仅讲解眼周配方，不指引在该区域涂抹。' : '局部图为配方示意；下方可暂停、重播与查看依据。';
    arEvent.hidden = false; arEvent.classList.remove('fade');
    if (eventTimer) clearTimeout(eventTimer);
    eventTimer = setTimeout(() => { arEvent.hidden = true; }, 3200);
  }
  async function toggleMirror() {
    if (mirrorStream) { stopMirror(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      $('camera-message').textContent = '当前环境无法开启摄像头。可点选脸颊或额头体验；相机需在 HTTPS 链接中使用。'; return;
    }
    const run = ++cameraRun;
    $('camera-toggle').disabled = true;
    $('camera-mode').textContent = '等待相机权限';
    $('camera-message').textContent = '正在请求前置摄像头…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (run !== cameraRun) { stream.getTracks().forEach((track) => track.stop()); return; }
      mirrorStream = stream;
      const video = $('camera-video'); video.srcObject = stream; await video.play();
      if (run !== cameraRun) { stream.getTracks().forEach((track) => track.stop()); return; }
      stage.classList.add('camera-on');
      $('camera-toggle').textContent = '关闭摄像头';
      $('camera-toggle').disabled = false;
      $('camera-mode').textContent = '准备手势识别';
      renderStep();
      $('camera-message').textContent = '正在加载面部与手部识别模型，首次打开需要片刻…';
      const { startARMirror } = await import('./ar-mirror.mjs?v=finger1');
      if (run !== cameraRun) return;
      const session = await startARMirror({ video, stage, canvas: overlay,
        onApproach: (zone, point) => { if (run === cameraRun) triggerMechanism(zone, point); },
        onFace: (bounds) => { if (run === cameraRun) skin.follow(bounds); },
        onPointer: (point) => { if (run === cameraRun && point) skin.track(point); },
        onFallback: () => { if (run === cameraRun) { stage.classList.remove('ar-ready'); $('camera-mode').textContent = '相机 · 点选可用'; skin.clearAnchor(); } },
        onStatus: (message) => { if (run === cameraRun) $('camera-message').textContent = message; }
      });
      if (run !== cameraRun) { session.stop(); return; }
      arSession = session; stage.classList.add('ar-ready'); $('camera-mode').textContent = '面部与手指识别中';
    } catch (error) {
      if (run !== cameraRun) return;
      if (mirrorStream && !stage.classList.contains('camera-on')) { mirrorStream.getTracks().forEach(track => track.stop()); mirrorStream = null; $('camera-video').srcObject = null; }
      $('camera-mode').textContent = mirrorStream ? '相机 · 点选可用' : '点选体验';
      $('camera-message').textContent = mirrorStream ? '实时识别暂不可用，仍可点选脸颊或额头查看动画。' : error.name === 'NotAllowedError' ? '未获相机权限，点选体验仍可使用。需要相机时可在浏览器设置中允许。' : '暂时无法打开相机，可先点选区域体验原理。';
    } finally { if (run === cameraRun) $('camera-toggle').disabled = false; }
  }
  function stopMirror() {
    cameraRun += 1;
    arSession?.stop(); arSession = null;
    mirrorStream?.getTracks().forEach((track) => track.stop()); mirrorStream = null;
    $('camera-video').srcObject = null; stage.classList.remove('camera-on', 'ar-ready');
    overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
    stage.querySelectorAll('.ar-touch').forEach(el => el.remove());
    $('camera-toggle').disabled = false; $('camera-toggle').textContent = '开启摄像头';
    $('camera-mode').textContent = '点选体验';
    $('camera-message').textContent = '相机未开启；点选体验可用。画面仅在本页处理。';
    skin.pause(); skin.clearAnchor();
    if (skin.product) renderStep();
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
           let matched = null;
           try {
             const url = new URL(value);
             if (/^(?:www\.)?guyu\.com\.cn$/i.test(url.hostname)) matched = products.find((product) => new URL(product.source).pathname === url.pathname);
           } catch (_) { /* Ignore non-URL QR codes. */ }
           if (matched) { closeScanner(); selectProduct(matched.id, false); showTab('mirror', 'lab-section'); }
           else $('scan-feedback').textContent = '该二维码未匹配到已收录的官网产品；可到产品库搜索。';
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
  $('hero-explore').addEventListener('click', () => showTab('products'));
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-journey]');
    if (button) showTab(button.dataset.journey);
  });
  $('open-lab').addEventListener('click', () => showTab('mirror', 'lab-section'));
  $('open-library').addEventListener('click', () => showTab('products'));
  $('catalog-search').addEventListener('input', renderCatalog);
  $('catalog-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-family]'); if (!button) return;
    catalogFamily = button.dataset.family;
    $('catalog-filters').querySelectorAll('[data-family]').forEach((item) => {
      const selected = item === button; item.classList.toggle('active', selected); item.setAttribute('aria-pressed', String(selected));
    });
    renderCatalog();
  });
  $('catalog-grid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-select-product]');
    if (button) selectProduct(button.dataset.selectProduct);
  });
  $('open-scanner').addEventListener('click', openScanner);
  $('scan-close').addEventListener('click', closeScanner);
  $('scan-sample').addEventListener('click', () => { closeScanner(); showTab('products'); });
  $('scan-modal').addEventListener('click', (event) => { if (event.target === $('scan-modal')) closeScanner(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('scan-modal').hidden) closeScanner(); });
  document.querySelectorAll('[data-feeling]').forEach((button) => button.addEventListener('click', () => updateToday({ feeling: button.dataset.feeling })));
  for (const part of ['am', 'pm']) $(`log-${part}`).addEventListener('click', () => {
    if (record().feeling === 'irritated' && !record()[part]) { $('why-bottom').textContent = '已选择“刺痛 / 明显泛红”：建议暂停使用，先处理不适。'; $('today-focus').scrollIntoView({ behavior: 'smooth' }); return; }
    const nowDone = !record()[part];
    updateToday({ [part]: nowDone, [`${part}ProductId`]: nowDone ? activeProduct().id : null });
  });
  $('camera-toggle').addEventListener('click', toggleMirror);
  document.querySelectorAll('[data-zone]').forEach((button) => button.addEventListener('click', () => {
    const target = button.getBoundingClientRect(), bounds = stage.getBoundingClientRect();
    const point = stage.contains(button) ? { x: target.left + target.width / 2 - bounds.left, y: target.top + target.height / 2 - bounds.top } :
      { x: bounds.width * (button.dataset.zone === 'forehead' ? .5 : .29), y: bounds.height * (button.dataset.zone === 'forehead' ? .28 : .58) };
    triggerMechanism(button.dataset.zone, point);
  }));
  document.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => skin.choose(Number(button.dataset.step))));
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
  renderStep(); render(); renderCatalog();
  window.GUYU_LIFESTYLE.applyTypography();
})();
