(() => {
  'use strict';
  const labels = { comfortable: '状态平稳', dry: '有些干燥', irritated: '刺痛 / 明显泛红' };
  function endpoint(value) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('请填写 HTTPS 服务地址');
    return url.href.replace(/\/$/, '');
  }
  function create({ product, feelings, navigate }) {
    document.querySelector('#page-today .journey-actions').insertAdjacentHTML('beforeend', '<button type="button" class="journey-link" data-journey="assistant">问问这一款 ↗</button>');
    document.querySelector('.main-content').insertAdjacentHTML('beforeend', `
      <section class="page assistant-page" id="page-assistant" aria-labelledby="assistant-title">
        <div class="focus-header"><button type="button" class="round-button" data-focus-back aria-label="返回">‹</button><h1 id="assistant-title">知肤答疑</h1><button type="button" class="round-button" id="ai-settings-button" aria-label="连接设置" aria-controls="ai-settings" aria-expanded="false">⋯</button></div>
        <div class="assistant-scroll" id="assistant-scroll">
          <div class="ai-product-hero"><img id="ai-product-image" alt=""><div><span class="ai-eyebrow">围绕你的这一款</span><h2 id="ai-product-name"></h2><span id="ai-product-effects"></span><button type="button" class="ai-change" id="ai-change-product">更换产品 ↗</button></div></div>
          <details class="ai-facts"><summary>先看看产品资料 <span>＋</span></summary><p id="ai-product-facts"></p><small id="ai-product-pending"></small><a id="ai-product-source" target="_blank" rel="noopener">品牌资料 ↗</a></details>
          <details class="ai-settings" id="ai-settings"><summary>AI 连接设置</summary><p>连接后，发送的问题会交给 OpenAI 处理</p><label for="ai-endpoint">服务地址</label><input id="ai-endpoint" type="url" inputmode="url" autocomplete="off" placeholder="https://你的服务地址"><label for="ai-access">体验码</label><input id="ai-access" type="password" autocomplete="off" maxlength="256" placeholder="由网站管理者提供，非模型密钥"><button type="button" class="secondary-btn" id="ai-connect">连接服务</button><button type="button" class="ai-change" id="ai-disconnect">断开连接</button><small>连接信息仅保留在本次打开期间</small></details>
          <div class="ai-conversation" id="ai-conversation" role="log" aria-label="与知肤助手的对话" aria-live="polite"><div class="ai-intro"><span class="ai-spark" aria-hidden="true">✧</span><h2>这一款，你想了解什么</h2><p>看懂成分，也照顾真实的肤感</p></div></div>
          <div class="ai-suggestions"><button type="button" data-ai-question="这款产品的公开核心成分分别有什么作用？">成分如何起作用</button><button type="button" data-ai-question="这款产品怎样使用，需要注意什么？">怎么用更合适</button><button type="button" data-ai-question="请结合我选择分享的肤感记录，解释护理时要注意什么；没有记录时请先问我">结合我的肤感</button></div>
        </div>
        <div class="ai-compose-area"><div class="ai-connection-line"><span id="ai-connection-label">AI 尚未连接</span><button type="button" class="ai-change" id="ai-open-settings">连接设置 ↗</button></div><label class="ai-share"><input id="ai-share-feelings" type="checkbox"> 使用最近 7 天肤感 <span id="ai-feeling-count"></span></label><details class="ai-context"><summary>本次会发送哪些信息</summary><p id="ai-context-preview"></p><small>不自动发送照片、睡眠、HRV、运动或生活备注<br>你在问题中主动输入的内容也会发送</small></details><form id="ai-form" class="ai-composer"><label class="sr-only" for="ai-question">输入护理问题</label><textarea id="ai-question" rows="1" maxlength="800" placeholder="想了解这款产品的什么" enterkeyhint="send"></textarea><button type="submit" id="ai-send" aria-label="发送问题" disabled>↑</button><button type="button" id="ai-cancel" aria-label="取消回答" hidden>×</button></form><p id="ai-status" role="status">可先展开产品资料，不需要连接</p><span class="ai-disclaimer">AI 回答供护理参考，不能代替诊断</span></div>
      </section>`);
    const $ = id => document.getElementById(id);
    let current = null, connection = null, controller = null, checkController = null, checking = false, history = [];
    function viewport() { if (document.body.dataset.screen === 'assistant') $('page-assistant').style.setProperty('--assistant-viewport', `${window.visualViewport?.height || window.innerHeight}px`); }
    window.visualViewport?.addEventListener('resize', viewport);
    const configured = window.GUYU_AI_CONFIG?.endpoint || '';
    $('ai-endpoint').value = configured;
    function settings(open = true) { $('ai-settings').open = open; $('ai-settings-button').setAttribute('aria-expanded', String(open)); if (open) $('ai-settings').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    $('ai-settings-button').onclick = () => settings(!$('ai-settings').open);
    $('ai-open-settings').onclick = () => settings();
    $('ai-settings').addEventListener('toggle', () => $('ai-settings-button').setAttribute('aria-expanded', String($('ai-settings').open)));
    $('ai-change-product').onclick = () => navigate('products');
    function updateContext() {
      const rows = feelings(), shared = $('ai-share-feelings').checked;
      $('ai-feeling-count').textContent = rows.length ? `${rows.length} 天` : '暂无记录';
      $('ai-context-preview').textContent = `产品：${product()?.short || '未选择'}\n本次问题与本页最近 3 轮对话\n` + (!shared ? '肤感：不发送' : !rows.length ? '肤感：没有可用记录' : rows.map(row => `${row.date}：${[labels[row.feeling], row.dry === undefined ? '' : `干燥 ${row.dry}/4`, row.dull === undefined ? '' : `暗沉 ${row.dull}/4`].filter(Boolean).join('、')}`).join('\n'));
    }
    function controls() {
      const busy = !!controller || checking;
      $('ai-send').disabled = !connection || busy || !$('ai-question').value.trim();
      $('ai-cancel').hidden = !controller;
      $('ai-send').hidden = !!controller;
      $('ai-connect').disabled = busy;
      $('ai-share-feelings').disabled = busy;
      $('ai-question').readOnly = busy;
      $('ai-connection-label').textContent = connection ? 'AI · OpenAI' : 'AI 尚未连接';
    }
    function cancel() { if (controller) $('ai-status').textContent = '已取消，问题仍保留'; controller?.abort(); controller = null; controls(); }
    function stopCheck() { checkController?.abort(); checkController = null; checking = false; }
    function disconnect() { stopCheck(); cancel(); connection = null; $('ai-access').value = ''; $('ai-status').textContent = '已断开，仍可查看产品资料'; controls(); }
    $('ai-disconnect').onclick = disconnect;
    $('ai-cancel').onclick = cancel;
    $('ai-share-feelings').onchange = () => { history = []; updateContext(); };
    $('ai-question').addEventListener('input', controls);
    $('ai-question').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('ai-form').requestSubmit(); } });
    document.querySelectorAll('[data-ai-question]').forEach(button => button.onclick = () => { $('ai-question').value = button.dataset.aiQuestion; controls(); $('ai-question').focus(); });
    // Keep credentials only for the chosen origin and invalidate them on edits
    for (const id of ['ai-endpoint', 'ai-access']) $(id).addEventListener('input', () => { stopCheck(); connection = null; cancel(); controls(); });
    $('ai-connect').onclick = async () => {
      const code = $('ai-access').value;
      stopCheck(); cancel(); connection = null; checking = true;
      const run = new AbortController(); checkController = run;
      const timer = setTimeout(() => run.abort(), 10000); controls();
      try {
        const base = endpoint($('ai-endpoint').value.trim());
        if (code.length < 24) throw new Error('请填写至少 24 位的体验码');
        const response = await fetch(base + '/api/status', { headers: { Authorization: 'Bearer ' + code }, credentials: 'omit', cache: 'no-store', signal: run.signal });
        if (!response.ok) throw new Error(response.status === 401 ? '体验码不正确' : '服务尚未准备好');
        const data = await response.json();
        if (data.provider !== 'OpenAI' || data.configured !== true) throw new Error('服务还没有配置模型');
        if (run.signal.aborted || checkController !== run) return;
        connection = { base, code }; settings(false); $('ai-status').textContent = '服务已连接，可以发送问题';
      } catch (error) { if (checkController === run) $('ai-status').textContent = error.name === 'AbortError' ? '连接超时，请稍后再试' : error.message === 'Failed to fetch' ? '没有连上服务，请检查地址与网络' : error.message; }
      finally { clearTimeout(timer); if (checkController === run) { checkController = null; checking = false; controls(); } }
    };
    function bubble(role, value) { const node = document.createElement('div'); node.className = 'ai-bubble ' + role; const label = document.createElement('small'); label.textContent = role === 'user' ? '你' : '知肤助手 · AI'; const text = document.createElement('p'); text.textContent = value.replace(/。/g, '\n'); node.append(label, text); $('ai-conversation').append(node); return node; }
    $('ai-form').addEventListener('submit', async event => {
      event.preventDefault();
      const message = $('ai-question').value.trim();
      if (!message || !connection || controller || checking) return;
      const run = new AbortController(); controller = run; controls();
      const timer = setTimeout(() => run.abort(), 40000);
      const userBubble = bubble('user', message);
      const payload = { productId: product().id, message, feelings: $('ai-share-feelings').checked ? feelings() : [], history: history.slice(-6) };
      $('ai-status').textContent = '正在回答…'; $('assistant-scroll').scrollTop = $('assistant-scroll').scrollHeight;
      try {
        const response = await fetch(connection.base + '/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + connection.code }, body: JSON.stringify(payload), signal: run.signal, credentials: 'omit', cache: 'no-store' });
        if (!response.ok) throw new Error(({ 401: '体验码已失效，请重新连接', 429: '提问较多，请稍后再试', 503: '模型尚未配置', 504: '回答超时，请稍后重试' })[response.status] || '暂时没有收到回答，请重试');
        const data = await response.json();
        if (typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 12000) throw new Error('回答格式有误，请重试');
        if (run.signal.aborted || controller !== run) return;
        bubble('assistant', data.answer); history.push({ role: 'user', content: message }, { role: 'assistant', content: data.answer.slice(0, 4000) }); history = history.slice(-6);
        $('ai-question').value = ''; $('ai-status').textContent = '回答已生成 · 产品信息可在品牌资料中核对';
        $('assistant-scroll').scrollTop = $('assistant-scroll').scrollHeight;
      } catch (error) { userBubble.remove(); if (controller === run) $('ai-status').textContent = error.name === 'AbortError' ? '已取消或超时，问题仍保留' : error.message; }
      finally { clearTimeout(timer); if (run.signal.aborted) userBubble.remove(); if (controller === run) { controller = null; controls(); } }
    });
    function render() {
      const p = product(); if (!p) return;
      if (current !== p.id) { cancel(); history = []; $('ai-conversation').querySelectorAll('.ai-bubble').forEach(node => node.remove()); $('ai-share-feelings').checked = false; current = p.id; }
      $('ai-product-name').textContent = p.short; $('ai-product-image').src = p.image; $('ai-product-image').alt = p.short;
      $('ai-product-effects').textContent = p.effects.slice(0, 2).join(' · ');
      const pending = window.GUYU_SKIN.profile(p).pending;
      $('ai-product-facts').textContent = (pending ? '这款产品的资料正在复核，专属成分与作用解释暂不展示' : `${p.ingredients.join('、')}\n${p.mechanism}\n${p.use}`).replace(/。/g, '\n');
      $('ai-product-pending').textContent = pending ? '请以产品包装与品牌最新说明为准' : '依据品牌公开资料整理，并非完整配方';
      $('ai-product-source').href = p.source;
      updateContext(); controls(); viewport();
    }
    return { render, leave() { stopCheck(); cancel(); controls(); $('ai-status').textContent = connection ? '可以继续提问' : '可先展开产品资料，不需要连接'; } };
  }
  window.GUYU_ASSISTANT = { create, endpoint };
})();
