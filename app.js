import { PianoRoll } from './piano-roll.js?v=6';
import { notesToAnalysis } from './midi.js?v=6';
import { KEYS } from './chords.js?v=6';
import { estimateTempo, harmonizeMelody } from './melody.js?v=6';
const $ = id => document.getElementById(id);
let editor, progression = [], context;
$('copy').addEventListener('click', async () => {
  if (!progression.length) return;
  const text = progression.map(chord => chord.name).join(' → ');
  try { await navigator.clipboard.writeText(text); $('status').textContent = 'コード進行をコピーしました。'; }
  catch { $('status').textContent = `こちらを選択してコピーしてください: ${text}`; }
});
let recording, stream, recordTimer, previewURL, audioBlob, analysis, sourceIsRecording = false, busy = false, acquiring = false;
editor = new PianoRoll($('piano-roll'), (notes, duration) => {
  analysis = notesToAnalysis(notes, duration);
  $('candidates').replaceChildren(); progression = []; $('copy').disabled = true; $('summary').textContent = '候補を再生成してください';
  $('melody-status').textContent = 'メロディを編集しました。候補を再生成してください。';
});
editor.beforePlay = () => { $('melody-preview').pause(); };
function updateAudioControls() {
  editor.setDisabled(busy || acquiring || Boolean(stream));
  $('record').disabled = busy || acquiring || Boolean(stream);
  $('audio-file').disabled = busy || acquiring || Boolean(stream);
  $('analyze').disabled = busy || acquiring || Boolean(stream);
}
function releaseMicrophone() {
  clearTimeout(recordTimer);
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  $('record-stop').disabled = true;
  updateAudioControls();
}
function loadAudio(blob, recorded = false) {
  if (recorded) $('audio-file').value = '';
  audioBlob = blob; analysis = null; sourceIsRecording = recorded; editor.clear();
  $('melody-preview').pause();
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = URL.createObjectURL(blob);
  $('melody-preview').src = previewURL; $('melody-preview').hidden = false;
  $('candidates').replaceChildren(); progression = []; $('copy').disabled = true; $('summary').textContent = '音声の解析待ち';
  $('melody-status').textContent = `${blob.name || '録音音声'} を読み込みました。メロディから候補を生成できます。`;
  updateAudioControls();
}
$('record').addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    $('melody-status').textContent = '録音にはHTTPSと録音対応ブラウザが必要です。音声ファイルの読み込みをご利用ください。'; return;
  }
  acquiring = true; editor.stop(); updateAudioControls(); $('melody-preview').pause();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    recording = new MediaRecorder(stream);
    const chunks = [];
    recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recording.onstop = () => { const blob = new Blob(chunks, { type: recording.mimeType }); releaseMicrophone(); if (blob.size) loadAudio(blob, true); };
    recording.onerror = () => { releaseMicrophone(); $('melody-status').textContent = '録音に失敗しました。もう一度お試しください。'; };
    recording.start(); $('record-stop').disabled = false;
    $('melody-status').textContent = '録音中… 最大60秒で自動停止します。';
    recordTimer = setTimeout(() => { if (recording.state === 'recording') recording.stop(); }, 60000);
  } catch { releaseMicrophone(); $('melody-status').textContent = 'マイクを使用できません。ブラウザのマイク許可を確認するか、音声ファイルを選んでください。'; }
  finally { acquiring = false; updateAudioControls(); }
});
$('record-stop').addEventListener('click', () => { if (recording?.state === 'recording') { $('record-stop').disabled = true; recording.stop(); } });
function readSelectedFile() {
  const file = $('audio-file').files[0];
  if (!file) return true;
  if (file.size > 20 * 1024 * 1024) {
    $('melody-status').textContent = '20MB以下の音声ファイルを選んでください。';
    return false;
  }
  if (audioBlob !== file) loadAudio(file);
  return true;
}
for (const event of ['input', 'change']) $('audio-file').addEventListener(event, readSelectedFile);

