/**
 * WaveformGenerator — Generates waveform visualizations.
 *
 * Supports multiple display modes:
 *   - Y-T (time sweep): Classic oscilloscope view, waveform scrolls left to right
 *   - X-Y: Two waveforms drive X and Y axes (like Lissajous but with arbitrary shapes)
 *
 * Waveform types: sine, square, sawtooth, triangle, noise
 */

import { SignalGenerator, SignalOutput } from './SignalGenerator';

export type WaveformShape = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';
export type DisplayMode = 'yt' | 'xy';

export interface WaveformParams {
  /** Display mode: Y-T sweep or X-Y */
  displayMode: DisplayMode;
  /** Channel 1 (Y in Y-T mode, X in X-Y mode) */
  ch1Shape: WaveformShape;
  ch1Freq: number;
  ch1Amp: number;
  ch1Phase: number;
  /** Channel 2 (unused in Y-T mode, Y in X-Y mode) */
  ch2Shape: WaveformShape;
  ch2Freq: number;
  ch2Amp: number;
  ch2Phase: number;
  /** Time base — controls how many cycles are visible */
  timebase: number;
  /** Animation speed */
  speed: number;
}

const POINTS_PER_FRAME = 4096;

export class WaveformGenerator implements SignalGenerator {
  readonly name = 'Waveform';

  public params: WaveformParams = {
    displayMode: 'yt',
    ch1Shape: 'sine',
    ch1Freq: 2.0,
    ch1Amp: 0.7,
    ch1Phase: 0,
    ch2Shape: 'sine',
    ch2Freq: 3.0,
    ch2Amp: 0.7,
    ch2Phase: 0,
    timebase: 2.0,
    speed: 1.0,
  };

  private positions: Float32Array;
  private intensities: Float32Array;
  private time = 0;
  private noiseBuffer: Float32Array;
  private noiseBuffer2: Float32Array;

  constructor() {
    this.positions = new Float32Array(POINTS_PER_FRAME * 3);
    this.intensities = new Float32Array(POINTS_PER_FRAME);
    // Pre-generate noise for consistent look per frame
    this.noiseBuffer = new Float32Array(POINTS_PER_FRAME);
    this.noiseBuffer2 = new Float32Array(POINTS_PER_FRAME);
    this.regenerateNoise();
  }

  private regenerateNoise(): void {
    for (let i = 0; i < POINTS_PER_FRAME; i++) {
      this.noiseBuffer[i] = (Math.random() * 2 - 1);
      this.noiseBuffer2[i] = (Math.random() * 2 - 1);
    }
  }

  generate(dt: number): SignalOutput {
    this.time += dt * this.params.speed;

    // Regenerate noise periodically for animation
    if (Math.floor(this.time * 15) !== Math.floor((this.time - dt * this.params.speed) * 15)) {
      this.regenerateNoise();
    }

    if (this.params.displayMode === 'yt') {
      return this.generateYT();
    } else {
      return this.generateXY();
    }
  }

  /**
   * Y-T mode: horizontal sweep, waveform on Y axis.
   * Classic oscilloscope time-domain view.
   */
  private generateYT(): SignalOutput {
    const p = this.params;
    const count = POINTS_PER_FRAME;
    const twoPi = Math.PI * 2;
    const timeOffset = this.time * 0.5;

    let prevY = 0;

    for (let i = 0; i < count; i++) {
      const frac = i / count;
      // X sweeps from -0.9 to 0.9
      const x = -0.9 + frac * 1.8;
      // T is the time value for this point
      const t = frac * twoPi * p.timebase + timeOffset;

      const y = p.ch1Amp * this.evalWaveform(p.ch1Shape, p.ch1Freq * t + p.ch1Phase, i);

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = 0;

      // Intensity: brighter at peaks (where beam slows down on vertical)
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

  /**
   * X-Y mode: Channel 1 drives X, Channel 2 drives Y.
   * Creates patterns similar to Lissajous but with arbitrary waveforms.
   */
  private generateXY(): SignalOutput {
    const p = this.params;
    const count = POINTS_PER_FRAME;
    const twoPi = Math.PI * 2;
    const timeOffset = this.time * 0.3;

    let prevX = 0;
    let prevY = 0;

    for (let i = 0; i < count; i++) {
      const t = (i / count) * twoPi * Math.max(p.ch1Freq, p.ch2Freq) * p.timebase;

      const x = p.ch1Amp * this.evalWaveform(p.ch1Shape, p.ch1Freq * t + p.ch1Phase + timeOffset, i);
      const y = p.ch2Amp * this.evalWaveform(p.ch2Shape, p.ch2Freq * t + p.ch2Phase, i);

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

  /**
   * Evaluate a waveform at a given phase angle.
   */
  private evalWaveform(shape: WaveformShape, phase: number, index: number): number {
    const twoPi = Math.PI * 2;
    const normalized = ((phase % twoPi) + twoPi) % twoPi; // 0..2π

    switch (shape) {
      case 'sine':
        return Math.sin(phase);

      case 'square': {
        // Band-limited square wave (sum of odd harmonics) to reduce aliasing
        const raw = normalized < Math.PI ? 1.0 : -1.0;
        // Smooth the transitions slightly for a more analog look
        const edge1 = Math.abs(normalized) / 0.15;
        const edge2 = Math.abs(normalized - Math.PI) / 0.15;
        if (edge1 < 1.0) return raw * edge1;
        if (edge2 < 1.0) return -raw * (1.0 - edge2) + raw * edge2;
        return raw;
      }

      case 'sawtooth': {
        // Rising sawtooth: -1 to 1 over one period
        return (normalized / Math.PI) - 1.0;
      }

      case 'triangle': {
        // Triangle wave
        if (normalized < Math.PI) {
          return -1.0 + (2.0 * normalized / Math.PI);
        } else {
          return 3.0 - (2.0 * normalized / Math.PI);
        }
      }

      case 'noise': {
        // Smoothed noise — interpolate between noise samples
        const noiseIdx = (index % POINTS_PER_FRAME);
        return this.noiseBuffer[noiseIdx] * 0.7;
      }

      default:
        return Math.sin(phase);
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
    this.regenerateNoise();
  }
}
