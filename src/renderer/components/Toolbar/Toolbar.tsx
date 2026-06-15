import { useProjectStore } from '../../store/projectStore'
import { usePreviewStore } from '../../store/previewStore'
import { useWorkbenchStore, PanelId } from '../../store/workbenchStore'

/**
 * 顶部工具栏组件
 */
export function Toolbar(): JSX.Element {
  const { setFilePath, setContent, markClean, newFile, editMode, toggleEditMode } = useProjectStore()
  const { isRunning } = usePreviewStore()
  const { panelVisibility, togglePanel } = useWorkbenchStore()

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
        width: '100%',
        height: 44,
        background: 'linear-gradient(135deg, #1e1e32 0%, #252542 50%, #20203a 100%)',
        borderBottom: '1px solid rgba(124,111,240,0.15)',
        boxShadow: '0 1px 8px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 6,
        position: 'relative',
        zIndex: 200,
        flexShrink: 0,
        userSelect: 'none'
      }}
    >
      {/* Left group: File operations */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <ToolbarButton label="新建" shortcut="Ctrl+N" onClick={handleNew} />
        <ToolbarButton label="打开" shortcut="Ctrl+O" onClick={handleOpen} />
        <ToolbarButton label="保存" shortcut="Ctrl+S" onClick={handleSave} />
      </div>

      <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', margin: '0 6px', flexShrink: 0 }} />

      {/* Run/Stop */}
      <ToolbarButton
        label={isRunning ? '停止' : '运行'}
        shortcut='Ctrl+B / F5'
        onClick={isRunning ? handleStop : handleRun}
        color={isRunning ? '#f44336' : '#4caf50'}
      />

      <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', margin: '0 6px', flexShrink: 0 }} />

      {/* 工作区切换按钮 */}
      <WorkbenchToggle label="资源" visible={panelVisibility.resource} onClick={() => togglePanel('resource')} />
      <WorkbenchToggle label="编辑" visible={panelVisibility.editor} onClick={() => togglePanel('editor')} />
      <WorkbenchToggle label="预览" visible={panelVisibility.preview} onClick={() => togglePanel('preview')} />

      <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', margin: '0 6px', flexShrink: 0 }} />

      {/* 可视化/代码切换 */}
      <ToolbarButton
        label={editMode === 'visual' ? '代码编辑' : '可视化编辑'}
        shortcut="Ctrl+E"
        onClick={toggleEditMode}
        color={editMode === 'visual' ? '#a29bfe' : '#7c6ff0'}
      />

      <div style={{ flex: 1 }} />
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
        padding: '5px 12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: color ?? '#b0b0d0',
        cursor: 'pointer',
        borderRadius: 6,
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 0.15s',
        textShadow: '0 1px 2px rgba(0,0,0,0.3)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(124,111,240,0.15)'
        e.currentTarget.style.borderColor = 'rgba(124,111,240,0.3)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
      }}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      {label}
      {shortcut && <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>{shortcut}</span>}
    </button>
  )
}

/** 工作区面板切换按钮 */
function WorkbenchToggle({
  label,
  visible,
  onClick
}: {
  label: string
  visible: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 10px',
        background: visible ? 'rgba(124,111,240,0.15)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${visible ? 'rgba(124,111,240,0.3)' : 'rgba(255,255,255,0.08)'}`,
        color: visible ? '#7c6ff0' : '#888',
        cursor: 'pointer',
        borderRadius: 6,
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all 0.15s'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(124,111,240,0.2)'
        e.currentTarget.style.borderColor = 'rgba(124,111,240,0.4)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = visible ? 'rgba(124,111,240,0.15)' : 'rgba(255,255,255,0.03)'
        e.currentTarget.style.borderColor = visible ? 'rgba(124,111,240,0.3)' : 'rgba(255,255,255,0.08)'
      }}
      title={`切换${label}面板`}
    >
      {label}
    </button>
  )
}

