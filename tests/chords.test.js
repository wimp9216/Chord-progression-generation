import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, generate } from '../chords.js';
test('C major produces I V vi IV with correctly voiced triads', () => {
  const result = generate({ random: () => 0 });
  assert.deepEqual(result.map(c => c.name), ['C', 'G', 'Am', 'F']);
  assert.deepEqual(result[0].notes, [60, 64, 67]);
  assert.deepEqual(result[2].notes, [69, 72, 76]);
});
test('A minor produces i VI III VII', () => {
  assert.deepEqual(generate({key: 'A', mode: 'minor', random: () => 0}).map(c => c.name), ['Am', 'F', 'C', 'G']);
});
test('all keys, modes, lengths and patterns produce valid triads', () => {
  for (const key of KEYS) for (const mode of ['major', 'minor']) for (const bars of [4,8,16]) for (const random of [() => 0, () => .3, () => .6, () => .99]) {
    const chords = generate({ key, mode, bars, random });
    assert.equal(chords.length, bars);
    for (const chord of chords) {
      assert.equal(chord.notes.length, 3);
      assert.ok(chord.notes.every(Number.isInteger));
      assert.ok(chord.notes[0] < chord.notes[1] && chord.notes[1] < chord.notes[2]);
    }
  }
});
test('invalid options are rejected', () => {
  for (const options of [{key:'H'}, {mode:'invalid'}, {bars:3}]) assert.throws(() => generate(options), RangeError);
});
