# 教材登録後の一覧維持・URL欄の文言

基点: 公開main `04e06416b4c8ab1f79ce8d769cf97d3488f1d282`（PR35）。今回の変更は別ブランチ・別PR。公開承認は未取得、Draftまで。

## 変更範囲

- 新規教材の登録成功後、詳細へ自動遷移せず学習教材一覧に留まる。新規カードを先頭へ表示し、成功通知へフォーカス。フォームは閉じてURL・タイトル・YouTube補完の手動入力状態をリセットし、次の登録では新しいIDを使う。
- 検索中は成功した場合だけ検索条件を解除して新規教材を表示し、通知で説明。アーカイブ一覧から追加した場合も学習中一覧へ切り替えて表示する。失敗・重複時はフォーム/入力/検索条件を保持。
- URL欄placeholderは厳密に「YouTubeなどのURL」。note URLやその他サイトの登録機能は変更しない。
- 「記録・コメント」の明示クリックでは従来どおり詳細へ遷移。学習回数・履歴・コメント・アーカイブ処理は変更なし。新しいソート機能はこのPRに含めない。

## 検証

- 型検査・build成功。
- 関連unit67件成功（MaterialsPage 40、YouTube hook27）。新規4試験で一覧継続、二重submit、連続登録のID、検索/archived表示、重複失敗、note登録、次draftの補完、保存後の古い応答破棄を確認。
- [全件試験](all-tests.log): 931件中930成功。唯一の失敗は既存A44性能試験346.01ms（閾値200ms）。前PRの基点でも同試験が312.08〜334.76msで失敗。検索実装・性能閾値は変更していない。
- [実ブラウザー](browser-results.json): 320/390/1440px、登録成功後の`#/materials`維持、フォーム閉鎖/reset、成功通知focus、新規カード表示、重複の入力保持、noteリンク、次draftのYouTube補完、手動title、遅延応答、学習回数不変、詳細明示遷移が成功。YouTubeレスポンスはこの試験ではモック。
- 既存教材UIスクリプトは登録後に明示リンクから詳細へ移動するよう更新し、74記録成功。既存YouTube UIスクリプトも一覧維持を検証するよう更新。
- 独立レビュー: 別agentが差分、unit67件、実Chromium390pxで検索/archivedからの登録、placeholder、連続登録、フォーカスを確認。重大指摘なし。

## 実画面

[320px・登録後の一覧](320-registered-list.png) / [390px・登録後の一覧](390-registered-list.png) / [PC・登録後の一覧](1440-registered-list.png) / [URL欄の指定文言](390-placeholder.png)

ローカルChromiumの合成データであり、公開版の画面ではない。再現: `MAHJONG_TEST_ORIGIN=http://127.0.0.1:PORT node scripts/validate-material-register-list-ui.mjs`。
