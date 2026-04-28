// Composite shader — tone maps the HDR phosphor buffer and applies CRT effects
precision highp float;

uniform sampler2D uPhosphor;
uniform sampler2D uBloom;
uniform float uBloomIntensity;
uniform float uCurvature;
uniform float uVignette;
uniform float uScanlineIntensity;
uniform float uGridIntensity;
uniform vec2 uResolution;
varying vec2 vUv;

vec2 curveUV(vec2 uv, float amount) {
  uv = uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) / vec2(6.0, 6.0);
  uv = uv + uv * offset * offset * amount * 40.0;
  uv = uv * 0.5 + 0.5;
  return uv;
}

void main() {
  vec2 uv = vUv;
  vec2 curved = curveUV(uv, uCurvature);

  if (curved.x < 0.0 || curved.x > 1.0 || curved.y < 0.0 || curved.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Sample HDR phosphor and bloom
  vec3 phosphor = texture2D(uPhosphor, curved).rgb;
  vec3 bloom = texture2D(uBloom, curved).rgb;

  // Combine in linear HDR space
  vec3 hdr = phosphor + bloom * uBloomIntensity;

  // Tone map: Reinhard with exposure control
  // This is the ONLY place tone mapping happens.
  // exposure of 1.5 makes the trace bright, Reinhard prevents blowout.
  float exposure = 1.5;
  vec3 color = hdr * exposure;
  color = color / (1.0 + color);

  // Scanlines
  float scanline = 1.0 - uScanlineIntensity * (0.5 + 0.5 * sin(curved.y * uResolution.y * 1.5));

  // Grid
  vec2 gridUv = curved * 10.0;
  float gridLine = smoothstep(0.0, 0.06, abs(fract(gridUv.x) - 0.5))
                 * smoothstep(0.0, 0.06, abs(fract(gridUv.y) - 0.5));
  float grid = mix(1.0, gridLine, uGridIntensity);

  vec2 majorGrid = curved * 2.0;
  float majorLine = 1.0 - (
    smoothstep(0.003, 0.0, abs(fract(majorGrid.x) - 0.5)) +
    smoothstep(0.003, 0.0, abs(fract(majorGrid.y) - 0.5))
  ) * uGridIntensity * 1.5;

  color *= scanline * grid * majorLine;

  // Vignette
  vec2 vigUv = curved * 2.0 - 1.0;
  float vig = 1.0 - dot(vigUv * 0.5, vigUv * 0.5) * uVignette;
  vig = clamp(vig, 0.0, 1.0);
  vig = smoothstep(0.0, 1.0, vig);
  color *= vig;

  // Ambient glass glow
  color += vec3(0.0, 0.003, 0.0);

  gl_FragColor = vec4(color, 1.0);
}
