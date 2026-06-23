# デュエル・マスターズ クラシック08 データベース

デュエル・マスターズ **クラシック08環境** のカード検索・デッキ構築・メタ分析ができる静的Webデータベースです。全 **2,134枚** のカードと **462件** のデッキレシピを収録しています。

🔗 **デモ:** https://t1k2a.github.io/duelmasters-classic08-database/

![トップページ](docs/screenshots/top.png)

> ⚠️ 本プロジェクトは非営利のファンメイドであり、株式会社タカラトミー様および関係各社とは一切関係ありません。カード情報・画像の権利はすべて権利者に帰属します。

## 主な機能

- **カード検索** — 全2,134枚を文明（光/水/闇/火/自然）・種類・コスト・種族・パック・パワー・レアリティ・特殊能力で絞り込み。名前/テキストのインクリメンタル検索とハイライト対応。リスト/グリッドの表示切替。
- **カード詳細** — 個別URL（`/card/dm01-001/`）でカードごとのページを持ち、SEO・SNS共有に対応。殿堂レギュレーション（殿堂🏅 / プレミアム殿堂🚫）バッジを表示。
- **デッキビルダー** — カードを選んで40枚デッキを組み立て。
- **デッキレシピ推薦** — カード詳細から、そのカードを採用している実戦レシピを推薦表示。関連カードも提示。
- **メタデッキTier表** — クラシック08環境の主要メタデッキ（ボルメテウスコントロール / 天門 / サバキストライク / 除去サファイア / ネクラコントロール）を解説。
- **今日の1枚** — 日替わりでカードをピックアップ。

![メタデッキページ](docs/screenshots/meta.png)

## 使い方

### オンライン

ブラウザで [デモサイト](https://t1k2a.github.io/duelmasters-classic08-database/) を開くだけで利用できます。

### ローカルで動かす

```bash
# 依存をインストール
npm install

# 静的サイトをビルド（cards.json と個別カードページを生成）
npm run build

# public/ をローカルサーバで配信
npm run serve
# → http://localhost:3000 などで開く
```

> 📝 静的ページ（`public/card/`・`public/recipe/`）と `sitemap.xml` は CI ではビルドされません。データ更新時は `npm run build:card-pages` でローカル生成し、`public/` ごとコミットしてください。

## AIアシスタント（ローカルLLM）

クラシック08のカード・用語・環境について質問できるチャット機能です。回答はローカルの [Ollama](https://ollama.com/) と本リポジトリのカードDBを使った RAG で生成し、**カードの数値や能力テキストはLLMに創作させずDB実値を返す**設計です。サイト本体（GitHub Pages）→ ngrok → 自宅の Ollama を中継する構成のため、**あなたのマシンで Ollama が起動している間だけ**サイト上に「💬 AIに聞く」ボタンが現れます（停止すれば自動でオフライン＝ボタン非表示）。

### 起動手順

```bash
# 1. Ollama を起動し、モデルを取得（初回のみ pull）
ollama serve
ollama pull qwen2.5:7b        # モデル名は環境変数 OLLAMA_MODEL で変更可

# 2. チャットサーバを起動（:8788。カードDB検索用の `npm run api`(:3000) とは別プロセス）
npm run chat

# 3. ngrok で固定ドメインを 8788 に向ける（無料の固定ドメインを取得済みの前提）
ngrok http --url=<あなたの固定>.ngrok-free.app 8788
```

最後に `public/index.html` の `CHAT_API_BASE` を、手順3で割り当てた固定ドメイン（例 `https://<あなたの固定>.ngrok-free.app`）に差し替えてコミットします。差し替え前に動作確認したい場合は、URL に `?chatApi=https://<あなたの固定>.ngrok-free.app` を付けて開くと一時的に上書きできます。

### 注意点

- **無料枠の制限**: ngrok 無料プランは固定ドメイン1つ・月20,000リクエストまで。Ollama 推論はあなたのマシンの帯域・1GBメモリ目安を消費します。
- **マシン停止＝自動オフライン**: Ollama / `npm run chat` / ngrok のいずれかを止めると health 応答が落ち、サイト側のチャットボタンは自動的に非表示になります。常時公開用途ではありません。
- 回答精度の手動チェックは `node scripts/chat-smoke.mjs`（実 Ollama 起動が前提・CI非対象）で行えます。

## 技術スタック

スクレイピングで収集したデータを正規化し、静的サイトとして GitHub Pages に配信するパイプライン構成です。

| レイヤー | 使用技術 |
|---|---|
| スクレイピング | TypeScript / Playwright / Cheerio |
| データ整形・永続化 | Prisma / PostgreSQL（Docker Compose）|
| ビルド | tsx（`scripts/build-json.ts`・`scripts/build-card-pages.ts`）|
| フロントエンド | 静的HTML + Tailwind CSS（CDN）+ バニラJS |
| 配信 | GitHub Pages（`public/`）|
| E2E / 検証 | Playwright（`scripts/e2e.mjs`・`npm run test:e2e`）|

```
スクレイピング (src/scraper) → DB/JSON整形 (Prisma, scripts/build-json.ts)
   → 静的ページ生成 (scripts/build-card-pages.ts) → public/ → GitHub Pages
```

### 主なディレクトリ

```
public/        配信される静的サイト（index.html / meta.html / card/ / *.json）
src/scraper/   カード・デッキレシピのスクレイパー
src/api/       検索API・CLI（ローカル開発用）
scripts/       JSON/カードページのビルド、E2E、OGP・スクショ生成
prisma/        スキーマ・マイグレーション・シード
data/          スクレイピング元データ・シード
```

## データ収録規模

- カード: **2,134枚**
- デッキレシピ: **462件**
- 文明: **5文明**（光・水・闇・火・自然）完全網羅
- メタデッキ解説: **5アーキタイプ**

## コントリビュート

不具合報告・データ修正・機能提案を歓迎します 🙌

- バグや誤データを見つけたら [Issue](https://github.com/t1k2a/duelmasters-classic08-database/issues) を立ててください。
- 改善のプルリクエストも歓迎です。変更内容と意図を簡潔に添えてください。

## ライセンス・免責

本リポジトリのソースコードは個人の学習・ファン活動を目的としています。カードのテキスト・画像等の著作権は各権利者に帰属し、本プロジェクトはそれらの権利を主張しません。権利者からの要請があれば速やかに対応します。
