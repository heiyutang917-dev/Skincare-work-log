import { ApproachGate, FingertipTracker, faceBounds, faceZone, toStagePoint } from './ar-engine.mjs?v=finger1';

/** Camera landmarks are processed locally; 2D proximity cannot verify physical contact. */
export async function startARMirror({ video, stage, canvas, onApproach, onStatus, onFace = () => {}, onPointer = () => {}, onFallback = () => {} }) {
  const { FilesetResolver, FaceLandmarker, HandLandmarker } = await import('./vendor/vision_bundle.mjs');
  const wasm = await FilesetResolver.forVisionTasks(new URL('./vendor/wasm/', import.meta.url).href);
  let faceTask, handTask;
  try {
    faceTask = await FaceLandmarker.createFromOptions(wasm, {
      baseOptions: { modelAssetPath: new URL('./models/face_landmarker.task', import.meta.url).href, delegate: 'CPU' },
      runningMode: 'VIDEO', numFaces: 1, minFaceDetectionConfidence: .5,
      minFacePresenceConfidence: .5, minTrackingConfidence: .5,
      outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false
    });
    handTask = await HandLandmarker.createFromOptions(wasm, {
      baseOptions: { modelAssetPath: new URL('./models/hand_landmarker.task', import.meta.url).href, delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .45,
      minHandPresenceConfidence: .45, minTrackingConfidence: .45
    });
  } catch (error) { faceTask?.close(); handTask?.close(); throw error; }

  const ctx = canvas.getContext('2d'), gate = new ApproachGate(), tracker = new FingertipTracker();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const glow = document.createElement('div'); glow.className = 'ar-fingertip'; glow.hidden = true; glow.setAttribute('aria-hidden', 'true'); stage.append(glow);
  let stopped = false, frameId = 0, lastFaceInference = -Infinity, lastHandInference = -Infinity, lastVideoTime = -1;
  let lastFace = null, lastHand = null, lastFaceAt = -Infinity, frame = null, zone = null, status = '';
  let ripples = [], trail = [], lastRipple = null, lastTrailAt = -Infinity;

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
    if (lastFace && now - lastFaceAt <= 240) {
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(235,255,240,.33)';
      for (const edge of FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
        const a = lastFace[edge.start], b = lastFace[edge.end]; if (!a || !b) continue;
        const p1 = position(a), p2 = position(b);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
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
    if (now - lastFaceInference >= 110) {
      lastFaceInference = now;
      const found = faceTask.detectForVideo(video, now).faceLandmarks[0];
      if (found) { lastFace = found; lastFaceAt = now; }
    }
    if (now - lastFaceAt > 240) lastFace = null;
    const box = lastFace && faceBounds(lastFace);
    if (!box) { frame = null; zone = null; gate.update(null, now); onFace(null); say(lastHand ? '光点已跟上指尖，让面部轮廓也进入画面' : '让面部和食指进入画面'); return; }
    const upper = position({ x: box.right, y: box.top }), lower = position({ x: box.left, y: box.bottom });
    frame = { left: upper.x, top: upper.y, width: lower.x - upper.x, height: lower.y - upper.y }; onFace(frame);
    if (!lastHand?.[8]) { zone = null; gate.update(null, now); say('面部已就绪，抬起食指，让指尖进入画面'); return; }
    zone = faceZone(lastFace, lastHand[8], .035);
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
    stopped = true; cancelAnimationFrame(frameId); tracker.reset(); gate.reset(); ripples = []; trail = []; glow.remove();
    ctx.clearRect(0, 0, canvas.width, canvas.height); faceTask?.close(); handTask?.close(); onFace(null); onPointer(null);
  }
  say('已就绪，抬起食指，让光点跟随你的指尖'); frameId = requestAnimationFrame(loop);
  return { stop };
}
