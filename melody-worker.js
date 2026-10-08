import { analyzeSamples } from './melody.js?v=4';
self.onmessage = ({ data }) => {
  try { self.postMessage({ result: analyzeSamples(data.samples, data.sampleRate) }); }
  catch { self.postMessage({ error: '音声解析に失敗しました。別のファイルをお試しください。' }); }
};
