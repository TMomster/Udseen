import { useProjectStore } from '../../store/projectStore'
import { usePreviewStore } from '../../store/previewStore'

/**
 * 顶部工具栏组件
 */
export function Toolbar(): JSX.Element {
  const { filePath, isDirty, setFilePath, setContent, markClean, newFile } = useProjectStore()
  const { isRunning } = usePreviewStore()

  const handleNew = async () => {
    newFile()
  }

  const handleOpen = async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.openFile()
    if (result) {
      setFilePath(result.filePath)
      setContent(result.content)
      markClean()
    }
  }

  const handleSave = async () => {
    if (!window.electronAPI) return
    const { content, filePath } = useProjectStore.getState()
    if (filePath) {
      await window.electronAPI.writeFile(filePath, content)
      markClean()
    } else {
      const result = await window.electronAPI.saveFile(content)
      if (result.success && result.filePath) {
        setFilePath(result.filePath)
        markClean()
      }
    }
  }

  const handleExportHtml = async () => {
    if (!window.electronAPI) return
    const htmlContent = generateExportHtml()
    await window.electronAPI.exportHtml(htmlContent)
  }

  const handleRun = () => {
    const runFn = (window as unknown as Record<string, unknown>).__udseenRun as (() => void) | undefined
    runFn?.()
  }

  const handleStop = () => {
    const stopFn = (window as unknown as Record<string, unknown>).__udseenStop as (() => void) | undefined
    stopFn?.()
  }

  return (
    <div
      style={{
        height: 40,
        background: '#252536',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 8
      }}
    >
      {/* File operations */}
      <ToolbarButton label="新建" shortcut="Ctrl+N" onClick={handleNew} />
      <ToolbarButton label="打开" shortcut="Ctrl+O" onClick={handleOpen} />
      <ToolbarButton label="保存" shortcut="Ctrl+S" onClick={handleSave} />

      <div style={{ width: 1, height: 24, background: '#444', margin: '0 4px' }} />

      {/* Run/Stop */}
      <ToolbarButton
        label={isRunning ? '停止' : '运行'}
        shortcut='Ctrl+B / F5'
        onClick={isRunning ? handleStop : handleRun}
        color={isRunning ? '#f44336' : '#4caf50'}
      />

      <div style={{ width: 1, height: 24, background: '#444', margin: '0 4px' }} />

      <ToolbarButton label="导出 HTML" shortcut="Ctrl+E" onClick={handleExportHtml} />

      <div style={{ flex: 1 }} />

      {/* File info */}
      <span style={{ color: '#888', fontSize: 11 }}>
        {filePath ? filePath.split(/[/\\]/).pop() : '未命名脚本'}
        {isDirty && ' *'}
      </span>
    </div>
  )
}

function ToolbarButton({
  label,
  shortcut,
  onClick,
  color
}: {
  label: string
  shortcut?: string
  onClick: () => void
  color?: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        background: 'transparent',
        border: '1px solid #444',
        color: color ?? '#ddd',
        cursor: 'pointer',
        borderRadius: 4,
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      {label}
      {shortcut && <span style={{ color: '#666', fontSize: 10 }}>{shortcut}</span>}
    </button>
  )
}

function generateExportHtml(): string {
  const { content } = useProjectStore.getState()
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Udseen 导出游戏</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a2e; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
    #game { width: 800px; height: 600px; }
  </style>
</head>
<body>
  <div id="game"></div>
  <script>
    // 此处为导出的 Udseen 运行时和脚本
    // 完整导出功能将在后续版本实现
    console.log("Udseen 游戏已加载");
    const script = ${JSON.stringify(content)};
  </script>
</body>
</html>`
}
