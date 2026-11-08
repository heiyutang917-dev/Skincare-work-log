(() => {
  'use strict';
  // These are editorial illustrations of the cited brand descriptions, not measured anatomy.
  const themes = {
    bright: { title: '焕亮护理', color: '#9d8757', focus: '黑色素相关环节', titleStep: '光甘草定，参与焕亮配方', copy: '品牌将极光甘草中的光甘草定与黑色素相关过程联系起来。图中金色光点与连线用来解释这一配方方向，不表示色斑正在消失。', observe: '用相近光线下的记录回看肤色感受；一次涂抹和动画都不能证明已经变白。', legend: '金色节点：焕亮配方思路' },
    barrier: { title: '保湿修护', color: '#648f7e', focus: '角质层护理', titleStep: '先了解肌肤的外层', copy: '品牌将此款产品用于保湿、修护及舒缓护理。砖块与间隙借喻角质层的结构，绿色边缘代表护理方向；这不是对屏障完整度的检测。', observe: '留意使用前后的干燥、紧绷与舒适度；凉感和柔润感不等于屏障已经修复。', legend: '绿色边缘：保湿修护方向' },
    oil: { title: '滋润封层', color: '#a78a68', focus: '表面滋润层', titleStep: '油脂，让表面多一层滋润', copy: '官网介绍此款油霜含有较丰富的油脂。表面薄膜和水滴示意滋润、减少水分散失的配方思路；膜的厚度和水滴数量没有测量含义。', observe: '关注涂后滋润感、厚重感与紧绷变化；焕亮功效需要更长期的观察。', legend: '薄膜与水滴：滋润配方思路' },
    firm: { title: '紧致护理', color: '#9a805d', focus: '支撑结构概念', titleStep: '从人参皂苷 CK 看配方方向', copy: '品牌把稀有人参皂苷 CK 与胶原相关研究联系起来，用于抗皱紧致配方。网状线条仅代表支撑结构这一概念，不展示成分渗透深度或个人胶原增生。', observe: '把使用记录和细纹、肤感的长期自评一起回看；网格亮起不代表肌肤已经提拉。', legend: '网状线条：支撑结构概念' },
    signal: { title: '抗皱配方', color: '#66897b', focus: '配方信号概念', titleStep: 'HME，如何进入配方思路', copy: '品牌将细胞泌素 HME 用于抗皱与紧致护理。相连节点借喻配方研究中的信号概念；这里不模拟细胞年龄、基因改变或真实吸收路径。', observe: '按产品说明使用，持续记录肤感。动画的节点变化不代表个人细胞状态发生改变。', legend: '相连节点：配方研究概念' },
    hydration: { title: '喷雾保湿', color: '#5b91a0', focus: '表面水润感', titleStep: '先看见喷雾的护理过程', copy: '官网将这款喷雾用于保湿，并以人参皂苷 CK 介绍紧致配方。水滴落在表面示意喷雾过程；不意味着它能被实时测得吸收，也不代表即时补充胶原。', observe: '可以记录喷后肤感；紧致效果与即时水润感应分开看待。', legend: '水滴：喷雾与表面护理示意' },
    eye: { title: '眼周护理', color: '#a48c64', focus: '眼周护理概念', titleStep: '眼周护理，需要更轻柔', copy: '官网以极光甘草介绍眼周焕亮配方，并提到保湿修护。弧线与光点仅指代眼周护理方向，不代表黑眼圈被实时识别或改善。', observe: '此页用点选体验即可。眼周实际用法以包装为准，避免接触眼球，不必为触发动画去触碰眼周。', legend: '弧线：眼周护理概念' },
    pending: { title: '资料待复核', color: '#829087', focus: '保留用法示意', titleStep: '这款产品的资料正在核对', copy: '本次读取的官网详情名称与目录名称不一致，暂不展示专属成分机制。已有成分与功效保留为历史资料，使用方式以手边包装为准。', observe: '可以记录实际使用与肤感。资料未核实前，不用其他产品的机制替代这款产品。', legend: '仅显示表面接触示意' }
  };
  const byProduct = {
    'hme-serum': 'signal', 'light-water': 'bright', 'ginseng-water': 'firm',
    'cream-pro': 'bright', 'ginseng-milk': 'pending', 'ginseng-cream': 'firm',
    'oil-cream': 'oil', 'ice-cream': 'barrier', 'black-ampoule': 'firm',
    'eye-cream': 'eye', 'collagen-spray': 'hydration', 'spot-serum': 'bright',
    'collagen-stick': 'firm', 'bright-mask': 'pending', 'hme-mask': 'signal', 'hme-cream': 'signal'
  };
  function profile(product) {
    const key = byProduct[product?.id] || 'pending';
    const theme = themes[key];
    return { key, ...theme, pending: key === 'pending', steps: [
      ['接触皮肤表面', key === 'pending' ? '先按产品包装了解使用方式。此处只展示接触表面的概念，不说明未经核验的作用路径。' : product.use],
      [theme.titleStep, theme.copy], ['把感受留给时间', theme.observe]
    ] };
  }
  // All SVG strings are static artwork; no user or product values are interpolated.
  function scene() {
    const cells = Array.from({ length: 18 }, (_, i) => `<rect x="${54 + (i % 6) * 44 + (Math.floor(i / 6) % 2) * 10}" y="${107 + Math.floor(i / 6) * 21}" width="39" height="16" rx="5"/>`).join('');
    const drops = [86, 132, 180, 232, 288].map((x, i) => `<circle class="skin-particle" cx="${x}" cy="66" r="${i % 2 ? 4 : 6}" style="--delay:${i * .3}s"/>`).join('');
    return `<svg class="skin-svg" viewBox="0 0 400 240" aria-hidden="true">
      <ellipse cx="200" cy="218" rx="154" ry="12" fill="#37533e" opacity=".06"/>
      <path d="M42 153L335 153 360 175 66 175Z" fill="#d9c9b8"/><path d="M66 175H360v29H66Z" fill="#d1bcaa"/>
      <g class="skin-network" fill="none" stroke="currentColor" stroke-width="2"><path d="m74 186 40-12 37 21 41-19 37 22 40-24 37 19 38-13M76 197l39-23 37 10 40-8 36 10 41-12 37 10 38-4"/><path class="skin-signal" d="m74 186 40-12 37 21 41-19 37 22 40-24 37 19 38-13" stroke-width="4"/></g>
      <path d="M42 97L335 97 360 116 66 116Z" fill="#dbe4d7"/><path d="M66 116H360v52H66Z" fill="#e0e7dc"/>
      <g class="skin-cells" fill="#f8f8ef" stroke="#c3d2bf" stroke-width="1">${cells}</g>
      <path class="skin-barrier" d="M63 126h286M73 148h276M99 108v51m44-51v51m44-51v51m44-51v51m44-51v51m44-51v51" stroke="currentColor" stroke-width="3" fill="none"/>
      <path d="M42 80L335 80 360 99 66 99Z" fill="#f1ece0" stroke="#fff"/><path d="M66 99H360v7H66Z" fill="#e3d9c6"/>
      <path class="skin-film" d="M43 76L336 76 361 95 66 95Z" fill="currentColor" opacity=".28"/>
      <g class="skin-drops" fill="currentColor">${drops}</g>
      <g class="skin-bright" fill="currentColor"><circle cx="119" cy="148" r="7"/><circle cx="201" cy="147" r="7"/><circle cx="286" cy="149" r="7"/><path d="M119 145v-23m82 23v-23m85 23v-23" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 4"/></g>
      <g class="skin-messages" fill="#f7faf0" stroke="currentColor" stroke-width="2"><path d="m94 135 54-13 54 22 55-22 56 13" fill="none" stroke-dasharray="3 5"/><circle cx="94" cy="135" r="8"/><circle cx="148" cy="122" r="8"/><circle cx="202" cy="144" r="8"/><circle cx="257" cy="122" r="8"/><circle cx="313" cy="135" r="8"/></g>
      <g class="skin-eye" fill="none" stroke="currentColor" stroke-width="2"><path d="M110 54q90-48 180 0M110 58q90 42 180 0"/><path d="M130 79q70 27 140 0" stroke-dasharray="4 5"/></g>
    </svg>`;
  }
  class SkinExperience {
    constructor({ panel, stage, onStep }) {
      this.panel = panel; this.stage = stage; this.onStep = onStep;
      this.product = null; this.step = 0; this.playing = false; this.timer = null; this.frame = null; this.anchor = null;
      this.autoShown = new Set();
      this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      panel.innerHTML = `<div class="mechanism-heading"><div><div class="panel-eyebrow">配方原理 · 分步了解</div><h2 id="mechanism-title"></h2></div><span class="mechanism-counter" id="mechanism-counter">01 / 03</span></div>
        <div class="mechanism-scene"><span class="mechanism-label">皮肤分层示意 · 非检测</span>${scene()}<div class="skin-layer-labels"><span>皮肤表面</span><span>角质层</span><span>更深层结构示意</span></div><span class="mechanism-legend"></span></div>
        <div class="mechanism-controls"><button type="button" id="mechanism-play">播放讲解</button><button type="button" id="mechanism-replay">重新播放</button><button type="button" id="mechanism-next">下一段 →</button></div>
        <div class="step-tabs" role="tablist" aria-label="原理讲解步骤"><button id="mechanism-tab-0" class="active" data-step="0" role="tab" aria-controls="mechanism-copy">接触表面</button><button id="mechanism-tab-1" data-step="1" role="tab" aria-controls="mechanism-copy">配方原理</button><button id="mechanism-tab-2" data-step="2" role="tab" aria-controls="mechanism-copy">长期观察</button></div>
        <div class="step-copy" id="mechanism-copy" role="tabpanel" aria-live="polite"><strong id="step-title"></strong><p id="step-text"></p></div>
        <div class="mechanism-ingredients"><span>官网公开核心成分</span><div id="mechanism-ingredients"></div></div>
        <details class="mechanism-evidence"><summary>成分依据与适用边界</summary><div><p id="mechanism-evidence"></p><p id="mechanism-boundary"></p><a id="mechanism-source" target="_blank" rel="noopener">查看品牌来源 ↗</a><small id="mechanism-review"></small></div></details>`;
      this.loupe = document.createElement('div'); this.loupe.className = 'skin-loupe'; this.loupe.hidden = true;
      this.loupe.innerHTML = `<span class="loupe-heading">局部机制示意</span>${scene()}<span class="loupe-caption"></span>`;
      this.pin = document.createElement('div'); this.pin.className = 'skin-pin'; this.pin.hidden = true; this.pin.setAttribute('aria-hidden', 'true');
      stage.append(this.pin, this.loupe);
      panel.querySelector('#mechanism-play').addEventListener('click', () => this.playing ? this.pause() : this.play());
      panel.querySelector('#mechanism-replay').addEventListener('click', () => { this.pause(); this.onStep(0); this.play(); });
      panel.querySelector('#mechanism-next').addEventListener('click', () => this.choose((this.step + 1) % 3));
      panel.querySelector('.step-tabs').addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (this.step + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
        this.choose(next); panel.querySelector(`[data-step="${next}"]`).focus();
      });
      this.reduced?.addEventListener('change', () => this.pause());
      window.addEventListener('resize', () => this.clearAnchor());
    }
    render(product, step) {
      const changed = this.product?.id !== product.id;
      if (changed) { this.pause(); this.clearAnchor(); }
      this.product = product; this.step = step; this.theme = profile(product);
      for (const element of [this.panel, this.stage]) { element.dataset.skinTheme = this.theme.key; element.dataset.skinStep = String(step); element.style.setProperty('--skin-accent', this.theme.color); }
      this.panel.querySelector('#mechanism-title').textContent = this.theme.title;
      this.panel.querySelector('#mechanism-counter').textContent = `0${step + 1} / 03`;
      this.panel.querySelector('.mechanism-legend').textContent = step === 0 ? '接触表面，不表示吸收深度' : step === 1 ? this.theme.legend : '长期记录，不由动画估算功效';
      this.panel.querySelector('#step-title').textContent = this.theme.steps[step][0];
      this.panel.querySelector('#step-text').textContent = this.theme.steps[step][1];
      this.panel.querySelector('#mechanism-copy').setAttribute('aria-labelledby', `mechanism-tab-${step}`);
      this.panel.querySelectorAll('[data-step]').forEach(button => {
        const active = Number(button.dataset.step) === step; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      });
      this.panel.querySelector('#mechanism-ingredients').replaceChildren(...product.ingredients.map(value => { const chip = document.createElement('span'); chip.textContent = value; return chip; }));
      this.panel.querySelector('#mechanism-evidence').textContent = this.theme.pending ? '资料核验未完成：本次详情内容与目录名称不一致。以下成分仅保留既有快照，不用于制作专属机制动画。' : `${product.mechanism} ${product.evidence}`;
      this.panel.querySelector('#mechanism-boundary').textContent = '核心成分不是完整配方。图形为对品牌配方思路的简化解释，形状、数量、深度和播放速度均无测量含义；不证明个人功效。';
      const source = this.panel.querySelector('#mechanism-source'); source.href = product.source;
      source.textContent = this.theme.pending ? '查看原资料页（内容待复核） ↗' : `查看${product.sourceType} ↗`;
      this.panel.querySelector('#mechanism-review').textContent = '机制资料核对：2026-11-07 · 品牌资料，非独立验证';
      this.loupe.querySelector('.loupe-heading').textContent = `${this.theme.title} · 示意`;
      this.loupe.querySelector('.loupe-caption').textContent = ['接触皮肤表面', this.theme.focus, '变化需长期记录'][step];
      this.syncPlayback();
    }
    syncPlayback() {
      for (const el of [this.panel, this.stage]) el.classList.toggle('skin-playing', this.playing && !this.reduced?.matches);
      this.panel.querySelector('#mechanism-play').textContent = this.playing ? '暂停讲解' : this.reduced?.matches ? '逐段查看' : this.step === 2 ? '从头播放' : '播放讲解';
      this.panel.querySelector('#mechanism-play').setAttribute('aria-pressed', String(this.playing));
      this.panel.querySelector('#mechanism-next').textContent = this.step === 2 ? '回到开头 ↺' : '下一段 →';
    }
    choose(step) { this.pause(); this.onStep(step); }
    play() {
      if (this.reduced?.matches) { this.choose((this.step + 1) % 3); return; }
      if (this.step === 2) this.onStep(0);
      this.pause(); this.playing = true; this.syncPlayback(); this.schedule();
    }
    schedule() {
      this.timer = setTimeout(() => {
        if (!this.playing) return;
        if (this.step === 2) { this.pause(); return; }
        this.onStep(this.step + 1); this.schedule();
      }, 4800);
    }
    pause() { clearTimeout(this.timer); this.timer = null; this.playing = false; if (this.product) this.syncPlayback(); }
    trigger(point) {
      if (this.autoShown.has(this.product.id)) {
        if (point?.camera) this.track(point);
        else { this.loupe.hidden = false; this.pin.hidden = false; this.anchor = null; this.place(point || { x: this.stage.clientWidth * .29, y: this.stage.clientHeight * .58 }); }
        return false;
      }
      this.autoShown.add(this.product.id);
      this.pause(); this.onStep(1);
      this.loupe.hidden = false; this.pin.hidden = false;
      this.anchor = point?.anchor || null;
      this.place(point || { x: this.stage.clientWidth * .29, y: this.stage.clientHeight * .58 });
      if (!this.reduced?.matches) { this.playing = true; this.syncPlayback(); this.schedule(); }
      return true;
    }
    track(point) {
      if (!point?.anchor || !this.anchor || !this.frame) return;
      this.anchor = point.anchor; this.loupe.hidden = false; this.pin.hidden = false; this.place(point);
    }
    place(point) {
      const w = this.stage.clientWidth, h = this.stage.clientHeight;
      const x = Math.max(12, Math.min(w - 12, point.x)), y = Math.max(12, Math.min(h - 12, point.y));
      this.pin.style.left = `${x}px`; this.pin.style.top = `${y}px`;
      const lw = Math.min(156, w - 24), lh = 130;
      this.loupe.style.width = `${lw}px`;
      this.loupe.style.left = `${Math.max(12, Math.min(w - lw - 12, x < w / 2 ? x + 24 : x - lw - 24))}px`;
      this.loupe.style.top = `${Math.max(12, Math.min(h - lh - 47, y - lh / 2))}px`;
    }
    follow(frame) {
      this.frame = frame;
      if (!this.anchor) return;
      if (!frame) { this.loupe.hidden = true; this.pin.hidden = true; return; }
      this.loupe.hidden = false; this.pin.hidden = false;
      this.place({ x: frame.left + this.anchor.u * frame.width, y: frame.top + this.anchor.v * frame.height });
    }
    clearAnchor() { this.anchor = null; this.frame = null; this.loupe.hidden = true; this.pin.hidden = true; }
    stop() { this.pause(); this.clearAnchor(); }
  }
  window.GUYU_SKIN = { profile, SkinExperience };
})();
