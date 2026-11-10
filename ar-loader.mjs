import { AR_ASSETS } from './ar-assets.mjs?v=load2';

export function abortError() { return new DOMException('已停止加载', 'AbortError'); }
export function waitFor(promise, signal, timeoutMs = 20000, message = '识别启动超时，请重试') {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve,reject) => {
    const stop = () => done(reject,abortError());
    const timer = setTimeout(() => done(reject,new Error(message)),timeoutMs);
    function done(callback,value) { clearTimeout(timer); signal?.removeEventListener('abort',stop); callback(value); }
    signal?.addEventListener('abort',stop,{once:true});
    Promise.resolve(promise).then(value=>done(resolve,value),error=>done(reject,error));
  });
}
async function readResponse(response, {signal,notify,limit,total,timeoutMs,idleMs}) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await waitFor(response.arrayBuffer(),signal,timeoutMs));
    if (bytes.length > limit) throw new Error('识别文件大小异常'); notify(bytes.length,total); return bytes;
  }
  const reader=response.body.getReader(),chunks=[];let length=0;
  const cancel=()=>reader.cancel().catch(()=>{});signal?.addEventListener('abort',cancel,{once:true});
  try {
    while(true){
      if(signal?.aborted)throw abortError();
      const {value,done}=await waitFor(reader.read(),signal,idleMs,'模型下载超时，请检查网络后重试');
      if(done)break;
      length+=value.byteLength;if(length>limit)throw new Error('识别文件大小异常');chunks.push(value);notify(length,total);
    }
    const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return bytes;
  } catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{signal?.removeEventListener('abort',cancel);reader.releaseLock();}
}
/** Downloads are cancellable, bounded and verified; only model files are cached */
export async function loadARAsset(relative,label,{signal,onLoad=()=>{},timeoutMs=60000,idleMs=15000}={}) {
  if(signal?.aborted)throw abortError();
  const meta=AR_ASSETS[relative];if(!meta)throw new Error('识别资源未登记');
  const local=new AbortController();const stop=()=>local.abort();signal?.addEventListener('abort',stop,{once:true});
  if(signal?.aborted)local.abort();
  const timer=setTimeout(stop,timeoutMs);let cache=null;
  const key=new URL(relative+'.gz?v=load2',import.meta.url).href;
  const notify=(loaded,total)=>onLoad({phase:'download',label,loaded,total});
  try{
    try{cache=await waitFor(globalThis.caches?.open('guyu-ar-assets-load2'),local.signal,2000);}catch(_){/* Cache is optional in private browsing */}
    let response;try{response=await waitFor(cache?.match(key),local.signal,2000);}catch(_){}
    if(!response){
      notify(0,meta.packedBytes);
      response=await waitFor(fetch(key,{signal:local.signal,cache:'no-cache',credentials:'same-origin'}),local.signal,idleMs,'模型下载超时，请检查网络后重试');
      if(response.status===404){
        response=await waitFor(fetch(new URL(relative,import.meta.url),{signal:local.signal,cache:'no-cache',credentials:'same-origin'}),local.signal,idleMs,'模型下载超时，请检查网络后重试');
      }
    }
    if(!response.ok)throw new Error(response.status===404?'识别文件缺失，请更新模型资源':'识别文件下载失败，请重试');
    const type=response.headers.get('Content-Type')||'';if(/text\/html/i.test(type))throw new Error('识别资源地址没有返回模型文件');
    const total=Number(response.headers.get('Content-Length'))||meta.packedBytes;
    const packed=await readResponse(response,{signal:local.signal,notify,limit:meta.rawBytes+65536,total,timeoutMs,idleMs});
    onLoad({phase:'unpack',label,loaded:packed.length,total:packed.length});
    let bytes=packed;
    if(packed[0]===0x1f&&packed[1]===0x8b){
      if(typeof DecompressionStream==='function')bytes=new Uint8Array(await waitFor(new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),local.signal,15000));
      else if(globalThis.fflate?.gunzipSync)bytes=globalThis.fflate.gunzipSync(packed);
      else throw new Error('浏览器不支持模型解压，请使用 Safari 或更新的浏览器');
    }
    if(bytes.length!==meta.rawBytes)throw new Error('识别文件不完整，请重试');
    const digest=await waitFor(crypto.subtle.digest('SHA-256',bytes),local.signal,10000);
    const hex=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
    if(hex!==meta.sha256){try{await cache?.delete(key);}catch(_){}throw new Error('识别文件校验失败，请重试');}
    if(local.signal.aborted)throw abortError();
    if(cache){try{await waitFor(cache.put(key,new Response(packed,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(packed.length)}})),local.signal,2000);}catch(_){/* Continue when local cache is full */}}
    return bytes;
  }catch(error){if(local.signal.aborted&&!signal?.aborted)throw new Error('模型加载超时，请检查网络后重试');throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
}
