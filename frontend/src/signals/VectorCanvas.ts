/**
 * VectorCanvas — User-drawn vector content with keyframe animation.
 *
 * Users draw paths on the scope screen. Each path is a series of XY points.
 * Multiple paths can be combined. Keyframes allow animating between different
 * drawings over time.
 *
 * Built-in templates: circle, star, square, spiral, heart, text outlines.
 */

import { SignalGenerator, SignalOutput } from './SignalGenerator';

export interface VectorPath {
  points: Array<{ x: number; y: number }>;
  closed: boolean;
}

export interface Keyframe {
  time: number; // seconds
  paths: VectorPath[];
}

export interface DrawParams {
  animSpeed: number;
  loopAnimation: boolean;
  traceSpeed: number; // how fast the beam traces the drawing
  interpolation: 'linear' | 'smooth';
}

const MAX_POINTS = 16384;
const POINTS_PER_SEGMENT = 8; // interpolation density between drawn points

export class VectorCanvas implements SignalGenerator {
  readonly name = 'Draw';

  public params: DrawParams = {
    animSpeed: 1.0,
    loopAnimation: true,
    traceSpeed: 1.0,
    interpolation: 'linear',
  };

  // Current drawing state
  private paths: VectorPath[] = [];
  private currentPath: VectorPath | null = null;

  // Keyframe animation
  private keyframes: Keyframe[] = [];
  private animTime = 0;
  private isPlaying = false;

  // Output buffers
  private positions: Float32Array;
  private intensities: Float32Array;
  private time = 0;

  // Callbacks for UI updates
  public onKeyframesChanged: (() => void) | null = null;

  constructor() {
    this.positions = new Float32Array(MAX_POINTS * 3);
    this.intensities = new Float32Array(MAX_POINTS);
  }

  // ===================== DRAWING =====================

  startPath(x: number, y: number): void {
    this.currentPath = { points: [{ x, y }], closed: false };
  }

  addPoint(x: number, y: number): void {
    if (!this.currentPath) return;
    const last = this.currentPath.points[this.currentPath.points.length - 1];
    const dx = x - last.x;
    const dy = y - last.y;
    // Only add if moved enough (avoid clustering)
    if (Math.sqrt(dx * dx + dy * dy) > 0.008) {
      this.currentPath.points.push({ x, y });
    }
  }

  endPath(close: boolean = false): void {
    if (!this.currentPath) return;
    if (this.currentPath.points.length >= 2) {
      this.currentPath.closed = close;
      this.paths.push(this.currentPath);
    }
    this.currentPath = null;
  }

  clearPaths(): void {
    this.paths = [];
    this.currentPath = null;
  }

  undoLastPath(): void {
    this.paths.pop();
  }

  getPaths(): VectorPath[] {
    return this.paths;
  }

  getPathCount(): number {
    return this.paths.length;
  }

  // ===================== TEMPLATES =====================

  loadTemplate(name: string): void {
    this.clearPaths();
    switch (name) {
      case 'circle': this.paths = [this.makeCircle(0, 0, 0.7, 64)]; break;
      case 'star': this.paths = [this.makeStar(0, 0, 0.7, 0.3, 5)]; break;
      case 'square': this.paths = [this.makeRect(0, 0, 1.2, 1.2)]; break;
      case 'triangle': this.paths = [this.makePolygon(0, 0, 0.7, 3)]; break;
      case 'pentagon': this.paths = [this.makePolygon(0, 0, 0.7, 5)]; break;
      case 'spiral': this.paths = [this.makeSpiral(0, 0, 0.05, 0.7, 5, 200)]; break;
      case 'heart': this.paths = [this.makeHeart(0, 0, 0.6)]; break;
      case 'infinity': this.paths = [this.makeInfinity(0, 0, 0.6)]; break;
      case 'grid': this.paths = this.makeGrid(0.7, 5); break;
      case 'crosshair': this.paths = this.makeCrosshair(0.8); break;
    }
  }

  private makeCircle(cx: number, cy: number, r: number, n: number): VectorPath {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return { points, closed: true };
  }

