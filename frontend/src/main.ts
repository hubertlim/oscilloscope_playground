/**
 * Phosphor — Oscilloscope Simulator
 * Main entry point. Wires up the renderer, signal generators, UI controls, and API.
 */

import { PhosphorRenderer, PhosphorParams } from './renderer/PhosphorRenderer';
import { LissajousGenerator, LissajousParams } from './signals/LissajousGenerator';
import { WaveformGenerator, WaveformParams } from './signals/WaveformGenerator';
import { MultiGenerator, MultiParams } from './signals/MultiGenerator';
import { AudioVisualizer, AudioParams } from './signals/AudioVisualizer';
import { VectorCanvas, DrawParams } from './signals/VectorCanvas';
import { SignalGenerator, SignalMode } from './signals/SignalGenerator';
import { Controls } from './ui/Controls';
import { DrawOverlay } from './ui/DrawOverlay';

class App {
  private renderer: PhosphorRenderer;
  private lissajous: LissajousGenerator;
  private waveform: WaveformGenerator;
  private multi: MultiGenerator;
  private audio: AudioVisualizer;
  private draw: VectorCanvas;
  private drawOverlay: DrawOverlay;
  private activeGenerator: SignalGenerator;
  private controls: Controls;
  private lastTime = 0;
  private running = true;
  private frameCount = 0;
  private fpsTime = 0;

  constructor() {
    const canvas = document.getElementById('scope-canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas not found');

    this.renderer = new PhosphorRenderer(canvas);

    this.lissajous = new LissajousGenerator();
    this.waveform = new WaveformGenerator();
    this.multi = new MultiGenerator();
    this.audio = new AudioVisualizer();
    this.draw = new VectorCanvas();
    this.activeGenerator = this.lissajous;

    // Draw overlay on the scope screen
    this.drawOverlay = new DrawOverlay(this.draw, 'scope-screen');

    this.controls = new Controls({
      onPhosphorChange: (p) => this.onPhosphorChange(p),
      onSignalModeChange: (m) => this.onSignalModeChange(m),
      onLissajousChange: (p) => this.onLissajousChange(p),
      onWaveformChange: (p) => this.onWaveformChange(p),
      onMultiChange: (p) => this.onMultiChange(p),
      onAudioChange: (p) => this.onAudioChange(p),
      onAudioStartMic: () => this.startAudioMic(),
      onAudioStartFile: (f) => this.startAudioFile(f),
      onAudioStop: () => this.stopAudio(),
      onDrawParamsChange: (p) => this.onDrawParamsChange(p),
      onDrawTemplate: (name) => this.onDrawTemplate(name),
      onDrawClear: () => this.onDrawClear(),
      onDrawUndo: () => this.onDrawUndo(),
      onDrawAddKeyframe: () => this.onDrawAddKeyframe(),
      onDrawClearKeyframes: () => this.onDrawClearKeyframes(),
      onDrawTogglePlay: () => this.onDrawTogglePlay(),
      onSavePreset: (name) => this.savePreset(name),
      onLoadPreset: (data) => this.loadPreset(data),
    });

    // Timeline scrub
    this.controls.onTimelineScrub = (frac) => {
      const kfs = this.draw.getKeyframes();
      if (kfs.length >= 2) {
        const totalDuration = kfs[kfs.length - 1].time;
        this.draw.setAnimTime(frac * totalDuration);
      }
    };

    // Keyframe change listener
    this.draw.onKeyframesChanged = () => this.syncDrawUI();

    this.controls.syncAllSliders();
    this.loadPresets();

    window.addEventListener('resize', () => this.renderer.resize());

    // === UI: Panel toggle, fullscreen, quick-controls, keyboard shortcuts ===
    this.initUIControls();

    this.lastTime = performance.now();
    this.fpsTime = this.lastTime;
    requestAnimationFrame((t) => this.loop(t));
  }

  // ===================== UI LAYOUT CONTROLS =====================

  private panelCollapsed = false;

