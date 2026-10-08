# 雀魂OCRの私有データ検査

今回の追加100枚に向けた台帳・CSV連携の準備。画像収集、認識器の実行、学習、精度評価、Google Sheetsへの書込みを行うツールではない。実画像0枚でも空台帳を作れるが、100枚取得を表す成功判定にはならない。

## 現行方式と調査結果（2026-10-08）

調査基準は `be2d983`。`autoRead.ts` → `locateHand` → `segmentTiles` / `segmentMelds` → 特徴量照合 → `inferMeld` のブラウザ内処理。外部生成AIは呼ばない。同梱 `public/import-model.json` のSHA-256は `1d6a76a5b350129fb983385f4a698191af4f75f1c86217dfc74bce38d899626a`。雀魂の牌は37ラベル109見本、文字434見本。天鳳の牌は37ラベル142見本、文字57見本。見本数は元スクショ数ではない。

加槓を返すOCR経路がなく、上下重なりを保持する副露矩形もない。暗槓判定は両端の `back` に依存するが同梱見本に `back` はない。手牌3枚以下の棄却も4副露局面で確認が必要。これらはコード調査で分かった制約であり、今回の実画像で測定した誤認識率ではない。

`samples-local/` はGit除外済みだが今回のチェックアウトに実体はなかった。引継ぎ仕様にある `train.ts` / `harness.ts` / `panel.ts` も存在しなかった。旧151枚・過去の評価値は現物の再確認前なので今回の評価には使わない。現行OCR関連19テスト・型チェックは調査時に成功したが、テストには人工画像・認識結果mockがあり、実画像精度の証明ではない。

## 保存場所と操作

画像、manifest、予測、CSV、固定検証のロックはリポジトリ外の私有ディレクトリ、または既にgitignoreされている `samples-local/` に置く。公開コード・`public/`・配信ビルドに入れない。Sheetsの作成・書込みは親の単一writerが担当し、このツールは通信しない。

```sh
node scripts/ocr-dataset.mjs validate --data-root /workspace/mj-private-ocr
node scripts/ocr-dataset.mjs export --data-root /workspace/mj-private-ocr --predictions predictions.json --output review.csv
node scripts/ocr-dataset.mjs validate --data-root /workspace/mj-private-ocr --require-new 100
node scripts/ocr-dataset.mjs freeze --data-root /workspace/mj-private-ocr --require-new 100
node scripts/ocr-dataset.mjs check-freeze --data-root /workspace/mj-private-ocr
node --test scripts/ocr-dataset.test.mjs
```

入力は既定で `manifest.json`（`--manifest` で変更）、ロックは `holdout-lock.json`（`--lock` で変更）。出力は既存ファイルを上書きせず、別名が必要。入力・出力のパス逸脱とsymlink逸脱を拒否する。Google Driveリンクの権限変更や画像公開は行わない。

## Manifest v1

最上位は `{ "schemaVersion": 1, "datasetId": "任意の固定ID", "samples": [] }`。空の `samples` は取得0枚を表す。架空の100行やダミー画像を入れない。

各sampleの必須項目：

| 項目 | 意味 |
|---|---|
| `id` | 画像の安定ID。Sheetsとの結合キー |
| `game` | `jantama` |
| `collection` | `new` / `existing`。既存画像の改名・切抜き・圧縮変更をnewにしない |
| `imageKind` | `realScreenshot` / `synthetic`。加工・再構成した例を実画面と扱わない |
| `imagePath`, `sha256` | 私有rootからの相対パス、ファイルの小文字SHA-256 |
| `imageViewUrl` | 権限を変えずに閲覧できる既存リンク、未設定ならnull |
| `source` | `url`, `acquiredAt`（timezone付きISO日時）, `position`（動画時刻、牌譜イベント、記事内画像位置）, `sourceSequenceGroup`, `roundGroup`, `nearDuplicateGroup` |
| `permission` | `status: "documented"`, `scope: "privateAnalysis"` または `"modelDistribution"`, `basis`, `evidence` |
| `split` | `tune` / `holdout`。未確認はnull |
| `review` | `status: "pending" / "verified" / "rejected"`。verifiedは `independentOfPrediction: true`, `reviewer`, `reviewedAt`, `evidence` が必要 |
| `dedupReview` | verifiedのとき `status: "verified"`, `reviewer`, `reviewedAt`, `existingInventory`, `evidence` が必要 |
| `groundTruth` | pending/rejectedはnull。verifiedのとき以下の正解構造 |

