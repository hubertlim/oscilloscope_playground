/**
 * AudioVisualizer — Captures audio from microphone or file,
 * runs FFT analysis, and generates oscilloscope point data.
 *
 * Display modes:
 *   - waveform: Time-domain waveform (classic scope view)
 *   - spectrum: Frequency spectrum (FFT bars as connected line)
 *   - xy: Left channel → X, Right channel → Y (stereo oscilloscope)
 *   - radial: Spectrum wrapped around a circle
 */

import { SignalGenerator, SignalOutput } from './SignalGenerator';

export type AudioDisplayMode = 'waveform' | 'spectrum' | 'xy' | 'radial';
export type AudioSource = 'mic' | 'file' | 'none';

export interface AudioParams {
  displayMode: AudioDisplayMode;
  gain: number;
  smoothing: number;
  fftSize: number;
  lineThickness: number;
}

const MAX_POINTS = 8192;

export class AudioVisualizer implements SignalGenerator {
  readonly name = 'Audio';

  public params: AudioParams = {
    displayMode: 'waveform',
    gain: 3.0,       // Higher default — mic signals are weak
    smoothing: 0.65,
    fftSize: 2048,
    lineThickness: 1.0,
  };

  private positions: Float32Array;
  private intensities: Float32Array;

  private audioCtx: AudioContext | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: AudioNode | null = null;
  private mediaStream: MediaStream | null = null;

  private timeDomainL: Float32Array = new Float32Array(0);
  private timeDomainR: Float32Array = new Float32Array(0);
  private frequencyData: Float32Array = new Float32Array(0);

  private _currentSource: AudioSource = 'none';
  private _isActive = false;
  private _fileElement: HTMLAudioElement | null = null;

  private prevEnergy = 0;
  private beatDecay = 0;

  constructor() {
    this.positions = new Float32Array(MAX_POINTS * 3);
    this.intensities = new Float32Array(MAX_POINTS);
  }

  get isActive(): boolean { return this._isActive; }
  get currentSource(): AudioSource { return this._currentSource; }

  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private setupAnalysers(): void {
    const ctx = this.ensureContext();

    this.analyserL = ctx.createAnalyser();
    this.analyserL.fftSize = this.params.fftSize;
    this.analyserL.smoothingTimeConstant = this.params.smoothing;
    this.analyserL.minDecibels = -90;
    this.analyserL.maxDecibels = -10;

    this.analyserR = ctx.createAnalyser();
    this.analyserR.fftSize = this.params.fftSize;
    this.analyserR.smoothingTimeConstant = this.params.smoothing;
    this.analyserR.minDecibels = -90;
    this.analyserR.maxDecibels = -10;

    this.splitter = ctx.createChannelSplitter(2);
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.params.gain;

    const bufSize = this.analyserL.fftSize;
    this.timeDomainL = new Float32Array(bufSize);
    this.timeDomainR = new Float32Array(bufSize);
    this.frequencyData = new Float32Array(this.analyserL.frequencyBinCount);
  }

