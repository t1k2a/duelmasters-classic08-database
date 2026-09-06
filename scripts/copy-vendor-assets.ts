import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = join(root, 'node_modules', 'qrcode-generator')
const source = join(packageRoot, 'qrcode.js')
const manifest = join(packageRoot, 'package.json')
const outputDir = join(root, 'public', 'js', 'vendor')
const output = join(outputDir, 'qrcode.js')
const licenseOutput = join(outputDir, 'qrcode-generator.LICENSE.txt')

const MIT_LICENSE = `MIT License

Copyright (c) 2009 Kazuhiko Arase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

const [sourceText, manifestText] = await Promise.all([
  readFile(source, 'utf8'),
  readFile(manifest, 'utf8'),
])
const packageInfo = JSON.parse(manifestText) as { name?: string; version?: string; license?: string }

if (packageInfo.name !== 'qrcode-generator' || packageInfo.version !== '1.4.4') {
  throw new Error(`Expected qrcode-generator@1.4.4, got ${packageInfo.name ?? 'unknown'}@${packageInfo.version ?? 'unknown'}`)
}
if (packageInfo.license !== 'MIT' || !sourceText.includes('Licensed under the MIT license')) {
  throw new Error('qrcode-generator license metadata or source notice is missing')
}

await mkdir(outputDir, { recursive: true })
await Promise.all([
  copyFile(source, output),
  writeFile(licenseOutput, MIT_LICENSE, 'utf8'),
])

console.log(`Copied qrcode-generator@${packageInfo.version} browser asset and license notice`)
