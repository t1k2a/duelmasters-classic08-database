// X (Twitter) API v2 への単発テキスト投稿。OAuth 1.0a user context。
// 依存追加を避けるため署名は Node 標準の crypto のみで行う（twitter-api-v2 等は未使用）。
//
// 使い方: tsx scripts/x-post.ts "投稿本文"
//
// 必須環境変数（.env.example参照）: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
// developer.x.com でアプリを作成し、OAuth 1.0a を有効化・権限を「Read and Write」にした上で
// Consumer Keys（API Key/Secret）と Access Token/Secret を発行して設定する。

import { createHmac, randomBytes } from "node:crypto";

const ENDPOINT = "https://api.x.com/2/tweets";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が未設定です。.env.example を参照して設定してください。`);
  }
  return value;
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuthHeader(method: string, url: string, consumerKey: string, consumerSecret: string, accessToken: string, accessSecret: string): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join("&");

  const signatureBase = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessSecret)}`;
  const signature = createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  const headerParams = { ...oauthParams, oauth_signature: signature };
  const header = Object.keys(headerParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(", ");

  return `OAuth ${header}`;
}

async function postTweet(text: string): Promise<void> {
  if (text.length === 0 || text.length > 280) {
    throw new Error(`投稿本文が不正です（0〜280文字である必要があります。現在: ${text.length}文字）`);
  }

  const consumerKey = requireEnv("X_API_KEY");
  const consumerSecret = requireEnv("X_API_SECRET");
  const accessToken = requireEnv("X_ACCESS_TOKEN");
  const accessSecret = requireEnv("X_ACCESS_SECRET");

  const authHeader = buildOAuthHeader("POST", ENDPOINT, consumerKey, consumerSecret, accessToken, accessSecret);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`X API 投稿失敗 (HTTP ${res.status}): ${body}`);
  }

  console.log("投稿成功:", body);
}

const text = process.argv[2];
if (!text) {
  console.error('使い方: tsx scripts/x-post.ts "投稿本文"');
  process.exit(1);
}

postTweet(text).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
