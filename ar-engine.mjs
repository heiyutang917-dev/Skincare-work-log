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

export function faceZone(landmarks, fingertip, margin = 0) {
  const box = faceBounds(landmarks);
  if (!box || !fingertip || !Number.isFinite(fingertip.x) || !Number.isFinite(fingertip.y)) return null;
  const u = (fingertip.x - box.left) / box.width;
  const v = (fingertip.y - box.top) / box.height;
  // The ellipse rejects fingers passing outside the visible facial oval.
  const dx = (u - 0.5) / (0.48 + margin), dy = (v - 0.5) / (0.53 + margin);
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
  constructor({ holdMs = 70, minFrames = 2, cooldownMs = 420, moveDistance = .14, releaseMs = 120 } = {}) {
    this.holdMs = holdMs; this.minFrames = minFrames; this.cooldownMs = cooldownMs;
    this.moveDistance = moveDistance; this.releaseMs = releaseMs;
    this.candidate = null; this.since = 0; this.frames = 0;
    this.lastTrigger = -Infinity; this.latched = null; this.lastPoint = null; this.outsideSince = null;
  }
  update(zone, now, point = null) {
    if (!zone) {
      if (this.outsideSince === null) this.outsideSince = now;
      this.candidate = null; this.frames = 0;
      if (now - this.outsideSince >= this.releaseMs) this.latched = null;
      return null;
    }
    if (this.outsideSince !== null && now - this.outsideSince >= this.releaseMs) this.latched = null;
    this.outsideSince = null;
    if (zone !== this.candidate) { this.candidate = zone; this.since = now; this.frames = 1; }
    else this.frames += 1;
    const moved = point && this.lastPoint && Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y) >= this.moveDistance;
    if ((zone === this.latched && !moved) || this.frames < this.minFrames || now - this.since < this.holdMs || now - this.lastTrigger < this.cooldownMs) return null;
    this.lastTrigger = now; this.latched = zone; this.lastPoint = point ? { ...point } : null; return zone;
  }
  reset() { this.candidate = null; this.frames = 0; this.latched = null; this.lastPoint = null; this.lastTrigger = -Infinity; this.outsideSince = null; }
  progress(now) {
    if (!this.candidate) return 0;
    return Math.max(0, Math.min(1, this.frames / Math.max(1, this.minFrames), (now - this.since) / Math.max(1, this.holdMs)));
  }
}

/** Smooth the visible fingertip independently of mechanism confirmation. */
export class FingertipTracker {
  constructor({ smoothingMs = 28, lostMs = 160, snapDistance = 100 } = {}) {
    this.smoothingMs = smoothingMs; this.lostMs = lostMs; this.snapDistance = snapDistance;
    this.target = null; this.current = null; this.lastSeen = -Infinity; this.lastDraw = null;
  }
  update(point, now) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (now - this.lastSeen > this.lostMs || !this.current || Math.hypot(point.x - this.current.x, point.y - this.current.y) > this.snapDistance) this.current = { x: point.x, y: point.y };
    this.target = { x: point.x, y: point.y }; this.lastSeen = now;
  }
  sample(now) {
    if (!this.target || now - this.lastSeen > this.lostMs) { this.current = null; return null; }
    const elapsed = this.lastDraw === null ? 16 : Math.max(0, now - this.lastDraw); this.lastDraw = now;
    const alpha = 1 - Math.exp(-elapsed / this.smoothingMs);
    this.current.x += (this.target.x - this.current.x) * alpha; this.current.y += (this.target.y - this.current.y) * alpha;
    return { ...this.current };
  }
  reset() { this.target = null; this.current = null; this.lastSeen = -Infinity; this.lastDraw = null; }
}
