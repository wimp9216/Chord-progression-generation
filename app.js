import { KEYS, generate } from './chords.js';
const $ = id => document.getElementById(id);
for (const key of KEYS) $('key').add(new Option(key, key));
let progression = [], context, voices = [], timers = [];
function stop() {
  timers.forEach(clearTimeout); timers = [];
  voices.forEach(voice => { try { voice.stop(); } catch {} }); voices = [];
  document.querySelectorAll('.chord').forEach(el => el.classList.remove('active'));
  $('play').disabled = false; $('stop').disabled = true;
  if ($('status').textContent === '再生中…') $('status').textContent = '再生を停止しました。';
}
function render() {
  stop();
  progression = generate({ key: $('key').value, mode: $('mode').value, bars: Number($('bars').value) });
  $('chords').replaceChildren(...progression.map((chord, i) => {
    const card = document.createElement('div'); card.className = 'chord';
    const bar = document.createElement('span'); bar.textContent = `BAR ${String(i + 1).padStart(2, '0')}`;
    const name = document.createElement('strong'); name.textContent = chord.name;
    const degree = document.createElement('small'); degree.textContent = `第${chord.degree}音のコード`;
    card.append(bar, name, degree); return card;
  }));
  $('summary').textContent = `${$('key').value} ${$('mode').value === 'major' ? 'メジャー' : 'マイナー'} / ${progression.length}小節`;
  $('status').textContent = '';
}
$('generate').addEventListener('click', render);
for (const id of ['key', 'mode', 'bars']) $(id).addEventListener('change', render);
$('tempo').addEventListener('input', () => { $('tempo-value').textContent = `${$('tempo').value} BPM`; stop(); });
$('stop').addEventListener('click', stop);
$('play').addEventListener('click', async () => {
  stop(); $('play').disabled = true; $('stop').disabled = false;
  try {
    context ||= new AudioContext(); await context.resume();
    if (!$('play').disabled) return;
    const duration = 240 / Number($('tempo').value), start = context.currentTime + 0.05;
    progression.forEach((chord, i) => {
      chord.notes.forEach(note => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = 'triangle'; oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
        const time = start + i * duration;
        gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(0.075, time + 0.04); gain.gain.exponentialRampToValueAtTime(0.001, time + duration - 0.03);
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(time); oscillator.stop(time + duration); voices.push(oscillator);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
      timers.push(setTimeout(() => {
        document.querySelectorAll('.chord').forEach((el, j) => el.classList.toggle('active', i === j));
      }, 50 + i * duration * 1000));
    });
    timers.push(setTimeout(stop, 50 + progression.length * duration * 1000));
    $('status').textContent = '再生中…';
  } catch { stop(); $('status').textContent = 'このブラウザでは試聴できません。'; }
});
$('copy').addEventListener('click', async () => {
  const text = progression.map(chord => chord.name).join(' → ');
  try { await navigator.clipboard.writeText(text); $('status').textContent = 'コード進行をコピーしました。'; }
  catch { $('status').textContent = `こちらを選択してコピーしてください: ${text}`; }
});
render();
