# 受入テスト結果（A01〜A44）

実行日: 2026-09-25／対象: `mahjong-study/`（DECKSHOT 非依存）

| ID | 結果 | 根拠 |
|---|---|---|
| A01 | PASS | `repository.test.ts` 永続化往復 |
| A02 | PASS | `domain.test.ts` 理牌 |
| A03 | PASS | `domain.test.ts` 副露成立 |
| A04 | PASS | `domain.test.ts` 5枚・赤重複拒否 |
| A05 | PASS | `domain.test.ts` 部分形警告／14枚警告なし |
| A06 | PASS | 実装・サンプル（正解あり／なし） |
| A07 | PASS | `domain.test.ts` answer_missing |
| A08 | PASS | `emptyContext` null 保持 |
| A09 | PASS | `domain.test.ts` タグ正規化 |
| A10 | PASS | `search.test.ts` 多重度 |
| A11 | PASS | `search.test.ts` 表の全例 |
| A12 | PASS | `search.test.ts` 個別切替 |
| A13 | PASS | `search.test.ts` 赤区別 |
| A14 | PASS | `search.test.ts` 副露ON/OFF |
| A15 | PASS | `search.test.ts` ドラ除外 |
| A16 | PASS | `search.test.ts` 含む／完全一致 |
| A17 | PASS | `search.test.ts` 不正入力拒否 |
| A18 | PASS | Detail の confirm lock + 取消（コードレビュー） |
| A19 | PASS | 確認は明示ボタンのみ（実装） |
| A20 | PASS | `judgeDiscard` 牌種判定 |
| A21 | PASS | 赤／通常区別 |
| A22 | PASS | answeredLock・selfReview 分母除外 |
| A23 | PASS | `orderReviewCandidates` 実装 |
| A24 | PASS | Review 問題フェーズでネタバレ非表示 |
| A25 | 部分 | 圧縮ロジック実装。実機ファイル境界は未実行 |
| A26 | 部分 | PNG生成実装。目視はローカル確認が必要 |
| A27 | PASS | share roundtrip ユニット |
| A28 | PASS | payload に秘密フィールドなし |
| A29 | PASS | 正解OFFでキー不在 |
| A30 | PASS | addFromShare 新ID・履歴ゼロ |
| A31 | PASS | 壊れたURL拒否 |
| A32 | PASS | 8000文字チェック実装 |
| A33 | PASS | quota 失敗テスト |
| A34 | PASS | 破損／未知スキーマテスト |
| A35 | 部分 | import merge/replace 実装。E2E未実行 |
| A36 | 部分 | storage イベント検知実装。手動別タブ未実行 |
| A37 | PASS | duplicate テスト |
| A38 | 未実行 | 実機／複数幅スクリーンショット未取得 |
| A39 | PASS | HTML非実行・http(s)のみ |
| A40 | PASS | サンプル任意・重複防止 |
| A41 | PASS | search.test |
| A42 | PASS | search.test |
| A43 | PASS | search.test |
| A44 | PASS | 500件計測 <200ms |

## 自動テスト実行

```text
npm test       → 44 passed
npm run typecheck → success
npm run build     → success
```

## 未実行・制約

- Playwright E2E と実機ブラウザ操作は本環境では未実施（A25/A26/A35/A36/A38 の一部）
- DECKSHOT ルートアプリには変更なし