  private makeStar(cx: number, cy: number, outer: number, inner: number, tips: number): VectorPath {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= tips * 2; i++) {
      const a = (i / (tips * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outer : inner;
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return { points, closed: true };
  }

  private makeRect(cx: number, cy: number, w: number, h: number): VectorPath {
    const hw = w / 2, hh = h / 2;
    return {
      points: [
        { x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh },
        { x: cx - hw, y: cy - hh },
      ],
      closed: true,
    };
  }

  private makePolygon(cx: number, cy: number, r: number, sides: number): VectorPath {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return { points, closed: true };
  }

  private makeSpiral(cx: number, cy: number, rStart: number, rEnd: number, turns: number, n: number): VectorPath {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < n; i++) {
      const frac = i / n;
      const a = frac * turns * Math.PI * 2;
      const r = rStart + (rEnd - rStart) * frac;
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return { points, closed: false };
  }

  private makeHeart(cx: number, cy: number, scale: number): VectorPath {
    const points: Array<{ x: number; y: number }> = [];
    const n = 80;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      points.push({ x: cx + x * scale / 17, y: cy + y * scale / 17 });
    }
    return { points, closed: true };
  }

  private makeInfinity(cx: number, cy: number, scale: number): VectorPath {
    const points: Array<{ x: number; y: number }> = [];
    const n = 100;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      const x = Math.cos(t) / (1 + Math.sin(t) * Math.sin(t));
      const y = Math.sin(t) * Math.cos(t) / (1 + Math.sin(t) * Math.sin(t));
      points.push({ x: cx + x * scale * 1.3, y: cy + y * scale * 1.3 });
    }
    return { points, closed: true };
  }

  private makeGrid(size: number, divisions: number): VectorPath[] {
    const paths: VectorPath[] = [];
    const step = (size * 2) / divisions;
    for (let i = 0; i <= divisions; i++) {
      const pos = -size + i * step;
      paths.push({ points: [{ x: pos, y: -size }, { x: pos, y: size }], closed: false });
      paths.push({ points: [{ x: -size, y: pos }, { x: size, y: pos }], closed: false });
    }
    return paths;
  }

  private makeCrosshair(size: number): VectorPath[] {
    return [
      { points: [{ x: -size, y: 0 }, { x: size, y: 0 }], closed: false },
      { points: [{ x: 0, y: -size }, { x: 0, y: size }], closed: false },
      this.makeCircle(0, 0, size * 0.3, 32),
      this.makeCircle(0, 0, size * 0.6, 48),
    ];
  }

  // ===================== KEYFRAMES =====================

  addKeyframe(): void {
    const time = this.keyframes.length === 0 ? 0 : this.keyframes[this.keyframes.length - 1].time + 2.0;
    const pathsCopy = this.paths.map(p => ({
      points: p.points.map(pt => ({ ...pt })),
      closed: p.closed,
    }));
    this.keyframes.push({ time, paths: pathsCopy });
    this.onKeyframesChanged?.();
  }

  removeKeyframe(index: number): void {
    if (index >= 0 && index < this.keyframes.length) {
      this.keyframes.splice(index, 1);
      this.onKeyframesChanged?.();
    }
  }

  getKeyframes(): Keyframe[] {
    return this.keyframes;
  }

  clearKeyframes(): void {
    this.keyframes = [];
    this.animTime = 0;
    this.onKeyframesChanged?.();
  }

