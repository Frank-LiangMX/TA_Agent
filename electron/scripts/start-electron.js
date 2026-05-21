const { spawnSync } = require('child_process')
const os = require('os')
const path = require('path')

if (process.platform === 'win32') {
  try {
    spawnSync('chcp', ['65001'], { shell: true, stdio: 'ignore' })
  } catch {
    // Best effort: Electron can still start if the console code page cannot be changed.
  }
}

process.env.LANG = process.env.LANG || 'zh_CN.UTF-8'
process.env.LC_ALL = process.env.LC_ALL || 'zh_CN.UTF-8'
process.env.PYTHONIOENCODING = process.env.PYTHONIOENCODING || 'utf-8'

const electronBin = process.platform === 'win32' ? 'electron.cmd' : 'electron'
const result = spawnSync(electronBin, [path.resolve(__dirname, '..')], {
  cwd: path.resolve(__dirname, '..'),
  env: process.env,
  shell: true,
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 0)
