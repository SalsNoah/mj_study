# 副露追加順と加槓表示の検証

対象 base: `6dc0593e897370355182758e7334a8c7e52cf785`。ローカル Chromium で検証。実機 iPhone/Android・公開 Pages の確認ではありません。

## 変更

- 保存する副露配列はそのまま維持し、描画時に外側配列のコピーだけを反転。最初に追加した組を右端、その後の組を左に表示します。組内の牌順、チー、赤牌、取得元を変更しません。
- 現行 main には副露配列を牌種ソートする処理はなく、追加配列を左から右へ描画していました。
- 旧保存の配列順を基準として同じ表示規則を適用します。旧データが既に並べ替えられて元追加順を失っていた場合、その順の復元はできません。追加時刻を捏造したり、保存配列を移行・並べ替えたりしません。表示処理のみなので元配列は保持されます。
- ポンと同じ牌を加槓タブで選んだとき、元の組の位置・ID・取得元・3枚の牌を維持して4枚目だけ追加。4組あっても昇格でき、手牌・ドラを含む物理4枚制限と赤牌制限、戻す操作を維持します。
- 加槓の縦積み内で横幅用 `flex-basis` が高さとして効き、横牌の箱が正方形になっていました。画像自体は横向き素材で `transform: none`、originは中央。変形やorigin変更は行わず、積み牌だけ `flex: none` と正しい高さを指定して横長比率・上下接触・底辺揃えを修正しました。

## 検証

- 変更前: 893件中892成功、A44検索性能のみ221.16msで200ms閾値超過（画像撮影と並行）。ログを保存。
- 変更後: 単独の全件試験 **63ファイル897件成功**。閾値・性能テストの変更なし。
- `npm run typecheck` / `npm run build`: 成功。
- 実操作: 320/390/1440pxで、中→九萬と九萬→中の順、削除→追加、戻す、異種4組、チー内部順、4組状態のポン昇格・取得元保持、保存/再読込、無変更保存時の履歴保持、JSONバックアップ完全一致に成功。`behavior/results.json`。
- 既存UI回帰: `validate-legacy-hand-ui.mjs`（320px/150%文字・390px・1440px、理解状態2種、タイトル/メモ変更・履歴・バックアップ）成功。`validate-unsaved-ui.mjs` の33記録も成功。各results.jsonにerrorsなし。
- 画像: 320/390/1440px × normal/cool/cute/dopa/moe の15条件、各画面に左家/対面/右家の加槓とチー。変更前は修正前の実画面、変更後はbuild版。画面幅超過なし。
- 独立レビュー: 実装者とは別のagentが変更前/後の全手牌画像30枚と変更後全画面15枚を直接確認。45組すべてで上下隙間0px、底辺差0px。独立対象回帰83件成功。ブロッカーなし。`independent-review.md`。
- 開始前の指示探索: checkout/mainと環境の `AGENTS.md` / `.agents/skills/run-test` は未発見。READMEのテスト手順を使用。ヒアリングは親側が07:18–07:19UTCに再確認した旨を受領（当作業者が直接読了したとは扱わない）。

## 画像

| 条件 | Before | After |
| --- | --- | --- |
| PC | [全画面](before/1440-normal.png) / [手牌](before/1440-normal-hand.png) | [全画面](after/1440-normal.png) / [手牌](after/1440-normal-hand.png) |
| 390px | [全画面](before/390-normal.png) / [手牌](before/390-normal-hand.png) | [全画面](after/390-normal.png) / [手牌](after/390-normal-hand.png) |
| 320px | [手牌](before/320-normal-hand.png) | [手牌](after/320-normal-hand.png) |

各テーマ・各方向の同条件画像と寸法は before/after 内。操作順の証拠は behavior 内。

再現: ローカル起動後 `MAHJONG_TEST_ORIGIN=http://127.0.0.1:PORT node scripts/capture-meld-layout.mjs after` と `node scripts/validate-meld-order-ui.mjs`（同じ環境変数）。`CHROMIUM_PATH` でChromium実行ファイルを指定可。beforeは変更前checkoutで採取します。

## 提出・公開状態

Libraryスキルの正式バッチupload経路を実行しましたが、接続エラーにより保存できず、`library_file_id` は取得していません。代替としてこのrepo内の実画像・寸法・テストログを提出します。認証情報の移動・新認証・別経路のuploadは行っていません。

Draft PRまで。今回の2修正を対象とする直前承認なしにreview-ready化・main merge・Pages deployは行いません。
