// Keep the legacy .mjs entry point in sync with the maintained TypeScript implementation.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const tsxCli = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url))
const implementation = fileURLToPath(new URL('./build-restrictions.ts', import.meta.url))
const result = spawnSync(process.execPath, [tsxCli, implementation], { cwd: projectRoot, stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
