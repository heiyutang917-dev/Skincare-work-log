import { AR_ASSETS } from './ar-assets.mjs?v=20261120-ar4';

const CACHE_NAME = 'guyu-ar-assets-load2';
const DOWNLOAD_TIMEOUT = '下载暂时中断，可以继续';
const partialAssets = new Map();

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

async function readResponse(response, { signal, report, limit, total, idleMs, partial }) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await waitFor(response.arrayBuffer(), signal, idleMs, DOWNLOAD_TIMEOUT));
    if (bytes.length > limit) throw new Error('识别文件大小异常');
    report(bytes.length, total);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let length = partial?.length ?? 0;
  try {
    while (true) {
      if (signal.aborted) throw abortError();
      const { value, done } = await waitFor(reader.read(), signal, idleMs, DOWNLOAD_TIMEOUT);
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('识别文件大小异常');
      if (partial) {
        partial.bytes.set(value, partial.length);
        partial.length = length;
      } else {
        chunks.push(value);
      }
      report(length, total);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (partial) return partial.bytes.subarray(0, length);
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

/** Slow transfers continue as long as data is arriving. Retries can resume in this page. */
export async function loadARAsset(relative, label, {
  signal, onLoad = () => {}, idleMs = 24000
} = {}) {
  if (signal?.aborted) throw abortError();
  const meta = AR_ASSETS[relative];
  if (!meta) throw new Error('识别资源未登记');

  const controller = new AbortController();
  const local = controller.signal;
  const stop = () => controller.abort();
  signal?.addEventListener('abort', stop, { once: true });
  const rawURL = new URL(relative, import.meta.url).href;
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
    const fetchAsset = (url, offset) => waitFor(fetch(url, {
      signal: request.signal, cache: retry || offset ? 'reload' : 'default', credentials: 'same-origin',
      headers: offset ? { Range: 'bytes=' + offset + '-' } : undefined
    }), local, idleMs, DOWNLOAD_TIMEOUT);

    try {
      let partial = partialAssets.get(key);
      let url = partial?.url ?? key;
      let expectedBytes = partial?.bytes.length ?? meta.packedBytes;
      let offset = partial?.length ?? 0;
      report(offset, expectedBytes);
      let response = await fetchAsset(url, offset);
      if (url === key && (response.status === 404 || (response.ok && /text\/html/i.test(response.headers.get('Content-Type') || '')))) {
        void response.body?.cancel().catch(() => {});
        partialAssets.delete(key);
        partial = undefined;
        offset = 0;
        url = rawURL;
        report(0, meta.rawBytes);
        expectedBytes = meta.rawBytes;
        response = await fetchAsset(url, 0);
      }
      if (response.status === 404) throw new Error('识别文件缺失，请更新模型资源');
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status === 416 && offset) partialAssets.delete(key);
        if (response.status === 408 || response.status === 416 || response.status === 429 || response.status >= 500) {
          throw new TypeError('识别文件下载失败，请重试');
        }
        throw new Error('识别文件下载失败，请重试');
      }

      if (response.status === 206) {
        const expectedRange = 'bytes ' + offset + '-' + (expectedBytes - 1) + '/' + expectedBytes;
        if (!offset || response.headers.get('Content-Range') !== expectedRange) {
          void response.body?.cancel().catch(() => {});
          partialAssets.delete(key);
          throw new TypeError('识别文件续传位置不匹配');
        }
      } else {
        partialAssets.delete(key);
        partial = undefined;
        report(0, expectedBytes);
      }
      const encoding = response.headers.get('Content-Encoding');
      const length = Number(response.headers.get('Content-Length'));
      if (response.status === 206 && encoding && encoding !== 'identity') {
        void response.body?.cancel().catch(() => {});
        partialAssets.delete(key);
        throw new TypeError('识别文件续传编码不匹配');
      }
      const canCheckpoint = response.body?.getReader && (!encoding || encoding === 'identity') &&
        (response.status === 206 || !length || length === expectedBytes) &&
        !/text\/html/i.test(response.headers.get('Content-Type') || '');
      if (!canCheckpoint) return await readAsset(response, expectedBytes, report);

      partial ??= { url, bytes: new Uint8Array(expectedBytes), length: 0 };
      partialAssets.set(key, partial);
      const packed = await readResponse(response, {
        signal: local, report, limit: expectedBytes, total: expectedBytes, idleMs, partial
      });
      if (packed.length !== expectedBytes) throw new Error('识别文件不完整，请继续下载');
      partialAssets.delete(key);
      onLoad({ phase: 'unpack', label, loaded: packed.length, total: packed.length });
      return { packed, raw: await decodeAsset(packed, meta, local) };
    } catch (error) {
      const received = partialAssets.get(key);
      if (received && received.length === received.bytes.length) partialAssets.delete(key);
      throw error;
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
        const result = await readAsset(cached, meta.packedBytes, () => {});
        partialAssets.delete(key);
        return result.raw;
      } catch (error) {
        if (local.aborted) throw error;
        await waitFor(cache.delete(key), local, 900).catch(() => {});
      }
    }

    let result;
    try {
      result = await download(false);
    } catch (error) {
      const recoverable = error instanceof TypeError || /暂时中断|不完整|校验失败/.test(error.message);
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
    if (error instanceof TypeError) throw new Error(label + '下载失败，可以继续');
    throw error;
  } finally {
    signal?.removeEventListener('abort', stop);
  }
}