  async startMic(): Promise<void> {
    this.stop();
    this.setupAnalysers();
    const ctx = this.ensureContext();

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);
      this.connectGraph();
      this._currentSource = 'mic';
      this._isActive = true;
    } catch (err) {
      console.error('Microphone access denied:', err);
      throw err;
    }
  }

  async startFile(file: File): Promise<void> {
    this.stop();
    this.setupAnalysers();
    const ctx = this.ensureContext();

    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = url;
    audio.loop = true;
    this._fileElement = audio;

    this.sourceNode = ctx.createMediaElementSource(audio);
    this.connectGraph();
    this.gainNode!.connect(ctx.destination);

    await audio.play();
    this._currentSource = 'file';
    this._isActive = true;
  }

  private connectGraph(): void {
    if (!this.sourceNode || !this.gainNode || !this.splitter || !this.analyserL || !this.analyserR) return;
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.splitter);
    this.splitter.connect(this.analyserL, 0);
    this.splitter.connect(this.analyserR, 1);
  }

  stop(): void {
    if (this.sourceNode) { try { this.sourceNode.disconnect(); } catch {} this.sourceNode = null; }
    if (this.gainNode) { try { this.gainNode.disconnect(); } catch {} }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
    if (this._fileElement) { this._fileElement.pause(); this._fileElement.src = ''; this._fileElement = null; }
    this._isActive = false;
    this._currentSource = 'none';
  }

  updateParams(): void {
    if (this.analyserL) this.analyserL.smoothingTimeConstant = this.params.smoothing;
    if (this.analyserR) this.analyserR.smoothingTimeConstant = this.params.smoothing;
    if (this.gainNode) this.gainNode.gain.value = this.params.gain;
  }

  generate(_dt: number): SignalOutput {
    if (!this._isActive || !this.analyserL) {
      return this.generateIdle();
    }

    this.analyserL.getFloatTimeDomainData(this.timeDomainL);
    this.analyserR.getFloatTimeDomainData(this.timeDomainR);
    this.analyserL.getFloatFrequencyData(this.frequencyData);
    this.detectBeat();

    switch (this.params.displayMode) {
      case 'waveform': return this.generateWaveform();
      case 'spectrum': return this.generateSpectrum();
      case 'xy': return this.generateXY();
      case 'radial': return this.generateRadial();
      default: return this.generateWaveform();
    }
  }

  private generateIdle(): SignalOutput {
    const count = 512;
    for (let i = 0; i < count; i++) {
      const frac = i / count;
      this.positions[i * 3] = -0.9 + frac * 1.8;
      this.positions[i * 3 + 1] = (Math.random() - 0.5) * 0.015;
      this.positions[i * 3 + 2] = 0;
      this.intensities[i] = 0.5;
    }
    return { positions: this.positions, intensities: this.intensities, count };
  }

  /**
   * Time-domain waveform — classic scope view.
   * The gain is applied to the raw signal to fill the screen.
   */
  private generateWaveform(): SignalOutput {
    const data = this.timeDomainL;
    const count = Math.min(data.length, MAX_POINTS);
    // Auto-scale: measure peak amplitude and boost if signal is weak
    let peak = 0;
    for (let i = 0; i < count; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
    // Target: fill ~70% of the screen height
    const autoGain = peak > 0.001 ? Math.min(0.7 / peak, 20.0) : 5.0;
    const gain = autoGain * (this.params.gain / 3.0); // normalize around default gain=3

    let prevY = 0;
    for (let i = 0; i < count; i++) {
      const frac = i / count;
      const x = -0.9 + frac * 1.8;
      const y = Math.max(-0.95, Math.min(0.95, data[i] * gain));

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = 0;

      if (i > 0) {
        const dy = Math.abs(y - prevY);
        const speed = dy * count;
        this.intensities[i] = Math.min(1.0, 0.5 / (speed + 0.08));
      } else {
        this.intensities[i] = 0.5;
      }
      prevY = y;
    }

    this.normalizeIntensities(count);
    return { positions: this.positions, intensities: this.intensities, count };
  }

  /**
   * Frequency spectrum — logarithmic scale, fills the screen.
   */
  private generateSpectrum(): SignalOutput {
    const data = this.frequencyData;
    const binCount = data.length;
    const count = Math.min(512, MAX_POINTS); // fewer points for cleaner spectrum
    const gainMul = this.params.gain / 3.0;
    let prevY = 0;

    for (let i = 0; i < count; i++) {
      const frac = i / count;
      // Logarithmic frequency mapping
      const logFrac = Math.pow(frac, 0.5);
      const x = -0.9 + logFrac * 1.8;

      // Map dB range to screen. minDecibels=-90, maxDecibels=-10
      const binIdx = Math.floor(frac * frac * binCount); // quadratic for log-like
      const db = data[Math.min(binIdx, binCount - 1)];
      // Normalize: -90dB → 0, -10dB → 1
      const linear = Math.max(0, (db + 90) / 80);
      const y = -0.85 + linear * 1.7 * gainMul;

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = Math.max(-0.95, Math.min(0.95, y));
      this.positions[i * 3 + 2] = 0;

      if (i > 0) {
        const dy = Math.abs(y - prevY);
        const speed = dy * count * 0.3;
        this.intensities[i] = Math.min(1.0, 0.6 / (speed + 0.08));
      } else {
        this.intensities[i] = 0.5;
      }
      prevY = y;
    }

    this.normalizeIntensities(count);
    return { positions: this.positions, intensities: this.intensities, count };
  }

  /**
   * X-Y stereo mode with auto-gain.
   */
  private generateXY(): SignalOutput {
    const dataL = this.timeDomainL;
    const dataR = this.timeDomainR;
    const count = Math.min(dataL.length, MAX_POINTS);

    // Auto-scale
    let peak = 0;
    for (let i = 0; i < count; i++) {
      const a = Math.max(Math.abs(dataL[i]), Math.abs(dataR[i]));
      if (a > peak) peak = a;
    }
    const autoGain = peak > 0.001 ? Math.min(0.7 / peak, 20.0) : 5.0;
    const gain = autoGain * (this.params.gain / 3.0);

    let prevX = 0, prevY = 0;
    for (let i = 0; i < count; i++) {
      const x = Math.max(-0.95, Math.min(0.95, dataL[i] * gain));
      const y = Math.max(-0.95, Math.min(0.95, dataR[i] * gain));

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = 0;

      if (i > 0) {
        const dx = x - prevX;
        const dy = y - prevY;
        const speed = Math.sqrt(dx * dx + dy * dy) * count;
        this.intensities[i] = Math.min(1.0, 0.4 / (speed + 0.05));
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
   * Radial spectrum with beat-reactive pulsing.
   */
  private generateRadial(): SignalOutput {
    const data = this.frequencyData;
    const binCount = Math.min(data.length, 256);
    const count = binCount * 2;
    const twoPi = Math.PI * 2;
    const baseRadius = 0.25 + this.beatDecay * 0.2;
    const gainMul = this.params.gain / 3.0;
    let prevX = 0, prevY = 0;

    for (let i = 0; i < count; i++) {
      const frac = i / count;
      const angle = frac * twoPi;
      const binIdx = Math.floor(frac * binCount) % binCount;

      const db = data[Math.min(binIdx, data.length - 1)];
      const linear = Math.max(0, (db + 90) / 80);
      const r = baseRadius + linear * 0.55 * gainMul;

      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = 0;

      if (i > 0) {
        const dx = x - prevX;
        const dy = y - prevY;
        const speed = Math.sqrt(dx * dx + dy * dy) * count;
        this.intensities[i] = Math.min(1.0, 0.4 / (speed + 0.06));
      } else {
        this.intensities[i] = 0.5;
      }
      prevX = x;
      prevY = y;
    }

    this.normalizeIntensities(count);
    return { positions: this.positions, intensities: this.intensities, count };
  }

  private detectBeat(): void {
    let energy = 0;
    const data = this.frequencyData;
    const bassEnd = Math.floor(data.length / 8);
    for (let i = 0; i < bassEnd; i++) {
      const linear = Math.max(0, (data[i] + 90) / 80);
      energy += linear * linear;
    }
    energy /= bassEnd;

    if (energy > this.prevEnergy * 1.3 && energy > 0.08) {
      this.beatDecay = 1.0;
    }
    this.beatDecay *= 0.9;
    this.prevEnergy = energy;
  }

  private normalizeIntensities(count: number): void {
    let maxI = 0;
    for (let i = 0; i < count; i++) {
      if (this.intensities[i] > maxI) maxI = this.intensities[i];
    }
    if (maxI > 0) {
      const scale = 1.0 / maxI;
      for (let i = 0; i < count; i++) {
        this.intensities[i] = 0.4 + this.intensities[i] * scale * 0.6;
      }
    }
  }

  reset(): void {
    this.stop();
    this.prevEnergy = 0;
    this.beatDecay = 0;
  }
}
