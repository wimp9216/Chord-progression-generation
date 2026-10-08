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

import { estimateTonality, estimateTempo, diatonicChords, harmonizeMelody } from '../melody.js';
function phrase(pitches) {
  return pitches.map((midi, i) => ({ midi, time: i * .5, duration: i === pitches.length - 1 ? 1 : .5, confidence: 1 }));
}
test('infers major keys from melodic evidence in every transposition', () => {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  for (let shift = 0; shift < 12; shift++) {
    const result = estimateTonality(phrase([60,64,67,65,62,67,71,60].map(n => n + shift)));
    assert.equal(result.key, names[shift]); assert.equal(result.mode, 'major');
  }
});
test('recognizes minor melodies rather than assuming major', () => {
  const result = estimateTonality(phrase([69,72,76,74,71,76,79,69]));
  assert.equal(result.key, 'A'); assert.equal(result.mode, 'minor');
  assert.deepEqual(diatonicChords(result.key, result.mode), ['Am','Bdim','C','Dm','Em','F','G']);
});
test('limited melodic evidence is reported as ambiguous', () => {
  assert.equal(estimateTonality(phrase([60,60,60])).uncertain, true);
});
test('tempo comes from attacks and sparse attacks produce no invented estimate', () => {
  assert.equal(estimateTempo([0,.5,1,1.5,2,2.5]).bpm, 120);
  assert.equal(estimateTempo([0,.75,1.5,2.25,3]).bpm, 80);
  assert.equal(estimateTempo([0,1]).bpm, null);
});
test('automatic harmony ignores caller key and BPM and stays within inferred diatonic chords', () => {
  const analysis = {notes: phrase([62,66,69,67,64,69,73,62]), onsets: [0,.5,1,1.5,2,2.5,3,3.5], duration: 4.5};
  const first = harmonizeMelody({...analysis, key:'C', mode:'minor', bpm:50});
  const second = harmonizeMelody({...analysis, key:'F#', mode:'major', bpm:180});
  assert.deepEqual(first, second);
  assert.equal(first.tonality.key, 'D'); assert.equal(first.tonality.mode, 'major'); assert.equal(first.tempo.bpm,120);
  assert.deepEqual(first.chords, ['D','Em','F#m','G','A','Bm','C#dim']);
  assert.equal(first.candidates.length,3);
  assert.ok(first.candidates.every(c => c.progression.every(chord => first.chords.includes(chord.name))));
});
test('unknown tempo uses four phrase sections and still returns three alternatives', () => {
  const result = harmonizeMelody({notes:phrase([60,64,67,65,62,67,71,60]),duration:4.5,onsets:[]});
  assert.equal(result.tempo.bpm,null);
  assert.ok(result.candidates.every(c=>c.progression.length===4));
});
test('sample analysis extracts attacks and feeds automatic harmony end to end', () => {
  const rate=8000, pitches=[60,64,67,65,62,67,71,60], samples=new Float32Array(rate*4);
  for(let index=0;index<pitches.length;index++) {
    const note=tone(pitches[index],.38,rate);
    samples.set(note, index*rate/2);
  }
  const analysis=analyzeSamples(samples,rate), result=harmonizeMelody(analysis);
  assert.ok(analysis.onsets.length>=7);
  assert.equal(result.tonality.key,'C'); assert.equal(result.tonality.mode,'major');
  assert.equal(result.tempo.bpm,120);
});
