(() => {
  'use strict';
  const LIMIT = 64 * 1024 * 1024, XML_LIMIT = 256 * 1024 * 1024;
  const keyOf = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const validKey = key => /^\d{4}-\d{2}-\d{2}$/.test(key) && keyOf(new Date(`${key}T12:00:00`)) === key;
  const num = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
  const formatMinutes = n => `${Math.floor(n / 60)}小时${Math.round(n % 60) ? `${Math.round(n % 60)}分` : ''}`;
  function windowStart(today) { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() - 27); return keyOf(date); }
  function normalizeRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const output = {};
    if (num(record.sleepMinutes, 1440)) output.sleepMinutes = Math.round(record.sleepMinutes);
    if (num(record.activityMinutes, 1440)) output.activityMinutes = Math.round(record.activityMinutes);
    if (num(record.hrvSDNNMs, 5000) && record.hrvSDNNMs > 0) output.hrvSDNNMs = Math.round(record.hrvSDNNMs * 10) / 10;
    return Object.keys(output).length ? output : null;
  }
  function jsonRecords(data, today) {
    if (data?.format !== 'guyu-health-v1' || !data.records || typeof data.records !== 'object') throw new Error('摘要文件格式不匹配，请选择健康导出 ZIP／XML，或符合说明的 JSON 摘要');
    const entries = Array.isArray(data.records) ? data.records.map(row => [row?.date, row]) : Object.entries(data.records);
    if (entries.length > 1000) throw new Error('摘要记录过多，请限制为需要回顾的日期');
    const records = {}, from = windowStart(today);
    for (const [key, value] of entries) {
      if (!validKey(String(key)) || key < from || key > today) continue;
      if (Object.hasOwn(records, key)) throw new Error('同一天存在重复摘要，请先核对文件');
      const normalized = normalizeRecord(value); if (normalized) records[key] = normalized;
    }
    if (!Object.keys(records).length) throw new Error('最近 28 天没有可导入的睡眠、活动或 HRV 摘要');
    return { records, source: '用户导入的 JSON 摘要', method: '摘要值来自你选择的文件，网站未向苹果验证来源' };
  }
  function appleDate(text) {
    if (typeof text !== 'string') return null;
    const iso = text.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?) ([+-]\d{2})(\d{2})$/, '$1T$2$3:$4');
    const value = new Date(iso); return Number.isNaN(value.getTime()) ? null : value;
  }
  function union(intervals) {
    const result = [];
    for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
      if (end <= start) continue;
      const last = result[result.length - 1];
      if (last && start <= last[1]) last[1] = Math.max(last[1], end); else result.push([start, end]);
    }
    return result;
  }
  function aggregate(sleep, activity, hrv, today) {
    const result = {}, from = windowStart(today);
    const day = key => { if (!validKey(key) || key < from || key > today) return null; return result[key] ||= {}; };
    let episode = [];
    function commit() {
      if (!episode.length) return;
      const record = day(keyOf(new Date(episode[episode.length - 1][1])));
      if (record) record.sleepMinutes = (record.sleepMinutes || 0) + episode.reduce((sum, [a, b]) => sum + (b - a) / 60000, 0);
    }
    for (const interval of union(sleep)) {
      if (episode.length && interval[0] - episode[episode.length - 1][1] > 7200000) { commit(); episode = []; }
      episode.push(interval);
    }
    commit();
    // Activity export is an estimate: overlapping samples use the larger rate, never a blind sum.
    const events = [], points = new Map(), seen = new Set();
    activity.forEach(([start, end, minutes], id) => {
      const identity = `${start}|${end}|${minutes}`; if (seen.has(identity)) return; seen.add(identity);
      if (start === end) { const key = keyOf(new Date(end)); points.set(key, (points.get(key) || 0) + minutes); return; }
      const rate = Math.min(1, minutes / ((end - start) / 60000));
      events.push([start, 1, id, rate], [end, -1, id, rate]);
    });
    events.sort((a, b) => a[0] - b[0]); const active = new Map(); let previous = null;
    function addActivity(start, end, rate) {
      let cursor = start;
      while (cursor < end) {
        const local = new Date(cursor), next = new Date(local); next.setHours(24, 0, 0, 0);
        const stop = Math.min(end, next.getTime()), record = day(keyOf(local));
        if (record) record.activityMinutes = (record.activityMinutes || 0) + (stop - cursor) / 60000 * rate;
        cursor = stop;
      }
    }
    for (const [time, kind, id, rate] of events) {
      if (previous !== null && time > previous && active.size) addActivity(previous, time, Math.max(...active.values()));
      if (kind === 1) active.set(id, rate); else active.delete(id); previous = time;
    }
    for (const [key, minutes] of points) { const record = day(key); if (record) record.activityMinutes = (record.activityMinutes || 0) + minutes; }
    for (const [key, samples] of hrv) { const record = day(key); if (record) record.hrvSDNNMs = samples.reduce((a, b) => a + b, 0) / samples.length; }
    for (const key of Object.keys(result)) { const value = normalizeRecord(result[key]); if (value) result[key] = value; else delete result[key]; }
    if (!Object.keys(result).length) throw new Error('文件中最近 28 天没有可用的睡眠、活动或 HRV 记录');
    return { records: result, source: '苹果健康导出文件 · 用户导入', method: '按当前手机时区估算，睡眠去重后按连续睡眠段结束日归档，活动重叠样本取较高密度，可能与健康 App 口径不同' };
  }
  function xmlParser(today, maxBytes = XML_LIMIT) {
    let buffer = '', header = '', ending = '', bytes = 0, count = 0;
    const decoder = new TextDecoder(), sleep = [], activity = [], hrv = new Map(), hrvSeen = new Set();
    const fromDate = new Date(`${windowStart(today)}T00:00:00`); fromDate.setDate(fromDate.getDate() - 2);
    const earliest = fromDate.getTime(), latest = new Date(`${today}T23:59:59`).getTime();
    function record(tag) {
      count++; if (count > 2000000) throw new Error('导出记录太多，请改用日期更集中的摘要文件');
      const attributes = {}; for (const match of tag.matchAll(/([A-Za-z][\w:]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attributes[match[1]] = match[2] ?? match[3];
      const type = attributes.type;
      if (!['HKCategoryTypeIdentifierSleepAnalysis', 'HKQuantityTypeIdentifierAppleExerciseTime', 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'].includes(type)) return;
      const startDate = appleDate(attributes.startDate), endDate = appleDate(attributes.endDate);
      if (!startDate || !endDate) return;
      const start = startDate.getTime(), end = endDate.getTime();
      if (end < earliest || end > latest || start > end || end - start > 129600000) return;
      if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
        if (/^HKCategoryValueSleepAnalysisAsleep(?:Unspecified|Core|Deep|REM)?$/i.test(attributes.value)) sleep.push([start, end]);
      } else {
        const value = Number(attributes.value); if (!Number.isFinite(value) || value < 0) return;
        if (type === 'HKQuantityTypeIdentifierAppleExerciseTime' && attributes.unit === 'min' && value <= 1440) activity.push([start, end, value]);
        if (type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') {
          const ms = attributes.unit === 'ms' ? value : attributes.unit === 's' ? value * 1000 : NaN;
          const identity = `${start}|${end}|${ms}`;
          if (num(ms, 5000) && ms > 0 && !hrvSeen.has(identity)) { hrvSeen.add(identity); const key = keyOf(endDate); if (!hrv.has(key)) hrv.set(key, []); hrv.get(key).push(ms); }
        }
      }
    }
    return {
      push(chunk, final = false) {
        bytes += chunk.byteLength; if (bytes > maxBytes) throw new Error('展开后的健康文件过大，请使用较小的健康摘要');
        const text = decoder.decode(chunk, { stream: !final }); if (header.length < 20000) header += text.slice(0, 20000 - header.length); ending = (ending + text).slice(-256);
        buffer += text;
        while (true) {
          const match = /<Record\b/.exec(buffer);
          if (!match) { buffer = buffer.slice(-16); break; }
          if (match.index) buffer = buffer.slice(match.index);
          let end = -1, quote = '';
          for (let index = 7; index < buffer.length; index++) { const char = buffer[index]; if (quote) { if (char === quote) quote = ''; } else if (char === '"' || char === "'") quote = char; else if (char === '>') { end = index; break; } }
          if (end < 0) { if (buffer.length > 65536) throw new Error('健康 XML 记录格式异常'); break; }
          record(buffer.slice(0, end + 1)); buffer = buffer.slice(end + 1);
        }
        if (final && /<Record\b/.test(buffer)) throw new Error('健康文件不完整，请重新选择完整导出文件');
      },
      finish() { if (!/<HealthData\b/.test(header)) throw new Error('这不是可识别的苹果健康 XML 导出文件'); if (!/<\/HealthData\s*>/.test(ending)) throw new Error('健康 XML 文件不完整，请重新导出'); return aggregate(sleep, activity, hrv, today); }
    };
  }
  async function parseFile(file, { today = keyOf(new Date()), signal, onProgress = () => {} } = {}) {
    if (!file || file.size > LIMIT) throw new Error('请选择不超过 64 MB 的健康文件，大文件可改用日期更集中的 JSON 摘要');
    const cancelled = () => { if (signal?.aborted) throw new Error('已取消本次读取'); };
    cancelled();
    if (/\.json$/i.test(file.name)) {
      if (file.size > 2 * 1024 * 1024) throw new Error('JSON 摘要最多 2 MB');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('JSON 文件无法读取，请检查格式'); }
      cancelled(); return jsonRecords(data, today);
    }
    const parser = xmlParser(today); let zip, found = false, completed = false, failure = null;
    if (/\.zip$/i.test(file.name)) {
      if (!window.fflate) throw new Error('ZIP 读取组件未加载，请刷新网页后重试');
      zip = new window.fflate.Unzip(entry => {
        if (!/(?:^|\/)export\.xml$/i.test(entry.name)) return;
        if (found) { failure = new Error('压缩包包含多个健康导出文件，请先核对'); return; }
        found = true;
        entry.ondata = (error, data, final) => { if (error) { failure = error; return; } try { cancelled(); parser.push(data, final); if (final) completed = true; } catch (error) { failure = error; entry.terminate(); } };
        entry.start();
      });
      zip.register(window.fflate.UnzipInflate);
    } else if (!/\.xml$/i.test(file.name)) throw new Error('支持苹果健康导出 ZIP、export.xml 或 JSON 摘要');
    try {
      for (let offset = 0; offset < file.size; offset += 131072) {
        cancelled(); const data = new Uint8Array(await file.slice(offset, offset + 131072).arrayBuffer()); const final = offset + data.length >= file.size;
        if (zip) zip.push(data, final); else parser.push(data, final);
        if (failure) throw failure; onProgress(Math.round((offset + data.length) / Math.max(1, file.size) * 100));
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (zip && (!found || !completed)) throw new Error('压缩包中没有完整的 export.xml，请选择苹果健康导出的 ZIP');
      cancelled(); return parser.finish();
    } catch (error) { throw new Error(error.message || '无法读取健康导出文件，请检查文件是否完整'); }
  }

  function adviceFor({ day, manual = {}, health = {}, care = {}, goalMinutes = null }) {
    const source = health.sleepMinutes === undefined ? '手动填写' : '导入文件';
    const sleep = health.sleepMinutes ?? manual.sleepMinutes, activity = health.activityMinutes ?? manual.activityMinutes;
    const feeling = manual.feeling || care.feeling;
    const dryURL = 'https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin';
    if (feeling === 'irritated') return [{ id: 'irritated', title: '先照顾不适', fact: `${day}，你记录了刺痛或明显泛红`, action: '暂停引起不适的产品，避免搓揉与叠加新产品，若持续或加重请咨询皮肤科医生', boundary: '依据你的肤感提醒，不能判断具体病因', url: dryURL }];
    const output = [];
    if (feeling === 'dry') output.push({ id: 'dry', title: '护理可以简单一点', fact: `${day}，你记录了干燥感`, action: '温和清洁，清洁后及时保湿，选用自己已经耐受的产品', boundary: '建议来自肤感，不是由睡眠或 HRV 推算皮肤含水量', url: dryURL });
    if (num(sleep, 1440) && num(goalMinutes, 1440) && goalMinutes > 0 && sleep < goalMinutes) output.push({ id: 'sleep', title: '给休息留一点时间', fact: `${day}，${source}睡眠约 ${formatMinutes(sleep)}，低于你设定的 ${formatMinutes(goalMinutes)} 目标`, action: '尽量保持规律的入睡与起床时间，护肤仍以当下肤感为依据，不必因少睡一晚增加功效产品', boundary: '个人目标用于生活对照，不能换算修护程度或诊断屏障受损', url: 'https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits' });
    if (num(activity, 1440) && activity > 0) output.push({ id: 'activity', title: '活动后，温和收尾', fact: `${day}，${health.activityMinutes === undefined ? '你填写了' : '文件中记录了'}约 ${Math.round(activity)} 分钟活动`, action: '如果活动时有出汗，结束后温和清洁并按肤感保湿，户外活动记得防晒', boundary: '活动分钟数不能直接说明出汗量、脱水程度或肤质', url: 'https://www.aad.org/public/everyday-care/skin-care-basics/care/face-washing-101' });
    if (!output.length) output.push({ id: 'baseline', title: '从基础护理开始', fact: '目前没有需要额外调整护理的依据', action: '保持温和清洁、按肤感保湿和日间防晒，想了解变化时再留下一条记录', boundary: 'HRV 可用于数据回顾，不用于决定护肤品功效', url: 'https://www.aad.org/public/everyday-care/skin-care-basics/care/face-washing-101' });
    return output;
  }

  function create({ read, write, manual, care, today, refresh }) {
    const $ = id => document.getElementById(id);
    let preview = null, abort = null, run = 0;
    const element = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
    const entries = () => Object.fromEntries(Object.entries(read().records || {}).filter(([key]) => validKey(key) && key <= today()).map(([key, value]) => [key, normalizeRecord(value)]).filter(([, value]) => value));
    const record = key => entries()[key];
    $('life-review').insertAdjacentHTML('afterend', '<section class="health-analysis" id="health-analysis" aria-labelledby="health-analysis-title"><header><span class="life-overline">生活数据 × 自述肤感</span><h2 id="health-analysis-title">给今天一点具体的照顾</h2></header><div id="health-import-summary"></div><div id="health-advice-list"></div><p class="health-foot">本地规则分析 · 建议依据可查看</p></section>');
    $('life-health-modal').querySelector('section').innerHTML = `<button type="button" class="life-modal-close" data-life-action="close" aria-label="关闭健康数据说明">×</button><span class="life-overline">HealthKit 尚未接入 · 网页支持文件导入</span><h2 id="life-health-title">让日常，成为有依据的回顾</h2><p>iPhone 浏览器不能直接申请苹果健康权限，你可以主动选择导出文件，由本网页在手机本地读取</p><details class="health-how"><summary>怎样准备苹果健康文件</summary><ol><li>打开 iPhone「健康」，点右上角头像</li><li>选择「导出所有健康数据」，保存 ZIP 到「文件」</li><li>回到这里选择 ZIP，也可选择解压后的 export.xml</li></ol><p>导出包可能包含很多健康信息，本网页只提取最近 28 天所选项目，不保留原文件或其他类型数据</p><a href="https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios" target="_blank" rel="noopener">苹果导出说明 ↗</a></details><fieldset class="health-types"><legend>导入后保留哪些摘要</legend><label><input type="checkbox" id="health-sleep" checked> 睡眠</label><label><input type="checkbox" id="health-activity" checked> 活动时间</label><label><input type="checkbox" id="health-hrv"> HRV SDNN · 可选</label></fieldset><label class="health-file-label">选择健康 ZIP／XML／JSON<input type="file" id="health-file" accept=".zip,.xml,.json,application/zip,text/xml,application/json"></label><p id="health-file-status" class="life-status" role="status"></p><div id="health-preview" hidden><div id="health-preview-copy"></div><button type="button" id="health-confirm" class="primary-btn">确认导入到本机</button><button type="button" id="health-cancel" class="life-text">取消本次导入</button></div><div class="health-goal"><label for="health-goal">自己的睡眠目标 · 选填</label><select id="health-goal"><option value="">暂不设置</option value="360">6 小时</option><option value="390">6.5 小时</option><option value="420">7 小时</option><option value="450">7.5 小时</option><option value="480">8 小时</option><option value="510">8.5 小时</option><option value="540">9 小时</option></select><button type="button" id="health-save-goal" class="life-button">保存个人目标</button></div><p class="life-privacy">文件在当前浏览器处理，不上传服务器<br>导入与手动记录分别保存，这不是苹果健康实时同步</p><button type="button" id="health-delete" class="life-text life-danger">清除已导入的健康摘要</button><p id="health-management-status" class="life-status" role="status"></p><button type="button" class="primary-btn" data-life-action="close">完成，回看护理建议</button>`;
    document.querySelectorAll('[data-life-action="health"]').forEach(button => { button.textContent = '健康数据与护理建议 ↗'; });
    function stop() { run++; abort?.abort(); abort = null; preview = null; $('health-preview').hidden = true; }
    $('health-file').addEventListener('change', async () => {
      stop(); const file = $('health-file').files[0]; if (!file) return;
      abort = new AbortController(); const current = run;
      $('health-file-status').textContent = '正在本机读取，可随时关闭取消';
      try {
        const result = await parseFile(file, { today: today(), signal: abort.signal, onProgress: percent => { if (current === run) $('health-file-status').textContent = `正在本机读取 ${percent}%`; } });
        if (current !== run) return; preview = result;
        $('health-preview-copy').textContent = `读取到 ${Object.keys(result.records).length} 天摘要，来源：${result.source}，确认后只保留勾选项目，并替换之前导入的健康摘要，手动记录和护理打卡会保留`;
        $('health-preview').hidden = false; $('health-file-status').textContent = '尚未保存，请核对后确认';
      } catch (error) { if (current === run) $('health-file-status').textContent = error.message; }
      finally { if (current === run) abort = null; }
    });
    $('health-confirm').addEventListener('click', () => {
      if (!preview) return;
      const chosen = { sleepMinutes: $('health-sleep').checked, activityMinutes: $('health-activity').checked, hrvSDNNMs: $('health-hrv').checked }, records = {};
      for (const [key, value] of Object.entries(preview.records)) { const row = Object.fromEntries(Object.entries(value).filter(([field]) => chosen[field])); if (Object.keys(row).length) records[key] = row; }
      if (!Object.keys(records).length) { $('health-file-status').textContent = '勾选项目中没有可保存的数据，请重新选择'; return; }
      const next = { ...read(), records, source: preview.source, method: preview.method, importedAt: new Date().toISOString() };
      if (!write(next)) { $('health-file-status').textContent = '未能保存导入，请检查浏览器存储空间'; return; }
      stop(); $('health-file').value = ''; $('health-file-status').textContent = `已导入 ${Object.keys(records).length} 天摘要，可回看护理建议`; refresh();
    });
    $('health-cancel').addEventListener('click', () => { stop(); $('health-file').value = ''; $('health-file-status').textContent = '已取消，原有记录保持原样'; });
    $('health-save-goal').addEventListener('click', () => {
      const goal = $('health-goal').value ? Number($('health-goal').value) : null;
      if (write({ ...read(), goalMinutes: goal })) { refresh(); $('health-management-status').textContent = '个人目标已保存，仅用于生活对照'; }
      else $('health-management-status').textContent = '暂时未能保存目标';
    });
    $('health-delete').addEventListener('click', () => {
      if (!window.confirm('清除已导入的健康摘要吗？手动生活记录和护理打卡会保留')) return;
      stop(); if (write({ goalMinutes: read().goalMinutes ?? null, records: {} })) { refresh(); $('health-management-status').textContent = '已清除健康摘要，原始文件和苹果健康数据不受影响'; }
      else $('health-management-status').textContent = '暂时未能保存删除结果';
    });
    document.addEventListener('click', event => {
      if (event.target.closest('[data-life-action="close"]')) { stop(); $('health-file').value = ''; }
      if (event.target.closest('[data-life-action="health"]')) $('health-goal').value = read().goalMinutes == null ? '' : String(read().goalMinutes);
    });
    new MutationObserver(() => { if ($('life-health-modal').hidden && (preview || abort)) stop(); }).observe($('life-health-modal'), { attributes: true, attributeFilter: ['hidden'] });
    function render(range = 7) {
      const all = entries(), from = new Date(`${today()}T12:00:00`); from.setDate(from.getDate() - range + 1);
      const days = Object.keys(all).filter(key => key >= keyOf(from)).sort(); const summary = $('health-import-summary'); summary.replaceChildren();
      if (days.length) {
        summary.append(element('strong', '', `已导入 ${days.length} 天健康摘要`), element('p', '', `${read().source || '用户文件'} · 非实时同步`));
        const sleep = days.map(key => all[key].sleepMinutes).filter(value => value !== undefined);
        const activity = days.map(key => all[key].activityMinutes).filter(value => value !== undefined);
        const hrv = days.map(key => all[key].hrvSDNNMs).filter(value => value !== undefined);
        const facts = [];
        if (sleep.length) facts.push(`已记录日平均睡眠 ${formatMinutes(Math.round(sleep.reduce((a, b) => a + b, 0) / sleep.length))}`);
        if (activity.length) facts.push(`活动合计 ${activity.reduce((a, b) => a + b, 0)} 分钟`);
        if (hrv.length) facts.push(`HRV SDNN ${hrv.length} 天样本均值 ${(hrv.reduce((a, b) => a + b, 0) / hrv.length).toFixed(1)} ms，仅回顾趋势`);
        summary.append(element('p', '', facts.join(' · ')), element('small', '', read().method || '以所选文件的数据口径为准'));
      } else summary.append(element('p', '', '可在「健康数据与护理建议」中导入苹果健康文件，也可继续手动记录'));
      const candidate = [...new Set([...Object.keys(manual()), ...Object.keys(care()), ...days])].filter(key => validKey(key) && key <= today() && key >= keyOf(from)).sort().at(-1) || today();
      const cards = adviceFor({ day: candidate, manual: manual()[candidate] || {}, health: all[candidate] || {}, care: care()[candidate] || {}, goalMinutes: read().goalMinutes });
      const list = $('health-advice-list'); list.replaceChildren();
      for (const card of cards) {
        const section = element('article', 'health-advice-card'); section.append(element('h3', '', card.title), element('p', 'health-observation', card.fact), element('p', '', card.action));
        const details = element('details'), label = element('summary', '', '为什么给出这条建议'); details.append(label, element('p', '', card.boundary));
        const link = element('a', '', '查看建议依据 ↗'); link.href = card.url; link.target = '_blank'; link.rel = 'noopener'; details.append(link); section.append(details); list.append(section);
      }
      $('health-delete').disabled = !Object.keys(all).length;
    }
    function appendTimeline(body, key) {
      const value = record(key); if (!value) return;
      const box = element('div', 'health-timeline'); box.append(element('span', '', '健康摘要 · 文件导入'));
      if (value.sleepMinutes !== undefined) box.append(element('p', '', `睡眠 ${formatMinutes(value.sleepMinutes)}`));
      if (value.activityMinutes !== undefined) box.append(element('p', '', `活动 ${value.activityMinutes} 分钟`));
      if (value.hrvSDNNMs !== undefined) box.append(element('p', '', `HRV SDNN ${value.hrvSDNNMs} ms · 样本均值`));
      body.append(box);
    }
    return { render, appendTimeline, hasDay: key => !!record(key) };
  }
  window.GUYU_HEALTH = { parseFile, jsonRecords, xmlParser, aggregate, adviceFor, normalizeRecord, create };
})();
