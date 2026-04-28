/**
 * Controls — Manages both Playground and Realistic UI modes,
 * plus signal mode switching (Lissajous / Waveform / Multi).
 */

import { PhosphorParams } from '../renderer/PhosphorRenderer';
import { LissajousParams } from '../signals/LissajousGenerator';
import { WaveformParams, WaveformShape, DisplayMode } from '../signals/WaveformGenerator';
import { MultiParams, MultiMode } from '../signals/MultiGenerator';
import { AudioParams, AudioDisplayMode } from '../signals/AudioVisualizer';
import { VectorCanvas, DrawParams } from '../signals/VectorCanvas';
import { SignalMode } from '../signals/SignalGenerator';

export type PhosphorColorName = 'green' | 'amber' | 'blue' | 'white';

const PHOSPHOR_COLORS: Record<PhosphorColorName, [number, number, number]> = {
  green: [0.2, 1.0, 0.3],
  amber: [1.0, 0.7, 0.1],
  blue: [0.3, 0.7, 1.0],
  white: [0.8, 0.85, 1.0],
};

const COLOR_NAMES: PhosphorColorName[] = ['green', 'amber', 'blue', 'white'];

export interface ControlsCallbacks {
  onPhosphorChange: (params: PhosphorParams) => void;
  onSignalModeChange: (mode: SignalMode) => void;
  onLissajousChange: (params: LissajousParams) => void;
  onWaveformChange: (params: WaveformParams) => void;
  onMultiChange: (params: MultiParams) => void;
  onAudioChange: (params: AudioParams) => void;
  onAudioStartMic: () => void;
  onAudioStartFile: (file: File) => void;
  onAudioStop: () => void;
  onDrawParamsChange: (params: DrawParams) => void;
  onDrawTemplate: (name: string) => void;
  onDrawClear: () => void;
  onDrawUndo: () => void;
  onDrawAddKeyframe: () => void;
  onDrawClearKeyframes: () => void;
  onDrawTogglePlay: () => void;
  onSavePreset: (name: string) => void;
  onLoadPreset: (data: any) => void;
}

export class Controls {
  private callbacks: ControlsCallbacks;
  private currentColor: PhosphorColorName = 'green';
  private colorIndex = 0;
  private activeKnob: HTMLElement | null = null;
  private knobStartY = 0;
  private knobStartValue = 0;
  private currentSignalMode: SignalMode = 'lissajous';

  public phosphorParams: PhosphorParams = {
    color: [0.2, 1.0, 0.3],
    decay: 0.92,
    bloomIntensity: 0.6,
    bloomRadius: 3.0,
    beamWidth: 2.0,
    curvature: 0.04,
    vignette: 0.3,
    scanlines: 0.08,
    grid: 0.15,
  };

  public lissajousParams: LissajousParams = {
    freqX: 3, freqY: 2, phaseOffset: 0, amplitude: 0.8, speed: 1.0,
  };

  public waveformParams: WaveformParams = {
    displayMode: 'yt',
    ch1Shape: 'sine', ch1Freq: 2.0, ch1Amp: 0.7, ch1Phase: 0,
    ch2Shape: 'sine', ch2Freq: 3.0, ch2Amp: 0.7, ch2Phase: 0,
    timebase: 2.0, speed: 1.0,
  };

  public multiParams: MultiParams = {
    mode: 'harmonics',
    baseShape: 'sine', baseFreq: 1.0, baseAmp: 0.7,
    modShape: 'sine', modFreq: 3.0, modAmp: 0.5,
    harmonicCount: 5, harmonicFalloff: 1.0, speed: 1.0,
  };

  public audioParams: AudioParams = {
    displayMode: 'waveform',
    gain: 3.0,
    smoothing: 0.65,
    fftSize: 2048,
    lineThickness: 1.0,
  };

  public drawParams: DrawParams = {
    animSpeed: 1.0,
    loopAnimation: true,
    traceSpeed: 1.0,
    interpolation: 'linear',
  };

  constructor(callbacks: ControlsCallbacks) {
    this.callbacks = callbacks;
    this.initModeToggle();
    this.initSignalTabs();
    this.initPlaygroundSliders();
    this.initColorButtons();
    this.initToggleButtons();
    this.initShapeSelectors();
    this.initRealisticControls();
    this.initRotarySwitch();
    this.initAudioControls();
    this.initDrawControls();
    this.initSavePreset();
  }

