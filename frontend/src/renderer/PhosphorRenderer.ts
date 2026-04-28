/**
 * PhosphorRenderer — Multi-pass WebGL rendering pipeline
 * that simulates a CRT oscilloscope display.
 *
 * Pipeline:
 *   1. BEAM: Render signal points as soft gaussian dots
 *   2. PHOSPHOR: Blend with previous frame (exponential decay)
 *   3. BLOOM: Multi-pass Gaussian blur on bright areas
 *   4. COMPOSITE: CRT curvature, vignette, scanlines, grid
 */

import * as THREE from 'three';

import beamVertSrc from '../shaders/beam.vert.glsl?raw';
import beamFragSrc from '../shaders/beam.frag.glsl?raw';
import fullscreenVertSrc from '../shaders/fullscreen.vert.glsl?raw';
import phosphorFragSrc from '../shaders/phosphor.frag.glsl?raw';
import bloomFragSrc from '../shaders/bloom.frag.glsl?raw';
import compositeFragSrc from '../shaders/composite.frag.glsl?raw';

export interface PhosphorParams {
  color: [number, number, number];
  decay: number;
  bloomIntensity: number;
  bloomRadius: number;
  beamWidth: number;
  curvature: number;
  vignette: number;
  scanlines: number;
  grid: number;
}

const MAX_POINTS = 65536;

export class PhosphorRenderer {
  private renderer: THREE.WebGLRenderer;
  private width: number;
  private height: number;

  // Render targets (ping-pong for phosphor persistence)
  private beamTarget: THREE.WebGLRenderTarget;
  private phosphorTargetA: THREE.WebGLRenderTarget;
  private phosphorTargetB: THREE.WebGLRenderTarget;
  private bloomTargetH: THREE.WebGLRenderTarget;
  private bloomTargetV: THREE.WebGLRenderTarget;
  private pingPong = false;

  // Scenes and cameras
  private beamScene: THREE.Scene;
  private beamCamera: THREE.Camera;
  private fullscreenScene: THREE.Scene;
  private fullscreenCamera: THREE.Camera;

  // Beam geometry
  private beamGeometry: THREE.BufferGeometry;
  private beamPositions: Float32Array;
  private beamIntensities: Float32Array;
  private beamMaterial: THREE.ShaderMaterial;
  private beamPoints: THREE.Points;
  private pointCount = 0;

  // Post-processing materials
  private phosphorMaterial: THREE.ShaderMaterial;
  private bloomMaterialH: THREE.ShaderMaterial;
  private bloomMaterialV: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;
  private fullscreenQuad: THREE.Mesh;

  // Parameters
  public params: PhosphorParams = {
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

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;

    const rect = canvas.parentElement!.getBoundingClientRect();
    this.width = Math.floor(rect.width);
    this.height = Math.floor(rect.height);
    this.renderer.setSize(this.width, this.height);

    // Create render targets
    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    };

    this.beamTarget = new THREE.WebGLRenderTarget(this.width, this.height, rtOpts);
    this.phosphorTargetA = new THREE.WebGLRenderTarget(this.width, this.height, rtOpts);
    this.phosphorTargetB = new THREE.WebGLRenderTarget(this.width, this.height, rtOpts);

    // Bloom at half resolution for performance
    const bloomW = Math.floor(this.width / 2);
    const bloomH = Math.floor(this.height / 2);
    this.bloomTargetH = new THREE.WebGLRenderTarget(bloomW, bloomH, rtOpts);
    this.bloomTargetV = new THREE.WebGLRenderTarget(bloomW, bloomH, rtOpts);

    // === BEAM PASS ===
    this.beamScene = new THREE.Scene();
    this.beamCamera = new THREE.Camera();

    this.beamPositions = new Float32Array(MAX_POINTS * 3);
    this.beamIntensities = new Float32Array(MAX_POINTS);

