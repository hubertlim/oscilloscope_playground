import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Database setup
if (!existsSync('/app/data')) mkdirSync('/app/data', { recursive: true });
const db = new Database('/app/data/phosphor.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'user',
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Seed default presets if empty
const count = db.prepare('SELECT COUNT(*) as c FROM presets').get();
if (count.c === 0) {
  const defaults = [
    {
      name: 'Classic Lissajous',
      category: 'demo',
      data: JSON.stringify({
        mode: 'lissajous',
        freqX: 3, freqY: 2, phaseOffset: 0, amplitude: 0.8,
        phosphor: { color: [0.2, 1.0, 0.3], decay: 0.92, bloomIntensity: 0.6, bloomRadius: 3.0, beamWidth: 2.0 }
      })
    },
    {
      name: 'Figure Eight',
      category: 'demo',
      data: JSON.stringify({
        mode: 'lissajous',
        freqX: 2, freqY: 1, phaseOffset: Math.PI / 2, amplitude: 0.75,
        phosphor: { color: [0.2, 1.0, 0.3], decay: 0.95, bloomIntensity: 0.5, bloomRadius: 2.5, beamWidth: 1.5 }
      })
    },
    {
      name: 'Spiral',
      category: 'demo',
      data: JSON.stringify({
        mode: 'lissajous',
        freqX: 5, freqY: 4, phaseOffset: 0.3, amplitude: 0.85,
        phosphor: { color: [0.3, 1.0, 0.4], decay: 0.88, bloomIntensity: 0.7, bloomRadius: 4.0, beamWidth: 2.5 }
      })
    },
    {
      name: 'Amber Scope',
      category: 'demo',
      data: JSON.stringify({
        mode: 'lissajous',
        freqX: 3, freqY: 4, phaseOffset: 0.5, amplitude: 0.7,
        phosphor: { color: [1.0, 0.7, 0.1], decay: 0.90, bloomIntensity: 0.8, bloomRadius: 3.5, beamWidth: 2.0 }
      })
    },
    {
      name: 'Sine Sweep',
      category: 'demo',
      data: JSON.stringify({
        mode: 'waveform',
        waveform: {
          displayMode: 'yt', ch1Shape: 'sine', ch1Freq: 3.0, ch1Amp: 0.7, ch1Phase: 0,
          ch2Shape: 'sine', ch2Freq: 2.0, ch2Amp: 0.7, ch2Phase: 0, timebase: 2.0, speed: 1.0
        },
        phosphor: { color: [0.2, 1.0, 0.3], decay: 0.90, bloomIntensity: 0.5, bloomRadius: 2.5, beamWidth: 1.8 }
      })
    },
    {
      name: 'Square Wave',
      category: 'demo',
      data: JSON.stringify({
        mode: 'waveform',
        waveform: {
          displayMode: 'yt', ch1Shape: 'square', ch1Freq: 2.0, ch1Amp: 0.65, ch1Phase: 0,
          ch2Shape: 'sine', ch2Freq: 2.0, ch2Amp: 0.7, ch2Phase: 0, timebase: 2.0, speed: 0.8
        },
        phosphor: { color: [0.3, 0.7, 1.0], decay: 0.88, bloomIntensity: 0.7, bloomRadius: 3.0, beamWidth: 2.0 }
      })
    },
    {
      name: 'XY Shapes',
      category: 'demo',
      data: JSON.stringify({
        mode: 'waveform',
        waveform: {
          displayMode: 'xy', ch1Shape: 'sine', ch1Freq: 3.0, ch1Amp: 0.75, ch1Phase: 0,
          ch2Shape: 'triangle', ch2Freq: 2.0, ch2Amp: 0.75, ch2Phase: 0, timebase: 1.5, speed: 1.0
        },
        phosphor: { color: [0.2, 1.0, 0.3], decay: 0.93, bloomIntensity: 0.6, bloomRadius: 3.0, beamWidth: 2.0 }
      })
    },
    {
      name: 'FM Spirograph',
      category: 'demo',
      data: JSON.stringify({
        mode: 'multi',
        multi: {
          mode: 'fm', baseShape: 'sine', baseFreq: 2.0, baseAmp: 0.75,
          modShape: 'sine', modFreq: 5.0, modAmp: 0.6, harmonicCount: 5, harmonicFalloff: 1.0, speed: 0.8
        },
        phosphor: { color: [0.2, 1.0, 0.3], decay: 0.94, bloomIntensity: 0.7, bloomRadius: 3.5, beamWidth: 1.8 }
      })
    },
    {
      name: 'Harmonic Series',
      category: 'demo',
      data: JSON.stringify({
        mode: 'multi',
        multi: {
          mode: 'harmonics', baseShape: 'sine', baseFreq: 1.0, baseAmp: 0.7,
          modShape: 'sine', modFreq: 3.0, modAmp: 0.5, harmonicCount: 8, harmonicFalloff: 1.0, speed: 1.0
        },
        phosphor: { color: [1.0, 0.7, 0.1], decay: 0.91, bloomIntensity: 0.6, bloomRadius: 3.0, beamWidth: 2.2 }
      })
    },
    {
      name: 'AM Modulation',
      category: 'demo',
      data: JSON.stringify({
        mode: 'multi',
        multi: {
          mode: 'am', baseShape: 'sine', baseFreq: 3.0, baseAmp: 0.7,
          modShape: 'sine', modFreq: 1.0, modAmp: 0.6, harmonicCount: 5, harmonicFalloff: 1.0, speed: 1.0
        },
        phosphor: { color: [0.8, 0.85, 1.0], decay: 0.89, bloomIntensity: 0.65, bloomRadius: 3.0, beamWidth: 2.0 }
      })
    }
  ];

  const insert = db.prepare('INSERT INTO presets (name, category, data) VALUES (?, ?, ?)');
  for (const p of defaults) {
    insert.run(p.name, p.category, p.data);
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/presets', (req, res) => {
  const { category } = req.query;
  let rows;
  if (category) {
    rows = db.prepare('SELECT * FROM presets WHERE category = ? ORDER BY created_at DESC').all(category);
  } else {
    rows = db.prepare('SELECT * FROM presets ORDER BY category, created_at DESC').all();
  }
  res.json(rows.map(r => ({ ...r, data: JSON.parse(r.data) })));
});

app.get('/api/presets/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM presets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, data: JSON.parse(row.data) });
});

app.post('/api/presets', (req, res) => {
  const { name, category = 'user', data } = req.body;
  if (!name || !data) return res.status(400).json({ error: 'name and data required' });
  const result = db.prepare('INSERT INTO presets (name, category, data) VALUES (?, ?, ?)').run(name, category || 'user', JSON.stringify(data));
  res.status(201).json({ id: result.lastInsertRowid });
});

app.delete('/api/presets/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM presets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.category === 'demo') return res.status(403).json({ error: 'Cannot delete demo presets' });
  db.prepare('DELETE FROM presets WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Phosphor backend running on port ${PORT}`);
});