  setPlaying(playing: boolean): void {
    this.isPlaying = playing;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  getAnimTime(): number {
    return this.animTime;
  }

  setAnimTime(t: number): void {
    this.animTime = t;
  }

  // ===================== SERIALIZATION =====================

  exportData(): { paths: VectorPath[]; keyframes: Keyframe[]; params: DrawParams } {
    return {
      paths: this.paths.map(p => ({ points: [...p.points], closed: p.closed })),
      keyframes: this.keyframes.map(k => ({
        time: k.time,
        paths: k.paths.map(p => ({ points: [...p.points], closed: p.closed })),
      })),
      params: { ...this.params },
    };
  }

  importData(data: { paths?: VectorPath[]; keyframes?: Keyframe[]; params?: Partial<DrawParams> }): void {
    if (data.paths) this.paths = data.paths;
    if (data.keyframes) this.keyframes = data.keyframes;
    if (data.params) Object.assign(this.params, data.params);
  }

  // ===================== GENERATION =====================

  generate(dt: number): SignalOutput {
    this.time += dt;

    let activePaths: VectorPath[];

    // If we have keyframes and animation is playing, interpolate
    if (this.keyframes.length >= 2 && this.isPlaying) {
      this.animTime += dt * this.params.animSpeed;
      const totalDuration = this.keyframes[this.keyframes.length - 1].time;
      if (this.params.loopAnimation && totalDuration > 0) {
        this.animTime = this.animTime % totalDuration;
      } else {
        this.animTime = Math.min(this.animTime, totalDuration);
      }
      activePaths = this.interpolateKeyframes(this.animTime);
    } else if (this.keyframes.length >= 2 && !this.isPlaying) {
      activePaths = this.interpolateKeyframes(this.animTime);
    } else {
      // Use current paths (including in-progress drawing)
      activePaths = [...this.paths];
      if (this.currentPath && this.currentPath.points.length >= 2) {
        activePaths.push(this.currentPath);
      }
    }

    if (activePaths.length === 0) {
      return this.generateIdle();
    }

    return this.rasterizePaths(activePaths);
  }

  private generateIdle(): SignalOutput {
    // Show a subtle dot in the center, like a scope with no signal
    const count = 64;
    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * 0.01;
      this.positions[i * 3 + 1] = (Math.random() - 0.5) * 0.01;
      this.positions[i * 3 + 2] = 0;
      this.intensities[i] = 0.4;
    }
    return { positions: this.positions, intensities: this.intensities, count };
  }

  /**
   * Convert vector paths into beam points.
   * The beam traces each path sequentially, with intensity varying by speed.
   */
  private rasterizePaths(paths: VectorPath[]): SignalOutput {
    // First, count total segments to allocate points proportionally
    let totalSegments = 0;
    for (const path of paths) {
      totalSegments += Math.max(1, path.points.length - 1);
    }

    const maxPoints = Math.min(MAX_POINTS, totalSegments * POINTS_PER_SEGMENT + paths.length * 2);
    let idx = 0;

    // Beam trace offset for animation
    const traceOffset = this.time * this.params.traceSpeed * 0.5;

    for (const path of paths) {
      if (path.points.length < 2) continue;

      const pts = path.points;
      const segCount = pts.length - 1;
      const pointsForPath = Math.floor((segCount / totalSegments) * maxPoints);

      for (let i = 0; i < pointsForPath && idx < MAX_POINTS; i++) {
        const frac = i / pointsForPath;
        const segFrac = frac * segCount;
        const segIdx = Math.min(Math.floor(segFrac), segCount - 1);
        const t = segFrac - segIdx;

        let x: number, y: number;

        if (this.params.interpolation === 'smooth' && pts.length >= 4) {
          // Catmull-Rom spline interpolation
          const p0 = pts[Math.max(0, segIdx - 1)];
          const p1 = pts[segIdx];
          const p2 = pts[Math.min(segIdx + 1, pts.length - 1)];
          const p3 = pts[Math.min(segIdx + 2, pts.length - 1)];
          x = this.catmullRom(p0.x, p1.x, p2.x, p3.x, t);
          y = this.catmullRom(p0.y, p1.y, p2.y, p3.y, t);
        } else {
          // Linear interpolation
          const p1 = pts[segIdx];
          const p2 = pts[segIdx + 1];
          x = p1.x + (p2.x - p1.x) * t;
          y = p1.y + (p2.y - p1.y) * t;
        }

        this.positions[idx * 3] = x;
        this.positions[idx * 3 + 1] = y;
        this.positions[idx * 3 + 2] = 0;

        // Intensity: uniform with slight variation for realism
        this.intensities[idx] = 0.6 + Math.sin((frac + traceOffset) * Math.PI * 20) * 0.1;
        idx++;
      }

      // Small gap between paths (beam retrace)
      if (idx < MAX_POINTS - 2) {
        this.positions[idx * 3] = this.positions[(idx - 1) * 3];
        this.positions[idx * 3 + 1] = this.positions[(idx - 1) * 3 + 1];
        this.positions[idx * 3 + 2] = 0;
        this.intensities[idx] = 0.05; // dim retrace
        idx++;
      }
    }

    const count = idx;
    this.normalizeIntensities(count);
    return { positions: this.positions, intensities: this.intensities, count };
  }

