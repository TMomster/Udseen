import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
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

ipcMain.handle('dialog:exportHtml', async (_event, htmlContent: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: '导出为 HTML',
    filters: [{ name: 'HTML 文件', extensions: ['html'] }]
  })
  if (result.canceled || !result.filePath) return false
  fs.writeFileSync(result.filePath, htmlContent, 'utf-8')
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
    svg: 'image/svg+xml'
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