    this.beamGeometry = new THREE.BufferGeometry();
    this.beamGeometry.setAttribute('position', new THREE.BufferAttribute(this.beamPositions, 3));
    this.beamGeometry.setAttribute('aIntensity', new THREE.BufferAttribute(this.beamIntensities, 1));

    this.beamMaterial = new THREE.ShaderMaterial({
      vertexShader: beamVertSrc,
      fragmentShader: beamFragSrc,
      uniforms: {
        uBeamColor: { value: new THREE.Vector3(...this.params.color) },
        uBeamWidth: { value: this.params.beamWidth },
        uResolution: { value: new THREE.Vector2(this.width, this.height) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.beamPoints = new THREE.Points(this.beamGeometry, this.beamMaterial);
    this.beamScene.add(this.beamPoints);

    // === FULLSCREEN QUAD (shared by post-processing passes) ===
    this.fullscreenScene = new THREE.Scene();
    this.fullscreenCamera = new THREE.Camera();

    const fsGeom = new THREE.PlaneGeometry(2, 2);

    // Phosphor persistence material
    this.phosphorMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertSrc,
      fragmentShader: phosphorFragSrc,
      uniforms: {
        uCurrentFrame: { value: null },
        uPreviousFrame: { value: null },
        uDecay: { value: this.params.decay },
      },
      depthTest: false,
      depthWrite: false,
    });

    // Bloom blur materials (horizontal + vertical)
    this.bloomMaterialH = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertSrc,
      fragmentShader: bloomFragSrc,
      uniforms: {
        uTexture: { value: null },
        uDirection: { value: new THREE.Vector2(1.0, 0.0) },
        uResolution: { value: new THREE.Vector2(bloomW, bloomH) },
        uRadius: { value: this.params.bloomRadius },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.bloomMaterialV = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertSrc,
      fragmentShader: bloomFragSrc,
      uniforms: {
        uTexture: { value: null },
        uDirection: { value: new THREE.Vector2(0.0, 1.0) },
        uResolution: { value: new THREE.Vector2(bloomW, bloomH) },
        uRadius: { value: this.params.bloomRadius },
      },
      depthTest: false,
      depthWrite: false,
    });

    // Composite material
    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertSrc,
      fragmentShader: compositeFragSrc,
      uniforms: {
        uPhosphor: { value: null },
        uBloom: { value: null },
        uBloomIntensity: { value: this.params.bloomIntensity },
        uCurvature: { value: this.params.curvature },
        uVignette: { value: this.params.vignette },
        uScanlineIntensity: { value: this.params.scanlines },
        uGridIntensity: { value: this.params.grid },
        uResolution: { value: new THREE.Vector2(this.width, this.height) },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.fullscreenQuad = new THREE.Mesh(fsGeom, this.phosphorMaterial);
    this.fullscreenScene.add(this.fullscreenQuad);
  }

  /**
   * Set the beam points for this frame.
   * Points are in normalized coordinates: x,y in [-1, 1]
   * Intensity is 0..1 (varies with beam speed)
   */
  setPoints(points: Float32Array, intensities: Float32Array, count: number): void {
    const n = Math.min(count, MAX_POINTS);
    this.pointCount = n;

    this.beamPositions.set(points.subarray(0, n * 3));
    this.beamIntensities.set(intensities.subarray(0, n));

    this.beamGeometry.attributes.position.needsUpdate = true;
    (this.beamGeometry.attributes.aIntensity as THREE.BufferAttribute).needsUpdate = true;
    this.beamGeometry.setDrawRange(0, n);
  }

  /**
   * Render one frame of the oscilloscope display.
   */
  render(): void {
    this.syncUniforms();

    const currentPhosphor = this.pingPong ? this.phosphorTargetA : this.phosphorTargetB;
    const previousPhosphor = this.pingPong ? this.phosphorTargetB : this.phosphorTargetA;

    // Pass 1: Render beam points to offscreen buffer
    this.renderer.setRenderTarget(this.beamTarget);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.beamScene, this.beamCamera);

    // Pass 2: Phosphor persistence — blend beam with decayed previous frame
    this.phosphorMaterial.uniforms.uCurrentFrame.value = this.beamTarget.texture;
    this.phosphorMaterial.uniforms.uPreviousFrame.value = previousPhosphor.texture;
    this.fullscreenQuad.material = this.phosphorMaterial;

    this.renderer.setRenderTarget(currentPhosphor);
    this.renderer.clear();
    this.renderer.render(this.fullscreenScene, this.fullscreenCamera);

    // Pass 3: Bloom — two-pass Gaussian blur
    // Horizontal pass
    this.bloomMaterialH.uniforms.uTexture.value = currentPhosphor.texture;
    this.fullscreenQuad.material = this.bloomMaterialH;

    this.renderer.setRenderTarget(this.bloomTargetH);
    this.renderer.clear();
    this.renderer.render(this.fullscreenScene, this.fullscreenCamera);

    // Vertical pass
    this.bloomMaterialV.uniforms.uTexture.value = this.bloomTargetH.texture;
    this.fullscreenQuad.material = this.bloomMaterialV;

    this.renderer.setRenderTarget(this.bloomTargetV);
    this.renderer.clear();
    this.renderer.render(this.fullscreenScene, this.fullscreenCamera);

    // Pass 4: Composite — combine everything with CRT effects
    this.compositeMaterial.uniforms.uPhosphor.value = currentPhosphor.texture;
    this.compositeMaterial.uniforms.uBloom.value = this.bloomTargetV.texture;
    this.fullscreenQuad.material = this.compositeMaterial;

    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.fullscreenScene, this.fullscreenCamera);

