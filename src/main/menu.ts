import { BrowserWindow, Menu, MenuItemConstructorOptions, app } from 'electron'

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
          click: () => mainWindow.webContents.send('menu:newFile')
        },
        {
          label: '打开脚本...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu:openFile')
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu:saveFile')
        },
        { type: 'separator' },
        {
          label: '导出为 HTML...',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('menu:exportHtml')
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
          click: () => mainWindow.webContents.send('menu:runScript')
        },
        {
          label: '运行 / 停止脚本 (F5)',
          accelerator: 'F5',
          visible: false,
          click: () => mainWindow.webContents.send('menu:runScript')
        },
        {
          label: '停止运行',
          click: () => mainWindow.webContents.send('menu:stopScript')
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
          label: '模板设置',
          click: () => mainWindow.webContents.send('menu:openTemplateSettings')
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
