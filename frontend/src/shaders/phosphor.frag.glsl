// Phosphor persistence — works in linear HDR space.
// Decay previous frame, add new beam energy, soft-clamp to prevent runaway.
// Tone mapping happens later in the composite pass.
precision highp float;

uniform sampler2D uCurrentFrame;
uniform sampler2D uPreviousFrame;
uniform float uDecay;
varying vec2 vUv;

void main() {
  vec4 current = texture2D(uCurrentFrame, vUv);
  vec4 previous = texture2D(uPreviousFrame, vUv);

  // Exponential decay
  vec4 decayed = previous * uDecay;

  // Add new beam energy
  vec4 combined = decayed + current;

  // Hard clamp at a reasonable HDR ceiling.
  // This prevents infinite accumulation but keeps the values
  // in a range where the composite tone mapping works well.
  // Values up to 2.0 are fine — the composite shader handles them.
  combined = min(combined, vec4(2.5));

  gl_FragColor = combined;
}
