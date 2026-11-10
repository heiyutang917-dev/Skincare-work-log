(() => {
  'use strict';
  const FEELINGS = { comfortable: '状态平稳', dry: '有些干燥', irritated: '刺痛 / 明显泛红' };
  const SLEEP_SOURCE = 'https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits';
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const localDate = (key) => new Date(`${key}T12:00:00`);
  const formatDate = (key) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(localDate(key));
  const duration = (minutes) => `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}`;
  const number = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
  function validDate(key, today) {
    return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= '1900-01-01' && key <= today && !Number.isNaN(localDate(key).getTime()) && dateKey(localDate(key)) === key;
  }
  function normalize(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const result = { source: 'manual' };
    if (number(entry.sleepMinutes, 1440)) result.sleepMinutes = entry.sleepMinutes;
    if (number(entry.activityMinutes, 1440)) result.activityMinutes = entry.activityMinutes;
    if (Object.hasOwn(FEELINGS, entry.feeling)) result.feeling = entry.feeling;
    if (typeof entry.note === 'string' && entry.note.trim()) result.note = entry.note.trim().slice(0, 300);
    if (typeof entry.updatedAt === 'string') result.updatedAt = entry.updatedAt;
    return ['sleepMinutes', 'activityMinutes', 'feeling', 'note'].some(key => Object.hasOwn(result, key)) ? result : null;
  }

  function create({ readAll, writeAll, today, navigate, refresh }) {
    let range = 7, selectedFeeling = '', editingDate = today(), dirty = false, dialogReturn = null, pendingDelete = null;
    const $ = (id) => document.getElementById(id);
    const entries = () => Object.fromEntries(Object.entries(readAll()).filter(([key]) => validDate(key, today())).map(([key, value]) => [key, normalize(value)]).filter(([, value]) => value));
    const entry = (key) => normalize(readAll()[key]);
    const element = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };

    $('page-today').querySelector('.note-bar').insertAdjacentHTML('afterend', `
      <article class="life-invite" aria-labelledby="life-invite-title"><div class="life-symbol" aria-hidden="true">◷</div><div><span class="life-overline">可选 · 为自己多留一点记录</span><h2 id="life-invite-title">也记下今天的生活？</h2><p>睡眠、运动和肤感，以后放在一起回看。</p></div><button type="button" class="life-round" data-life-action="today" aria-label="补充今天的生活记录">↗</button></article>`);
    $('page-growth').querySelector('.growth-overview').insertAdjacentHTML('beforebegin', `
      <article class="life-review" aria-labelledby="life-review-title" id="life-review"><header class="life-review-header"><div><span class="life-overline">生活与肤感</span><h2 id="life-review-title">把日常，放在一起看。</h2></div><div class="life-segment" role="group" aria-label="选择回顾时间"><button type="button" data-life-range="7" aria-pressed="true">7 天</button><button type="button" data-life-range="28" aria-pressed="false">28 天</button></div></header><div class="life-summary" id="life-summary"></div><div class="life-sleep-chart" id="life-sleep-chart"></div><div class="life-review-note" id="life-review-note"></div><div class="life-review-actions"><button type="button" class="life-button" data-life-action="today">补充生活记录 <span aria-hidden="true">＋</span></button><button type="button" class="life-text" data-life-action="health">苹果健康接入说明 ↗</button></div><p class="life-status" id="life-review-status" role="status"></p></article>`);
    $('page-growth').querySelector('.timeline-card').insertAdjacentHTML('afterend', `
      <details class="life-data"><summary>管理生活记录</summary><div><p>仅保存在当前浏览器。换手机或清理浏览器前，可先导出保存。</p><button type="button" class="life-button" data-life-action="export" id="life-export">导出生活记录</button><button type="button" class="life-text life-danger" data-life-action="clear" id="life-clear">删除全部生活记录</button><small>删除生活记录会保留原有的护理打卡与肤感自评。</small></div></details>`);
    $('page-growth').querySelector('.timeline-card').previousElementSibling.querySelector('h2').id = 'life-timeline-title';
    $('page-growth').querySelector('.timeline-foot').textContent = '护理与生活按同一天对照；未填写的项目保留空白。记录不代表产品造成了变化。';
    $('page-growth').insertAdjacentHTML('afterend', `
      <section class="page life-page" id="page-lifestyle" aria-labelledby="life-title"><div class="journey-bar"><button type="button" data-life-action="back">← 护理日记</button><span class="journey-progress">自愿填写 · 随时可以跳过</span></div><div class="page-heading"><span class="life-overline">给自己的日常留白</span><h1 id="life-title">今天，过得怎么样？</h1><p>记下睡眠、运动与肌肤感受。<br>不用填满，也值得被留下。</p></div><form class="life-form" id="life-form" novalidate>
        <div class="life-form-date"><label for="life-date">记录日期</label><input id="life-date" type="date" min="1900-01-01" required><span>睡眠归入醒来这一天</span></div>
        <fieldset class="life-field"><legend><span class="life-field-icon" aria-hidden="true">☾</span> 昨晚睡了多久 <small>选填</small></legend><p id="life-sleep-hint">填写实际睡眠时长，不含清醒时间。</p><div class="life-number-pair"><label><input id="life-sleep-hours" type="number" inputmode="numeric" min="0" max="24" step="1" aria-describedby="life-sleep-hint"><span>小时</span></label><label><input id="life-sleep-minutes" type="number" inputmode="numeric" min="0" max="59" step="1" aria-describedby="life-sleep-hint"><span>分钟</span></label></div></fieldset>
        <fieldset class="life-field"><legend><span class="life-field-icon" aria-hidden="true">↗</span> 今天活动了多久 <small>选填</small></legend><p id="life-activity-hint">散步、运动等活动时长；没有活动可填 0。</p><label class="life-number-single"><input id="life-activity" type="number" inputmode="numeric" min="0" max="1440" step="1" aria-label="今天活动分钟数" aria-describedby="life-activity-hint"><span>分钟</span></label></fieldset>
        <fieldset class="life-field"><legend><span class="life-field-icon" aria-hidden="true">◌</span> 此刻的肌肤感受 <small>选填</small></legend><div class="life-feelings" role="group" aria-label="生活记录中的肤感"><button type="button" data-life-feeling="comfortable" aria-pressed="false">状态平稳</button><button type="button" data-life-feeling="dry" aria-pressed="false">有些干燥</button><button type="button" data-life-feeling="irritated" aria-pressed="false">刺痛 / 明显泛红</button></div><p>再次轻点可取消选择。</p></fieldset>
        <div class="life-field life-note-field"><label for="life-note">还有什么想记下 <span>选填</span></label><textarea id="life-note" maxlength="300" rows="3" placeholder="例如：今天在空调房待得比较久"></textarea><span class="life-note-count" id="life-note-count">0 / 300</span></div>
        <p class="life-privacy">由你填写，仅保存在当前浏览器。可随时修改或删除。</p><p id="life-form-status" class="life-status" role="status"></p><button type="submit" class="primary-btn life-save">保存，回看今天 <span aria-hidden="true">↗</span></button><button type="button" class="life-text life-skip" data-life-action="skip">先跳过，查看护理日记</button>
      </form></section>`);
    document.body.insertAdjacentHTML('beforeend', `
      <div class="life-modal" id="life-health-modal" hidden><section role="dialog" aria-modal="true" aria-labelledby="life-health-title" tabindex="-1"><button type="button" class="life-modal-close" data-life-action="close" aria-label="关闭苹果健康说明">×</button><span class="life-overline">苹果健康 · 尚未接入</span><h2 id="life-health-title">让授权，有清楚的用途。</h2><p>当前网页暂不能直接读取苹果健康。现在可以手动记录，后续需要通过 iPhone 应用接入。</p><ul><li><strong>睡眠、运动</strong><span>计划在你主动启用回顾时，逐项申请读取；可以只允许其中一项。</span></li><li><strong>HRV</strong><span>仍在评估用途，暂不读取，也不用于推断肤质、压力或产品效果。</span></li><li><strong>随时可选</strong><span>未授权或没有数据时，照常护理和手动记录。</span></li></ul><p class="life-privacy">目前没有申请健康权限，也没有同步健康数据。</p><a href="https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data" target="_blank" rel="noopener">查看苹果授权说明 ↗</a><button type="button" class="primary-btn" data-life-action="close">知道了</button></section></div>
      <div class="life-modal" id="life-delete-modal" hidden><section role="alertdialog" aria-modal="true" aria-labelledby="life-delete-title" aria-describedby="life-delete-copy" tabindex="-1"><h2 id="life-delete-title">删除这条生活记录？</h2><p id="life-delete-copy"></p><div class="life-delete-actions"><button type="button" class="life-button" data-life-action="close">保留记录</button><button type="button" class="life-button life-danger" data-life-action="confirm-delete">确认删除</button></div><p id="life-delete-status" class="life-status" role="status"></p></section></div>`);

    function fill(key) {
      editingDate = key; const value = entry(key) || {};
      $('life-date').value = key; $('life-date').max = today();
      $('life-sleep-hours').value = value.sleepMinutes === undefined ? '' : Math.floor(value.sleepMinutes / 60);
      $('life-sleep-minutes').value = value.sleepMinutes === undefined ? '' : value.sleepMinutes % 60;
      $('life-activity').value = value.activityMinutes ?? '';
      selectedFeeling = value.feeling || ''; $('life-note').value = value.note || '';
      updateForm(); $('life-form-status').textContent = ''; dirty = false;
      $('life-form').querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    }
    function begin(key = today()) { fill(validDate(key, today()) ? key : today()); navigate('lifestyle'); }
    function updateForm() {
      document.querySelectorAll('[data-life-feeling]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lifeFeeling === selectedFeeling)));
      $('life-note-count').textContent = `${$('life-note').value.length} / 300`;
    }
    function invalid(id, message) { $(id).setAttribute('aria-invalid', 'true'); $('life-form-status').textContent = message; $(id).focus(); }
    function field(id, max) {
      const input = $(id), text = input.value.trim();
      if (input.validity.badInput) return NaN;
      if (!text) return null;
      return /^\d+$/.test(text) && number(Number(text), max) ? Number(text) : NaN;
    }
    $('life-form').addEventListener('input', (event) => { if (event.target.id !== 'life-date') dirty = true; updateForm(); $('life-form-status').textContent = ''; });
    $('life-date').addEventListener('change', () => {
      const key = $('life-date').value;
      if (!validDate(key, today())) { invalid('life-date', '请选择今天或之前的有效日期。'); return; }
      if (dirty && key !== editingDate && !window.confirm('切换日期会放弃还未保存的填写，继续吗？')) { $('life-date').value = editingDate; return; }
      fill(key);
    });
    $('life-form').addEventListener('submit', (event) => {
      event.preventDefault();
      $('life-form').querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
      const key = $('life-date').value;
      if (!validDate(key, today())) return invalid('life-date', '请选择今天或之前的有效日期。');
      const hours = field('life-sleep-hours', 24), minutes = field('life-sleep-minutes', 59), activity = field('life-activity', 1440);
      if (Number.isNaN(hours)) return invalid('life-sleep-hours', '小时请填 0–24 的整数。');
      if (Number.isNaN(minutes)) return invalid('life-sleep-minutes', '分钟请填 0–59 的整数。');
      const sleep = hours === null && minutes === null ? null : (hours || 0) * 60 + (minutes || 0);
      if (sleep > 1440) return invalid('life-sleep-hours', '一天的睡眠时长不能超过 24 小时。');
      if (Number.isNaN(activity)) return invalid('life-activity', '活动时长请填 0–1440 的整数分钟。');
      const value = normalize({ ...(sleep !== null ? { sleepMinutes: sleep } : {}), ...(activity !== null ? { activityMinutes: activity } : {}), feeling: selectedFeeling, note: $('life-note').value });
      if (!value) { $('life-form-status').textContent = '任选一项留下记录，或轻点下方跳过。'; return; }
      value.updatedAt = new Date().toISOString();
      if (!writeAll({ ...readAll(), [key]: value })) { $('life-form-status').textContent = '当前浏览器未能保存，请检查可用空间或浏览器存储设置。填写仍在本页。'; return; }
      dirty = false; refresh(); navigate('growth');
      $('life-review-status').textContent = `${formatDate(key)}的生活记录已保存。给自己留下一点关注，就很好。`;
      if (key < dates(range)[0]) $('life-review-status').textContent += ' 这条记录在当前回顾范围外，可在补记中选择该日期修改。';
      $('life-review').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    function dates(count) {
      const end = localDate(today());
      return Array.from({ length: count }, (_, index) => { const d = new Date(end); d.setDate(end.getDate() - count + 1 + index); return dateKey(d); });
    }
    function render() {
      $('life-date').max = today();
      const days = dates(range), values = days.map(key => entry(key)).filter(Boolean);
      document.querySelectorAll('[data-life-range]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.lifeRange) === range)));
      $('life-timeline-title').textContent = `你的 ${range} 天时间线`;
      const sleep = values.filter(value => value.sleepMinutes !== undefined);
      const activity = values.filter(value => value.activityMinutes !== undefined);
      const summary = $('life-summary'); summary.replaceChildren();
      const average = sleep.length ? duration(Math.round(sleep.reduce((total, value) => total + value.sleepMinutes, 0) / sleep.length)) : '未填写';
      for (const [label, value, detail] of [['生活记录', `${values.length} 天`, `最近 ${range} 天`], ['平均睡眠', average, sleep.length ? `按已填写的 ${sleep.length} 天` : '空白不按 0 计算'], ['活动时长', activity.length ? `${activity.reduce((total, value) => total + value.activityMinutes, 0)} 分钟` : '未填写', activity.length ? `已填写 ${activity.length} 天的合计` : '空白不按 0 计算']]) {
        const cell = element('div', 'life-metric'); cell.append(element('span', '', label), element('strong', '', value), element('small', '', detail)); summary.append(cell);
      }
      const chart = $('life-sleep-chart'); chart.replaceChildren();
      if (sleep.length) {
        const caption = element('div', 'life-chart-caption'); caption.append(element('span', '', '睡眠时长 · 用户填写'), element('span', '', '空白＝未记录'));
        const bars = element('div', 'life-bars'); bars.setAttribute('role', 'img'); bars.setAttribute('aria-label', `${range}天睡眠记录，${sleep.length}天已填写；空白为未记录，逐日数据见下方时间线。`);
        bars.style.setProperty('--life-columns', range);
        const scale = Math.max(8 * 60, ...sleep.map(value => value.sleepMinutes));
        for (const key of days) {
          const minutes = entry(key)?.sleepMinutes, column = element('div', `life-bar${minutes === undefined ? ' is-missing' : ''}`);
          column.title = `${formatDate(key)}：${minutes === undefined ? '未填写' : duration(minutes)}`;
          const bar = element('span'); if (minutes !== undefined) bar.style.height = `${Math.max(3, minutes / scale * 100)}%`;
          column.append(bar); bars.append(column);
        }
        const labels = element('div', 'life-chart-labels'); labels.append(element('span', '', formatDate(days[0])), element('span', '', formatDate(days[days.length - 1]))); chart.append(caption, bars, labels);
      }
      const note = $('life-review-note'); note.replaceChildren();
      note.append(element('strong', '', values.length ? '先看见，再慢慢了解。' : '先留下一天，就有了起点。'));
      note.append(element('p', '', values.length ? `这 ${range} 天中有 ${values.length} 天生活记录。下方可按日期对照护理与肤感，未填写的日期保持空白。这些记录不能证明睡眠、运动或产品造成了肌肤变化。` : '可以只记一项，之后随时补充。没有生活记录也可以照常护理。'));
      const tip = element('div', 'life-gentle-tip');
      if (values.some(value => value.feeling === 'irritated')) {
        tip.append(element('span', '', '回顾提醒：你记录过刺痛或明显泛红。可回看当时的产品与感受；出现不适时，先暂停相关产品。'));
      } else {
        tip.append(element('span', '', '一个小习惯：尽量在相近的时间入睡和起床，让作息更规律。'));
        const source = element('a', '', '建议依据 ↗'); source.href = SLEEP_SOURCE; source.target = '_blank'; source.rel = 'noopener'; tip.append(source);
      }
      note.append(tip);
      const hasAny = Object.keys(entries()).length > 0; $('life-export').disabled = !hasAny; $('life-clear').disabled = !hasAny;
    }
    function appendTimeline(body, key) {
      const value = entry(key); if (!value) return;
      const meta = element('div', 'life-timeline-meta');
      meta.append(element('span', 'life-manual', '生活 · 手动填写'));
      const parts = [`睡眠 ${value.sleepMinutes === undefined ? '未填写' : duration(value.sleepMinutes)}`, `活动 ${value.activityMinutes === undefined ? '未填写' : `${value.activityMinutes}分钟`}`];
      if (value.feeling) parts.push(`肤感：${FEELINGS[value.feeling]}`);
      meta.append(element('p', '', parts.join(' · ')));
      if (value.note) meta.append(element('p', 'life-timeline-note', value.note));
      const actions = element('div', 'life-row-actions');
      for (const [action, label] of [['edit', '修改'], ['delete', '删除']]) { const button = element('button', 'life-text', label); button.type = 'button'; button.dataset.lifeAction = action; button.dataset.lifeDate = key; button.setAttribute('aria-label', `${label}${formatDate(key)}的生活记录`); actions.append(button); }
      meta.append(actions); body.append(meta);
    }
    function openModal(id) { dialogReturn = document.activeElement; $(id).hidden = false; document.body.classList.add('life-modal-open'); $(id).querySelector('button').focus(); }
    function closeModal() { document.querySelectorAll('.life-modal').forEach(modal => { modal.hidden = true; }); document.body.classList.remove('life-modal-open'); pendingDelete = null; if (dialogReturn?.isConnected) dialogReturn.focus(); else $('life-review-title').focus(); }
    function askDelete(key) {
      pendingDelete = key; $('life-delete-title').textContent = key === '*' ? '删除全部生活记录？' : `删除${formatDate(key)}的生活记录？`;
      $('life-delete-copy').textContent = '将删除相应的睡眠、运动、肤感和备注，无法撤销。原有的护理打卡与护理时的肤感自评会保留。';
      $('life-delete-status').textContent = ''; openModal('life-delete-modal');
    }
    document.addEventListener('click', (event) => {
      const feeling = event.target.closest('[data-life-feeling]');
      if (feeling) { selectedFeeling = selectedFeeling === feeling.dataset.lifeFeeling ? '' : feeling.dataset.lifeFeeling; dirty = true; updateForm(); }
      const rangeButton = event.target.closest('[data-life-range]');
      if (rangeButton) { range = Number(rangeButton.dataset.lifeRange) === 28 ? 28 : 7; $('life-review-status').textContent = ''; refresh(); }
      const button = event.target.closest('[data-life-action]'); if (!button) return;
      const action = button.dataset.lifeAction;
      if (action === 'today') begin();
      if (action === 'edit') begin(button.dataset.lifeDate);
      if (action === 'back' || action === 'skip') { navigate('growth'); $('life-review-status').textContent = dirty ? '本次填写尚未保存。随时可以回来补充。' : ''; }
      if (action === 'health') openModal('life-health-modal');
      if (action === 'close') closeModal();
      if (action === 'delete') askDelete(button.dataset.lifeDate);
      if (action === 'clear') askDelete('*');
      if (action === 'confirm-delete' && pendingDelete) {
        const next = { ...readAll() }; if (pendingDelete === '*') Object.keys(next).forEach(key => delete next[key]); else delete next[pendingDelete];
        if (!writeAll(next)) { $('life-delete-status').textContent = '暂时无法保存删除结果，请检查浏览器存储设置。'; return; }
        refresh(); closeModal(); $('life-review-status').textContent = '生活记录已删除，护理记录仍保留。';
      }
      if (action === 'export') {
        const data = { format: 'guyu-lifestyle-v1', exportedAt: new Date().toISOString(), records: entries() };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = `谷雨生活记录-${today()}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        $('life-review-status').textContent = '已生成导出文件；如浏览器打开预览，请用“分享”保存到文件。';
      }
    });
    document.querySelectorAll('.life-modal').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModal(); }));
    document.addEventListener('keydown', event => {
      const modal = [...document.querySelectorAll('.life-modal')].find(el => !el.hidden); if (!modal) return;
      if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
      if (event.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('button,a[href]')].filter(el => !el.disabled), first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    });
    $('life-review-title').tabIndex = -1;
    fill(today());
    return { render, appendTimeline, hasEntry: key => !!entry(key), getRange: () => range };
  }
  // Format interface copy only; user-authored notes retain their original punctuation.
  function applyTypography() {
    const excluded = 'script,style,textarea,input,.life-timeline-note,[data-user-copy]';
    function format(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.parentElement?.closest(excluded) && node.nodeValue.includes('。')) node.nodeValue = node.nodeValue.replace(/。\s*/g, ' ').trimEnd();
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.matches(excluded)) {
        for (const child of node.childNodes) format(child);
      }
    }
    format(document.body);
    new MutationObserver(changes => {
      for (const change of changes) {
        if (change.type === 'characterData') format(change.target);
        else for (const node of change.addedNodes) format(node);
      }
    }).observe(document.body, { childList: true, characterData: true, subtree: true });
  }
  window.GUYU_LIFESTYLE = { create, normalize, validDate, applyTypography };
})();
