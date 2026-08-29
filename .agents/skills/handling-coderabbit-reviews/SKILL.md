---
name: handling-coderabbit-reviews
description: Use when a PR has a CodeRabbit review to process — fetching its comments, triaging findings, implementing fixes on the PR branch, and reporting back. Also covers when CodeRabbit shows "Review skipped" and no review exists yet.
---

# Handling CodeRabbit Reviews

## Overview

CodeRabbit reviews arrive as one summary review (with an overall body containing walkthrough, notes, etc.) plus zero or more inline comments anchored to file:line.
In OSS repositories, CodeRabbit may display `Review skipped: manual review required for this OSS repository` until manually triggered or triggered by PR update.
Both summary reviews and inline comments must be fetched via `gh api` to avoid truncated text.

## When to Use

- User asks to "check/handle/respond to the CodeRabbit review" on a PR (e.g. 「coderabbit対応をして」)
- `gh pr checks <N>` shows a CodeRabbit check and you need to know what it found
- Before merging a PR that has open review comments

## Step 1: Check whether a review exists or was skipped

```bash
gh pr checks <PR> 2>&1 | grep -i coderabbit
```

If it says `Review skipped: manual review required for this OSS repository`:
- Check if inline review comments already exist via Step 2.
- If no review exists yet, comment `@coderabbitai review` on the PR to trigger it.

## Step 2: Fetch the full review comments

```bash
# Summary review body
gh api repos/<owner>/<repo>/pulls/<PR>/reviews | python3 -c "
import json,sys
for r in json.load(sys.stdin):
    if r['user']['login'] == 'coderabbitai[bot]':
        print(r['body'])
"

# Inline comments (file:line-anchored)
gh api repos/<owner>/<repo>/pulls/<PR>/comments | python3 -c "
import json,sys
for c in json.load(sys.stdin):
    if c['user']['login'] == 'coderabbitai[bot]':
        print(f\"=== {c['path']}:{c.get('line')} ===\")
        print(c['body'])
"
```

**Pitfall:** Never truncate comment bodies while scanning. The actual suggestion and rationale are often at the bottom after static analysis details.

## Step 3: Triage findings

For each finding, evaluate:
1. **Functional Correctness / Bug**: Fix immediately (e.g., matching normalized vs unnormalized strings, unhandled runtime exceptions).
2. **Stability & Availability**: Validate runtime inputs / schemas at boundary handlers (reject invalid input with `400 BAD_INPUT`).
3. **Stylistic / Nitpick**: Fix if trivial; note and skip if unnecessary or conflicting with existing repository conventions.
4. **False positive**: Explain why with technical evidence and skip.

## Step 4: Implement, verify, and push

1. Work on the PR branch:
   ```bash
   git checkout <pr-branch>
   ```
2. Make minimal, focused code modifications.
3. Run project test suite and type check before claiming done:
   ```bash
   npx tsc --noEmit
   npx tsx <relevant-tests>
   ```
4. Commit and push:
   ```bash
   git commit -m 'fix: CodeRabbit指摘の対応 — <概要>'
   git push origin <pr-branch>
   ```

## Step 5: Report back on the PR

Post a clear, structured response comment on the PR referencing the commit:

```bash
gh pr comment <PR> --body "### CodeRabbit レビュー指摘への対応完了 (commit <sha>)

1. **<file>**: <修正内容>
2. **<file>**: <修正内容>

#### 検証結果
- テスト実行結果
- 型チェック結果"
```

## Common Pitfalls

| Pitfall | Solution |
|---|---|
| Review skipped in OSS | Check if comments already exist; if not, comment `@coderabbitai review` |
| Truncating comment bodies | Read full body text including code diffs |
| Ignoring input schema validation | Always validate types and array shapes before calling array methods on request body |
| Claiming fixed without running tests | Run tests and type checks (`npx tsc --noEmit`) before committing |