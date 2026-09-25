# 要件 → 実装箇所 → テスト対応表

仕様書 v1.0 を唯一の基準とする。

| 受入 | 要件概要 | 実装箇所 | テスト |
|---|---|---|---|
| A01 | 手牌・ツモ・赤牌の永続化 | `storage/repository.ts`, `features/editor` | unit + e2e |
| A02 | 理牌（手牌のみ） | `domain/sort.ts` | unit |
| A03 | チー／ポン／槓の成立・表示 | `domain/melds.ts`, `components/MeldView` | unit |
| A04 | 不正チー・5枚・赤2枚の保存拒否 | `domain/validate.ts` | unit |
| A05 | 部分形警告／通常形警告なし | `domain/validate.ts` | unit |
| A06 | 正解なし／複数正解 | `domain/quiz.ts`, review | unit + e2e |
| A07 | 消えた正解牌種の修正要求 | `domain/validate.ts` | unit |
| A08 | 条件の空欄と0の区別 | `domain/types.ts`, schema | unit |
| A09 | タグ正規化・改名・削除 | `domain/tags.ts` | unit |
| A10 | 重複牌の部分検索 | `domain/search.ts` | unit |
| A11 | 7章検索例全件 | `domain/search.ts` | unit (固定期待値) |
| A12 | 色替え・反転・ずれ個別切替 | `domain/search.ts` | unit |
| A13 | 赤区別ON/OFF | `domain/search.ts` | unit |
| A14 | 副露を含むON/OFF | `domain/search.ts` | unit |
| A15 | ドラ表示牌は検索対象外 | `domain/search.ts` | unit |
| A16 | 完全一致／含む | `domain/search.ts` | unit |
| A17 | 不正文字入力は検索せず案内 | `domain/parse.ts` | unit |
| A18 | 確認ボタン・連打・取消 | `features/detail`, store | unit + e2e |
| A19 | 閲覧・解答のみでは確認増えない | review/detail | e2e |
| A20 | 同牌別位置で同じ正誤 | `domain/quiz.ts` | unit |
| A21 | 赤五と通常五の正解区別 | `domain/quiz.ts` | unit |
| A22 | 回答連打・正解なし・スキップ | review + quiz | unit + e2e |
| A23 | 苦手優先・タグ・ランダム | `domain/quiz.ts` | unit |
| A24 | クイズ開始前ネタバレなし | `features/review` | e2e |
| A25 | 添付上限・圧縮・削除取消 | `export/compressImage.ts` | unit |
| A26 | PNG出力 | `export/renderTiles.ts` | unit/manual |
| A27 | URL往復・自動保存なし | `domain/share.ts` | unit + e2e |
| A28 | 共有に画像・メモ・履歴なし | `domain/share.ts` | unit |
| A29 | 正解共有OFFでpayload除外 | `domain/share.ts` | unit |
| A30 | 取込は新ID・履歴ゼロ | share + repository | unit |
| A31 | 壊れたURL安全拒否 | `domain/share.ts` | unit |
| A32 | 長すぎる共有URL案内 | share UI | unit |
| A33 | 容量超過で成功を装わない | repository | unit |
| A34 | 破損JSON・未知版の救出 | repository | unit |
| A35 | バックアップ追加・全置換 | repository | unit |
| A36 | 別タブ変更検知 | repository | unit |
| A37 | 複製・削除・contentRevision | repository | unit |
| A38 | スマホ／PC幅レイアウト | CSS + screenshots | manual |
| A39 | HTML不実行・危険URL拒否 | validate + UI | unit |
| A40 | サンプル任意導入 | `data/samples.ts` | unit |
| A41 | 11123m→67888p 合成一致 | `domain/search.ts` | unit |
| A42 | 数字ずれ境界 | `domain/search.ts` | unit |
| A43 | 05m→66p 赤同一視 | `domain/search.ts` | unit |
| A44 | 500件検索性能 | search bench | unit(計測) |
