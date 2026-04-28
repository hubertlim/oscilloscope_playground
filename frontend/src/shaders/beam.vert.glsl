// Beam vertex shader — positions points on the scope screen
// Point size is kept small and resolution-independent to prevent blowout
attribute float aIntensity;
varying float vIntensity;

uniform float uBeamWidth;
uniform vec2 uResolution;

void main() {
  vIntensity = aIntensity;
  gl_Position = vec4(position.xy, 0.0, 1.0);
  // Scale point size relative to a reference resolution, clamped to prevent huge dots
  // Reference: 512px. On larger screens points get slightly bigger but capped.
  float scale = min(uResolution.y / 512.0, 2.0);
  gl_PointSize = uBeamWidth * scale;
}
