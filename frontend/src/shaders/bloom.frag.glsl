// Bloom shader — multi-pass Gaussian blur for the characteristic CRT glow
precision highp float;

uniform sampler2D uTexture;
uniform vec2 uDirection; // (1,0) for horizontal, (0,1) for vertical
uniform vec2 uResolution;
uniform float uRadius;
varying vec2 vUv;

void main() {
  vec4 sum = vec4(0.0);
  float totalWeight = 0.0;

  // 13-tap Gaussian blur
  float weights[7];
  weights[0] = 0.1964825501511404;
  weights[1] = 0.2969069646728344;
  weights[2] = 0.2195956136;
  weights[3] = 0.0439369336;
  weights[4] = 0.0109634340;
  weights[5] = 0.0018363771;
  weights[6] = 0.0002149321;

  vec2 texelSize = uRadius / uResolution;

  for (int i = -6; i <= 6; i++) {
    float weight = weights[abs(i)];
    vec2 offset = uDirection * texelSize * float(i);
    sum += texture2D(uTexture, vUv + offset) * weight;
    totalWeight += weight;
  }

  gl_FragColor = sum / totalWeight;
}
