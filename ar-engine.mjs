/** Pure geometry and timing for the camera interaction. Coordinates are image-normalized. */
export function faceBounds(landmarks) {
  const points = landmarks?.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  if (!points?.length) return null;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const left = Math.min(...xs), right = Math.max(...xs);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  if (right - left < 0.08 || bottom - top < 0.08) return null;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

export function faceZone(landmarks, fingertip) {
  const box = faceBounds(landmarks);
  if (!box || !fingertip || !Number.isFinite(fingertip.x) || !Number.isFinite(fingertip.y)) return null;
  const u = (fingertip.x - box.left) / box.width;
  const v = (fingertip.y - box.top) / box.height;
  // The ellipse rejects fingers passing outside the visible facial oval.
  const dx = (u - 0.5) / 0.48, dy = (v - 0.5) / 0.53;
  if (dx * dx + dy * dy > 1) return null;
  // Avoid suggesting application very close to the eyes.
  if (v > 0.31 && v < 0.51 && (u < 0.34 || u > 0.66)) return null;
  if (v < 0.37) return 'forehead';
  if (v > 0.74 && u > 0.34 && u < 0.66) return 'chin';
  if (u < 0.39 || u > 0.61) return 'cheek';
  return 'center';
}

export function toStagePoint(point, videoWidth, videoHeight, stageWidth, stageHeight, mirrored = true) {
  const scale = Math.max(stageWidth / videoWidth, stageHeight / videoHeight);
  const offsetX = (stageWidth - videoWidth * scale) / 2;
  const offsetY = (stageHeight - videoHeight * scale) / 2;
  const rawX = offsetX + point.x * videoWidth * scale;
  return { x: mirrored ? stageWidth - rawX : rawX, y: offsetY + point.y * videoHeight * scale };
}

export class ApproachGate {
  constructor({ holdMs = 260, minFrames = 3, cooldownMs = 1700 } = {}) {
    this.holdMs = holdMs; this.minFrames = minFrames; this.cooldownMs = cooldownMs;
    this.candidate = null; this.since = 0; this.frames = 0;
    this.lastTrigger = -Infinity; this.latched = null;
  }
  update(zone, now) {
    if (!zone) { this.candidate = null; this.frames = 0; this.latched = null; return null; }
    if (zone !== this.candidate) { this.candidate = zone; this.since = now; this.frames = 1; }
    else this.frames += 1;
    if (zone === this.latched || this.frames < this.minFrames || now - this.since < this.holdMs || now - this.lastTrigger < this.cooldownMs) return null;
    this.lastTrigger = now; this.latched = zone; return zone;
  }
  reset() { this.candidate = null; this.frames = 0; this.latched = null; }
  progress(now) {
    if (!this.candidate) return 0;
    return Math.max(0, Math.min(1, this.frames / Math.max(1, this.minFrames), (now - this.since) / Math.max(1, this.holdMs)));
  }
}
