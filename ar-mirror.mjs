import { ApproachGate, FingertipTracker, faceBounds, faceZone, toStagePoint } from './ar-engine.mjs?v=finger1';
import { loadARAsset, waitFor, abortError } from './ar-loader.mjs?v=20261120-ar4';

let visionLibrary;

/** Camera landmarks are processed locally; 2D proximity cannot verify physical contact. */
export async function startARMirror({ video, stage, canvas, signal, retry = '', onApproach, onStatus, onLoad = () => {}, onReady = () => {}, onTracking = () => {}, onFace = () => {}, onPointer = () => {}, onFallback = () => {} }) {
  const loading = new AbortController(), cancel = () => loading.abort();
  signal?.addEventListener('abort',cancel,{once:true}); if(signal?.aborted)loading.abort();
  let faceTask, handTask, wasm, wasmURL = null, FaceDetector, HandLandmarker;
  const closed=new WeakSet();
  function closeTask(task){if(task&&!closed.has(task)){closed.add(task);task.close();}}
  async function createTask(factory,label){
    onLoad({phase:'init',label}); let rejected=false;
    const promise=Promise.resolve().then(factory);
    promise.then(task=>{if(rejected||loading.signal.aborted)closeTask(task);},()=>{});
    try{return await waitFor(promise,loading.signal,20000);}catch(error){rejected=true;throw error;}
  }
  try {
    onLoad({phase:'module',label:'手指识别'});
    const options = { signal: loading.signal, onLoad };
    const modelRequest = loadARAsset('models/hand_landmarker.task', '手指模型', options);
    const engineRequest = (async () => {
      const suffix = retry ? '?retry=' + encodeURIComponent(retry) : '';
      const library = visionLibrary ?? await waitFor(import('./vendor/vision_bundle.mjs' + suffix), loading.signal, 15000, '识别组件加载超时，请重试');
      visionLibrary = library;
      ({ FaceDetector, HandLandmarker } = library);
      const fileset = await waitFor(library.FilesetResolver.forVisionTasks(new URL('./vendor/wasm', import.meta.url).href), loading.signal, 6000);
      if (!fileset.wasmBinaryPath) return { fileset };
      const filename = new URL(fileset.wasmBinaryPath).pathname.split('/').pop();
      return { fileset, binary: await loadARAsset('vendor/wasm/' + filename, '识别引擎', options) };
    })();
    const [model, { fileset, binary }] = await Promise.all([modelRequest, engineRequest]);
    const createHand = () => HandLandmarker.createFromOptions(wasm, {
      baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .45,
      minHandPresenceConfidence: .45, minTrackingConfidence: .45
    });
    wasm = fileset;
    if (binary) {
      wasmURL = URL.createObjectURL(new Blob([binary], { type: 'application/wasm' }));
      wasm = { ...fileset, wasmBinaryPath: wasmURL };
    }
    try {
      handTask = await createTask(createHand, '手指识别');
    } catch (error) {
      // A browser may reject the Blob URL. Try the original same-origin WASM.
      // Do not run a second factory while a timed-out factory may still be active.
      if (!wasmURL || loading.signal.aborted || /超时/.test(error.message)) throw error;
      URL.revokeObjectURL(wasmURL);
      wasmURL = null;
      wasm = fileset;
      handTask = await createTask(createHand, '兼容识别引擎');
    }
    if(loading.signal.aborted)throw abortError();
  } catch (error) { loading.abort(); closeTask(faceTask); closeTask(handTask); if(wasmURL)URL.revokeObjectURL(wasmURL);signal?.removeEventListener('abort',cancel);throw error; }

  const ctx = canvas.getContext('2d'), gate = new ApproachGate(), tracker = new FingertipTracker();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const glow = document.createElement('div'); glow.className = 'ar-fingertip'; glow.hidden = true; glow.setAttribute('aria-hidden', 'true'); stage.append(glow);
  let stopped = false, frameId = 0, lastFaceInference = -Infinity, lastHandInference = -Infinity, lastVideoTime = -1;
  let lastFace = null, lastHand = null, lastFaceAt = -Infinity, frame = null, zone = null, status = '';
  let ripples = [], trail = [], lastRipple = null, lastTrailAt = -Infinity;
  let faceFailed = false, faceLoading = false, tracking = '', faceTimer = null;
  function reportFaceFailure() {
    faceFailed = true;
    onLoad({ phase: 'failed', label: '面部定位' });
  }
  async function prepareFace(){
    if (stopped || faceTask || faceLoading) return;
    faceLoading = true;
    faceFailed = false;
    try{
      const model = await loadARAsset('models/face_detector.tflite', '面部定位', { signal: loading.signal, onLoad });
      const task = await createTask(() => FaceDetector.createFromOptions(wasm, {
        baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
        runningMode: 'VIDEO', minDetectionConfidence: .6
      }), '面部定位');
      if(stopped){closeTask(task);return;}faceTask=task;onReady('face');onLoad({phase:'ready',label:'面部定位'});
    } catch (_) {
      if (!stopped) reportFaceFailure();
    } finally {
      faceLoading = false;
    }
  }

  function say(next) { if (next !== status) { status = next; onStatus(next); } }
  function position(point) { return toStagePoint(point, video.videoWidth, video.videoHeight, stage.clientWidth, stage.clientHeight, true); }
  function anchored(point) { return { ...point, anchor: { u: (point.x - frame.left) / frame.width, v: (point.y - frame.top) / frame.height }, camera: true }; }
  function ripple(point, now) {
    if (reduced?.matches) return;
    ripples.push({ ...point, at: now }); ripples = ripples.slice(-10); lastRipple = { ...point, at: now };
  }
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(stage.clientWidth * dpr), height = Math.round(stage.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function draw(now) {
    resizeCanvas(); ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
    if (frame && now - lastFaceAt > 240) { frame = null; zone = null; gate.update(null, now); onFace(null); }
    if (frame && now - lastFaceAt <= 240) {
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(235,255,240,.33)';
      ctx.beginPath();
      ctx.ellipse(frame.left + frame.width / 2, frame.top + frame.height / 2,
        frame.width / 2, frame.height / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const tip = tracker.sample(now);
    if (tip && tip.x >= 0 && tip.x <= stage.clientWidth && tip.y >= 0 && tip.y <= stage.clientHeight) {
      glow.hidden = false; glow.style.transform = `translate3d(${tip.x - 15}px,${tip.y - 15}px,0)`; glow.classList.toggle('is-near', !!zone);
      if (zone && frame) {
        onPointer(anchored(tip));
        if (!lastRipple || (now - lastRipple.at >= 130 && Math.hypot(tip.x - lastRipple.x, tip.y - lastRipple.y) >= 9)) ripple(tip, now);
      } else onPointer(null);
      if (!reduced?.matches && now - lastTrailAt >= 28) { trail.push({ ...tip, at: now }); lastTrailAt = now; }
    } else { glow.hidden = true; onPointer(null); }
    trail = reduced?.matches ? [] : trail.filter(point => now - point.at < 260).slice(-12);
    trail.forEach(point => {
      const alpha = (1 - (now - point.at) / 260) * .6;
      ctx.beginPath(); ctx.arc(point.x, point.y, 1.5, 0, Math.PI * 2); ctx.fillStyle = `rgba(244,255,236,${alpha})`; ctx.fill();
    });
    ripples = reduced?.matches ? [] : ripples.filter(point => now - point.at < 700);
    for (const point of ripples) {
      const progress = (now - point.at) / 700;
      ctx.beginPath(); ctx.arc(point.x, point.y, 7 + progress * 48, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(243,255,222,${(1 - progress) * .8})`; ctx.lineWidth = 1.5; ctx.stroke();
      if (progress > .16) { ctx.beginPath(); ctx.arc(point.x, point.y, 5 + (progress - .16) * 37, 0, Math.PI * 2); ctx.strokeStyle = `rgba(220,250,226,${(1 - progress) * .5})`; ctx.stroke(); }
    }
  }
  function infer(now) {
    if (video.readyState < 2 || !video.videoWidth || video.currentTime === lastVideoTime) return;
    if (now - lastHandInference < 45) return;
    lastVideoTime = video.currentTime; lastHandInference = now;
    // Hands update more often than the face model; stale frames are never queued.
    const resultHand = handTask.detectForVideo(video, now);
    lastHand = resultHand.landmarks[0] || null;
    if (lastHand?.[8]) tracker.update(position(lastHand[8]), now);
    if (faceTask && now - lastFaceInference >= 110) {
      lastFaceInference = now;
      try {
        const found = faceTask.detectForVideo(video, now).detections[0];
        const bounds = found?.boundingBox;
        if (bounds) {
          // BlazeFace returns a measured face box and normalized eye points.
          lastFace = {
            corners: [
              { x: bounds.originX / video.videoWidth, y: bounds.originY / video.videoHeight },
              { x: (bounds.originX + bounds.width) / video.videoWidth,
                y: (bounds.originY + bounds.height) / video.videoHeight }
            ],
            eyes: found.keypoints?.slice(0, 2) ?? []
          };
          lastFaceAt = now;
        }
      } catch (_) {
        closeTask(faceTask);
        faceTask = null;
        lastFace = null;
        reportFaceFailure();
      }
    }
    if (now - lastFaceAt > 240) lastFace = null;
    const box = lastFace && faceBounds(lastFace.corners);
    const tracked=`${!!lastHand?.[8]}:${!!box}`;
    if(tracking!==tracked){tracking=tracked;onTracking({hand:!!lastHand?.[8],face:!!box});}
    if (!box) { frame = null; zone = null; gate.update(null, now); onFace(null); say(lastHand ? faceTask ? '光点已跟上指尖，让面部轮廓也进入画面' : faceFailed ? '手指光点可用，面部定位需重试；也可点选区域' : '手指光点已就绪，面部定位仍在准备' : '先让手掌和食指完整入镜，再慢慢靠近脸颊'); return; }
    const upper = position({ x: box.right, y: box.top }), lower = position({ x: box.left, y: box.bottom });
    frame = { left: upper.x, top: upper.y, width: lower.x - upper.x, height: lower.y - upper.y }; onFace(frame);
    if (!lastHand?.[8]) { zone = null; gate.update(null, now); say('面部已就绪，抬起食指，让指尖进入画面'); return; }
    const fingertip = lastHand[8];
    const nearEye = lastFace.eyes.some(eye =>
      Math.hypot((fingertip.x - eye.x) / box.width, (fingertip.y - eye.y) / box.height) < .15);
    zone = nearEye ? null : faceZone(lastFace.corners, fingertip, .035);
    if (!zone) { gate.update(null, now); say('光点跟随食指，靠近脸颊或额头试试'); return; }
    const tip = position(lastHand[8]), relative = { x: (tip.x - frame.left) / frame.width, y: (tip.y - frame.top) / frame.height };
    const shown = gate.update(zone, now, relative);
    say('轻轻移动指尖，光圈跟随位置展开');
    if (shown) { ripple(tip, now); onApproach(shown, anchored(tip)); }
  }
  function loop(now) {
    if (stopped) return;
    try { infer(now); draw(now); }
    catch (_) { say('实时识别暂停，仍可轻点画面查看动画'); stop(); onFallback(); return; }
    frameId = requestAnimationFrame(loop);
  }
  function stop() {
    if (stopped) return;
    stopped = true; loading.abort(); clearTimeout(faceTimer); cancelAnimationFrame(frameId); tracker.reset(); gate.reset(); ripples = []; trail = []; glow.remove();
    ctx.clearRect(0, 0, canvas.width, canvas.height); closeTask(faceTask); closeTask(handTask);if(wasmURL)URL.revokeObjectURL(wasmURL);signal?.removeEventListener('abort',cancel);onFace(null); onPointer(null);
  }
  onReady('hand');say('手指识别已就绪，先让手掌和食指进入画面'); frameId = requestAnimationFrame(loop);
  faceTimer = setTimeout(prepareFace, 280);
  return { stop, retryFace: prepareFace };
}
