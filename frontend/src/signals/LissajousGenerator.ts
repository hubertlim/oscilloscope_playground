/**
 * LissajousGenerator — Generates XY point data for Lissajous figures.
 *
 * A Lissajous curve is defined by:
 *   x(t) = A * sin(a*t + δ)
 *   y(t) = B * sin(b*t)
 *
 * The beam intensity varies inversely with speed — slower segments
 * appear brighter, just like a real oscilloscope.
 */

import { SignalGenerator, SignalOutput } from './SignalGenerator';

export interface LissajousParams {
  freqX: number;
  freqY: number;
  phaseOffset: number;
  amplitude: number;
  speed: number;
}

const POINTS_PER_FRAME = 4096;

export class LissajousGenerator implements SignalGenerator {
  readonly name = 'Lissajous';

  public params: LissajousParams = {
    freqX: 3,
    freqY: 2,
    phaseOffset: 0,
    amplitude: 0.8,
    speed: 1.0,
  };

  private positions: Float32Array;
  private intensities: Float32Array;
  private time = 0;

  constructor() {
    this.positions = new Float32Array(POINTS_PER_FRAME * 3);
    this.intensities = new Float32Array(POINTS_PER_FRAME);
  }

  generate(dt: number): SignalOutput {
    const p = this.params;
    this.time += dt * p.speed;

    const count = POINTS_PER_FRAME;
    const twoPi = Math.PI * 2;
    const timePhase = this.time * 0.3;

    let prevX = 0;
    let prevY = 0;

    for (let i = 0; i < count; i++) {
      const t = (i / count) * twoPi * Math.max(p.freqX, p.freqY);

      const x = p.amplitude * Math.sin(p.freqX * t + p.phaseOffset + timePhase);
      const y = p.amplitude * Math.sin(p.freqY * t);

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = 0;

      if (i > 0) {
        const dx = x - prevX;
        const dy = y - prevY;
        const speed = Math.sqrt(dx * dx + dy * dy) * count;
        this.intensities[i] = Math.min(1.0, 0.3 / (speed + 0.05));
      } else {
        this.intensities[i] = 0.5;
      }

      prevX = x;
      prevY = y;
    }

    this.normalizeIntensities(count);
    return { positions: this.positions, intensities: this.intensities, count };
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
  }
}