    // Flip ping-pong
    this.pingPong = !this.pingPong;
  }

  private syncUniforms(): void {
    const p = this.params;
    this.beamMaterial.uniforms.uBeamColor.value.set(...p.color);
    this.beamMaterial.uniforms.uBeamWidth.value = p.beamWidth;
    this.phosphorMaterial.uniforms.uDecay.value = p.decay;
    this.bloomMaterialH.uniforms.uRadius.value = p.bloomRadius;
    this.bloomMaterialV.uniforms.uRadius.value = p.bloomRadius;
    this.compositeMaterial.uniforms.uBloomIntensity.value = p.bloomIntensity;
    this.compositeMaterial.uniforms.uCurvature.value = p.curvature;
    this.compositeMaterial.uniforms.uVignette.value = p.vignette;
    this.compositeMaterial.uniforms.uScanlineIntensity.value = p.scanlines;
    this.compositeMaterial.uniforms.uGridIntensity.value = p.grid;
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const rect = canvas.parentElement!.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (w === this.width && h === this.height) return;

    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);

    this.beamTarget.setSize(w, h);
    this.phosphorTargetA.setSize(w, h);
    this.phosphorTargetB.setSize(w, h);

    const bw = Math.floor(w / 2);
    const bh = Math.floor(h / 2);
    this.bloomTargetH.setSize(bw, bh);
    this.bloomTargetV.setSize(bw, bh);

    this.beamMaterial.uniforms.uResolution.value.set(w, h);
    this.bloomMaterialH.uniforms.uResolution.value.set(bw, bh);
    this.bloomMaterialV.uniforms.uResolution.value.set(bw, bh);
    this.compositeMaterial.uniforms.uResolution.value.set(w, h);
  }

  dispose(): void {
    this.beamTarget.dispose();
    this.phosphorTargetA.dispose();
    this.phosphorTargetB.dispose();
    this.bloomTargetH.dispose();
    this.bloomTargetV.dispose();
    this.beamGeometry.dispose();
    this.beamMaterial.dispose();
    this.phosphorMaterial.dispose();
    this.bloomMaterialH.dispose();
    this.bloomMaterialV.dispose();
    this.compositeMaterial.dispose();
    this.renderer.dispose();
  }
}
