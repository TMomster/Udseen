import { useRef, useState, useCallback } from 'react'
import { useWorkbenchStore, PanelId } from '../../store/workbenchStore'
import { ResourceBrowser } from '../ResourceBrowser'
import { ScriptEditor } from '../Editor'
import { PreviewCanvas } from '../Preview'
import { TimelinePanel } from '../Timeline'
import { useProjectStore } from '../../store/projectStore'
import { VisualEditor } from '../VisualEditor'

/**
 * 工作区布局组件
 * 由三个可切换、可拖拽调整大小的面板组成：
 * 左：资源浏览器 | 中：编辑器（代码/可视化切换） | 右：预览+日志
 */
export function Workbench(): JSX.Element {
  const { panelVisibility, resourcePanelWidth, previewPanelWidth, setResourcePanelWidth, setPreviewPanelWidth } =
    useWorkbenchStore()
  const editMode = useProjectStore((s) => s.editMode)
  const containerRef = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState<'left' | 'right' | null>(null)

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
      {/* 左侧资源面板 */}
      {showResource && (
        <>
          <div
            style={{
              width: resourcePanelWidth,
              flexShrink: 0,
              borderRight: '1px solid rgba(255,255,255,0.06)',
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
              background: resizing === 'left' ? 'rgba(124,111,240,0.3)' : 'transparent',
              transition: 'background 0.1s'
            }}
            onMouseEnter={(e) => { if (!resizing) e.currentTarget.style.background = 'rgba(124,111,240,0.15)' }}
            onMouseLeave={(e) => { if (!resizing) e.currentTarget.style.background = 'transparent' }}
          />
        </>
      )}

      {/* 中间编辑面板 */}
      {showEditor && (
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

      {/* 右侧预览面板 */}
      {showPreview && (
        <>
          {/* 右侧拖拽手柄 */}
          <div
            onMouseDown={startResize('right')}
            style={{
              width: 4,
              cursor: 'col-resize',
              flexShrink: 0,
              background: resizing === 'right' ? 'rgba(124,111,240,0.3)' : 'transparent',
              transition: 'background 0.1s'
            }}
            onMouseEnter={(e) => { if (!resizing) e.currentTarget.style.background = 'rgba(124,111,240,0.15)' }}
            onMouseLeave={(e) => { if (!resizing) e.currentTarget.style.background = 'transparent' }}
          />
          <div
            style={{
              width: previewPanelWidth,
              flexShrink: 0,
              borderLeft: '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ flex: 1, minHeight: 300 }}>
              <PreviewCanvas isFullscreen={false} />
            </div>
            <div style={{ height: 200, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <TimelinePanel />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
