// X (Twitter) API v2 への単発テキスト投稿（手動実行用）。OAuth 1.0a user context。
//
// 使い方: tsx scripts/x-post.ts "投稿本文"
//
// 必須環境変数（.env.example参照）: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
// developer.x.com でアプリを作成し、OAuth 1.0a を有効化・権限を「Read and Write」にした上で
// Consumer Keys（API Key/Secret）と Access Token/Secret を発行して設定する。

import { postTweet } from "./x-lib.js";

const text = process.argv[2];
if (!text) {
  console.error('使い方: tsx scripts/x-post.ts "投稿本文"');
  process.exit(1);
}

postTweet(text).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
