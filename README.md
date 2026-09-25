# 麻雀学習帳

スマホ優先の麻雀学習帳です。牌姿・解説・メモをブラウザの localStorage に保存し、牌の形で検索・クイズ復習・URL共有できます。**ログイン・サーバー保存はありません。**

> このディレクトリ（`mahjong-study/`）は **DECKSHOT とは完全に独立**したアプリです。ルートの `package.json` / `src/` は使いません。作業・起動は必ずこのフォルダ内で行ってください。

## 最初のコマンド

```bash
cd mahjong-study
npm install
npm run dev
```

ブラウザで http://localhost:5174 を開きます。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー（5174） |
| `npm test` | ユニットテスト（Vitest） |
| `npm run typecheck` | TypeScript 検査 |
| `npm run build` | 本番ビルド → `dist/` |
| `npm run preview` | ビルド結果のプレビュー |

## 使い方（概要）

1. **作成**: 下部ナビ「作成」→ 牌パレットで手牌／ツモ／副露／ドラ表示牌を入力 → 保存
2. **学習帳**: 文字検索と牌姿検索（色替え・反転・数字のずれ）で絞り込み
3. **詳細**: 「確認した」でのみ確認回数+1。PNG保存・URL共有
4. **復習**: 正解あり／なし両対応。苦手優先・タグ・ランダム
5. **設定**: JSONバックアップ／復元、サンプル追加、全件削除

## ローカル保存の制約

- キー: `mahjong-study:v1`（localStorage）
- 端末・ブラウザ・プロファイルが違えば別の学習帳
- ブラウザのデータ削除で消えます。定期的に設定から JSON バックアップを取ってください
- 目安上限 4MiB（3MiB で注意表示）。画像を増やしすぎないでください

## 共有用静的ホスト

問題データはサーバーに送りません。**アプリ本体だけ**を静的配信します。

```bash
cd mahjong-study
npm run build
# dist/ を GitHub Pages / Netlify / Cloudflare Pages 等へ
```

共有URL形式: `https://<host>/<base>/#share=v1.<payload>`

- localhost の URL は他者向け共有に使えません
- 画像・自分のメモ・学習履歴・内部IDは共有に含まれません
- 正解・解説は共有画面で除外できます

GitHub Pages でサブパス配信する場合は `vite.config.ts` の `base` を合わせてください（初期値 `./`）。

## 牌画像について

牌はアプリ内の SVG／Canvas 描画です。外部サイトから牌画像を取得しません。図形は自作の簡易表現です。

## 検証

```bash
cd mahjong-study
npm test
npm run typecheck
npm run build
```

受入条件 A01〜A44 の対応は `docs/requirements-matrix.md` と `docs/acceptance-results.md` を参照。

## 補完仕様（実装判断）

仕様書 §2 の補完方針に従いました。認証追加・IndexedDB 化・共有範囲の拡大は行っていません。
