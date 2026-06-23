// src/chat/queue.ts
export class SingleFlightQueue {
  private running = false
  private waiting: { fn: () => Promise<unknown>; resolve: (v:any)=>void; reject:(e:any)=>void }[] = []
  constructor(private maxWaiting = 5) {}
  get depth() { return this.waiting.length + (this.running ? 1 : 0) }
  run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running && this.waiting.length >= this.maxWaiting) return Promise.reject(new Error('BUSY'))
    return new Promise<T>((resolve, reject) => { this.waiting.push({ fn, resolve, reject }); this.pump() })
  }
  private async pump() {
    if (this.running) return
    const next = this.waiting.shift(); if (!next) return
    this.running = true
    try { next.resolve(await next.fn()) } catch (e) { next.reject(e) }
    finally { this.running = false; this.pump() }
  }
}

export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(private perMin = 10) {}
  allow(ip: string, now = Date.now()): boolean {
    const win = now - 60_000
    const arr = (this.hits.get(ip) ?? []).filter(t => t > win)
    if (arr.length >= this.perMin) { this.hits.set(ip, arr); return false }
    arr.push(now); this.hits.set(ip, arr); return true
  }
}
