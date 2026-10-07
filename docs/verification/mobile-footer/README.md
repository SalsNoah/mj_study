# モバイルの固定ナビとページ端の引っ張り

ソートPR37のtree `94650459e1483f95dc4f6dd02e3ba656089f7452`を保持した別変更。公開・ready化・main統合は未承認で実施しない。

## 調査と変更

- ナビは既に`position:fixed; bottom:0`。rootはHTMLのdocument scroll、画面復元はwindow.scrollToに依存。ナビ祖先に固定基準を変えるtransform/filterはない。
- `viewport-fit=cover`とsafe-area-inset-bottomの余白は既存実装にある。rootのoverscroll制御はなかった。
- モバイルナビが表示される1099px以下でhtml/bodyの`overscroll-behavior-y:none`を指定。document scroll、ルート復元、固定ナビ、安全領域、入力フォーカスは変更しない。横方向はautoのまま。1100px以上のPC配置は変更しない。
- 副作用: 対応ブラウザーでは縦のpull-to-refreshも停止する。
- これは根拠のある修正候補であり、報告画像の実原因やiOS症状解消は未確定。

## 取得・再現の限界

- 添付`libfile_e9f07550042881919101fdba8f8fd610`はLibrary公式prepare/readで`IMG_8204.png`（946×2048、483461bytes）と解決。現行Library helperでのmaterializeは`download failed`。readは画像ポインターと説明だけを返し画素なし、取得されたfile IDによるdownload_fileも`file could not be authorized or resolved`。executor内に読める画像はなく、添付の視覚確認を完了したとはしていない。説明文だけで原因を断定しない。
- Playwright WebKitの正規インストールは`403 Domain forbidden`で失敗。ネットワーク制限の迂回なし。実Safari/WebKit・iPhone実機なし。
- Chromiumの合成touchでiOS固有のrubber-bandは再現できず、修正前も矩形は安定。[前](390-before-bottom.png)／[後](390-after-bottom.png)は同条件の配置記録であり症状解消の比較画像ではない。
- standalone CSS mediaエミュレーションを試みたがmatchMediaはfalse。ホーム画面起動の検証済みとはしない。34px安全領域と縮小viewportは制約の模擬だけで、実OSキーボード/ブラウザバー/ホームインジケータではない。
- Safari 16.4で短いページのoverscroll:none不具合修正があるため旧Safari一律対応を保証しない。[WebKit公式](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
- 視覚的overscroll変位は矩形APIに現れない場合がある。[CSS仕様](https://drafts.csswg.org/css-overscroll-1/#overscroll-and-positioned-elements)。対応ブラウザーでnoneが境界動作を抑える根拠: [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior)。

## 検証

- production build（型検査含む）成功。mobileNavigation、unsavedChanges、MaterialsPage、materialSortの計86試験成功。[ログ](unit.log)
- Chromium320/390/844横長/1440px: rootの制御値、最下部連続合成スワイプ、ナビ配置、横overflow、縦横変更、安全領域34px時の最終カード到達とナビ非被覆、縮小viewportでURL入力可視、保存データ不変、作成画面末尾の参考資料がナビ上へ到達。[実測](results.json)
- 既存ソート320/390/1440px全シナリオ成功、未保存ガード33記録成功。検索A44処理/閾値は変更せず、全体再実行はしていない。PR37での既存A44失敗は残る。
- 独立担当がコードとChromium390/1099/1100pxを確認。root/window維持、横gesture指定不変、PC境界、祖先transformなし。コード阻害事項なし、実iOS未確認は明示。

[作成画面末尾](390-editor-bottom.png) / [縮小viewport入力](390-reduced-viewport-input.png) / [PC](1440-after-bottom.png)

再現: `node scripts/validate-mobile-footer-ui.mjs`。公開前の残り: 添付の画素確認、iOS Safariで下端を引っ張る実操作、ホーム画面起動、実キーボードとブラウザバー開閉。