  private initUIControls(): void {
    const app = document.getElementById('app')!;

    // Panel toggle button
    document.getElementById('btn-toggle-panel')?.addEventListener('click', () => {
      this.togglePanel();
    });

    // Fullscreen button
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      this.toggleFullscreen();
    });

    // Double-click scope to fullscreen
    document.getElementById('scope-screen')?.addEventListener('dblclick', () => {
      this.toggleFullscreen();
    });

    // Quick-controls: mode tabs
    document.querySelectorAll<HTMLButtonElement>('.qc-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode as SignalMode;
        // Sync with main signal tabs
        document.querySelectorAll('.signal-tab').forEach(t => {
          t.classList.toggle('active', (t as HTMLElement).dataset.mode === mode);
        });
        document.querySelectorAll('.qc-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.controls.showSignalControls(mode);
        this.onSignalModeChange(mode);
      });
    });

    // Quick-controls: color buttons
    document.querySelectorAll<HTMLButtonElement>('.qc-color').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.qc-color').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Sync with main color buttons
        const color = btn.dataset.color!;
        document.querySelectorAll<HTMLButtonElement>('.color-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.color === color);
        });
        btn.classList.add('active');
        // Trigger color change
        const colorBtn = document.querySelector(`.color-btn[data-color="${color}"]`) as HTMLButtonElement;
        colorBtn?.click();
      });
    });

    // Quick-controls: bloom slider
    document.getElementById('qc-bloom')?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.renderer.params.bloomIntensity = val;
      // Sync main slider
      const mainSlider = document.getElementById('ctrl-bloom') as HTMLInputElement;
      if (mainSlider) { mainSlider.value = String(val); }
      const display = document.querySelector('[data-for="ctrl-bloom"]');
      if (display) display.textContent = val.toFixed(2);
    });

    // Quick-controls: decay slider
    document.getElementById('qc-decay')?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.renderer.params.decay = val;
      const mainSlider = document.getElementById('ctrl-decay') as HTMLInputElement;
      if (mainSlider) { mainSlider.value = String(val); }
      const display = document.querySelector('[data-for="ctrl-decay"]');
      if (display) display.textContent = val.toFixed(2);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Don't capture when typing in inputs
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          this.togglePanel();
          break;
        case 'f':
        case 'F':
          this.toggleFullscreen();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          break;
      }
    });

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', () => {
      const app = document.getElementById('app')!;
      if (document.fullscreenElement) {
        app.classList.add('is-fullscreen');
        this.showQuickControls(true);
      } else {
        app.classList.remove('is-fullscreen');
        if (!this.panelCollapsed) {
          this.showQuickControls(false);
        }
      }
      // Resize after layout change
      setTimeout(() => this.renderer.resize(), 100);
    });
  }

  private togglePanel(): void {
    const app = document.getElementById('app')!;
    this.panelCollapsed = !this.panelCollapsed;
    app.classList.toggle('panel-collapsed', this.panelCollapsed);
    this.showQuickControls(this.panelCollapsed);
    // Resize after animation
    setTimeout(() => this.renderer.resize(), 400);
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  private showQuickControls(show: boolean): void {
    const qc = document.getElementById('quick-controls');
    if (qc) {
      qc.classList.toggle('hidden', !show);
      // Sync quick-control values with current state
      if (show) {
        const qcBloom = document.getElementById('qc-bloom') as HTMLInputElement;
        if (qcBloom) qcBloom.value = String(this.renderer.params.bloomIntensity);
        const qcDecay = document.getElementById('qc-decay') as HTMLInputElement;
        if (qcDecay) qcDecay.value = String(this.renderer.params.decay);
      }
    }
  }

  private onPhosphorChange(params: PhosphorParams): void {
    Object.assign(this.renderer.params, params);
  }

  private onSignalModeChange(mode: SignalMode): void {
    switch (mode) {
      case 'lissajous': this.activeGenerator = this.lissajous; break;
      case 'waveform': this.activeGenerator = this.waveform; break;
      case 'multi': this.activeGenerator = this.multi; break;
      case 'audio': this.activeGenerator = this.audio; break;
      case 'draw': this.activeGenerator = this.draw; break;
    }
    // Enable/disable draw overlay
    this.drawOverlay.setEnabled(mode === 'draw');
  }

  private onLissajousChange(params: LissajousParams): void {
    Object.assign(this.lissajous.params, params);
  }

  private onWaveformChange(params: WaveformParams): void {
    Object.assign(this.waveform.params, params);
  }

  private onMultiChange(params: MultiParams): void {
    Object.assign(this.multi.params, params);
  }

  private onAudioChange(params: AudioParams): void {
    Object.assign(this.audio.params, params);
    this.audio.updateParams();
  }

  private onDrawParamsChange(params: DrawParams): void {
    Object.assign(this.draw.params, params);
  }

  private onDrawTemplate(name: string): void {
    this.draw.loadTemplate(name);
    this.syncDrawUI();
  }

  private onDrawClear(): void {
    this.draw.clearPaths();
    this.syncDrawUI();
  }

  private onDrawUndo(): void {
    this.draw.undoLastPath();
    this.syncDrawUI();
  }

  private onDrawAddKeyframe(): void {
    this.draw.addKeyframe();
    this.syncDrawUI();
  }

  private onDrawClearKeyframes(): void {
    this.draw.clearKeyframes();
    this.syncDrawUI();
  }

  private onDrawTogglePlay(): void {
    const playing = !this.draw.getIsPlaying();
    this.draw.setPlaying(playing);
    this.controls.updatePlayButton(playing);
  }

  private syncDrawUI(): void {
    this.controls.updateDrawInfo(this.draw.getPathCount());
    const kfs = this.draw.getKeyframes();
    this.controls.updateKeyframeList(kfs, (i) => {
      this.draw.removeKeyframe(i);
      this.syncDrawUI();
    });
  }

  private async startAudioMic(): Promise<void> {
    try {
      await this.audio.startMic();
      this.controls.setAudioActive('mic');
    } catch (err) {
      this.controls.setAudioActive('none');
      console.error('Failed to start microphone:', err);
    }
  }

  private async startAudioFile(file: File): Promise<void> {
    try {
      await this.audio.startFile(file);
      this.controls.setAudioActive('file', file.name);
    } catch (err) {
      this.controls.setAudioActive('none');
      console.error('Failed to play audio file:', err);
    }
  }

  private stopAudio(): void {
    this.audio.stop();
    this.controls.setAudioActive('none');
  }

  private loop(time: number): void {
    if (!this.running) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    // FPS counter
    this.frameCount++;
    if (time - this.fpsTime >= 1000) {
      const fpsEl = document.getElementById('info-fps');
      if (fpsEl) fpsEl.textContent = `${this.frameCount} FPS`;
      this.frameCount = 0;
      this.fpsTime = time;
    }

    const { positions, intensities, count } = this.activeGenerator.generate(dt);
    this.renderer.setPoints(positions, intensities, count);
    this.renderer.render();

    // Update draw timeline UI if in draw mode
    if (this.activeGenerator === this.draw) {
      const kfs = this.draw.getKeyframes();
      if (kfs.length >= 2) {
        const totalDuration = kfs[kfs.length - 1].time;
        const progress = totalDuration > 0 ? this.draw.getAnimTime() / totalDuration : 0;
        this.controls.updateTimeline(progress, kfs, totalDuration);
      }
      // Update path count during drawing
      this.controls.updateDrawInfo(this.draw.getPathCount());
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  private async loadPresets(): Promise<void> {
    try {
      const res = await fetch('/api/presets');
      if (res.ok) {
        const presets = await res.json();
        this.controls.renderPresets(presets);
      }
    } catch {
      console.log('Presets API not available');
    }
  }

  private async savePreset(name: string): Promise<void> {
    const mode = this.controls.getCurrentMode();
    let signalData: any = {};

    switch (mode) {
      case 'lissajous':
        signalData = { ...this.lissajous.params };
        break;
      case 'waveform':
        signalData = { waveform: { ...this.waveform.params } };
        break;
      case 'multi':
        signalData = { multi: { ...this.multi.params } };
        break;
      case 'audio':
        signalData = { audio: { ...this.audio.params } };
        break;
      case 'draw':
        signalData = { draw: this.draw.exportData() };
        break;
    }

    const data = {
      mode,
      ...signalData,
      phosphor: { ...this.renderer.params },
    };

    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, data }),
      });
      if (res.ok) this.loadPresets();
    } catch {
      console.error('Failed to save preset');
    }
  }

  private loadPreset(data: any): void {
    if (data.phosphor) {
      const ph = data.phosphor;
      if (ph.color) this.renderer.params.color = [...ph.color];
      if (ph.decay !== undefined) this.renderer.params.decay = ph.decay;
      if (ph.bloomIntensity !== undefined) this.renderer.params.bloomIntensity = ph.bloomIntensity;
      if (ph.bloomRadius !== undefined) this.renderer.params.bloomRadius = ph.bloomRadius;
      if (ph.beamWidth !== undefined) this.renderer.params.beamWidth = ph.beamWidth;
    }

    if (data.freqX !== undefined) this.lissajous.params.freqX = data.freqX;
    if (data.freqY !== undefined) this.lissajous.params.freqY = data.freqY;
    if (data.phaseOffset !== undefined) this.lissajous.params.phaseOffset = data.phaseOffset;
    if (data.amplitude !== undefined) this.lissajous.params.amplitude = data.amplitude;
    if (data.waveform) Object.assign(this.waveform.params, data.waveform);
    if (data.multi) Object.assign(this.multi.params, data.multi);
    if (data.audio) Object.assign(this.audio.params, data.audio);
    if (data.draw) {
      this.draw.importData(data.draw);
      this.syncDrawUI();
    }

    if (data.mode) this.onSignalModeChange(data.mode);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
