// X (Twitter) API v2 投稿の共通ロジック（OAuth 1.0a 署名・投稿実行）。
// scripts/x-post.ts（手動単発投稿）と scripts/x-post-queue.ts（キュー投稿）から共用する。

import { createHmac, randomBytes } from "node:crypto";
import twitterText from "twitter-text";
const { parseTweet } = twitterText;

const ENDPOINT = "https://api.x.com/2/tweets";

export function requireEnv(name: string): string {
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

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  const header = Object.keys(headerParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(", ");

  return `OAuth ${header}`;
}

export async function postTweet(text: string): Promise<void> {
  const parsed = parseTweet(text);
  if (!parsed.valid) {
    throw new Error(`投稿本文が不正です（Xの重み付き文字数で0〜280以内である必要があります。現在: ${parsed.weightedLength}）`);
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
    signal: AbortSignal.timeout(30_000),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`X API 投稿失敗 (HTTP ${res.status}): ${body}`);
  }

  console.log("投稿成功:", body);
}
