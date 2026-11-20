import { AR_ASSETS } from './ar-assets.mjs?v=load2';

const CACHE_NAME = 'guyu-ar-assets-load2';
const DOWNLOAD_TIMEOUT = '下载长时间无响应，请重试';

export function abortError() { return new DOMException('已停止加载', 'AbortError'); }

export function waitFor(promise, signal, timeoutMs = 20000, message = '识别启动超时，请重试') {
  return new Promise((resolve, reject) => {
    const done = (callback, value) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      callback(value);
    };
    const stop = () => done(reject, abortError());
    const timer = setTimeout(() => done(reject, new Error(message)), timeoutMs);
    Promise.resolve(promise).then(value => done(resolve, value), error => done(reject, error));
    if (signal?.aborted) stop();
    else signal?.addEventListener('abort', stop, { once: true });
  });
}

async function readResponse(response, { signal, report, limit, total, idleMs }) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await waitFor(response.arrayBuffer(), signal, idleMs, DOWNLOAD_TIMEOUT));
    if (bytes.length > limit) throw new Error('识别文件大小异常');
    report(bytes.length, total);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      if (signal.aborted) throw abortError();
      const { value, done } = await waitFor(reader.read(), signal, idleMs, DOWNLOAD_TIMEOUT);
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('识别文件大小异常');
      chunks.push(value);
      report(length, total);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function decodeAsset(bytes, meta, signal) {
  let raw = bytes;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'function') {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        raw = await readResponse(new Response(stream), {
          signal, report: () => {}, limit: meta.rawBytes, total: meta.rawBytes, idleMs: 6000
        });
      } catch (error) {
        if (signal.aborted || !globalThis.fflate?.gunzipSync) throw error;
        raw = globalThis.fflate.gunzipSync(bytes, { out: new Uint8Array(meta.rawBytes) });
      }
    } else if (globalThis.fflate?.gunzipSync) {
      raw = globalThis.fflate.gunzipSync(bytes, { out: new Uint8Array(meta.rawBytes) });
    } else {
      throw new Error('浏览器不支持模型解压，请使用 Safari 或更新的浏览器');
    }
  }
  if (raw.length !== meta.rawBytes) throw new Error('识别文件不完整，请重试');
  const digest = await waitFor(crypto.subtle.digest('SHA-256', raw), signal, 6000, '识别文件校验超时');
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hex !== meta.sha256) throw new Error('识别文件校验失败，请重试');
  return raw;
}

/** Verified downloads and retries share one time budget per asset. */
export async function loadARAsset(relative, label, {
  signal, onLoad = () => {}, timeoutMs = 42000, idleMs = 12000
} = {}) {
  if (signal?.aborted) throw abortError();
  const meta = AR_ASSETS[relative];
  if (!meta) throw new Error('识别资源未登记');

  const controller = new AbortController();
  const local = controller.signal;
  const stop = () => controller.abort();
  const timer = setTimeout(stop, timeoutMs);
  signal?.addEventListener('abort', stop, { once: true });
  const rawURL = new URL(relative, import.meta.url);
  const key = new URL(relative + '.gz?v=load2', import.meta.url).href;
  const report = (loaded, total) => onLoad({ phase: 'download', label, loaded, total });

  async function readAsset(response, expectedBytes, reportProgress) {
    if (!response.ok) throw new Error('识别文件下载失败，请重试');
    if (/text\/html/i.test(response.headers.get('Content-Type') || '')) {
      void response.body?.cancel().catch(() => {});
      throw new Error('识别资源地址没有返回模型文件');
    }
    const total = Number(response.headers.get('Content-Length')) || expectedBytes;
    const packed = await readResponse(response, {
      signal: local, report: reportProgress, limit: meta.rawBytes, total, idleMs
    });
    onLoad({ phase: 'unpack', label, loaded: packed.length, total: packed.length });
    return { packed, raw: await decodeAsset(packed, meta, local) };
  }

  async function download(retry) {
    const request = new AbortController();
    const cancelRequest = () => request.abort();
    local.addEventListener('abort', cancelRequest, { once: true });
    if (local.aborted) cancelRequest();
    const fetchAsset = url => waitFor(fetch(url, {
      signal: request.signal, cache: retry ? 'reload' : 'default', credentials: 'same-origin'
    }), local, idleMs, DOWNLOAD_TIMEOUT);

    try {
      report(0, meta.packedBytes);
      let response = await fetchAsset(key);
      let expectedBytes = meta.packedBytes;
      if (response.status === 404 || (response.ok && /text\/html/i.test(response.headers.get('Content-Type') || ''))) {
        void response.body?.cancel().catch(() => {});
        report(0, meta.rawBytes);
        response = await fetchAsset(rawURL);
        expectedBytes = meta.rawBytes;
      }
      if (response.status === 404) throw new Error('识别文件缺失，请更新模型资源');
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status === 408 || response.status === 429 || response.status >= 500) {
          throw new TypeError('识别文件下载失败，请重试');
        }
        throw new Error('识别文件下载失败，请重试');
      }
      return await readAsset(response, expectedBytes, report);
    } finally {
      local.removeEventListener('abort', cancelRequest);
      cancelRequest();
    }
  }

  try {
    const cache = await waitFor(globalThis.caches?.open(CACHE_NAME), local, 900).catch(() => null);
    const cached = await waitFor(cache?.match(key), local, 900).catch(() => null);
    if (cached) {
      try {
        return (await readAsset(cached, meta.packedBytes, () => {})).raw;
      } catch (error) {
        if (local.aborted) throw error;
        await waitFor(cache.delete(key), local, 900).catch(() => {});
      }
    }

    let result;
    try {
      result = await download(false);
    } catch (error) {
      const recoverable = error instanceof TypeError || /无响应|不完整|校验失败/.test(error.message);
      if (local.aborted || !recoverable) throw error;
      onLoad({ phase: 'retry', label });
      result = await download(true);
    }

    if (local.aborted) throw abortError();
    if (cache) {
      const stored = new Response(result.packed, {
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(result.packed.length) }
      });
      void cache.put(key, stored).catch(() => {});
    }
    return result.raw;
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (local.aborted) throw new Error('下载' + label + '超时，请重试');
    if (error instanceof TypeError) throw new Error(label + '下载失败，请重试');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}
