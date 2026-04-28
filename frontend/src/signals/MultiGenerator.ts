/**
 * MultiGenerator — Combines multiple waveforms into complex patterns.
 * Supports additive synthesis, AM/FM modulation, and harmonic series.
 */

import { SignalGenerator, SignalOutput } from './SignalGenerator';
import { WaveformShape } from './WaveformGenerator';

export type MultiMode = 'additive' | 'am' | 'fm' | 'harmonics';

export interface MultiParams {
  mode: MultiMode;
  /** Base waveform */
  baseShape: WaveformShape;
  baseFreq: number;
  baseAmp: number;
  /** Modulator / second waveform */
  modShape: WaveformShape;
  modFreq: number;
  modAmp: number;
  /** Number of harmonics (for harmonics mode) */
  harmonicCount: number;
  /** Harmonic falloff (1/n^falloff) */
  harmonicFalloff: number;
  speed: number;
}

const POINTS_PER_FRAME = 4096;

export class MultiGenerator implements SignalGenerator {
  readonly name = 'Multi';

  public params: MultiParams = {
    mode: 'harmonics',
    baseShape: 'sine',
    baseFreq: 1.0,
    baseAmp: 0.7,
    modShape: 'sine',
    modFreq: 3.0,
    modAmp: 0.5,
    harmonicCount: 5,
    harmonicFalloff: 1.0,
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
    this.time += dt * this.params.speed;
    const p = this.params;

    switch (p.mode) {
      case 'additive': return this.generateAdditive();
      case 'am': return this.generateAM();
      case 'fm': return this.generateFM();
      case 'harmonics': return this.generateHarmonics();
      default: return this.generateHarmonics();
    }
  }

  /** Additive: X-Y plot of base + modulator */
  private generateAdditive(): SignalOutput {
    const p = this.params;
    const count = POINTS_PER_FRAME;
    const twoPi = Math.PI * 2;
    const tOff = this.time * 0.3;
    let prevX = 0, prevY = 0;

    for (let i = 0; i < count; i++) {
      const t = (i / count) * twoPi * Math.max(p.baseFreq, p.modFreq) * 2;
      const x = p.baseAmp * this.eval(p.baseShape, p.baseFreq * t + tOff);
      const y = p.modAmp * this.eval(p.modShape, p.modFreq * t);
      const xMixed = x + p.modAmp * 0.3 * this.eval(p.modShape, p.modFreq * 2 * t);
      const yMixed = y + p.baseAmp * 0.3 * this.eval(p.baseShape, p.baseFreq * 2 * t + tOff);

      this.positions[i * 3] = xMixed * 0.8;
      this.positions[i * 3 + 1] = yMixed * 0.8;
      this.positions[i * 3 + 2] = 0;
      this.calcIntensity(i, xMixed * 0.8, yMixed * 0.8, prevX, prevY, count);
      prevX = xMixed * 0.8;
      prevY = yMixed * 0.8;
    }

    this.normalizeIntensities(count);
    return { positions: this.positions, intensities: this.intensities, count };
  }

  /** AM: Amplitude modulation — carrier modulated by envelope */
  private generateAM(): SignalOutput {
    const p = this.params;
    const count = POINTS_PER_FRAME;
    const twoPi = Math.PI * 2;
    const tOff = this.time * 0.3;
    let prevX = 0, prevY = 0;

    for (let i = 0; i < count; i++) {
      const t = (i / count) * twoPi * p.baseFreq * 3;
      const carrier = this.eval(p.baseShape, t + tOff);
      const modulator = 0.5 + 0.5 * this.eval(p.modShape, p.modFreq / p.baseFreq * t);
      const x = p.baseAmp * carrier * modulator;
      const y = p.modAmp * this.eval(p.modShape, p.modFreq * t + Math.PI / 4);

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = 0;
      this.calcIntensity(i, x, y, prevX, prevY, count);
      prevX = x;
      prevY = y;
    }

    this.normalizeIntensities(count);
    return { positions: this.positions, intensities: this.intensities, count };
  }

  /** FM: Frequency modulation — creates complex spirograph-like patterns */
  private generateFM(): SignalOutput {
    const p = this.params;
    const count = POINTS_PER_FRAME;
    const twoPi = Math.PI * 2;
    const tOff = this.time * 0.2;
    let prevX = 0, prevY = 0;

    for (let i = 0; i < count; i++) {
      const t = (i / count) * twoPi * p.baseFreq * 3;
      const modSignal = p.modAmp * 2.0 * this.eval(p.modShape, p.modFreq * t);
      const x = p.baseAmp * Math.sin(t + modSignal + tOff);
      const y = p.baseAmp * Math.cos(t * (p.modFreq / p.baseFreq) + modSignal * 0.7);

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = 0;
      this.calcIntensity(i, x, y, prevX, prevY, count);
      prevX = x;
      prevY = y;
    }

    this.normalizeIntensities(count);
    return { positions: this.positions, intensities: this.intensities, count };
  }

  /** Harmonics: Y-T display of harmonic series */
  private generateHarmonics(): SignalOutput {
    const p = this.params;
    const count = POINTS_PER_FRAME;
    const twoPi = Math.PI * 2;
    const tOff = this.time * 0.4;
    let prevY = 0;

    for (let i = 0; i < count; i++) {
      const frac = i / count;
      const x = -0.9 + frac * 1.8;
      const t = frac * twoPi * p.baseFreq * 2 + tOff;

      // Sum harmonics
      let y = 0;
      for (let h = 1; h <= p.harmonicCount; h++) {
        const harmAmp = 1.0 / Math.pow(h, p.harmonicFalloff);
        y += harmAmp * this.eval(p.baseShape, h * t);
      }
      // Normalize
      y *= p.baseAmp / this.harmonicNorm(p.harmonicCount, p.harmonicFalloff);

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = Math.max(-0.95, Math.min(0.95, y));
      this.positions[i * 3 + 2] = 0;

      if (i > 0) {
        const dy = Math.abs(y - prevY);
        const speed = dy * count;
        this.intensities[i] = Math.min(1.0, 0.4 / (speed + 0.08));
      } else {
        this.intensities[i] = 0.5;
      }
      prevY = y;
    }

    this.normalizeIntensities(count);
    return { positions: this.positions, intensities: this.intensities, count };
  }

  private harmonicNorm(n: number, falloff: number): number {
    let sum = 0;
    for (let h = 1; h <= n; h++) sum += 1.0 / Math.pow(h, falloff);
    return Math.max(sum, 0.001);
  }

  private eval(shape: WaveformShape, phase: number): number {
    const twoPi = Math.PI * 2;
    const n = ((phase % twoPi) + twoPi) % twoPi;
    switch (shape) {
      case 'sine': return Math.sin(phase);
      case 'square': return n < Math.PI ? 1.0 : -1.0;
      case 'sawtooth': return (n / Math.PI) - 1.0;
      case 'triangle': return n < Math.PI ? -1 + 2 * n / Math.PI : 3 - 2 * n / Math.PI;
      default: return Math.sin(phase);
    }
  }

  private calcIntensity(i: number, x: number, y: number, px: number, py: number, count: number): void {
    if (i > 0) {
      const dx = x - px;
      const dy = y - py;
      const speed = Math.sqrt(dx * dx + dy * dy) * count;
      this.intensities[i] = Math.min(1.0, 0.3 / (speed + 0.05));
    } else {
      this.intensities[i] = 0.5;
    }
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
