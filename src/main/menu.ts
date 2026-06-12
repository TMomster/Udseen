import { BrowserWindow, Menu, MenuItemConstructorOptions, app, shell } from 'electron'
import { join } from 'path'
import * as fs from 'fs'

/** 安全地发送 IPC 消息到渲染进程，忽略渲染器已销毁的情况 */
function safeSend(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  if (!win.webContents.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}

export function createMenu(mainWindow: BrowserWindow): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: '关于 Udseen', role: 'about' as const },
              { type: 'separator' as const },
              { label: '退出', role: 'quit' as const }
            ]
          } as MenuItemConstructorOptions
        ]
      : []),
    {
      label: '文件',
      submenu: [
        {
          label: '新建脚本',
          accelerator: 'CmdOrCtrl+N',
          click: () => safeSend(mainWindow, 'menu:newFile')
        },
        {
          label: '打开脚本...',
          accelerator: 'CmdOrCtrl+O',
          click: () => safeSend(mainWindow, 'menu:openFile')
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => safeSend(mainWindow, 'menu:saveFile')
        },
        { type: 'separator' },
        isMac ? { label: '关闭窗口', role: 'close' } : { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '运行',
      submenu: [
        {
          label: '运行 / 停止脚本',
          accelerator: 'CmdOrCtrl+B',
          click: () => safeSend(mainWindow, 'menu:runScript')
        },
        {
          label: '运行 / 停止脚本 (F5)',
          accelerator: 'F5',
          visible: false,
          click: () => safeSend(mainWindow, 'menu:runScript')
        },
        {
          label: '停止运行',
          click: () => safeSend(mainWindow, 'menu:stopScript')
        }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '重置缩放', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: '演出区域边界裁剪',
          type: 'checkbox',
          checked: false,
          click: () => safeSend(mainWindow, 'menu:toggleCropPreview')
        },
        { type: 'separator' },
        {
          label: '资源预览气泡',
          type: 'checkbox',
          checked: true,
          click: () => safeSend(mainWindow, 'menu:toggleResourcePreview')
        },
        { type: 'separator' },
        {
          label: '切换编辑模式',
          accelerator: 'CmdOrCtrl+E',
          click: () => safeSend(mainWindow, 'menu:toggleEditMode')
        },
        { type: 'separator' },
        {
          label: '模板设置',
          click: () => safeSend(mainWindow, 'menu:openTemplateSettings')
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '内置帮助',
          accelerator: 'F1',
          click: () => safeSend(mainWindow, 'menu:openHelp')
        },
        { type: 'separator' },
        {
          label: '打开资源目录',
          click: () => {
            const appPath = app.getAppPath()
            const publicDir = join(appPath, 'assets', 'public')
            if (fs.existsSync(publicDir)) {
              shell.openPath(publicDir)
            } else {
              // 目录不存在则创建后打开
              fs.mkdirSync(publicDir, { recursive: true })
              shell.openPath(publicDir)
            }
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
