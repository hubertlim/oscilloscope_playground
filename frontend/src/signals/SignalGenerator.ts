/**
 * SignalGenerator — Unified interface for all signal sources.
 * Each generator produces XY point data for the phosphor renderer.
 */

export interface SignalOutput {
  positions: Float32Array;
  intensities: Float32Array;
  count: number;
}

export interface SignalGenerator {
  /** Human-readable name */
  readonly name: string;
  /** Generate one frame of points */
  generate(dt: number): SignalOutput;
  /** Reset time/state */
  reset(): void;
}

export type SignalMode = 'lissajous' | 'waveform' | 'multi' | 'audio' | 'draw';