function runAnalysis(samples, sampleRate) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./melody-worker.js?v=6', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('解析がタイムアウトしました。短い音声で再試行してください。')); }, 60000);
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onmessage = ({ data }) => { finish(); if (data.error) reject(new Error(data.error)); else resolve(data.result); };
    worker.onerror = () => { finish(); reject(new Error('音声解析を開始できませんでした。ブラウザを更新して再試行してください。')); };
    worker.postMessage({ samples, sampleRate }, [samples.buffer]);
  });
}
$('analyze').addEventListener('click', async () => {
  if (busy || acquiring || stream || !readSelectedFile()) return;
  if (!audioBlob) { $('melody-status').textContent = '音声ファイルを選ぶか、メロディを録音してください。'; return; }
  busy = true; editor.stop(); updateAudioControls(); $('melody-preview').pause(); $('candidates').replaceChildren();
  $('melody-status').textContent = '音声を解析しています…';
  try {
    if (!analysis) {
      context ||= new AudioContext();
      let buffer;
      try { buffer = await context.decodeAudioData(await audioBlob.arrayBuffer()); }
      catch { throw new Error('この音声形式を読み込めませんでした。WAVやMP3形式をお試しください。'); }
      if (buffer.duration > 60 && !sourceIsRecording) throw new Error('60秒以内の音声を選んでください。');
      const samples = new Float32Array(Math.min(buffer.length, Math.floor(buffer.sampleRate * 60)));
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) samples[i] += data[i] / buffer.numberOfChannels;
      }
      analysis = await runAnalysis(samples, buffer.sampleRate);
      editor.load(analysis, estimateTempo(analysis.onsets).bpm || 100);
    }
    const result = harmonizeMelody(analysis);
    const { candidates, tonality, tempo } = result;
    editor.bpm = tempo.bpm || 100;
    const detected = [...new Set(analysis.notes.map(note => KEYS[note.midi % 12]))];
    const modeName = mode => mode === 'major' ? 'メジャー' : 'マイナー';
    const rhythm = tempo.bpm ? `推定 ${tempo.bpm} BPM（拍の倍・半分になる可能性があります）` : 'テンポを特定できないため、音声を4区間に分けて提案します（試聴は100 BPM）';
    $('melody-status').textContent = `検出音: ${detected.join('・')} / 推定キー: ${tonality.key} ${modeName(tonality.mode)}。${rhythm}。ダイアトニックコード: ${result.chords.join('・')}。${tonality.uncertain ? `キーは曖昧です。別の可能性: ${tonality.alternatives.map(t => `${t.key} ${modeName(t.mode)}`).join('、')}。` : ''}伴奏付き音源では精度が下がります。`;

    candidates.forEach((candidate, i) => {
      const card = document.createElement('div'); card.className = 'candidate';
      const title = document.createElement('h3'); title.textContent = `候補 ${i + 1}`;
      const text = document.createElement('p'); text.textContent = candidate.progression.map(chord => chord.name).join(' → ');
      const button = document.createElement('button'); button.textContent = 'この候補を選択';
      button.addEventListener('click', () => {
        progression = candidate.progression;
        editor.setChords(progression, result.timing, `候補 ${i+1}`);
        editor.status(`候補 ${i+1} のコードを表示しています。メロディとコードを同期再生できます。`);
        if (!busy) editor.chordGrid.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        $('candidates').querySelectorAll('.candidate').forEach((el,index) => { el.classList.toggle('selected',index===i); el.querySelector('button').setAttribute('aria-pressed',String(index===i)); });
        $('summary').textContent = `候補 ${i+1} · ${progression.map(chord=>chord.name).join(' → ')}`;
        $('copy').disabled = false;
        $('status').textContent = `候補 ${i+1} をコードトラックに反映しました。`;

      });
      card.append(title, text, button); $('candidates').append(card);
      if(i===0)button.click();
    });
  } catch (error) { $('melody-status').textContent = error.message; }
  finally { busy = false; updateAudioControls(); }
});
window.addEventListener('pagehide', () => { editor.stop(); if (recording?.state === 'recording') recording.stop(); releaseMicrophone(); if (previewURL) URL.revokeObjectURL(previewURL); });

updateAudioControls();
readSelectedFile();
if (!audioBlob) $('melody-status').textContent = '音声ファイルを選ぶか、メロディを録音してください。';
