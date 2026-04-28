/**
 * DrawOverlay — Transparent overlay on the scope screen for vector drawing.
 * Converts mouse/touch coordinates to normalized scope coordinates (-1..1).
 */

import { VectorCanvas } from '../signals/VectorCanvas';

export class DrawOverlay {
  private canvas: VectorCanvas;
  private screenEl: HTMLElement;
  private isDrawing = false;
  private enabled = false;

  constructor(canvas: VectorCanvas, screenElementId: string) {
    this.canvas = canvas;
    this.screenEl = document.getElementById(screenElementId)!;
    this.setupEvents();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.screenEl.style.cursor = enabled ? 'crosshair' : 'default';
  }

  private setupEvents(): void {
    const el = this.screenEl;

    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const pos = this.eventToScope(e);
      this.canvas.startPath(pos.x, pos.y);
      this.isDrawing = true;
    });

    el.addEventListener('mousemove', (e) => {
      if (!this.isDrawing || !this.enabled) return;
      const pos = this.eventToScope(e);
      this.canvas.addPoint(pos.x, pos.y);
    });

    el.addEventListener('mouseup', () => {
      if (!this.isDrawing) return;
      this.canvas.endPath(false);
      this.isDrawing = false;
    });

    el.addEventListener('mouseleave', () => {
      if (!this.isDrawing) return;
      this.canvas.endPath(false);
      this.isDrawing = false;
    });

    // Touch events
    el.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const pos = this.touchToScope(e.touches[0]);
      this.canvas.startPath(pos.x, pos.y);
      this.isDrawing = true;
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      if (!this.isDrawing || !this.enabled) return;
      e.preventDefault();
      const pos = this.touchToScope(e.touches[0]);
      this.canvas.addPoint(pos.x, pos.y);
    }, { passive: false });

    el.addEventListener('touchend', () => {
      if (!this.isDrawing) return;
      this.canvas.endPath(false);
      this.isDrawing = false;
    });
  }

  private eventToScope(e: MouseEvent): { x: number; y: number } {
    const rect = this.screenEl.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    return {
      x: (nx * 2 - 1) * 0.9,
      y: -(ny * 2 - 1) * 0.9, // flip Y
    };
  }

  private touchToScope(touch: Touch): { x: number; y: number } {
    const rect = this.screenEl.getBoundingClientRect();
    const nx = (touch.clientX - rect.left) / rect.width;
    const ny = (touch.clientY - rect.top) / rect.height;
    return {
      x: (nx * 2 - 1) * 0.9,
      y: -(ny * 2 - 1) * 0.9,
    };
  }
}
