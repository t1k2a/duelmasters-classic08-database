import { execSync } from 'child_process';

// scripts/coderabbit-triage.ts
// CodeRabbit の未返信インライン指摘を自動検知して一覧化するユーティリティ

interface PrComment {
  id: number;
  path: string;
  line: number | null;
  original_line: number | null;
  body: string;
  in_reply_to_id?: number;
  user: { login: string };
  created_at: string;
}

export function getOpenPrs(): { number: number; headRefName: string; title: string }[] {
  try {
    const stdout = execSync('gh pr list --state open --json number,headRefName,title', { encoding: 'utf-8' });
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

export function getPrComments(prNumber: number): PrComment[] {
  try {
    const stdout = execSync(`gh api repos/t1k2a/duelmasters-classic08-database/pulls/${prNumber}/comments`, { encoding: 'utf-8' });
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

export function replyToComment(prNumber: number, commentId: number, body: string): void {
  const payload = JSON.stringify({ body });
  execSync(`gh api repos/t1k2a/duelmasters-classic08-database/pulls/${prNumber}/comments/${commentId}/replies --input -`, {
    input: payload,
    encoding: 'utf-8',
  });
  console.log(`Replied to comment ${commentId}`);
}

async function main() {
  const prs = getOpenPrs();
  if (!prs.length) {
    console.log('No open PRs found.');
    return;
  }

  for (const pr of prs) {
    console.log(`\nChecking PR #${pr.number}: ${pr.title}`);
    const comments = getPrComments(pr.number);
    const crComments = comments.filter(c => c.user.login.includes('coderabbit') && !c.in_reply_to_id);
    const myReplies = new Set(comments.filter(c => !c.user.login.includes('coderabbit')).map(c => c.in_reply_to_id));

    const pending = crComments.filter(c => !myReplies.has(c.id));
    console.log(`Total CodeRabbit Root Comments: ${crComments.length}`);
    console.log(`Pending Unreplied Comments: ${pending.length}`);

    for (const p of pending) {
      console.log(`- [ID: ${p.id}] ${p.path}:${p.line || p.original_line}`);
      console.log(`  Body: ${p.body.slice(0, 100).replace(/\n/g, ' ')}...`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
