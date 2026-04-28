# Contributing to Phosphor

Thanks for your interest in contributing! This project is a web-based oscilloscope simulator with a multi-pass WebGL rendering pipeline.

## Getting Started

The entire app runs in Docker. No local Node.js, no build tools needed on your machine.

```bash
docker compose up --build
```

Open http://localhost:8090 in your browser.

## Project Structure

```
├── frontend/           TypeScript + Three.js + Vite
│   ├── src/
│   │   ├── shaders/    GLSL shaders (beam, phosphor, bloom, composite)
│   │   ├── renderer/   WebGL rendering pipeline
│   │   ├── signals/    Signal generators (Lissajous, Waveform, Multi, Audio, Draw)
│   │   ├── ui/         UI controls and draw overlay
│   │   └── styles/     CSS
│   └── index.html
├── backend/            Node.js + Express + SQLite (presets API)
├── nginx/              Reverse proxy config
└── docker-compose.yml
```

## How the Rendering Pipeline Works

1. **Beam pass** — Signal generators produce XY points. These are rendered as soft gaussian dots with additive blending onto an offscreen buffer.
2. **Phosphor pass** — The beam buffer is added to the previous frame (decayed by the persistence factor). This runs in linear HDR space.
3. **Bloom pass** — Two-pass Gaussian blur at half resolution creates the characteristic CRT glow.
4. **Composite pass** — Tone maps the HDR buffer, adds bloom, applies CRT barrel distortion, scanlines, vignette, and grid overlay.

## Areas for Contribution

- **New signal generators** — Implement the `SignalGenerator` interface in `frontend/src/signals/`
- **Shader improvements** — Better phosphor decay models, chromatic aberration, screen reflections
- **New templates** — Add vector shapes to `VectorCanvas.ts`
- **Audio features** — New visualization modes, better beat detection
- **UI polish** — Animations, responsive improvements, accessibility
- **Presets** — Curated demo presets that showcase the app's capabilities

## Guidelines

- All changes must build successfully in Docker (`docker compose up --build`)
- Test visual changes across Chrome and Firefox
- Keep the rendering pipeline in HDR — tone mapping only in the composite pass
- Signal generators should output points in the [-1, 1] coordinate range
- Intensity values should be in [0, 1] — the beam shader and phosphor handle the rest

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test with `docker compose up --build`
5. Open a pull request with screenshots for visual changes
