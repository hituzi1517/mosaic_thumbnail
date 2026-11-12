# Thumbnail Mosaic

YouTube の公開サムネイルだけでモザイクアートを作る、GitHub Pages 向けの iPhone 対応 Web アプリです。

## 特徴
- YouTube **チャンネル** または **再生リスト** の公開サムネイルを最後まで取得
- サイト側の **取得上限なし**（YouTube API の制限や端末性能の制約はあり）
- 取得進行度・ページ数・解析進行度・失敗枚数を表示
- モザイク生成時に、**タイル数が素材数以上なら全素材を最低1回は使用**
- 途中停止しても、取得済み分・解析済み分を使って続行しやすい構成

## GitHub Pages 公開
1. このフォルダの中身をリポジトリ直下に置く
2. GitHub Pages を `main` / `root` で有効化
3. Safari で公開URLを開く
4. 必要なら「ホーム画面に追加」

## YouTube API キー
1. Google Cloud でプロジェクト作成
2. YouTube Data API v3 を有効化
3. API キーを作成
4. 可能なら HTTP リファラ制限で GitHub Pages の URL のみ許可

## CORS 対策
YouTube サムネイルを Canvas で読み込めない場合は、`worker/thumb-proxy.js` を Cloudflare Workers にデプロイし、その URL をアプリの「Worker URL」に入力してください。

## 補足
- 素材数よりタイル数が少ない場合は、物理的に全素材を1回ずつ使えないため、使えた数を結果表示します。
- APIキーや画像は localStorage / IndexedDB に保存しません。
