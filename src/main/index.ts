import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join, dirname } from 'path'
import * as fs from 'fs'
import { execFile } from 'child_process'
import pidusage from 'pidusage'
import { createMenu } from './menu'

// Chromium 磁盘缓存损坏时会导致窗口无法渲染，禁用内存缓存
// （开发阶段不需要持久化 HTTP 缓存）
app.commandLine.appendSwitch('disable-http-cache')

/**
 * 获取 assets 目录的正确路径
 * - 开发模式：app.getAppPath() 返回项目根目录
 * - 生产模式：extraResources 将 assets 放在 process.resourcesPath 下
 */
function getAssetsPath(): string {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return join(app.getAppPath(), 'assets')
  }
  return join(process.resourcesPath, 'assets')
}

// ─── 配置文件路径 ──────────────────────────────────────────────────
function getConfigDir(): string {
  if (process.env['ELECTRON_RENDERER_URL']) {
    // 开发模式：项目根目录，config.json 直接可见
    return app.getAppPath()
  }
  // 生产模式：exe 所在目录，用户可直接管理 config.json
  return dirname(app.getPath('exe'))
}

const configDir = getConfigDir()
const configPath = join(configDir, 'config.json')

const DEFAULT_CONFIG: AppConfig = {
  gpuAcceleration: false,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 14,
  autoSaveInterval: 0,
  autoPlayCharDelay: 1000,
  autoPlayMinDelay: 1000,
  audioExtraDelay: 1000,
  audioVolume: 80,
  fpsLimit: 0,
  resourceDir: 'assets/public',
  virtualPaths: [],
  resolutionWidth: 1400,
  resolutionHeight: 900,
  openingSpeed: 'standard'
}

function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return {
        gpuAcceleration: raw.gpuAcceleration === true,
        fontFamily: typeof raw.fontFamily === 'string' ? raw.fontFamily : DEFAULT_CONFIG.fontFamily,
        fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : DEFAULT_CONFIG.fontSize,
        autoSaveInterval: typeof raw.autoSaveInterval === 'number' ? raw.autoSaveInterval : DEFAULT_CONFIG.autoSaveInterval,
        autoPlayCharDelay: typeof raw.autoPlayCharDelay === 'number' ? raw.autoPlayCharDelay : DEFAULT_CONFIG.autoPlayCharDelay,
        autoPlayMinDelay: typeof raw.autoPlayMinDelay === 'number' ? raw.autoPlayMinDelay : DEFAULT_CONFIG.autoPlayMinDelay,
        audioExtraDelay: typeof raw.audioExtraDelay === 'number' ? raw.audioExtraDelay : DEFAULT_CONFIG.audioExtraDelay,
        audioVolume: typeof raw.audioVolume === 'number' ? raw.audioVolume : DEFAULT_CONFIG.audioVolume,
        fpsLimit: typeof raw.fpsLimit === 'number' ? raw.fpsLimit : DEFAULT_CONFIG.fpsLimit,
        resourceDir: typeof raw.resourceDir === 'string' ? raw.resourceDir : DEFAULT_CONFIG.resourceDir,
        virtualPaths: Array.isArray(raw.virtualPaths) ? raw.virtualPaths : DEFAULT_CONFIG.virtualPaths,
        resolutionWidth: typeof raw.resolutionWidth === 'number' ? raw.resolutionWidth : DEFAULT_CONFIG.resolutionWidth,
        resolutionHeight: typeof raw.resolutionHeight === 'number' ? raw.resolutionHeight : DEFAULT_CONFIG.resolutionHeight,
        openingSpeed: raw.openingSpeed === 'fast' ? 'fast' : 'standard'
      }
    }
  } catch {
    // 配置文件损坏则回退默认值
  }
  return { ...DEFAULT_CONFIG }
}

const appConfig = loadConfig()

// 仅当用户关闭 GPU 加速时才设置 --disable-gpu
if (!appConfig.gpuAcceleration) {
  app.commandLine.appendSwitch('disable-gpu')
}

