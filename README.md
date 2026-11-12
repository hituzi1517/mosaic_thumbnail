# Thumbnail Mosaic — YouTube専用モザイクアート

独立したGitHub Pages向けWebアプリ（iPhoneのSafari / ホーム画面追加に対応）。**カメラロールの写真を大量選択する必要はありません**。元画像1枚を選び、YouTubeチャンネルまたは再生リストの公開動画サムネイルを素材にします。

## 機能

- YouTubeチャンネル: `@handle`、`https://www.youtube.com/@handle`、チャンネルID `UC...`、`https://www.youtube.com/channel/UC...`、`/user/username` を指定可能。
- 再生リスト: URLまたはIDを指定可能。
- **アプリ側にサムネイル取得件数の上限を設けません**。`playlistItems.list`の`maxResults=50`と`nextPageToken`で終端までたどります。実際の取得枚数は公開状況・YouTube APIの日次割り当て・通信環境に依存します。
- **動画一覧の取得**（総数の推定値、取得件数、ページ数、進捗率）、**画像解析**（解析枚数、失敗枚数、進捗率）、**描画**それぞれに進捗表示。
- 停止/再開。取得済み動画はブラウザを閉じるまで残ります。チャンネル取得を停止して再取得すると同じ入力で続きから再開します。
- 端末メモリへの負担を抑えるため、サムネ画像を1枚ずつ取得して小型化します。
- 同じサムネの偏り抑制、隣接回避、元画像の合成、出力サイズ設定。PNG保存、iPhoneの共有シート対応。
- カメラロール版から完全に独立しています。

## 1. GitHub Pagesで公開する

1. GitHubで**別のリポジトリ**（例: `youtube-mosaic`）を新規作成します。
2. このフォルダの中の `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `sw.js`, PNGアイコン, `.nojekyll` をリポジトリの最上層へアップロードします（`worker/`フォルダも一緒に置いてOK）。
3. リポジトリの **Settings → Pages → Build and deployment → Deploy from a branch → main / (root)** を選択します。
4. `https://<GitHubユーザー名>.github.io/youtube-mosaic/` をSafariで開きます。
5. 共有メニュー → **ホーム画面に追加** でアプリのように使えます。

## 2. YouTube Data APIキーを作る

1. https://console.cloud.google.com/ でプロジェクトを作成。
2. 「APIとサービス」→ライブラリで **YouTube Data API v3** を有効化。
3. 「認証情報」で **APIキー** を作成。
4. **APIの制限:** YouTube Data API v3 に制限します。
5. **アプリケーションの制限:** ウェブサイト（HTTPリファラー）を選び、GitHub Pagesの `https://<GitHubユーザー名>.github.io/*` を許可します。特定リポジトリまで絞れる場合はそのURL範囲に絞ってください。
6. サイトのAPIキー欄へ入力します。ソースコードや公開リポジトリにキーを書かないでください。

このアプリはAPIキーをブラウザの永続ストレージに保存しません。ページを閉じると再入力が必要です。

## 3. サムネイル画像のCORS対策（重要）

YouTube APIが返す動画情報からサムネイルURLは分かりますが、`i.ytimg.com` の画像を第三者のサイトから **Canvasで読み取り・PNG出力** するにはCORSの許可が必要です。直接取得できる場合はWorkerなしでも動きますが、CORSエラーになる環境ではブラウザ内のみでは回避できません。

このZIPの `worker/thumb-proxy.js` は、公開サムネイルのみを一時的に転送する **Cloudflare Worker** です。写真・APIキーを受け取らず、画像をDBやファイルとして保存しません。

### Cloudflare Workerの設置

1. https://dash.cloudflare.com/ にサインインします。
2. 「Workers & Pages」から **Workerを新規作成** します。
3. ソースコードを **`worker/thumb-proxy.js` の内容へ置き換え** てデプロイします。
4. Workerの **Settings → Variables and Secrets**（画面表示名は変わる場合があります）で、テキスト環境変数 **`ALLOWED_ORIGIN`** を作成し、**サイトのオリジン**を指定します。例: `https://hituzi1517.github.io`（末尾の `/` や `/youtube-mosaic` は付けない）。
5. WorkerのURL（例: `https://my-thumbnail-worker.<subdomain>.workers.dev`）を、アプリの「画像読み込み用 Worker URL」に入力します。
6. `https://your-worker.example.workers.dev/thumb?id=jfKfPfyJRdk` をブラウザで開き、画像が返ることを確認します。Workerの設定でOrigin制限によりブラウザから直接開くテストは通る場合がありますが、実際のPWAからのリクエストは `ALLOWED_ORIGIN` と一致する必要があります。

**注意:** Workerは元画像をCloudflare経由で中継します。ユーザーがカメラロールから選んだ元画像は中継しません。大規模チャンネルではWorkerの無料枠やサムネイル配信側の制限に当たる可能性があります。

## 4. 使い方

1. 元画像を1枚選択。
2. APIキー、取得元（チャンネル/再生リスト）、URLを入力。
3. **全サムネイルを取得**を押し、件数・ページ・進行度を確認。途中停止も可能。
4. 画質・重複設定などを調整。
5. 必要ならWorker URLを入力。
6. **モザイクを作成**を押すと、画像解析・描画進捗を確認できます。
7. 「iPhoneで共有・保存」または「PNGを保存」を押して完成画像を保存。

## 技術と制約

- YouTube APIメタデータ: `channels.list(part=contentDetails,snippet)`でuploadsプレイリストを取得、`playlistItems.list(part=snippet,contentDetails,maxResults=50,pageToken=...)`を終端まで呼び出します。
- YouTubeに存在する非公開・削除済み動画、閲覧権限がない動画のサムネイルは取得できません。通常のチャンネルuploadsに載らないコンテンツも対象外です。
- APIキーのクォータ消費: 呼び出しごとに割り当てが消費されます。取得件数に上限をかけないため、巨大なチャンネルでは割り当て上限やWorker上限に到達する場合があります。
- 写真・APIキー・加工後の小型サムネイルを `localStorage` / `IndexedDB` / サーバーDBに保存しません。サービスワーカーのキャッシュ対象はアプリの静的ファイルのみです。
- 途中停止した処理は **ページを閉じると消えます**。端末の負荷でSafariが強制終了した場合も同様です。
- サムネイルを加工した画像を公開・再配布する際は著作権・YouTube利用規約などを確認してください。