`permission` は個別許諾がすべての解析に必須という意味ではない。ユーザーが指定したネット公開資料の私有解析、出典の条件を踏まえた利用根拠、確認した制限を具体的に残す。`privateAnalysis` を付けても再配布権を確認したことにはならない。モデルへの収録・配布判断は別に行う。認証・支払・明示的禁止・アクセス制限の回避はしない。

`sourceSequenceGroup` は同じ動画・記事連番などのまとまり、`roundGroup` は同じ対局ID＋局＋本場。転載・別視点も判明していれば同じ局のグループへ寄せる。判明しない候補はpendingで保留し、勝手に独立した局と扱わない。同一グループを調整用／検証用にまたがらせない。`nearDuplicateGroup` は同一・近接局面で共通にし、台帳に残せる代表は1枚。ハッシュ一致と指定グループの検査に加え、目視または知覚ハッシュによる近似重複確認が必要。ツール自体が近似重複を発見するわけではない。旧画像が不在なら `existingInventory` の確認済みを偽らず、verifiedにしない。

正解構造は `{ hand: [...], dora: [...], melds: [...] }`。牌コードは `1m`〜`9m`・`1p`〜`9p`・`1s`〜`9s`・`1z`〜`7z`、赤五は `0m/0p/0s`。手牌・ドラ・副露と各組の牌は画像上の順序を保持する。副露ごとに以下を記録する。

- `type`: `chi` / `pon` / `closedKan` / `openKan` / `addedKan`
- `tiles`: 3枚または4枚。暗槓の裏牌は独立に確認できた牌種で記録し、根拠をreview.evidenceへ残す。赤牌や裏牌が確定できなければpending。
- `turns`: 各牌の0/90/180/270度。裏牌の姿勢も記録する。
- `from`: `left` / `opposite` / `right`、暗槓はnull。
- `calledIndex`: 鳴いた牌の配列index、暗槓はnull。
- `addedIndex`: 加槓で追加した牌のindex、それ以外はnull。上下に重なる加槓は下側を先・上側を後として、画像上の左から右へ列を走査する。

reviewは初回予測のコピーではなく元画像または独立した牌譜との照合。本人コメントは正解に自動昇格させない。曖昧な候補は別メモに残し、groundTruthへ入れない。

## 予測ファイルとSheets連携

予測は別JSON：`{ schemaVersion: 1, datasetId, predictions: [...] }`。各行は `sampleId`, `imageSha256`, `engine`, `codeRevision`, `modelSha256`, `predictedAt`, `localBank: "empty"`, `status: "ok" / "failed"`, `rawOutput`, `failure`。失敗時には理由を `failure` に残す。出力が不正な牌や過剰な枚数でも修正せずrawOutputへ保存する。実行していない画像には予測行を作らない。

CSVには画像リンク、予測raw、独立正解、レビュー状態を別列で出力する。副露種別・枚数・複数副露・向き・鳴いた相手も別列にする。`error_type` / `error_tile_count` / `error_tile_kind` / `error_red` / `error_order` は未評価の空欄として出力し、自動採点済みと見せない。`user_comment` はSheets側で本人が入力する列。CSV再取込はIDで結合し、このコメント列を上書きしない。

親のSheets列schemaが確定するまでは列名で対応付ける。表タブにはID・画像・予測・正解・状態・本人コメント、裏タブにはsource/permission/hash/split/実行来歴を置く想定。CSVの数式開始文字はエスケープする。画像リンクはテキストで、`IMAGE()` や公開URL化を自動生成しない。Sheets上で画像を表示する処理は既存権限内で別途実装・確認が必要。

## 固定検証と限界

まず出典グループで調整用と保留検証用へ分割し、未確定を除き、`freeze` で台帳全体のhashと検証IDを固定する。旧画像は旧モデルの学習履歴が未確認なので新しい保留検証には入れない。合成画像も実画像の保留検証・追加100枚の数には入れない。`check-freeze` はラベル・分割・出典・画像hashなどの変更を検知する。調整開始後に検証データを見て調整した場合は、同じ保留検証での改善とは主張しない。

改善前後の認識実行器と採点器は今後の作業。局・点数・供託・本場も評価する際は正解schemaを拡張する。本ツールは牌データ準備のみ。画像署名・SHA照合は画像を完全にデコード・閲覧した証拠ではない。独立レビュー・利用根拠・重複群の真実性は記録者が確認する必要があり、booleanや文章だけで検証済みと証明するものではない。
