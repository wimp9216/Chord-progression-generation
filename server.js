import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const assets = new Map([['/midi.js', ['midi.js', 'text/javascript']], ['/piano-roll.js', ['piano-roll.js', 'text/javascript']], ['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/chords.js', ['chords.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']], ['/melody.js', ['melody.js', 'text/javascript']], ['/melody-worker.js', ['melody-worker.js', 'text/javascript']]]);
const port = Number(process.env.PORT || 3000);
createServer(async (req, res) => {
  const asset = assets.get(new URL(req.url, 'http://localhost').pathname);
  if (!asset) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const content = await readFile(new URL(asset[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch { res.writeHead(500); res.end('Unable to read asset'); }
}).listen(port, '0.0.0.0', () => console.log(`Chord app listening on port ${port}`));
