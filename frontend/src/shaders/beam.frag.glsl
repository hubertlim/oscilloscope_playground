// Beam fragment shader — renders each point as a soft gaussian dot
// The tone mapping in the phosphor shader prevents blowout,
// so we can output a healthy brightness per point here.
precision highp float;

varying float vIntensity;
uniform vec3 uBeamColor;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);

  // Tight core + soft glow
  float core = exp(-dist * dist * 28.0);
  float glow = exp(-dist * dist * 8.0) * 0.3;
  float shape = core + glow;

  // Each point contributes a moderate amount.
  // With 4096 points and additive blending, overlapping regions
  // will accumulate, but the phosphor tone mapping handles that.
  float brightness = shape * vIntensity * 0.7;

  gl_FragColor = vec4(uBeamColor * brightness, brightness);
}
