import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { execFile } from 'child_process'
import pidusage from 'pidusage'
import { createMenu } from './menu'

// Chromium 磁盘缓存损坏时会导致窗口无法渲染，禁用内存缓存
// （开发阶段不需要持久化 HTTP 缓存）
app.commandLine.appendSwitch('disable-http-cache')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
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
    mainWindow?.show()
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
    flac: 'audio/flac'
  }
  const mime = mimeMap[ext || ''] || 'application/octet-stream'
  return `data:${mime};base64,${buffer.toString('base64')}`
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

ipcMain.handle('app:getPath', async () => {
  return app.getAppPath()
})

ipcMain.handle('shell:openPublicDir', async () => {
  const appPath = app.getAppPath()
  const publicDir = join(appPath, 'assets', 'public')
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
  }
  shell.openPath(publicDir)
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
  const appPath = app.getAppPath()
  return join(appPath, 'assets', 'public')
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

// --- App Lifecycle ---

/** 确保 assets 目录及其子目录存在 */
function ensureAssetDirectories(): void {
  const assetSubdirs = ['public/audio', 'public/background', 'public/character', 'template/choice', 'template/dialog']
  const appPath = app.getAppPath()
  const assetsDir = join(appPath, 'assets')

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
