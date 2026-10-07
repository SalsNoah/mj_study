# YouTubeタイトル補完と教材一覧操作

Base main: `5ef1f6fa817fbf492a3c60baf57be16791f34d3d` (PR34)。2つの変更を独立commitに分離。公開・main merge・ready化は未実施。

## 1. YouTubeタイトル補完

新規追加時のみ、空欄のタイトルを公式oEmbedから補完。watch/youtu.be/shorts/live/embedの動画ID認識をサムネイルと共有し、APIへは正規watch URLだけ送信。保存URLは既存正規化以上に変更しない。note等は手入力のまま。

300ms待機、5秒タイムアウト、認証情報・referrer・キャッシュ送信なし。手動入力/削除は以後上書きせず、自動タイトルだけURL変更時に更新。古い応答、閉じる/再表示、保存中の応答を破棄。長いタイトルは既存100文字制限に合わせ、サロゲートを壊さず短縮し画面で説明。エラー時も手入力/ホスト名で即時登録できる。

公式仕様: https://oembed.com/#section5.1

### 実通信とモックの区別

実取得は**未成功、CORSは未判定**。2026-10-07 08:47:23–24 UTCに本番buildを配信した`http://127.0.0.1:5184`から実Chromiumで次をfetchした。

`https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DM7lc1UVf-VE&format=json`

Service Worker有効/無効の両方で`net::ERR_TUNNEL_CONNECTION_FAILED` / `TypeError: Failed to fetch`、HTTPレスポンスなし。[生ログ](logs/live-probe.json)。環境のネットワーク経路で止まっており、YouTubeのCORS拒否とは断定しない。ネットワークdenyの迂回、外部proxy/server、APIキー、追加ログインは使用していない。公開Pages originからのoEmbed実測ではない。

08:54:11 UTCに公開`https://salsnoah.github.io/mj_study/`への実Chromium navigationも`ERR_TUNNEL_CONNECTION_FAILED`で失敗。公開レスポンスのCSPヘッダーは未確認([ログ](logs/public-origin-probe.json))。checkoutのindex.html/public/.githubにはCSP/connect-src指定なし。公開origin条件での追加検証は親側の利用可能なブラウザーへ引き継ぐ。

事前プローブで既存Service Workerが通信失敗時にindex.htmlを返すことも確認したため、oEmbedだけキャッシュ/HTML fallback対象外とした。キャッシュversionをv51へ更新。APIレスポンスのtitle型検証により旧SWのHTMLもエラー扱い。

補完成功・遅延・長いタイトル・タイムアウト等はモック試験。実際のYouTube取得成功とは扱わない。公開前に通常の利用環境で直接取得の追加検証が必要。

## 2. 一覧の4操作

サムネイル・タイトル・回数・URLホスト・コメント表示を維持。上段はprimary「教材を開く」とoutline「学習した」、下段は低強調の「記録・コメント」「アーカイブ」。全テーマで下段の塗り/影/装飾を抑え、44px以上の操作領域と読みやすい文字を維持。

一覧から学習を記録しても保存済みコメントは保持。updatedAt更新でカードがポインター下から動かないよう、その一覧滞在中は並び順を維持する。再訪問時は従来どおり更新順。連打で1回だけ記録し、同じ画面で2回目以後の学習は確認後に別イベントとして追加できる（日次制限なし）。外部リンクは回数を増やさない。

アーカイブは確認後に対象だけ移動し、コメント・履歴は保持。取消時は元ボタン、移動/復元時は検索へフォーカス。アーカイブ表示では学習不可、復元と既存詳細経路を維持。既存詳細の編集/学習/履歴/未保存ガードに変更なし。

## 検証

- `npm run typecheck` / `npm run build`: 成功。
- 新規hook 27件、一覧追加3件、既存関連回帰を実行。[全件ログ](logs/all-tests.log): **927件中926成功**。唯一の失敗は既存A44検索性能334.76ms、閾値200ms。変更前も同じ試験が312.08msで失敗([baseline](logs/baseline.log))。検索実装/試験/閾値は未変更。タイトル段階も923/924、A44のみ310.35ms。
- タイトル実ブラウザー: 320/390/1440、モック補完、手動編集維持、元URL保持、学習回数不変、取得中即時保存、横溢れなし。[結果](logs/title-browser.json)
- 一覧実ブラウザー: 320/390/1440 × 全5テーマ、100/150%文字、長いタイトル/コメント/画像失敗、4操作44px、重なりなし、Tab/Enter/Space、focus/hover/disabled、連打、カード順維持、コメント保持、アーカイブ取消/確定/復元、外部openによる回数増なし。[結果](logs/actions-browser.json)
- 既存実ブラウザー回帰: [未保存ガード33記録](logs/unsaved-browser.json)、[アーカイブ](logs/archive-browser.json)、[初期3教材・バックアップ/再読込](logs/initial-browser.json)成功。既存履歴・コメント・データ置換維持、page errorsなし。
- 独立agentレビュー: debounce/保存失敗時loading残留、accessible name変更、archive後focus消失の4指摘を修正して再検証。別担当の関連unit144件、Chromium手入力/連打/フォーカス/320〜1440幅チェック成功。追加blockerなし。
- AGENTS.md/.agents/skills/run-testはcheckoutと環境を探索したが未発見。READMEの手順を使用。ヒアリングは親担当が08:32UTC再確認した旨を受領。

## 画像

| 幅 | 変更前 | 変更後 |
|---|---|---|
| 320 | [before](before/320-normal-100.png) | [after](after/320-normal-100.png) |
| 390 | [before](before/390-normal-100.png) | [after](after/390-normal-100.png) |
| 1440 | [before](before/1440-normal-100.png) | [after](after/1440-normal-100.png) |

[320px・150%文字](after/320-normal-150.png) / [dopa](after/390-dopa-100.png) / [moe](after/1440-moe-100.png) / [focus・hover](after/390-normal-focus-hover.png) / [タイトル補完（モック）](title/390-autofill.png)

ローカルChromiumの画面であり実機iOS/Androidではない。全テーマ全条件画像は作業workspaceの`evidence/material-actions/`に保存。画像はリポジトリに添付し、Library IDは発行していない。

再現スクリプト: `scripts/probe-youtube-oembed.mjs`（実通信）、`scripts/validate-youtube-title-ui.mjs`（モック）、`scripts/validate-material-actions-ui.mjs`。`MAHJONG_TEST_ORIGIN`にローカル配信origin、`CHROMIUM_PATH`にブラウザー実行パスを設定可能。
