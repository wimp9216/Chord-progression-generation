# Chord Canvas

コード進行を生成・試聴できる、日本語の小さな Web アプリです。

## 開発

Node.js 20 以上を使用してください。外部パッケージ・API キー・データベースは不要です。

```sh
npm start
```

ポート 3000 で起動します。`PORT=3001 npm start` で変更できます。

```sh
npm test
```

## 機能

- 12 キー、メジャー／自然短音階、4・8・16 小節
- 各モードの4種類の定番パターンから4小節ごとに選択
- テンポ指定、Web Audio API による三和音の試聴と停止
- コード進行のコピー（Clipboard API が利用できない場合は文字列表示）

音名はシャープ表記です。試聴はブラウザの音声機能を使用します。

## 構成

`chords.js` は生成ロジック、`app.js` は画面・音声制御、`server.js` は依存パッケージ不要の静的ファイルサーバーです。`tests/` で生成・移調・入力検証を確認します。

## GitHub Pages で公開

GitHub の Settings → Pages で「Deploy from a branch」を選び、`main` ブランチの `/ (root)` を指定して保存します。ビルドや Node.js サーバーは不要です。公開後の URL は `https://wimp9216.github.io/Chord-progression-generation/` です。