let mainWindow: BrowserWindow | null = null
let isClosingConfirmed = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: appConfig.resolutionWidth,
    height: appConfig.resolutionHeight,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: join(__dirname, '../../resources/icon.png'),
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    // 短暂延迟确保渲染器首帧（黑底+Splash）已绘制完成，避免白闪
    setTimeout(() => {
      mainWindow?.maximize() // 先最大化填满可用屏幕，避免无框窗口超出下边界
      mainWindow?.show()
    }, 80)
  })

  // 拦截关闭事件：先通知渲染进程播放退出动画
  mainWindow.on('close', (e) => {
    if (!isClosingConfirmed) {
      e.preventDefault()
      mainWindow?.webContents.send('app:beforeClose')
    }
  })

  // 渲染进程崩溃时记录日志并弹窗提示
  mainWindow.webContents.on('crashed', () => {
    console.error('[Udseen] 渲染进程崩溃！')
    const crashLog = `[${new Date().toISOString()}] Renderer process crashed!`
    try {
      fs.appendFileSync(join(configDir, 'crash.log'), crashLog + '\n')
    } catch { /* ignore */ }
    dialog.showErrorBox('程序错误', '渲染进程异常退出，程序将关闭。\n请尝试重新启动或取消 GPU 加速。')
    app.quit()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  createMenu(mainWindow)

  // Windows 会拦截 F11 键（菜单栏加速器），通过 before-input-event 处理
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      _event.preventDefault()
      mainWindow?.setFullScreen(!mainWindow?.isFullScreen())
    }
  })

  // 全屏状态变更时通知渲染进程
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('app:fullscreenChanged', true)
  })
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('app:fullscreenChanged', false)
  })
}

// --- IPC Handlers ---

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '打开 Udseen 脚本',
    filters: [{ name: 'Udseen 剧本', extensions: ['ykn'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const content = fs.readFileSync(filePath, 'utf-8')
  return { filePath, content }
})

ipcMain.handle('dialog:saveFile', async (_event, content: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: '保存脚本',
    filters: [{ name: 'Udseen 剧本', extensions: ['ykn'] }]
  })
  if (result.canceled || !result.filePath) return { success: false }
  fs.writeFileSync(result.filePath, content, 'utf-8')
  return { success: true, filePath: result.filePath }
})

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  const dir = dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, content, 'utf-8')
  return true
})



ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  return fs.readFileSync(filePath, 'utf-8')
})

ipcMain.handle('fs:readBinary', async (_event, filePath: string) => {
  const buffer = fs.readFileSync(filePath)
  const ext = filePath.split('.').pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    opus: 'audio/opus',
    wav: 'audio/wav',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    ttf: 'font/ttf',
    otf: 'font/otf'
  }
  const mime = mimeMap[ext || ''] || 'application/octet-stream'
  return `data:${mime};base64,${buffer.toString('base64')}`
})

ipcMain.handle('fs:writeBinary', async (_event, filePath: string, dataUrl: string) => {
  // dataUrl 格式: "data:image/png;base64,iVBORw0KGgo..."
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) return false
  const base64Data = matches[2]
  const buffer = Buffer.from(base64Data, 'base64')
  const dir = dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, buffer)
  return true
})

ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  return entries.map((e) => ({
    name: e.name,
    isDirectory: e.isDirectory()
  }))
})

ipcMain.handle('fs:fileExists', async (_event, filePath: string) => {
  return fs.existsSync(filePath)
})

ipcMain.handle('window:setMenuBarVisible', async (_event, visible: boolean) => {
  if (mainWindow) {
    mainWindow.setMenuBarVisibility(visible)
  }
})

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

ipcMain.handle('app:confirmClose', () => {
  isClosingConfirmed = true
  mainWindow?.close()
  // 如果 close 被阻止，重置标志
  setTimeout(() => { isClosingConfirmed = false }, 2000)
})

ipcMain.handle('window:enterFullscreen', () => {
  mainWindow?.setFullScreen(!mainWindow?.isFullScreen())
})

ipcMain.handle('window:setSize', async (_event, width: number, height: number) => {
  if (mainWindow) {
    mainWindow.unmaximize()
    mainWindow.setSize(width, height)
  }
})

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false
})

ipcMain.handle('app:getPath', async () => {
  return app.getAppPath()
})

ipcMain.handle('app:getConfigDir', async () => {
  return configDir
})

ipcMain.handle('shell:openPublicDir', async () => {
  const publicDir = join(getAssetsPath(), 'public')
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
  }
  shell.openPath(publicDir)
})

ipcMain.handle('shell:showItemInFolder', async (_event, fullPath: string) => {
  shell.showItemInFolder(fullPath)
})

// --- 文件系统操作（资源管理器） ---

ipcMain.handle('fs:copyFile', async (_event, src: string, dest: string) => {
  fs.copyFileSync(src, dest)
  return true
})

ipcMain.handle('fs:moveFile', async (_event, src: string, dest: string) => {
  fs.renameSync(src, dest)
  return true
})

ipcMain.handle('fs:deleteFile', async (_event, filePath: string) => {
  fs.unlinkSync(filePath)
  return true
})

ipcMain.handle('fs:deleteDir', async (_event, dirPath: string) => {
  fs.rmSync(dirPath, { recursive: true, force: true })
  return true
})

ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
  fs.renameSync(oldPath, newPath)
  return true
})

ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true })
  return true
})

ipcMain.handle('app:getPublicDir', async () => {
  return join(getAssetsPath(), 'public')
})

ipcMain.handle('app:getAssetsPath', async () => {
  return getAssetsPath()
})

// --- System Resource Monitoring (PIDUsage) ---

