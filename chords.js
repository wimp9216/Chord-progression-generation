export const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MODES = {
  major: { scale: [0, 2, 4, 5, 7, 9, 11], quality: ['', 'm', 'm', '', '', 'm', 'dim'], patterns: [[0, 4, 5, 3], [0, 5, 3, 4], [1, 4, 0, 0], [0, 3, 4, 0]] },
  minor: { scale: [0, 2, 3, 5, 7, 8, 10], quality: ['m', 'dim', '', 'm', 'm', '', ''], patterns: [[0, 5, 2, 6], [0, 3, 6, 2], [0, 6, 5, 6], [0, 3, 4, 0]] }
};
export function generate({ key = 'C', mode = 'major', bars = 4, random = Math.random } = {}) {
  const tonic = KEYS.indexOf(key);
  if (tonic < 0 || !MODES[mode] || ![4, 8, 16].includes(bars)) throw new RangeError('Invalid progression options');
  const config = MODES[mode];
  const progression = [];
  for (let i = 0; i < bars; i += 4) {
    const pattern = config.patterns[Math.floor(random() * config.patterns.length)];
    for (const degree of pattern) {
      const root = (tonic + config.scale[degree]) % 12;
      const quality = config.quality[degree];
      const intervals = quality === 'dim' ? [0, 3, 6] : quality === 'm' ? [0, 3, 7] : [0, 4, 7];
      progression.push({ name: KEYS[root] + quality, degree: degree + 1, notes: intervals.map(n => 60 + root + n) });
    }
  }
  return progression;
}
