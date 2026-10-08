import { KEYS } from './chords.js';

// YIN difference function: identify a single fundamental, rather than loud harmonics.
export function detectPitch(samples, sampleRate) {
  let energy = 0;
  for (const value of samples) energy += value * value;
  if (Math.sqrt(energy / samples.length) < 0.008) return null;
  const maxLag = Math.min(Math.floor(sampleRate / 75), Math.floor(samples.length / 2));
  const minLag = Math.floor(sampleRate / 1000);
  const difference = new Float64Array(maxLag + 1);
  let sum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let value = 0;
    for (let i = 0; i < samples.length - maxLag; i++) value += (samples[i] - samples[i + lag]) ** 2;
    sum += value;
    difference[lag] = sum ? value * lag / sum : 1;
  }
  for (let lag = minLag; lag < maxLag; lag++) {
    if (difference[lag] >= 0.15) continue;
    while (lag + 1 <= maxLag && difference[lag + 1] < difference[lag]) lag++;
    const left = difference[lag - 1], middle = difference[lag], right = difference[lag + 1] ?? middle;
    const denominator = 2 * (2 * middle - right - left);
    const offset = denominator ? (right - left) / denominator : 0;
    return { midi: Math.round(69 + 12 * Math.log2((sampleRate / (lag + offset)) / 440)), confidence: 1 - middle };
  }
  return null;
}

export function analyzeSamples(samples, sampleRate) {
  const targetRate = 8000;
  const length = Math.floor(samples.length * targetRate / sampleRate);
  const reduced = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * sampleRate / targetRate), end = Math.max(start + 1, Math.floor((i + 1) * sampleRate / targetRate));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j] || 0;
    reduced[i] = sum / (end - start);
  }
  const notes = [], hop = 400, window = 1024;
  for (let i = 0; i + window <= reduced.length; i += hop) {
    const pitch = detectPitch(reduced.subarray(i, i + window), targetRate);
    if (pitch) notes.push({ ...pitch, time: (i + window / 2) / targetRate, duration: hop / targetRate });
  }
  return { notes, duration: samples.length / sampleRate };
}

export function suggestProgressions({ notes, duration, key = 'C', mode = 'major', bpm = 100 }) {
  if (!notes.length) throw new Error('メロディの音高を検出できませんでした。伴奏なしの歌声や単音楽器を録音してください。');
  const tonic = KEYS.indexOf(key);
  if (tonic < 0 || !['major', 'minor'].includes(mode) || !Number.isFinite(bpm) || bpm < 50 || bpm > 180 || !Number.isFinite(duration) || duration <= 0 || duration > 60) throw new RangeError('Invalid melody options');
  const scale = mode === 'major' ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,10];
  const qualities = mode === 'major' ? ['', 'm', 'm', '', '', 'm', 'dim'] : ['m', 'dim', '', 'm', 'm', '', ''];
  const chords = scale.map((interval, degree) => {
    const root = (tonic + interval) % 12, quality = qualities[degree];
    return { name: KEYS[root] + quality, degree: degree + 1, notes: (quality === 'dim' ? [0,3,6] : quality === 'm' ? [0,3,7] : [0,4,7]).map(n => 60 + root + n) };
  });
  const barDuration = 240 / bpm, bars = Math.ceil(duration / barDuration);
  let beam = [{ progression: [], score: 0 }];
  for (let bar = 0; bar < bars; bar++) {
    const melody = notes.filter(note => Math.floor(note.time / barDuration) === bar);
    const total = melody.reduce((sum, note) => sum + note.duration * note.confidence, 0);
    const next = [];
    for (const path of beam) for (const chord of chords) {
      const match = melody.reduce((sum, note) => sum + (chord.notes.some(n => n % 12 === note.midi % 12) ? 1 : -0.35) * note.duration * note.confidence, 0);
      const previous = path.progression.at(-1);
      const transition = previous?.degree === chord.degree ? -0.08 : previous?.degree === 5 && chord.degree === 1 ? 0.12 : 0;
      const tonicBonus = (bar === 0 || bar === bars - 1) && chord.degree === 1 ? 0.08 : 0;
      next.push({ progression: [...path.progression, chord], score: path.score + (total ? match / total : 0) + transition + tonicBonus });
    }
    beam = next.sort((a, b) => b.score - a.score).slice(0, 24);
  }
  // Select alternatives that differ over the phrase, not only in the final bar.
  const selected = [];
  for (const candidate of beam) {
    if (selected.every(other => candidate.progression.filter((chord, i) => chord.name !== other.progression[i].name).length >= Math.max(1, Math.floor(bars / 3)))) selected.push(candidate);
    if (selected.length === 3) break;
  }
  for (const candidate of beam) {
    if (selected.length === 3) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  return selected;
}
