// src/chat/provider.ts
// CHAT_PROVIDER 環境変数で LLM 供給元を切り替える。
//   CHAT_PROVIDER=ollama (既定) … ローカル Ollama
//   CHAT_PROVIDER=gemini        … Google Gemini (OpenAI互換API)
//   CHAT_PROVIDER=groq          … Groq (OpenAI互換API / 無料枠は課金設定不要)
// streamChat / isUp / warmup の I/F は全プロバイダで共通。
import * as ollama from './ollama.js'
import * as gemini from './gemini.js'
import * as groq from './groq.js'

export const providerName = (process.env['CHAT_PROVIDER'] ?? 'ollama').toLowerCase()

const impl =
  providerName === 'gemini' ? { streamChat: gemini.streamChat, isUp: gemini.isUp, warmup: gemini.warmup } :
  providerName === 'groq' ? { streamChat: groq.streamChat, isUp: groq.isUp, warmup: groq.warmup } :
  { streamChat: ollama.streamChat, isUp: ollama.isOllamaUp, warmup: ollama.warmup }

export const streamChat = impl.streamChat
export const isUp = impl.isUp
export const warmup = impl.warmup
