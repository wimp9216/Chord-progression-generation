export function framesToNotes(frames, duration, onsets = []) {
  const notes = [];
  for (const frame of [...frames].sort((a,b)=>a.time-b.time)) {
    const start = Math.max(0, frame.time - frame.duration / 2), end = Math.min(duration, start + frame.duration);
    const previous = notes.at(-1);
    const attack = previous && onsets.some(time=>time > previous.start + .1 && time > previous.start + previous.duration - .03 && time <= start);
    if (previous && previous.midi === frame.midi && start - (previous.start + previous.duration) < .08 && !attack) previous.duration = end - previous.start;
    else if (end > start) notes.push({ midi: frame.midi, start, duration: end-start });
  }
  return notes.filter(note=>note.duration >= .06);
}
export function normalizeNote(note) {
  const midi = Math.round(Number(note.midi)), start = Number(note.start), duration = Number(note.duration);
  if (!Number.isFinite(midi) || !Number.isFinite(start) || !Number.isFinite(duration)) throw new RangeError('Invalid note');
  return { midi: Math.max(24,Math.min(108,midi)), start: Math.max(0,Math.min(59.95,start)), duration: Math.max(.05,Math.min(60-Math.max(0,Math.min(59.95,start)),duration)) };
}
export function notesToAnalysis(notes, duration) {
  const frames = [];
  for (const raw of notes) {
    const note = normalizeNote(raw);
    for(let position=0;position<note.duration;position+=.05) {
      const length = Math.min(.05,note.duration-position);
      frames.push({ midi:note.midi,time:note.start+position+length/2,duration:length,confidence:1 });
    }
  }
  return { notes:frames.sort((a,b)=>a.time-b.time), onsets: [...new Set(notes.map(n=>n.start))].sort((a,b)=>a-b), duration: Math.min(60,Math.max(duration,...notes.map(n=>n.start+n.duration))) };
}
function variable(value) {
  let bytes=[value&127];
  while ((value>>>=7)) bytes.unshift((value&127)|128);
  return bytes;
}
export function encodeMidi(notes, bpm=100) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('Invalid tempo');
  const tempo=Math.round(60000000/bpm), events=[];
  for (const raw of notes) {
    const note=normalizeNote(raw);
    events.push({tick:Math.round(note.start*bpm/60*480),bytes:[0x90,note.midi,80]});
    events.push({tick:Math.max(Math.round((note.start+note.duration)*bpm/60*480),Math.round(note.start*bpm/60*480)+1),bytes:[0x80,note.midi,0]});
  }
  events.sort((a,b)=>a.tick-b.tick || a.bytes[0]-b.bytes[0]);
  const track=[0,0xff,0x51,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255];let last=0;
  for(const event of events){track.push(...variable(event.tick-last),...event.bytes);last=event.tick;}
  track.push(0,0xff,0x2f,0);
  const size=track.length;
  return new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,(size>>>24)&255,(size>>>16)&255,(size>>>8)&255,size&255,...track]);
}
