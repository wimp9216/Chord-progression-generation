import test from 'node:test';
import assert from 'node:assert/strict';
import { framesToNotes, normalizeNote, notesToAnalysis, encodeMidi } from '../midi.js';
import { harmonizeMelody } from '../melody.js';
test('groups equal pitch frames while preserving rests and repeated-note attacks',()=>{
 const frames=[{midi:60,time:.025,duration:.05},{midi:60,time:.075,duration:.05},{midi:60,time:.125,duration:.05},{midi:60,time:.325,duration:.05},{midi:60,time:.375,duration:.05},{midi:62,time:.425,duration:.05},{midi:62,time:.475,duration:.05}];
 const result=framesToNotes(frames,.5);
 assert.equal(result.length,3);assert.equal(result[0].midi,60);assert.ok(Math.abs(result[0].duration-.15)<1e-8);assert.ok(result[1].start>.25);assert.equal(result[2].midi,62);
 const repeated=Array.from({length:8},(_,i)=>({midi:60,time:i*.05+.025,duration:.05}));
 assert.equal(framesToNotes(repeated,.4,[0,.2]).length,2);
});
test('editing clamps pitch and time, rejects nonnumeric values',()=>{
 assert.deepEqual(normalizeNote({midi:200,start:-2,duration:100}),{midi:108,start:0,duration:60});
 const boundary=normalizeNote({midi:20,start:80,duration:10});assert.equal(boundary.midi,24);assert.equal(boundary.start+boundary.duration,60);
 assert.throws(()=>normalizeNote({midi:'invalid',start:0,duration:1}),RangeError);
});
test('long edited notes contribute to every covered segment',()=>{
 const result=notesToAnalysis([{midi:60,start:0,duration:4}],4);
 assert.ok(result.notes.some(n=>n.time<1));assert.ok(result.notes.some(n=>n.time>3));
 assert.ok(Math.abs(result.notes.reduce((sum,n)=>sum+n.duration,0)-4)<1e-8);
});
test('edited pitches change inferred key and candidates',()=>{
 const pitches=[60,64,67,65,62,67,71,60];
 const build=shift=>harmonizeMelody(notesToAnalysis(pitches.map((midi,i)=>({midi:midi+shift,start:i*.5,duration:.4})),4));
 assert.equal(build(0).tonality.key,'C');assert.equal(build(2).tonality.key,'D');assert.notDeepEqual(build(0).candidates,build(2).candidates);
});
test('MIDI export has valid header, timing, tempo and paired note events',()=>{
 const bytes=encodeMidi([{midi:60,start:.5,duration:1},{midi:64,start:1.5,duration:.5}],120);
 const view=new DataView(bytes.buffer);assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'MThd');assert.equal(view.getUint16(10),1);assert.equal(view.getUint16(12),480);assert.equal(view.getUint32(18),bytes.length-22);
 let cursor=22,tick=0,events=[];
 function variable(){let value=0,byte;do{byte=bytes[cursor++];value=value*128+(byte&127);}while(byte&128);return value;}
 while(cursor<bytes.length){tick+=variable();const status=bytes[cursor++];if(status===255){const kind=bytes[cursor++],length=variable();if(kind===81)assert.equal(bytes[cursor]*65536+bytes[cursor+1]*256+bytes[cursor+2],500000);cursor+=length;}else{events.push([tick,status,bytes[cursor++],bytes[cursor++]]);}}
 assert.deepEqual(events,[[480,144,60,80],[1440,128,60,0],[1440,144,64,80],[1920,128,64,0]]);
});