/**
 * pidusage 返回的 stats 字段：
 *   cpu     - CPU 使用率（百分比，归一化到单核）
 *   memory  - 物理内存占用（bytes）
 *   elapsed - 进程已运行时间（ms）
 *   pid     - 进程 ID
 */
ipcMain.handle('system:resourceUsage', async () => {
  const stats = await pidusage(process.pid)
  return {
    cpuPercent: Math.round(stats.cpu * 10) / 10, // 保留一位小数
    memoryMB: Math.round(stats.memory / 1024 / 1024)
  }
})

// --- GPU 实时利用率（NVIDIA nvidia-smi） ---

/** 调用 nvidia-smi 解析 GPU 实时信息 */
function queryNvidiaSmi(): Promise<{
  utilizationPercent: number
  memoryUsedMB: number
  memoryTotalMB: number
  temperature: number
  name: string
} | null> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      [
        '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name',
        '--format=csv,noheader,nounits'
      ],
      { timeout: 2000 },
      (err, stdout) => {
        if (err) {
          resolve(null)
          return
        }
        const parts = stdout.trim().split(', ')
        if (parts.length < 5) {
          resolve(null)
          return
        }
        resolve({
          utilizationPercent: Math.round(parseFloat(parts[0])),
          memoryUsedMB: Math.round(parseFloat(parts[1])),
          memoryTotalMB: Math.round(parseFloat(parts[2])),
          temperature: Math.round(parseFloat(parts[3])),
          name: parts.slice(4).join(', ')
        })
      }
    )
  })
}

ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择资源目录',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('fs:listSubdirs', async (_event, dirPath: string) => {
  try {
    if (!fs.existsSync(dirPath)) return []
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
})

// --- 系统字体枚举（通过 PowerShell 调用 GDI） ---

let cachedFonts: string[] | null = null

async function getSystemFonts(): Promise<string[]> {
  if (cachedFonts) return cachedFonts

  return new Promise((resolve) => {
    execFile(
      'powershell',
      [
        '-NoProfile', '-Command',
        '$OutputEncoding = [console]::OutputEncoding = [System.Text.Encoding]::UTF8;' +
        'Add-Type -AssemblyName System.Drawing;' +
        '(New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }'
      ],
      { timeout: 5000, encoding: 'buffer' },
      (err, stdout: Buffer) => {
        if (err) {
          console.warn('[Fonts] 系统字体枚举失败:', err.message)
          cachedFonts = []
          resolve([])
          return
        }
        const text = stdout.toString('utf8')
        const fonts = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        cachedFonts = fonts
        resolve(fonts)
      }
    )
  })
}

ipcMain.handle('system:getFonts', async () => {
  return getSystemFonts()
})

ipcMain.handle('system:gpuInfo', async () => {
  // 1. 基础 GPU 信息（品牌/型号）来自 Electron
  let gpuName = 'Unknown'
  try {
    const gpuInfo = await app.getGPUInfo('complete')
    gpuName = gpuInfo.gpuDevice?.[0]?.deviceName ?? 'Unknown'
  } catch {
    // getGPUInfo 可能在某些环境下失败，忽略
  }

  // 2. 尝试 nvidia-smi 获取实时利用率
  const nvidia = await queryNvidiaSmi()
  if (nvidia) {
    return {
      name: nvidia.name || gpuName,
      utilizationPercent: nvidia.utilizationPercent,
      memoryUsedMB: nvidia.memoryUsedMB,
      memoryTotalMB: nvidia.memoryTotalMB,
      temperature: nvidia.temperature
    }
  }

  // 3. 回退：仅返回型号名称
  return {
    name: gpuName,
    utilizationPercent: null,
    memoryUsedMB: null,
    memoryTotalMB: null,
    temperature: null
  }
})

// --- 设置读写 IPC ---

ipcMain.handle('settings:getConfig', async () => {
  return loadConfig()
})

ipcMain.handle('settings:setConfig', async (_event, newConfig: Partial<AppConfig>) => {
  const current = loadConfig()
  const merged = { ...current, ...newConfig }
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    console.error('[Udseen] 保存配置失败:', err)
    return { success: false, error: String(err) }
  }
})

// --- App Lifecycle ---

/** 确保 assets 目录及其子目录存在 */
function ensureAssetDirectories(): void {
  const assetSubdirs = ['public/audio', 'public/background', 'public/character', 'template/choice', 'template/dialog', 'template/font']
  const assetsDir = getAssetsPath()

  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true })
    console.log('[Udseen] assets 目录已创建:', assetsDir)
  }

  for (const subdir of assetSubdirs) {
    const dir = join(assetsDir, subdir)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      console.log(`[Udseen] assets/${subdir} 目录已创建`)
    }
  }
}

app.whenReady().then(() => {
  ensureAssetDirectories()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
