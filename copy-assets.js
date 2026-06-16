/**
 * 将 assets/ 以及许可证/声明文件复制到 runpack/ 目录
 */
const fs = require('fs')
const path = require('path')

const RUNPACK = path.join(__dirname, 'runpack')

// ── 复制 assets ──────────────────────────────────
const assetsSrc = path.join(__dirname, 'assets')
const assetsDst = path.join(RUNPACK, 'assets')

if (!fs.existsSync(assetsSrc)) {
  console.error('[copy-assets] 错误: 项目根目录下不存在 assets/ 文件夹')
  process.exit(1)
}

if (fs.existsSync(assetsDst)) {
  fs.rmSync(assetsDst, { recursive: true })
  console.log('[copy-assets] 已清除旧的 runpack/assets')
}
fs.cpSync(assetsSrc, assetsDst, { recursive: true })
console.log('[copy-assets] ✓ assets/ 已复制到 runpack/assets/')

// ── 复制许可证与第三方声明 ────────────────────────
const licenseFiles = [
  { name: 'LICENSE', desc: '许可证' },
  { name: 'THIRD-PARTY-LICENSES', desc: '第三方声明' }
]

for (const file of licenseFiles) {
  const src = path.join(__dirname, file.name)
  const dst = path.join(RUNPACK, file.name)

  if (fs.existsSync(src)) {
    // 已在目标目录时跳过（避免清除已有文件）
    if (!fs.existsSync(dst) || fs.readFileSync(src).equals(fs.readFileSync(dst))) {
      fs.copyFileSync(src, dst)
      console.log(`[copy-assets] ✓ ${file.name} 已复制到 runpack/`)
    }
  } else {
    console.warn(`[copy-assets] 警告: ${file.name} 不存在，跳过`)
  }
}
