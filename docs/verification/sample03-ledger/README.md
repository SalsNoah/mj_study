# サンプル03の台帳原稿反映

基点main `b35407fdba277ce220cc27adc9c0063c2e6fe724`。原稿訂正と旧03の同ID移行を含むDraft。公開承認は未取得。

## 正本と変更

[サンプル10題 編集台帳](https://docs.google.com/spreadsheets/d/1YnyRH1Alyos7a50wpUiEv0v3xA0R51uOzICNU40d65c/edit#gid=880965910)、編集用10題 A8:W8、ID `sample-v2-03`。親の読取り担当によるrevision16（2026-10-07 14:22:33 UTC）の読取結果を使用。セル単位の更新日時とは扱わない。台帳そのものには書き込んでいない。

- C8の本人題名「強い待ちを選ぶ」、I8の正解`2s`、J8の解説を優先。旧4索正解へ戻さない。
- 解説の「聴牌であればより強い待ちを残す。ことが学べます。」は「テンパイであればより強い待ちを残すことを学びます。」、「14索待ち」は「1索・4索待ち」へ表記整理。
- 旧条件が残った題名括弧末尾「内側」を「外側の待ち」へ変更。privateMemoの旧「内側の不要牌を先に切る／4索が内側」も今回の待ち方針へ整合。河等がないため必ずアガりやすいとは保証しない旨はmemoに限定。
- 03のcontentVersionだけ`2026-10-07.1`。項目別contentVersionをsample.versionへ反映し、他9題のversion/内容/認識は変えない。
- 14枚の手牌、ドラ表示牌5z、context等は不変。台帳E8の旧ツモ9sはD8へ統合済みのため重ねて追加しない。

## 保存済み旧03の同ID移行

旧配布原本のcatalogId/version/itemId/fingerprintと、明示した全content field、タグ名/参照、未知fieldの有無を、正規化前のrawデータで比較する。完全一致した旧03だけを起動時・JSON取込・旧catalog復元時に訂正する。追加/削除せず、問題ID・createdAt/updatedAt・タグID・確認回数・理解度・過去attemptのID/結果/所属・日別記録・他9題を維持。study.contentRevisionだけ+1し、過去4s正解を新しい2s正解で再採点しない。旧回答は「現行版成績」から区別されるが、履歴/累計から削除しない。

本人編集があるもの、出所不明、重複ID/学習状態、状態欠落、不正revision/加算上限、未来revisionの履歴などは訂正しない。既知旧03の出所が残る場合は既導入と扱い、新03の重複追加もしない。未知の出所から旧03と推測して更新しない。削除済みはproblemがないため復活しない。新versionが二重移行防止となり、移行後に本人が編集したものも再訂正しない。

タグの正規化を跨いでも本人編集の除外を保つため、import/restore時には必要に応じてsample出所情報にcorrectionSkippedを保存する。本文/履歴には手を加えない。独立レビューで見つかった「空白付きタグ名→mergeで整形→再loadで誤訂正」の回帰を防止した。

保存はサイズ確認とexpectedRawの再比較を経て一回のmain-store書込み。容量不足・アクセス失敗・別タブ競合では旧データを維持してエラーを表示する。古いsnapshotの原本/digestは変更せず、追加undoの比較で既知の訂正だけを仮想的に適用する。旧削除snapshotは同じ問題IDと履歴を復元したうえで訂正する。後から本人が編集/学習した問題は復元で消さない。

旧追加/削除のfixtureはPR36の実配布artifact（旧03の内容が同じ）をローカルで動かし、隔離browserの合成データから生成。ユーザー保存データではない。

## 検証

- 型検査を含むproduction build成功。
- 最終全980件中979成功。既存A44性能のみ508.27msで200ms閾値超過。検索処理・閾値変更なし。[全体ログ](all-tests.log)
- 移行38試験、catalog54試験、history import63試験が成功。各content編集、タグ正規化、未知field、同ID/履歴保持、重複なし、削除済み、再起動、本人再編集、JSON merge/replace、旧snapshot追加undo/削除復元、quota/access/size/conflictを検証。
- 実計算エンジンと独立手計算: 2s切りは1s×4＋4s×2、4s切りは2s×2＋5s×4。双方シャンテン0、6枚。
- 既存sample UI71チェック成功。320/375/390/1440px、03表示/2索正解、全8正解問題、バックアップ復元。[実測](sample-results.json)
- 専用移行browserは320/390/1440px×旧原本/本人編集/削除済みの9シナリオ成功。同ID/同時刻/同問題数・旧4s回答保持・他9件不変・再load保存不変・本人編集版の重複追加抑止。[移行実測](migration-results.json)
- 独立担当が移行設計、raw判定、履歴保護、snapshot比較をreview。タグ正規化の保護抜けを修正後、独立92試験と同じ再現手順で解消確認。残るreview阻害事項なし。

[同ID訂正・スマホ](390-same-id-corrected.png) / [本人編集保護](390-edited-protected.png)

[スマホ表示](sample03-answer-390.png) / [PC表示](sample03-answer-1440.png) / [2索で正解](sample03-test-correct.png)
