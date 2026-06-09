interface ElectronAPI {
  openFile: () => Promise<{ filePath: string; content: string } | null>
  saveFile: (content: string) => Promise<{ success: boolean; filePath?: string }>
  writeFile: (filePath: string, content: string) => Promise<boolean>
  exportHtml: (htmlContent: string) => Promise<boolean>
  readFile: (filePath: string) => Promise<string>
  readBinary: (filePath: string) => Promise<string>  // 返回 base64 data URL
  readDir: (dirPath: string) => Promise<{ name: string; isDirectory: boolean }[]>
  fileExists: (filePath: string) => Promise<boolean>
  onMenuEvent: (channel: string, callback: () => void) => () => void
  setMenuBarVisible: (visible: boolean) => Promise<void>
  getAppPath: () => Promise<string>
}

interface Window {
  electronAPI: ElectronAPI
}
