import { BrowserWindow, Menu, app } from 'electron'

/**
 * 移除原生菜单栏，全部菜单功能由渲染进程的 Udseen 内置菜单栏管理。
 * macOS 下仅保留应用菜单（关于、退出），否则系统不会显示应用名。
 */
export function createMenu(mainWindow: BrowserWindow): void {
  const isMac = process.platform === 'darwin'

  if (isMac) {
    // macOS 必须有应用菜单，否则菜单栏不显示应用名
    const template = [
      {
        label: app.name,
        submenu: [
          { label: '关于 Udseen', role: 'about' as const },
          { type: 'separator' as const },
          { label: '退出', role: 'quit' as const }
        ]
      }
    ]
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
  } else {
    // Windows/Linux: 完全移除原生菜单栏
    Menu.setApplicationMenu(null)
  }
}