  private catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  /**
   * Interpolate between keyframes at a given time.
   */
  private interpolateKeyframes(time: number): VectorPath[] {
    if (this.keyframes.length === 0) return this.paths;
    if (this.keyframes.length === 1) return this.keyframes[0].paths;

    // Find surrounding keyframes
    let kfA = this.keyframes[0];
    let kfB = this.keyframes[1];

    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (time >= this.keyframes[i].time && time <= this.keyframes[i + 1].time) {
        kfA = this.keyframes[i];
        kfB = this.keyframes[i + 1];
        break;
      }
    }

    if (time >= this.keyframes[this.keyframes.length - 1].time) {
      return this.keyframes[this.keyframes.length - 1].paths;
    }

    const duration = kfB.time - kfA.time;
    if (duration <= 0) return kfA.paths;
    const t = (time - kfA.time) / duration;
    const smoothT = t * t * (3 - 2 * t); // smoothstep

    // Interpolate matching paths
    const maxPaths = Math.max(kfA.paths.length, kfB.paths.length);
    const result: VectorPath[] = [];

    for (let p = 0; p < maxPaths; p++) {
      const pathA = kfA.paths[p];
      const pathB = kfB.paths[p];

      if (!pathA && pathB) {
        // Fade in: scale from center
        result.push(this.scalePath(pathB, smoothT));
      } else if (pathA && !pathB) {
        // Fade out: scale to center
        result.push(this.scalePath(pathA, 1 - smoothT));
      } else if (pathA && pathB) {
        // Interpolate point by point
        result.push(this.lerpPaths(pathA, pathB, smoothT));
      }
    }

    return result;
  }

  private lerpPaths(a: VectorPath, b: VectorPath, t: number): VectorPath {
    const maxLen = Math.max(a.points.length, b.points.length);
    const points: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < maxLen; i++) {
      const fracA = a.points.length > 1 ? i / (maxLen - 1) * (a.points.length - 1) : 0;
      const fracB = b.points.length > 1 ? i / (maxLen - 1) * (b.points.length - 1) : 0;

      const idxA = Math.floor(fracA);
      const tA = fracA - idxA;
      const pA1 = a.points[Math.min(idxA, a.points.length - 1)];
      const pA2 = a.points[Math.min(idxA + 1, a.points.length - 1)];
      const ax = pA1.x + (pA2.x - pA1.x) * tA;
      const ay = pA1.y + (pA2.y - pA1.y) * tA;

      const idxB = Math.floor(fracB);
      const tB = fracB - idxB;
      const pB1 = b.points[Math.min(idxB, b.points.length - 1)];
      const pB2 = b.points[Math.min(idxB + 1, b.points.length - 1)];
      const bx = pB1.x + (pB2.x - pB1.x) * tB;
      const by = pB1.y + (pB2.y - pB1.y) * tB;

      points.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
    }

    return { points, closed: a.closed || b.closed };
  }

  private scalePath(path: VectorPath, scale: number): VectorPath {
    return {
      points: path.points.map(p => ({ x: p.x * scale, y: p.y * scale })),
      closed: path.closed,
    };
  }

  private normalizeIntensities(count: number): void {
    let maxI = 0;
    for (let i = 0; i < count; i++) {
      if (this.intensities[i] > maxI) maxI = this.intensities[i];
    }
    if (maxI > 0) {
      const scale = 1.0 / maxI;
      for (let i = 0; i < count; i++) {
        this.intensities[i] = 0.3 + this.intensities[i] * scale * 0.7;
      }
    }
  }

  reset(): void {
    this.time = 0;
    this.animTime = 0;
    this.isPlaying = false;
  }
}
