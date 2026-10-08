import { framesToNotes, normalizeNote, encodeMidi } from './midi.js?v=4';
const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteName=midi=>`${names[midi%12]}${Math.floor(midi/12)-1}`;
const clone=notes=>notes.map(n=>({...n}));
export class PianoRoll {
  constructor(root,onChange) {
    this.root=root;this.onChange=onChange;this.notes=[];this.selected=-1;this.history=[];this.future=[];this.voices=[];this.px=90;this.row=22;
    root.innerHTML=`<h3>メロディ・ピアノロール</h3><p>音符をドラッグして音程・位置を変更。右端をドラッグして長さを変更。空白をダブルクリックして追加できます。時間は秒表示です。</p>
    <div class="roll-scroll"><div class="roll-grid" role="group" aria-label="メロディの音符編集"></div></div>
    <div class="note-fields"><label>音程（MIDI番号）<input data-field="midi" type="number" required min="24" max="108"></label><label>開始（秒）<input data-field="start" type="number" required min="0" max="59.95" step="0.05"></label><label>長さ（秒）<input data-field="duration" type="number" required min="0.05" max="60" step="0.05"></label></div>
    <div class="actions"><button data-action="apply">選択音符を更新</button><button data-action="add">音符を追加</button><button data-action="delete">選択音符を削除</button><button data-action="undo">元に戻す</button><button data-action="redo">やり直す</button><button data-action="reset">解析直後に戻す</button></div>
    <div class="actions roll-audio"><button data-action="play">▶ メロディを試聴</button><button data-action="stop">■ 停止</button><button data-action="download">MIDIを書き出す</button></div><p class="roll-status" role="status" aria-live="polite"></p>`;
    this.grid=root.querySelector('.roll-grid');
    this.grid.addEventListener('dblclick',event=>{if(event.target.closest('.roll-note'))return;const rect=this.grid.getBoundingClientRect();this.add({start:(event.clientX-rect.left-60)/this.px,midi:this.high-Math.floor((event.clientY-rect.top-26)/this.row),duration:.5});});
    root.querySelector('[data-action=apply]').onclick=()=>{
      if(this.selected<0)return;
      if(![...root.querySelectorAll('[data-field]')].every(input=>input.reportValidity()))return;
      const note={};for(const field of ['midi','start','duration']) note[field]=root.querySelector(`[data-field=${field}]`).value;
      try {const normalized=normalizeNote(note);this.commit();this.notes[this.selected]=normalized;this.changed();}catch{this.status('数値を入力してください。');}
    };
    for(const action of ['add','delete','undo','redo','reset','play','stop','download'])root.querySelector(`[data-action=${action}]`).onclick=()=>this[action]();
  }
  status(text){this.root.querySelector('.roll-status').textContent=text;}
  setDisabled(disabled){this.disabled=disabled;this.root.querySelectorAll('button,input').forEach(el=>el.disabled=disabled);this.grid.inert=disabled;}
  load(analysis,bpm=100){this.stop();this.notes=framesToNotes(analysis.notes,analysis.duration,analysis.onsets);this.original=clone(this.notes);this.duration=analysis.duration;this.bpm=bpm;this.selected=-1;this.history=[];this.future=[];this.root.hidden=false;this.draw();this.status(`${this.notes.length}音を検出しました。編集後は「メロディから候補を生成」でコードを再生成できます。`);}
  clear(){this.stop();this.notes=[];this.root.hidden=true;}
  commit(){this.history.push(clone(this.notes));if(this.history.length>50)this.history.shift();this.future=[];}
  changed(){this.stop();this.draw();this.onChange(clone(this.notes),this.duration);this.status('編集を反映しました。コード候補を再生成してください。');}
  add(note={midi:60,start:0,duration:.5}){if(this.disabled)return;this.commit();this.notes.push(normalizeNote(note));this.selected=this.notes.length-1;this.changed();}
  delete(){if(this.selected<0)return;this.commit();this.notes.splice(this.selected,1);this.selected=-1;this.changed();}
  undo(){if(!this.history.length)return;this.future.push(clone(this.notes));this.notes=this.history.pop();this.selected=-1;this.changed();}
  redo(){if(!this.future.length)return;this.history.push(clone(this.notes));this.notes=this.future.pop();this.selected=-1;this.changed();}
  reset(){this.commit();this.notes=clone(this.original);this.selected=-1;this.changed();}
  fields(){const note=this.notes[this.selected];for(const field of ['midi','start','duration']){const input=this.root.querySelector(`[data-field=${field}]`);input.value=note?(field==='midi'?note[field]:note[field].toFixed(3)):'';}}
  draw(){
    this.high=Math.min(108,Math.max(84,...this.notes.map(n=>n.midi+3)));this.low=Math.max(24,Math.min(48,...this.notes.map(n=>n.midi-3)));
    const duration=Math.max(this.duration,...this.notes.map(n=>n.start+n.duration));
    this.grid.style.width=`${60+Math.max(4,duration)*this.px+10}px`;this.grid.style.height=`${26+(this.high-this.low+1)*this.row}px`;this.grid.replaceChildren();
    for(let second=0;second<=duration;second++){const marker=document.createElement('span');marker.className='roll-time';marker.style.left=`${60+second*this.px}px`;marker.textContent=`${second}s`;this.grid.append(marker);}
    for(let midi=this.high;midi>=this.low;midi--){const label=document.createElement('span');label.className='roll-key';label.style.top=`${26+(this.high-midi)*this.row}px`;label.textContent=noteName(midi);this.grid.append(label);}
    this.notes.forEach((note,index)=>{
      const el=document.createElement('div');el.className='roll-note'+(this.selected===index?' selected':'');el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',`${noteName(note.midi)} 開始 ${note.start.toFixed(2)}秒 長さ ${note.duration.toFixed(2)}秒`);
      const position=()=>{el.style.left=`${60+note.start*this.px}px`;el.style.top=`${26+(this.high-note.midi)*this.row+1}px`;el.style.width=`${Math.max(5,note.duration*this.px)}px`;};position();el.textContent=noteName(note.midi);const handle=document.createElement('span');handle.className='roll-resize';el.append(handle);
      el.addEventListener('click',()=>{this.selected=index;this.grid.querySelectorAll('.roll-note').forEach((n,i)=>n.classList.toggle('selected',i===index));this.fields();});
      el.addEventListener('pointerdown',event=>{
        if(this.disabled || event.button!==0)return;event.preventDefault();this.selected=index;this.fields();const original={...note},x=event.clientX,y=event.clientY,resize=event.target===handle;let moved=false;el.setPointerCapture(event.pointerId);
        const move=event=>{const dx=(event.clientX-x)/this.px;const updated=normalizeNote(resize?{...original,duration:original.duration+dx}:{...original,start:Math.round((original.start+dx)*20)/20,midi:original.midi-Math.round((event.clientY-y)/this.row)});if(!moved && (updated.midi!==original.midi || updated.start!==original.start || updated.duration!==original.duration)){this.commit();moved=true;}Object.assign(note,updated);position();this.fields();};
        const finish=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',finish);el.removeEventListener('pointercancel',finish);if(moved)this.changed();else this.draw();};
        el.addEventListener('pointermove',move);el.addEventListener('pointerup',finish);el.addEventListener('pointercancel',finish);
      });
      el.addEventListener('keydown',event=>{
        this.selected=index;
        if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();this.delete();return;}
        if(event.key==='Enter'){this.fields();return;}
        if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();this.commit();this.notes[index]=normalizeNote({...note,midi:note.midi+(event.key==='ArrowUp'?1:event.key==='ArrowDown'?-1:0),start:note.start+(event.key==='ArrowRight'?.05:event.key==='ArrowLeft'?-.05:0)});this.changed();this.grid.querySelectorAll('.roll-note')[index]?.focus();
      });this.grid.append(el);
    });this.fields();
  }
  stop(){this.playVersion=(this.playVersion||0)+1;clearTimeout(this.timer);this.voices.forEach(voice=>{try{voice.stop();}catch{}});this.voices=[];}
  async play(){
    this.beforePlay?.();this.stop();const version=this.playVersion;
    try {this.audio ||= new AudioContext();await this.audio.resume();if(version!==this.playVersion)return;
      for(const note of this.notes){const oscillator=this.audio.createOscillator(),gain=this.audio.createGain(),time=this.audio.currentTime+.05+note.start;oscillator.type='triangle';oscillator.frequency.value=440*2**((note.midi-69)/12);gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(.12,time+.01);gain.gain.linearRampToValueAtTime(0,time+note.duration);oscillator.connect(gain);gain.connect(this.audio.destination);oscillator.start(time);oscillator.stop(time+note.duration);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};this.voices.push(oscillator);}
      this.status('編集したメロディを再生中…');this.timer=setTimeout(()=>{this.stop();this.status('再生が終了しました。');},(Math.max(0,...this.notes.map(n=>n.start+n.duration))+.1)*1000);
    }catch{this.stop();this.status('このブラウザでは試聴できません。');}
  }
  download(){const url=URL.createObjectURL(new Blob([encodeMidi(this.notes,this.bpm)],{type:'audio/midi'})),link=document.createElement('a');link.href=url;link.download='melody.mid';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.status('編集したメロディをMIDIファイルに書き出しました。');}
}
