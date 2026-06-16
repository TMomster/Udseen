import { useRef, useState, useCallback, useEffect } from 'react'
import { useWorkbenchStore, PanelId } from '../../store/workbenchStore'
import { ResourceBrowser } from '../ResourceBrowser'
import { ScriptEditor } from '../Editor'
import { PreviewCanvas } from '../Preview'
import { TimelinePanel } from '../Timeline'
import { useProjectStore } from '../../store/projectStore'
import { useSettingsStore } from '../../store/settingsStore'
import { VisualEditor } from '../VisualEditor'

/**
 * 工作区布局组件
 * 由三个可切换、可拖拽调整大小的面板组成：
 * 左：资源浏览器 | 中：编辑器（代码/可视化切换） | 右：预览+日志
 */
export function Workbench({ stageFullscreen }: { stageFullscreen?: boolean }): JSX.Element {
  const { panelVisibility, resourcePanelWidth, previewPanelWidth, setResourcePanelWidth, setPreviewPanelWidth } =
    useWorkbenchStore()
  const editMode = useProjectStore((s) => s.editMode)
  const containerRef = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState<'left' | 'right' | null>(null)

  // ─── 自动保存 ──────────────────────────────────────────────
  const autoSaveInterval = useSettingsStore((s) => s.autoSaveInterval)
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // 清除旧定时器
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    if (autoSaveInterval <= 0) return

    autoSaveTimerRef.current = setInterval(async () => {
      const { filePath, content, isDirty } = useProjectStore.getState()
      if (!filePath || !isDirty) return
      if (!window.electronAPI) return
      try {
        await window.electronAPI.writeFile(filePath, content)
        useProjectStore.getState().markClean()
        console.log(`[AutoSave] 已保存: ${filePath}`)
      } catch (err) {
        console.error('[AutoSave] 保存失败:', err)
      }
    }, autoSaveInterval * 1000)

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [autoSaveInterval])

  const startResize = useCallback((side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault()
    setResizing(side)
  }, [])

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!resizing || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      if (resizing === 'left') {
        setResourcePanelWidth(x)
      } else {
        setPreviewPanelWidth(rect.width - x)
      }
    },
    [resizing, setResourcePanelWidth, setPreviewPanelWidth]
  )

  const onMouseUp = useCallback(() => {
    setResizing(null)
  }, [])

  // 计算可见面板数量来决定布局
  const showResource = panelVisibility.resource
  const showEditor = panelVisibility.editor
  const showPreview = panelVisibility.preview
  const visibleCount = [showResource, showEditor, showPreview].filter(Boolean).length

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
        cursor: resizing ? 'col-resize' : undefined
      }}
      onMouseMove={resizing ? onMouseMove : undefined}
      onMouseUp={resizing ? onMouseUp : undefined}
      onMouseLeave={resizing ? onMouseUp : undefined}
    >
      {/* 左侧资源面板 — 舞台全屏时隐藏 */}
      {showResource && !stageFullscreen && (
        <>
          <div
            style={{
              width: resourcePanelWidth,
              flexShrink: 0,
              borderRight: '1px solid var(--border)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <ResourceBrowser />
          </div>
          {/* 左侧拖拽手柄 */}
          <div
            onMouseDown={startResize('left')}
            style={{
              width: 4,
              cursor: 'col-resize',
              flexShrink: 0,
              background: resizing === 'left' ? 'var(--border)' : 'transparent',
              transition: 'background 0.1s'
            }}
            onMouseEnter={(e) => { if (!resizing) e.currentTarget.style.background = 'var(--bg-hover, #2a2a30)' }}
            onMouseLeave={(e) => { if (!resizing) e.currentTarget.style.background = 'transparent' }}
          />
        </>
      )}

      {/* 中间编辑面板 — 舞台全屏时隐藏 */}
      {showEditor && !stageFullscreen && (
        <div
          style={{
            flex: 1,
            minWidth: 300,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {editMode === 'code' ? (
            <ScriptEditor />
          ) : (
            <VisualEditor />
          )}
        </div>
      )}

      {/* 右侧预览面板 — 始终渲染，保持 PreviewCanvas 常驻挂载不中断播放 */}
      {showPreview && (
        <>
          {/* 右侧拖拽手柄 — 舞台全屏时隐藏 */}
          {!stageFullscreen && (
            <div
              onMouseDown={startResize('right')}
              style={{
                width: 4,
                cursor: 'col-resize',
                flexShrink: 0,
                background: resizing === 'right' ? 'var(--border)' : 'transparent',
                transition: 'background 0.1s'
              }}
              onMouseEnter={(e) => { if (!resizing) e.currentTarget.style.background = 'var(--bg-hover, #2a2a30)' }}
              onMouseLeave={(e) => { if (!resizing) e.currentTarget.style.background = 'transparent' }}
            />
          )}
          <div
            style={{
              flex: stageFullscreen ? 1 : undefined,
              width: stageFullscreen ? '100%' : previewPanelWidth,
              flexShrink: stageFullscreen ? 1 : 0,
              borderLeft: stageFullscreen ? 'none' : '1px solid var(--border)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ flex: 1, minHeight: 300 }}>
              <PreviewCanvas isFullscreen={!!stageFullscreen} />
            </div>
            {/* 时间线面板 — 舞台全屏时隐藏 */}
            {!stageFullscreen && (
              <div style={{ height: 200, borderTop: '1px solid var(--border)' }}>
                <TimelinePanel />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
