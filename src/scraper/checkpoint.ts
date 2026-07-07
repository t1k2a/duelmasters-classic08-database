// src/scraper/checkpoint.ts
// スクレイプの中断・再開を支える純ロジック（副作用なしのパース/直列化/再開状態）と、
// 追記ヘルパ（appendRecord のみ副作用あり）。
//
// フォーマットは JSON Lines（1行1レコード）。追記中にプロセスが落ちても、
// 壊れるのは最終行だけで済み、それ以前の行はそのまま復元できる（parseCheckpoint が末尾破損を許容）。
//
// status:
//   'collected' … デッキとして解析でき recipe を収集した（recipe を保持）
//   'empty'     … 取得できたがカード行なし等の決定論的失敗（再開時に再取得しない）
//   'failed'    … fetch 失敗など一過性の失敗（再開時に再取得する＝processed に含めない）
// 同一 URL が複数回現れた場合は「後勝ち」（例: failed の後に collected できたら collected を採用）。
import { appendFileSync } from 'fs'

export interface CheckpointRecord<R = unknown> {
  url: string
  status: 'collected' | 'empty' | 'failed'
  recipe?: R
}

export interface ResumeState<R = unknown> {
  processed: Set<string>
  recipes: R[]
}

/** 1レコードを改行終端の1行 JSON にする（本文中に生の改行は入らない）。 */
export function serializeRecord<R>(rec: CheckpointRecord<R>): string {
  return JSON.stringify(rec) + '\n'
}

/**
 * チェックポイント全文（JSON Lines）から有効なレコード列を復元する。
 * 空行・空白のみの行・url を持たない行・JSON として壊れた行（末尾の途中書き込み含む）は読み飛ばす。
 */
export function parseCheckpoint<R>(text: string): CheckpointRecord<R>[] {
  const recs: CheckpointRecord<R>[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let rec: CheckpointRecord<R>
    try {
      rec = JSON.parse(trimmed) as CheckpointRecord<R>
    } catch {
      continue // 追記中に切れた末尾行などは無視
    }
    if (!rec.url) continue
    recs.push(rec)
  }
  return recs
}

/**
 * レコード列から再開状態を組み立てる。同一 URL は後勝ちで最終状態を決める。
 * - processed: 最終状態が 'collected' か 'empty' の URL（'failed' は再試行するため含めない）
 * - recipes  : 最終状態が 'collected' の recipe を URL 初出順で復元
 */
export function resumeState<R>(recs: CheckpointRecord<R>[]): ResumeState<R> {
  // 初出順を保ちつつ後勝ちで上書きするため Map<url, record> を使う。
  const byUrl = new Map<string, CheckpointRecord<R>>()
  for (const rec of recs) byUrl.set(rec.url, rec)

  const processed = new Set<string>()
  const recipes: R[] = []
  for (const rec of byUrl.values()) {
    if (rec.status === 'collected' || rec.status === 'empty') {
      processed.add(rec.url)
    }
    if (rec.status === 'collected' && rec.recipe !== undefined) {
      recipes.push(rec.recipe)
    }
  }
  return { processed, recipes }
}

/** 連続失敗数が閾値（既定20）以上なら安全停止すべき。 */
export function shouldSafeStop(consecutiveFailures: number, threshold = 20): boolean {
  return consecutiveFailures >= threshold
}

/** 1レコードをチェックポイントファイルへ追記する（fsync はしない）。 */
export function appendRecord<R>(path: string, rec: CheckpointRecord<R>): void {
  appendFileSync(path, serializeRecord(rec), 'utf-8')
}