  // ===================== MODE TOGGLE =====================

  private initModeToggle(): void {
    const btnRealistic = document.getElementById('btn-realistic')!;
    const btnPlayground = document.getElementById('btn-playground')!;
    const playgroundPanel = document.getElementById('playground-controls')!;
    const realisticPanel = document.getElementById('realistic-controls')!;

    btnRealistic.addEventListener('click', () => {
      btnRealistic.classList.add('active');
      btnPlayground.classList.remove('active');
      realisticPanel.classList.remove('hidden');
      playgroundPanel.classList.add('hidden');
      this.syncKnobsFromParams();
    });

    btnPlayground.addEventListener('click', () => {
      btnPlayground.classList.add('active');
      btnRealistic.classList.remove('active');
      playgroundPanel.classList.remove('hidden');
      realisticPanel.classList.add('hidden');
      this.syncAllSliders();
    });
  }

  // ===================== SIGNAL TABS =====================

  private initSignalTabs(): void {
    const tabs = document.querySelectorAll<HTMLButtonElement>('.signal-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.mode as SignalMode;
        this.currentSignalMode = mode;
        this.showSignalControls(mode);
        this.callbacks.onSignalModeChange(mode);
        this.updateInfoDisplay();
      });
    });
  }

  showSignalControls(mode: SignalMode): void {
    document.querySelectorAll('.signal-controls').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`sig-${mode}`);
    if (target) target.classList.remove('hidden');
  }

  private updateInfoDisplay(): void {
    const el = document.getElementById('info-mode');
    if (el) el.textContent = this.currentSignalMode.toUpperCase();
  }

  // ===================== PLAYGROUND SLIDERS =====================

  private initPlaygroundSliders(): void {
    const sliders = document.querySelectorAll<HTMLInputElement>('#playground-controls input[type="range"]');
    sliders.forEach(slider => {
      slider.addEventListener('input', () => {
        this.updateValueDisplay(slider);
        this.readAllSlidersToParams();
        this.emitCurrentSignal();
        this.emitPhosphor();
      });
    });
  }

  private readAllSlidersToParams(): void {
    // Lissajous
    this.lissajousParams.freqX = this.sliderVal('ctrl-freqX');
    this.lissajousParams.freqY = this.sliderVal('ctrl-freqY');
    this.lissajousParams.phaseOffset = this.sliderVal('ctrl-phase');
    this.lissajousParams.amplitude = this.sliderVal('ctrl-amplitude');
    this.lissajousParams.speed = this.sliderVal('ctrl-speed');

    // Waveform
    this.waveformParams.ch1Freq = this.sliderVal('ctrl-wf-ch1Freq');
    this.waveformParams.ch1Amp = this.sliderVal('ctrl-wf-ch1Amp');
    this.waveformParams.ch1Phase = this.sliderVal('ctrl-wf-ch1Phase');
    this.waveformParams.ch2Freq = this.sliderVal('ctrl-wf-ch2Freq');
    this.waveformParams.ch2Amp = this.sliderVal('ctrl-wf-ch2Amp');
    this.waveformParams.ch2Phase = this.sliderVal('ctrl-wf-ch2Phase');
    this.waveformParams.timebase = this.sliderVal('ctrl-wf-timebase');
    this.waveformParams.speed = this.sliderVal('ctrl-wf-speed');

    // Multi
    this.multiParams.baseFreq = this.sliderVal('ctrl-multi-baseFreq');
    this.multiParams.baseAmp = this.sliderVal('ctrl-multi-baseAmp');
    this.multiParams.modFreq = this.sliderVal('ctrl-multi-modFreq');
    this.multiParams.modAmp = this.sliderVal('ctrl-multi-modAmp');
    this.multiParams.harmonicCount = Math.round(this.sliderVal('ctrl-multi-harmonicCount'));
    this.multiParams.harmonicFalloff = this.sliderVal('ctrl-multi-harmonicFalloff');
    this.multiParams.speed = this.sliderVal('ctrl-multi-speed');

    // Phosphor (shared)
    this.phosphorParams.decay = this.sliderVal('ctrl-decay');
    this.phosphorParams.bloomIntensity = this.sliderVal('ctrl-bloom');
    this.phosphorParams.bloomRadius = this.sliderVal('ctrl-bloomRadius');
    this.phosphorParams.beamWidth = this.sliderVal('ctrl-beamWidth');
    this.phosphorParams.curvature = this.sliderVal('ctrl-curvature');
    this.phosphorParams.vignette = this.sliderVal('ctrl-vignette');
    this.phosphorParams.scanlines = this.sliderVal('ctrl-scanlines');
    this.phosphorParams.grid = this.sliderVal('ctrl-grid');

    // Audio
    const audioGain = this.sliderVal('ctrl-audio-gain');
    if (audioGain) this.audioParams.gain = audioGain;
    const audioSmoothing = this.sliderVal('ctrl-audio-smoothing');
    if (audioSmoothing !== undefined) this.audioParams.smoothing = audioSmoothing;

    // Draw
    const drawTrace = this.sliderVal('ctrl-draw-traceSpeed');
    if (drawTrace) this.drawParams.traceSpeed = drawTrace;
    const drawAnim = this.sliderVal('ctrl-draw-animSpeed');
    if (drawAnim) this.drawParams.animSpeed = drawAnim;
  }

  syncAllSliders(): void {
    // Lissajous
    this.setSlider('ctrl-freqX', this.lissajousParams.freqX);
    this.setSlider('ctrl-freqY', this.lissajousParams.freqY);
    this.setSlider('ctrl-phase', this.lissajousParams.phaseOffset);
    this.setSlider('ctrl-amplitude', this.lissajousParams.amplitude);
    this.setSlider('ctrl-speed', this.lissajousParams.speed);

    // Waveform
    this.setSlider('ctrl-wf-ch1Freq', this.waveformParams.ch1Freq);
    this.setSlider('ctrl-wf-ch1Amp', this.waveformParams.ch1Amp);
    this.setSlider('ctrl-wf-ch1Phase', this.waveformParams.ch1Phase);
    this.setSlider('ctrl-wf-ch2Freq', this.waveformParams.ch2Freq);
    this.setSlider('ctrl-wf-ch2Amp', this.waveformParams.ch2Amp);
    this.setSlider('ctrl-wf-ch2Phase', this.waveformParams.ch2Phase);
    this.setSlider('ctrl-wf-timebase', this.waveformParams.timebase);
    this.setSlider('ctrl-wf-speed', this.waveformParams.speed);

    // Multi
    this.setSlider('ctrl-multi-baseFreq', this.multiParams.baseFreq);
    this.setSlider('ctrl-multi-baseAmp', this.multiParams.baseAmp);
    this.setSlider('ctrl-multi-modFreq', this.multiParams.modFreq);
    this.setSlider('ctrl-multi-modAmp', this.multiParams.modAmp);
    this.setSlider('ctrl-multi-harmonicCount', this.multiParams.harmonicCount);
    this.setSlider('ctrl-multi-harmonicFalloff', this.multiParams.harmonicFalloff);
    this.setSlider('ctrl-multi-speed', this.multiParams.speed);

    // Phosphor
    this.setSlider('ctrl-decay', this.phosphorParams.decay);
    this.setSlider('ctrl-bloom', this.phosphorParams.bloomIntensity);
    this.setSlider('ctrl-bloomRadius', this.phosphorParams.bloomRadius);
    this.setSlider('ctrl-beamWidth', this.phosphorParams.beamWidth);
    this.setSlider('ctrl-curvature', this.phosphorParams.curvature);
    this.setSlider('ctrl-vignette', this.phosphorParams.vignette);
    this.setSlider('ctrl-scanlines', this.phosphorParams.scanlines);
    this.setSlider('ctrl-grid', this.phosphorParams.grid);

    // Audio
    this.setSlider('ctrl-audio-gain', this.audioParams.gain);
    this.setSlider('ctrl-audio-smoothing', this.audioParams.smoothing);

    // Draw
    this.setSlider('ctrl-draw-traceSpeed', this.drawParams.traceSpeed);
    this.setSlider('ctrl-draw-animSpeed', this.drawParams.animSpeed);
  }

  // ===================== COLOR BUTTONS =====================

  private initColorButtons(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.color-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentColor = btn.dataset.color as PhosphorColorName;
        this.colorIndex = COLOR_NAMES.indexOf(this.currentColor);
        this.phosphorParams.color = [...PHOSPHOR_COLORS[this.currentColor]];
        this.syncRotarySwitch();
        this.emitPhosphor();
      });
    });
  }

  // ===================== TOGGLE BUTTONS =====================

  private initToggleButtons(): void {
    document.querySelectorAll('.toggle-group').forEach(group => {
      const buttons = group.querySelectorAll<HTMLButtonElement>('.toggle-btn');
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const param = btn.dataset.param!;
          const value = btn.dataset.value!;
          this.applyToggle(param, value);
        });
      });
    });
  }

  private applyToggle(param: string, value: string): void {
    switch (param) {
      case 'wf-displayMode':
        this.waveformParams.displayMode = value as DisplayMode;
        const ch2Section = document.getElementById('wf-ch2-section');
        if (ch2Section) {
          ch2Section.classList.toggle('hidden', value === 'yt');
        }
        this.emitCurrentSignal();
        break;
      case 'multi-mode':
        this.multiParams.mode = value as MultiMode;
        const harmSection = document.getElementById('multi-harmonics-section');
        if (harmSection) {
          harmSection.classList.toggle('hidden', value !== 'harmonics');
        }
        this.emitCurrentSignal();
        break;
      case 'audio-displayMode':
        this.audioParams.displayMode = value as AudioDisplayMode;
        this.callbacks.onAudioChange({ ...this.audioParams });
        break;
      case 'audio-fftSize':
        this.audioParams.fftSize = parseInt(value);
        this.callbacks.onAudioChange({ ...this.audioParams });
        break;
      case 'draw-interpolation':
        this.drawParams.interpolation = value as 'linear' | 'smooth';
        this.callbacks.onDrawParamsChange({ ...this.drawParams });
        break;
      case 'draw-loop':
        this.drawParams.loopAnimation = value === 'true';
        this.callbacks.onDrawParamsChange({ ...this.drawParams });
        break;
    }
  }

  // ===================== SHAPE SELECTORS =====================

  private initShapeSelectors(): void {
    document.querySelectorAll('.shape-selector').forEach(selector => {
      const param = (selector as HTMLElement).dataset.param!;
      const buttons = selector.querySelectorAll<HTMLButtonElement>('.shape-btn');
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const shape = btn.dataset.value as WaveformShape;
          this.applyShape(param, shape);
        });
      });
    });
  }

  private applyShape(param: string, shape: WaveformShape): void {
    switch (param) {
      case 'wf-ch1Shape': this.waveformParams.ch1Shape = shape; break;
      case 'wf-ch2Shape': this.waveformParams.ch2Shape = shape; break;
      case 'multi-baseShape': this.multiParams.baseShape = shape; break;
      case 'multi-modShape': this.multiParams.modShape = shape; break;
    }
    this.emitCurrentSignal();
  }

  // ===================== REALISTIC KNOBS =====================

  private initRealisticControls(): void {
    const knobs = document.querySelectorAll<HTMLElement>('.knob');
    knobs.forEach(knob => {
      knob.addEventListener('mousedown', (e) => this.onKnobDown(e.clientY, knob));
      knob.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.onKnobDown(e.touches[0].clientY, knob);
      }, { passive: false });
    });

    document.addEventListener('mousemove', (e) => this.onKnobMove(e.clientY));
    document.addEventListener('mouseup', () => { this.activeKnob = null; });
    document.addEventListener('touchmove', (e) => {
      if (this.activeKnob) { e.preventDefault(); this.onKnobMove(e.touches[0].clientY); }
    }, { passive: false });
    document.addEventListener('touchend', () => { this.activeKnob = null; });
  }

  private onKnobDown(clientY: number, knob: HTMLElement): void {
    this.activeKnob = knob;
    this.knobStartY = clientY;
    const param = knob.dataset.param!;
    this.knobStartValue = this.getKnobParamValue(param);
  }

  private onKnobMove(clientY: number): void {
    if (!this.activeKnob) return;
    const knob = this.activeKnob;
    const param = knob.dataset.param!;
    const min = parseFloat(knob.dataset.min!);
    const max = parseFloat(knob.dataset.max!);
    const range = max - min;
    const dy = this.knobStartY - clientY;
    const newValue = Math.max(min, Math.min(max, this.knobStartValue + dy * range / 200));

    this.setKnobParamValue(param, newValue);
    const normalized = (newValue - min) / range;
    knob.style.transform = `rotate(${-135 + normalized * 270}deg)`;

    this.syncAllSliders();
    this.emitPhosphor();
    this.emitCurrentSignal();
  }

  private getKnobParamValue(param: string): number {
    // Map knob params to the correct source
    switch (param) {
      case 'freqX': return this.lissajousParams.freqX;
      case 'freqY': return this.lissajousParams.freqY;
      case 'phase': return this.lissajousParams.phaseOffset;
      case 'amplitude': return this.lissajousParams.amplitude;
      case 'speed': return this.lissajousParams.speed;
      case 'bloom': return this.phosphorParams.bloomIntensity;
      case 'beamWidth': return this.phosphorParams.beamWidth;
      case 'decay': return this.phosphorParams.decay;
      default: return 0;
    }
  }

  private setKnobParamValue(param: string, value: number): void {
    switch (param) {
      case 'freqX': this.lissajousParams.freqX = value; break;
      case 'freqY': this.lissajousParams.freqY = value; break;
      case 'phase': this.lissajousParams.phaseOffset = value; break;
      case 'amplitude': this.lissajousParams.amplitude = value; break;
      case 'speed': this.lissajousParams.speed = value; break;
      case 'bloom': this.phosphorParams.bloomIntensity = value; break;
      case 'beamWidth': this.phosphorParams.beamWidth = value; break;
      case 'decay': this.phosphorParams.decay = value; break;
    }
  }

  private syncKnobsFromParams(): void {
    document.querySelectorAll<HTMLElement>('.knob').forEach(knob => {
      const param = knob.dataset.param!;
      const min = parseFloat(knob.dataset.min!);
      const max = parseFloat(knob.dataset.max!);
      const value = this.getKnobParamValue(param);
      const normalized = (value - min) / (max - min);
      knob.style.transform = `rotate(${-135 + normalized * 270}deg)`;
    });
  }

  // ===================== ROTARY SWITCH =====================

  private initRotarySwitch(): void {
    const sw = document.getElementById('rotary-phosphor-color');
    if (!sw) return;

    sw.addEventListener('click', () => {
      this.colorIndex = (this.colorIndex + 1) % COLOR_NAMES.length;
      this.currentColor = COLOR_NAMES[this.colorIndex];
      this.phosphorParams.color = [...PHOSPHOR_COLORS[this.currentColor]];
      this.syncRotarySwitch();
      this.syncColorButtons();
      this.emitPhosphor();
    });

    this.syncRotarySwitch();
  }

  private syncRotarySwitch(): void {
    const sw = document.getElementById('rotary-phosphor-color');
    if (!sw) return;
    const angle = -90 + this.colorIndex * (360 / COLOR_NAMES.length);
    sw.style.transform = `rotate(${angle}deg)`;

    document.querySelectorAll('.rotary-label').forEach(label => {
      const pos = parseInt((label as HTMLElement).dataset.pos || '0');
      label.classList.toggle('active', pos === this.colorIndex);
    });
  }

  private syncColorButtons(): void {
    document.querySelectorAll<HTMLButtonElement>('.color-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === this.currentColor);
    });
  }

  // ===================== AUDIO CONTROLS =====================

  private initAudioControls(): void {
    // Mic button
    document.getElementById('btn-audio-mic')?.addEventListener('click', () => {
      this.callbacks.onAudioStartMic();
      this.setAudioActive('mic');
    });

    // File button
    document.getElementById('btn-audio-file')?.addEventListener('click', () => {
      document.getElementById('audio-file-input')?.click();
    });

    // File input
    document.getElementById('audio-file-input')?.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.files && input.files[0]) {
        this.callbacks.onAudioStartFile(input.files[0]);
        this.setAudioActive('file', input.files[0].name);
      }
    });

    // Stop button
    document.getElementById('btn-audio-stop')?.addEventListener('click', () => {
      this.callbacks.onAudioStop();
      this.setAudioActive('none');
    });

    // Drop zone
    const dropZone = document.getElementById('audio-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer?.files;
        if (files && files[0] && files[0].type.startsWith('audio/')) {
          this.callbacks.onAudioStartFile(files[0]);
          this.setAudioActive('file', files[0].name);
        }
      });
      dropZone.addEventListener('click', () => {
        document.getElementById('audio-file-input')?.click();
      });
    }
  }

  setAudioActive(source: 'mic' | 'file' | 'none', fileName?: string): void {
    const micBtn = document.getElementById('btn-audio-mic');
    const fileBtn = document.getElementById('btn-audio-file');
    const stopBtn = document.getElementById('btn-audio-stop');
    const status = document.getElementById('audio-status');
    const dropZone = document.getElementById('audio-drop-zone');

    micBtn?.classList.toggle('active', source === 'mic');
    fileBtn?.classList.toggle('active', source === 'file');
    stopBtn?.classList.toggle('hidden', source === 'none');

    if (source === 'none') {
      dropZone?.classList.remove('hidden');
    } else {
      dropZone?.classList.add('hidden');
    }

    if (status) {
      switch (source) {
        case 'mic':
          status.textContent = '● MICROPHONE ACTIVE';
          status.className = 'audio-status active';
          break;
        case 'file':
          status.textContent = `♪ ${fileName || 'Playing file'}`;
          status.className = 'audio-status active';
          break;
        default:
          status.textContent = 'No audio source';
          status.className = 'audio-status';
      }
    }
  }

  // ===================== DRAW CONTROLS =====================

  private initDrawControls(): void {
    // Draw pen toggle
    document.getElementById('btn-draw-pen')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-draw-pen')!;
      btn.classList.toggle('active');
    });

    // Undo
    document.getElementById('btn-draw-undo')?.addEventListener('click', () => {
      this.callbacks.onDrawUndo();
    });

    // Clear
    document.getElementById('btn-draw-clear')?.addEventListener('click', () => {
      this.callbacks.onDrawClear();
    });

    // Templates
    document.querySelectorAll<HTMLButtonElement>('.template-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const template = btn.dataset.template!;
        this.callbacks.onDrawTemplate(template);
      });
    });

    // Animation controls
    document.getElementById('btn-anim-play')?.addEventListener('click', () => {
      this.callbacks.onDrawTogglePlay();
    });

    document.getElementById('btn-anim-addkf')?.addEventListener('click', () => {
      this.callbacks.onDrawAddKeyframe();
    });

    document.getElementById('btn-anim-clearkf')?.addEventListener('click', () => {
      this.callbacks.onDrawClearKeyframes();
    });

    // Timeline bar click to scrub
    document.getElementById('timeline-bar')?.addEventListener('click', (e) => {
      const bar = document.getElementById('timeline-bar')!;
      const rect = bar.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      this.onTimelineScrub?.(frac);
    });
  }

  // Callback for timeline scrubbing — set by main.ts
  public onTimelineScrub: ((frac: number) => void) | null = null;

  updateDrawInfo(pathCount: number): void {
    const el = document.getElementById('draw-path-count');
    if (el) el.textContent = `${pathCount} path${pathCount !== 1 ? 's' : ''}`;
  }

  updatePlayButton(isPlaying: boolean): void {
    const btn = document.getElementById('btn-anim-play');
    if (btn) btn.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
  }

  updateTimeline(progress: number, keyframes: Array<{ time: number }>, totalDuration: number): void {
    const progressEl = document.getElementById('timeline-progress');
    if (progressEl) {
      progressEl.style.width = `${Math.min(100, progress * 100)}%`;
    }

    const markersEl = document.getElementById('timeline-markers');
    if (markersEl && totalDuration > 0) {
      markersEl.innerHTML = '';
      keyframes.forEach(kf => {
        const marker = document.createElement('div');
        marker.className = 'timeline-marker';
        marker.style.left = `${(kf.time / totalDuration) * 100}%`;
        markersEl.appendChild(marker);
      });
    }
  }

  updateKeyframeList(keyframes: Array<{ time: number }>, onRemove: (index: number) => void): void {
    const list = document.getElementById('keyframe-list');
    if (!list) return;
    list.innerHTML = '';
    keyframes.forEach((kf, i) => {
      const item = document.createElement('div');
      item.className = 'kf-item';
      item.innerHTML = `<span>KF ${i + 1} — ${kf.time.toFixed(1)}s</span>`;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => onRemove(i));
      item.appendChild(removeBtn);
      list.appendChild(item);
    });
  }

  isDrawPenActive(): boolean {
    return document.getElementById('btn-draw-pen')?.classList.contains('active') ?? false;
  }

  // ===================== PRESETS =====================

  private initSavePreset(): void {
    document.getElementById('btn-save-preset')?.addEventListener('click', () => {
      const name = prompt('Preset name:');
      if (name) this.callbacks.onSavePreset(name);
    });
  }

  applyPreset(data: any): void {
    // Signal mode
    if (data.mode && ['lissajous', 'waveform', 'multi', 'audio', 'draw'].includes(data.mode)) {
      this.currentSignalMode = data.mode;
      this.showSignalControls(data.mode);
      document.querySelectorAll('.signal-tab').forEach(t => {
        t.classList.toggle('active', (t as HTMLElement).dataset.mode === data.mode);
      });
      this.callbacks.onSignalModeChange(data.mode);
    }

    // Lissajous params
    if (data.freqX !== undefined) this.lissajousParams.freqX = data.freqX;
    if (data.freqY !== undefined) this.lissajousParams.freqY = data.freqY;
    if (data.phaseOffset !== undefined) this.lissajousParams.phaseOffset = data.phaseOffset;
    if (data.amplitude !== undefined) this.lissajousParams.amplitude = data.amplitude;

    // Phosphor
    if (data.phosphor) {
      const ph = data.phosphor;
      if (ph.color) this.phosphorParams.color = [...ph.color];
      if (ph.decay !== undefined) this.phosphorParams.decay = ph.decay;
      if (ph.bloomIntensity !== undefined) this.phosphorParams.bloomIntensity = ph.bloomIntensity;
      if (ph.bloomRadius !== undefined) this.phosphorParams.bloomRadius = ph.bloomRadius;
      if (ph.beamWidth !== undefined) this.phosphorParams.beamWidth = ph.beamWidth;
    }

    this.syncAllSliders();
    this.syncKnobsFromParams();
    this.updateInfoDisplay();
    this.emitPhosphor();
    this.emitCurrentSignal();
  }

  renderPresets(presets: any[]): void {
    const list = document.getElementById('presets-list');
    if (!list) return;
    list.innerHTML = '';
    presets.forEach(preset => {
      const item = document.createElement('div');
      item.className = 'preset-item';
      item.innerHTML = `
        <span class="preset-name">${preset.name}</span>
        <span class="preset-category">${preset.category}</span>
      `;
      item.addEventListener('click', () => {
        this.applyPreset(preset.data);
        this.callbacks.onLoadPreset(preset.data);
      });
      list.appendChild(item);
    });
  }

  // ===================== HELPERS =====================

  private emitPhosphor(): void {
    this.callbacks.onPhosphorChange({ ...this.phosphorParams });
  }

  private emitCurrentSignal(): void {
    switch (this.currentSignalMode) {
      case 'lissajous': this.callbacks.onLissajousChange({ ...this.lissajousParams }); break;
      case 'waveform': this.callbacks.onWaveformChange({ ...this.waveformParams }); break;
      case 'multi': this.callbacks.onMultiChange({ ...this.multiParams }); break;
      case 'audio': this.callbacks.onAudioChange({ ...this.audioParams }); break;
      case 'draw': this.callbacks.onDrawParamsChange({ ...this.drawParams }); break;
    }
  }

  getCurrentMode(): SignalMode {
    return this.currentSignalMode;
  }

  private sliderVal(id: string): number {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return el ? parseFloat(el.value) : 0;
  }

  private setSlider(id: string, value: number): void {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) {
      el.value = String(value);
      this.updateValueDisplay(el);
    }
  }

  private updateValueDisplay(slider: HTMLInputElement): void {
    const display = document.querySelector(`[data-for="${slider.id}"]`);
    if (display) {
      const decimals = slider.step.includes('.') ? slider.step.split('.')[1].length : 0;
      display.textContent = parseFloat(slider.value).toFixed(decimals);
    }
  }
}
