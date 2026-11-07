import { ApproachGate, faceBounds, faceZone, toStagePoint } from './ar-engine.mjs?v=ar2';

/**
 * Runs face + hand landmark detection entirely inside the visitor's browser.
 * A fingertip overlapping the facial region in 2D is only an approximation of touch.
 */
export async function startARMirror({ video, stage, canvas, onApproach, onStatus, onFace = () => {}, onFallback = () => {} }) {
  const { FilesetResolver, FaceLandmarker, HandLandmarker } = await import('./vendor/vision_bundle.mjs');
  const wasm = await FilesetResolver.forVisionTasks(new URL('./vendor/wasm/', import.meta.url).href);
  let faceTask;
  let handTask;
  try {
    faceTask = await FaceLandmarker.createFromOptions(wasm, {
      baseOptions: { modelAssetPath: new URL('./models/face_landmarker.task', import.meta.url).href, delegate: 'CPU' },
      runningMode: 'VIDEO', numFaces: 1, minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false
    });
    handTask = await HandLandmarker.createFromOptions(wasm, {
      baseOptions: { modelAssetPath: new URL('./models/hand_landmarker.task', import.meta.url).href, delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
    });
  } catch (error) { faceTask?.close(); handTask?.close(); throw error; }

  const ctx = canvas.getContext('2d');
  const gate = new ApproachGate();
  let stopped = false;
  let frameId = 0;
  let lastInferenceAt = -Infinity;
  let lastVideoTime = -1;
  let lastFace = null;
  let lastHand = null;
  let lastFaceAt = -Infinity;
  let zone = null;
  let status = '';
  let holdProgress = 0;

  function say(next) { if (next !== status) { status = next; onStatus(next); } }
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(stage.clientWidth * dpr), height = Math.round(stage.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function position(point) { return toStagePoint(point, video.videoWidth, video.videoHeight, stage.clientWidth, stage.clientHeight, true); }
  function draw(now) {
    resizeCanvas();
    const width = stage.clientWidth, height = stage.clientHeight;
    ctx.clearRect(0, 0, width, height);
    if (!lastFace || !video.videoWidth) return;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(232,255,224,.80)';
    ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(174,246,173,.68)';
    for (const edge of FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
      const a = lastFace[edge.start], b = lastFace[edge.end];
      if (!a || !b) continue;
      const p1 = position(a), p2 = position(b);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (lastHand?.[8]) {
      const finger = lastHand[8]; const tip = position(finger);
      ctx.strokeStyle = zone ? 'rgba(255,232,173,.95)' : 'rgba(232,255,224,.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const index of [5, 6, 7, 8]) {
        const p = position(lastHand[index]);
        if (index === 5) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      const pulse = 8 + Math.sin(now / 170) * 2;
      ctx.beginPath(); ctx.arc(tip.x, tip.y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = zone ? 'rgba(255,230,160,.33)' : 'rgba(210,251,209,.25)'; ctx.fill();
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#fffaf0'; ctx.fill();
      if (zone && holdProgress > 0) {
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * holdProgress);
        ctx.strokeStyle = '#fff1b7'; ctx.lineWidth = 3; ctx.stroke();
      }
    }
  }
  function infer(now) {
    if (video.readyState < 2 || !video.videoWidth || video.currentTime === lastVideoTime) return;
    if (now - lastInferenceAt < 90) return;
    lastInferenceAt = now; lastVideoTime = video.currentTime;
    const resultFace = faceTask.detectForVideo(video, now);
    const resultHand = handTask.detectForVideo(video, now);
    if (resultFace.faceLandmarks[0]) { lastFace = resultFace.faceLandmarks[0]; lastFaceAt = now; }
    else if (now - lastFaceAt > 450) lastFace = null;
    lastHand = resultHand.landmarks[0] || null;
    if (!resultFace.faceLandmarks[0]) { zone = null; holdProgress = 0; gate.update(null, now); onFace(null); say('请把脸放入画面中央；点选体验随时可用。'); return; }
    const box = faceBounds(lastFace);
    if (!box) { zone = null; holdProgress = 0; gate.update(null, now); onFace(null); return; }
    const upper = position({ x: box.right, y: box.top }), lower = position({ x: box.left, y: box.bottom });
    const frame = { left: upper.x, top: upper.y, width: lower.x - upper.x, height: lower.y - upper.y };
    onFace(frame);
    if (!lastHand?.[8]) { zone = null; holdProgress = 0; gate.update(null, now); say('已找到面部。让食指靠近脸颊或额头，停留片刻。'); return; }
    zone = faceZone(lastFace, lastHand[8]);
    if (!zone) { holdProgress = 0; gate.update(null, now); say('已找到脸和手。让食指靠近脸颊或额头，避开眼睛。'); return; }
    const shown = gate.update(zone, now);
    holdProgress = gate.progress(now);
    say(gate.latched === zone ? '已触发作用示意。移开手指后，可以再次体验。' : '检测到画面位置接近，保持片刻…');
    if (shown) {
      const tip = position(lastHand[8]);
      onApproach(shown, { ...tip, anchor: { u: (tip.x - frame.left) / frame.width, v: (tip.y - frame.top) / frame.height } });
    }
  }
  function loop(now) {
    if (stopped) return;
    try { infer(now); draw(now); }
    catch (error) { say('实时识别暂停；仍可点选脸颊或额头体验动画。'); stop(); onFallback(); return; }
    frameId = requestAnimationFrame(loop);
  }
  function stop() {
    if (stopped) return;
    stopped = true; cancelAnimationFrame(frameId);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    faceTask?.close(); handTask?.close();
    onFace(null);
  }
  say('模型已就绪。请把脸和食指放进画面。');
  frameId = requestAnimationFrame(loop);
  return { stop };
}
