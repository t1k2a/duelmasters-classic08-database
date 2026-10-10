# UTM保持・投稿別計測の確認（2026-10-10）

## 実装と検証の範囲

検索URLの更新は標準UTM 6項目（source / medium / campaign / term / content / id）を保持する。検索の共有URLには引き継がない。recipe / d / deck / id とhashも保持する。計測開始の同意条件は変更しない。

投稿別レポートはGA4の `sessionSource` / `sessionMedium` / `sessionCampaignName` / `sessionManualAdContent` で、完了した直近30日間を集計する。sessionsと各イベントのeventCountは別々に取得し、4項目で結合する。ページングを行い、取得失敗はゼロ件として扱わない。`copy_deck`、`deck_complete`、`share_deck`、`click_buy_card`、`click_buy_deck` は延べイベント数で、購入完了やCVRではない。

Data APIのモック応答によるテストと、外部通信を遮断した実ブラウザでの同意・URLテストは、GA4本番への到達や実データ取得を証明しない。

## 実データ取得の現状

2026-10-05の[週次実行](https://github.com/t1k2a/duelmasters-classic08-database/actions/runs/37259317650)は成功だが、認証準備・レポートアップロード・保存ジョブがスキップされ、Artifactは0件だった。mainに保存済みレポートもなく、実測成功とは判断できない。

mainの週次workflowはJSON鍵用Secrets参照で、WIF認証ステップ・provider参照・service account参照・`id-token: write`・environment指定がない。リポジトリと既存2 environmentsのVariables/Secretsの**名前だけ**を確認したが、GA4_PROPERTY_IDやWIF参照用の設定名は見つからなかった。Google Cloud側に作成済みのWIFプロバイダやサービスアカウントが存在しないという意味ではない。

既存WIF経由で進めるには次を確認して、別途承認されたworkflow接続が必要:

- 作成済みproviderの完全リソース名と既存サービスアカウントの参照先、保存場所。
- 対象GA4プロパティIDのActionsへの受け渡し元。
- 既存WIFの信頼条件が対象repository / branch / environmentに一致すること、およびサービスアカウントの既存GA4読取アクセス。
- `google-github-actions/auth` とOIDC権限を使うworkflow接続。現在の固定JSON鍵パスで、認証actionが出力するADCパスを上書きしないこと。

この変更では認証・IAM・Secrets・Variables・workflow権限を変更せず、実データ取得も実行していない。元のWSL checkoutにあるworkflow編集は保持している。

## 再実行

```sh
npm test
npx tsc --noEmit
BUILD_REUSE_CARDS_JSON=true npm run build
node scripts/e2e-utm-consent.mjs
```

ブラウザQAは独立context、service worker無効、偽の計測ID、Googleタグへのリクエストをローカル応答に置換して行う。ユーザーのChromeデータは使用しない。スクリーンショットは `docs/qa/utm-consent/` に出力する。

参照: [GA4 Data API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)、[Google GitHub Actions auth](https://github.com/google-github-actions/auth)。
