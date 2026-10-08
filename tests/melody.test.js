import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, analyzeSamples, suggestProgressions } from '../melody.js';
function tone(midi, seconds = 0.128, rate = 8000) {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  return Float32Array.from({ length: Math.floor(rate * seconds) }, (_, i) => .2 * Math.sin(2 * Math.PI * frequency * i / rate) + .05 * Math.sin(4 * Math.PI * frequency * i / rate));
}
test('pitch detection identifies bass, melody and harmonic-rich tones', () => {
  for (const midi of [40, 48, 60, 64, 69, 79, 83]) assert.equal(detectPitch(tone(midi), 8000)?.midi, midi);
});
test('silence is rejected instead of producing a false melody', () => {
  assert.equal(detectPitch(new Float32Array(1024), 8000), null);
  const analysis = analyzeSamples(new Float32Array(8000), 8000);
  assert.equal(analysis.notes.length, 0);
  assert.throws(() => suggestProgressions(analysis), /音高/);
});
test('audio analysis preserves timing and detects changes at 44.1kHz', () => {
  const rate = 44100, first = tone(60, 1, rate), second = tone(67, 1, rate);
  const samples = new Float32Array(first.length + second.length);
  samples.set(first); samples.set(second, first.length);
  const analysis = analyzeSamples(samples, rate);
  assert.equal(analysis.duration, 2);
  const early = analysis.notes.filter(n => n.time < .9);
  const late = analysis.notes.filter(n => n.time > 1.1);
  assert.ok(early.length > 10 && late.length > 10);
  assert.ok(early.every(n => n.midi === 60));
  assert.ok(late.every(n => n.midi === 67));
});
test('three unique candidates fit melody notes and use tempo for bar boundaries', () => {
  const notes = [60, 67, 69, 65].flatMap((midi, bar) => Array.from({length: 20}, (_, i) => ({midi, time: bar * 2 + i * .09 + .1, duration: .09, confidence: 1})));
  const results = suggestProgressions({ notes, duration: 8, bpm: 120 });
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map(r => r.progression.map(c => c.name).join(','))).size, 3);
  assert.ok(results.every(r => r.progression.length === 4));
  for (let i = 0; i < 4; i++) assert.ok(results[0].progression[i].notes.some(n => n % 12 === [60,67,69,65][i] % 12));
  assert.equal(suggestProgressions({notes, duration: 8, bpm: 60})[0].progression.length, 2);
});
test('changing the melody changes the leading accompaniment', () => {
  const build = midi => suggestProgressions({notes: [{midi, time: .2, duration: 1, confidence: 1}], duration: 2, bpm: 120})[0].progression[0];
  assert.notEqual(build(60).name, build(62).name);
  assert.ok(build(62).notes.some(n => n % 12 === 2));
});
test('invalid duration, tempo and key are rejected', () => {
  const options = { notes: [{midi:60,time:.2,duration:.1,confidence:1}], duration: 2 };
  for (const override of [{duration: 61}, {duration: 0}, {bpm: 0}, {key: 'H'}, {mode: 'invalid'}]) assert.throws(() => suggestProgressions({...options, ...override}), RangeError);
});
