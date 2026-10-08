import { KEYS } from './chords.js?v=6';

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
  const onsets = [];
  let previousEnergy = 0, lastOnset = -1;
  const energyHop = 80;
  for (let i = 0; i + energyHop <= reduced.length; i += energyHop) {
    let energy = 0;
    for (let j = i; j < i + energyHop; j++) energy += reduced[j] ** 2;
    energy = Math.sqrt(energy / energyHop);
    const time = i / targetRate;
    if (energy > 0.012 && energy > previousEnergy * 1.7 && energy - previousEnergy > 0.008 && time - lastOnset > 0.18) {
      onsets.push(time); lastOnset = time;
    }
    previousEnergy = energy;
  }
  return { notes, onsets, duration: samples.length / sampleRate };
}

export function suggestProgressions({ notes, duration, key = 'C', mode = 'major', bpm = 100, segmentDuration, offset = 0 }) {
  if (!notes.length) throw new Error('メロディの音高を検出できませんでした。伴奏なしの歌声や単音楽器を録音してください。');
  const tonic = KEYS.indexOf(key);
  if (tonic < 0 || !['major', 'minor'].includes(mode) || !Number.isFinite(bpm) || bpm < 50 || bpm > 180 || !Number.isFinite(duration) || duration <= 0 || duration > 60) throw new RangeError('Invalid melody options');
  const scale = mode === 'major' ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,10];
  const qualities = mode === 'major' ? ['', 'm', 'm', '', '', 'm', 'dim'] : ['m', 'dim', '', 'm', 'm', '', ''];
  const chords = scale.map((interval, degree) => {
    const root = (tonic + interval) % 12, quality = qualities[degree];
    return { name: KEYS[root] + quality, degree: degree + 1, notes: (quality === 'dim' ? [0,3,6] : quality === 'm' ? [0,3,7] : [0,4,7]).map(n => 60 + root + n) };
  });
  const barDuration = segmentDuration || 240 / bpm, bars = Math.max(1, Math.ceil((duration - offset) / barDuration));
  let beam = [{ progression: [], score: 0 }];
  for (let bar = 0; bar < bars; bar++) {
    const melody = notes.filter(note => Math.floor((note.time - offset) / barDuration) === bar);
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


export function diatonicChords(key, mode) {
  const tonic = KEYS.indexOf(key);
  if (tonic < 0 || !['major', 'minor'].includes(mode)) throw new RangeError('Invalid tonality');
  const scale = mode === 'major' ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,10];
  const qualities = mode === 'major' ? ['', 'm', 'm', '', '', 'm', 'dim'] : ['m', 'dim', '', 'm', 'm', '', ''];
  return scale.map((interval, degree) => KEYS[(tonic + interval) % 12] + qualities[degree]);
}

// Duration-weighted pitch-class profiles, scale coverage and phrase-ending evidence.
export function estimateTonality(notes) {
  if (!notes.length) throw new Error('メロディの音高を検出できませんでした。伴奏なしの歌声や単音楽器を録音してください。');
  const histogram = Array(12).fill(0);
  for (const note of notes) histogram[((note.midi % 12) + 12) % 12] += note.duration * note.confidence;
  const total = histogram.reduce((a,b) => a+b, 0);
  const profiles = { major: [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88], minor: [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17] };
  const endings = [...notes].sort((a,b)=>a.time-b.time).slice(-Math.max(1, Math.ceil(notes.length * 0.08)));
  const candidates = [];
  for (let tonic = 0; tonic < 12; tonic++) for (const mode of ['major', 'minor']) {
    const profile = profiles[mode];
    const rotated = histogram.map((_, pc) => profile[(pc-tonic+12)%12]);
    const meanH = total / 12, meanP = rotated.reduce((a,b)=>a+b,0)/12;
    let numerator=0, varianceH=0, varianceP=0;
    for (let i=0;i<12;i++) { numerator+=(histogram[i]-meanH)*(rotated[i]-meanP); varianceH+=(histogram[i]-meanH)**2; varianceP+=(rotated[i]-meanP)**2; }
    const correlation = numerator / Math.sqrt(varianceH * varianceP || 1);
    const scale = mode === 'major' ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,10];
    const coverage = scale.reduce((sum, pc)=>sum+histogram[(tonic+pc)%12],0)/(total || 1);
    const endingWeight = endings.reduce((sum,n)=>sum+n.duration*n.confidence,0);
    const cadence = endings.reduce((sum,n)=>sum+(n.midi%12===tonic ? n.duration*n.confidence : 0),0)/(endingWeight || 1);
    candidates.push({ key: KEYS[tonic], mode, score: correlation + 0.6*coverage + 0.2*cadence, coverage });
  }
  candidates.sort((a,b)=>b.score-a.score);
  const distinct = histogram.filter(n=>n>total*0.025).length;
  return { ...candidates[0], uncertain: distinct < 4 || candidates[0].score-candidates[1].score < 0.12, alternatives: candidates.slice(1,3) };
}

export function estimateTempo(onsets = []) {
  const intervals = onsets.slice(1).map((time,i)=>time-onsets[i]).filter(value=>value>=0.18 && value<=2);
  if (intervals.length < 3) return { bpm: null, uncertain: true };
  const ordered = [...intervals].sort((a,b)=>a-b);
  const median = ordered[Math.floor(ordered.length/2)];
  let beat = median;
  while (60/beat < 80) beat/=2;
  while (60/beat > 160) beat*=2;
  const error = intervals.reduce((sum, value)=>sum+Math.abs(value/beat-Math.round(value/beat*2)/2),0)/intervals.length;
  if (error > 0.12) return { bpm: null, uncertain: true };
  return { bpm: Math.round(60/beat), uncertain: error > 0.04 };
}

export function harmonizeMelody(analysis) {
  const tonality = estimateTonality(analysis.notes);
  const tempo = estimateTempo(analysis.onsets);
  const offset = tempo.bpm ? (analysis.onsets?.[0] || 0) : 0;
  const options = { ...analysis, key: tonality.key, mode: tonality.mode, bpm: tempo.bpm || 100, offset };
  if (!tempo.bpm) options.segmentDuration = analysis.duration / 4;
  return { timing: { offset, segmentDuration: options.segmentDuration || 240/options.bpm, duration: analysis.duration }, tonality, tempo, chords: diatonicChords(tonality.key, tonality.mode), candidates: suggestProgressions(options) };
}
