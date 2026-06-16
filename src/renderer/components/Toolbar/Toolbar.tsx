import { useRef, useState, useEffect, useCallback } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { usePreviewStore } from '../../store/previewStore'
import { useWorkbenchStore } from '../../store/workbenchStore'
import { useStatusStore } from '../../store/statusStore'

declare global {
  interface Window {
    electronAPI?: {
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      isWindowMaximized: () => Promise<boolean>
      [key: string]: unknown
    }
  }
}

// ─── 菜单项类型 ────────────────────────────────────
interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  type?: 'separator'
  checked?: boolean
}

interface MenuGroup {
  label: string
  items: MenuItem[]
}

// ─── 通用下拉菜单组件 ───────────────────────────────
function DropdownMenu({
  menu,
  isOpen,
  onToggle,
  onClose
}: {
  menu: MenuGroup
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
}): JSX.Element {
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick, true)
    return () => document.removeEventListener('mousedown', handleClick, true)
  }, [isOpen, onClose])

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          style={{
            padding: '5px 10px',
            height: 34,
            background: isOpen ? 'var(--bg-input)' : 'none',
            border: '1px solid transparent',
            borderColor: isOpen ? 'var(--border)' : 'transparent',
            color: isOpen ? 'var(--text)' : 'var(--text-secondary)',
            cursor: 'pointer',
            borderRadius: 0,
            fontSize: 13,
            letterSpacing: 0.5,
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!isOpen) {
              e.currentTarget.style.background = 'var(--bg-input)'
              e.currentTarget.style.color = 'var(--text)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }
          }}
          onMouseLeave={(e) => {
            if (!isOpen) {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.transform = 'translateY(0)'
            }
          }}
        >
        {menu.label}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            minWidth: 260,
            background: 'var(--panel-bg)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 9999,
            padding: '4px 0',
            animation: 'dropdownFadeIn 0.12s ease-out'
          }}
        >
          {menu.items.map((item, idx) => {
            if (item.type === 'separator') {
              return (
                <div
                  key={`sep-${idx}`}
                  style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }}
                />
              )
            }
            return (
              <div
                key={item.label}
                onClick={(e) => { e.stopPropagation(); onClose(); item.action?.() }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '' }}
                style={{
                  padding: '6px 24px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 32,
                  userSelect: 'none',
                  transition: 'background 0.1s, color 0.1s'
                }}
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 24 }}>
                    {item.shortcut}
                  </span>
                )}
                {item.checked !== undefined && (
                  <span style={{ marginLeft: 'auto' }}>{item.checked ? '✓' : ''}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 主工具栏组件 ───────────────────────────────────
export function Toolbar(): JSX.Element {
  const { setFilePath, setContent, markClean, newFile, editMode, toggleEditMode, setCurrentView } = useProjectStore()
  const { isRunning } = usePreviewStore()
  const { panelVisibility, togglePanel } = useWorkbenchStore()
  const pushLog = useStatusStore((s) => s.pushLog)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const closeMenus = useCallback(() => setOpenMenu(null), [])

  // 文件操作
  const handleNew = useCallback(() => {
    newFile()
    pushLog('新建脚本')
  }, [newFile, pushLog])
  const handleOpen = useCallback(async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.openFile()
    if (result) {
      setFilePath(result.filePath)
      setContent(result.content)
      markClean()
      const name = result.filePath.split(/[/\\]/).pop()!
      pushLog(`打开文件 ${name}`)
    }
  }, [setFilePath, setContent, markClean, pushLog])
  const handleSave = useCallback(async () => {
    if (!window.electronAPI) return
    const { content, filePath } = useProjectStore.getState()
    if (filePath) {
      await window.electronAPI.writeFile(filePath, content)
      markClean()
      const name = filePath.split(/[/\\]/).pop()!
      pushLog(`已保存 ${name}`)
    } else {
      const result = await window.electronAPI.saveFile(content)
      if (result.success && result.filePath) {
        setFilePath(result.filePath)
        markClean()
        const name = result.filePath.split(/[/\\]/).pop()!
        pushLog(`已保存 ${name}`)
      }
    }
  }, [setFilePath, markClean, pushLog])

  const handleRun = useCallback(() => {
    const runFn = (window as unknown as Record<string, unknown>).__udseenRun as (() => void) | undefined
    runFn?.()
  }, [])
  const handleStop = useCallback(() => {
    const stopFn = (window as unknown as Record<string, unknown>).__udseenStop as (() => void) | undefined
    stopFn?.()
  }, [])

  const handleTemplateSettings = useCallback(() => {
    setCurrentView('template-settings')
  }, [setCurrentView])
  const handleSettings = useCallback(() => {
    setCurrentView('settings')
  }, [setCurrentView])
  const handleHelp = useCallback(() => {
    setCurrentView('help')
  }, [setCurrentView])

  // Store-based booleans for menu items
  const { resourcePreview, setResourcePreview } = useProjectStore()

  // ─── 菜单定义 ────────────────────────────────────
  const menus: MenuGroup[] = [
    {
      label: '文件',
      items: [
        { label: '新建脚本', shortcut: 'Ctrl+N', action: handleNew },
        { label: '打开脚本...', shortcut: 'Ctrl+O', action: handleOpen },
        { label: '保存', shortcut: 'Ctrl+S', action: handleSave },
        { type: 'separator' },
        { label: '退出', action: () => window.close() }
      ]
    },
    {
      label: '编辑',
      items: [
        { label: '撤销', shortcut: 'Ctrl+Z', action: () => document.execCommand('undo') },
        { label: '重做', shortcut: 'Ctrl+Y', action: () => document.execCommand('redo') },
        { type: 'separator' },
        { label: '剪切', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
        { label: '复制', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
        { label: '粘贴', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
        { label: '全选', shortcut: 'Ctrl+A', action: () => document.execCommand('selectAll') }
      ]
    },
    {
      label: '运行',
      items: [
        { label: isRunning ? '停止脚本' : '运行脚本', shortcut: 'Ctrl+B / F5', action: isRunning ? handleStop : handleRun }
      ]
    },
    {
      label: '视图',
      items: [
        { label: '重新加载', shortcut: 'Ctrl+R', action: () => location.reload() },
        { label: '开发者工具', shortcut: 'Ctrl+Shift+I', action: () => {
          // Electron 开发者工具通过原生菜单保留
        }},
        { type: 'separator' },
        { label: '重置缩放', shortcut: 'Ctrl+0', action: () => {} },
        { label: '放大', shortcut: 'Ctrl++', action: () => {} },
        { label: '缩小', shortcut: 'Ctrl+-', action: () => {} },
        { type: 'separator' },
        { label: '全屏', shortcut: 'F11', action: () => {
          if (document.fullscreenElement) {
            document.exitFullscreen()
          } else {
            document.documentElement.requestFullscreen()
          }
        }},
        { label: '资源预览气泡', checked: resourcePreview, action: () => setResourcePreview(!resourcePreview) },
        { type: 'separator' },
        { label: editMode === 'visual' ? '代码模式' : '图形模式', shortcut: 'Ctrl+E', action: toggleEditMode },
        { type: 'separator' },
        { label: '模板设置', action: handleTemplateSettings },
        { type: 'separator' },
        { label: '设置', action: handleSettings }
      ]
    },
    {
      label: '帮助',
      items: [
        { label: '内置帮助', shortcut: 'F1', action: handleHelp },
        { type: 'separator' },
        {
          label: '关于 Udseen',
          action: handleHelp
        },
        { type: 'separator' },
        {
          label: '打开资源目录',
          action: () => { window.electronAPI?.openPublicDir() }
        }
      ]
    }
  ]

  return (
    <div
      style={{
        width: '100%',
        height: 52,
        background: 'var(--header-bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 28px',
        gap: 8,
        position: 'relative',
        zIndex: 200,
        flexShrink: 0,
        userSelect: 'none'
      }}
    >
      {/* Logo / Brand */}
      <span style={{ fontSize: 16, letterSpacing: 1.5, fontWeight: 300, color: 'var(--text)', whiteSpace: 'nowrap', marginRight: 8 }}>
        Udseen
      </span>

      {/* 内置菜单栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginRight: 12 }}>
        {menus.map((m) => (
          <DropdownMenu
            key={m.label}
            menu={m}
            isOpen={openMenu === m.label}
            onToggle={() => setOpenMenu(openMenu === m.label ? null : m.label)}
            onClose={closeMenus}
          />
        ))}
      </div>

      {/* Run/Stop */}
      <ToolbarButton
        label={isRunning ? '停止' : '运行'}
        tooltip={isRunning ? '停止脚本 (Ctrl+B / F5)' : '运行脚本 (Ctrl+B / F5)'}
        onClick={isRunning ? handleStop : handleRun}
        color={isRunning ? 'var(--error)' : 'var(--success)'}
      />

      <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 8px', flexShrink: 0 }} />

      {/* 工作区切换按钮 */}
      <WorkbenchToggle label="资源" visible={panelVisibility.resource} onClick={() => togglePanel('resource')} />
      <WorkbenchToggle label="编辑" visible={panelVisibility.editor} onClick={() => togglePanel('editor')} />
      <WorkbenchToggle label="预览" visible={panelVisibility.preview} onClick={() => togglePanel('preview')} />

      <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 8px', flexShrink: 0 }} />

      {/* 图形/代码模式切换 */}
      <ToolbarButton
        label={editMode === 'visual' ? '图形模式' : '代码模式'}
        tooltip={editMode === 'visual' ? '切换到代码编辑 (Ctrl+E)' : '切换到图形化编辑 (Ctrl+E)'}
        onClick={toggleEditMode}
        color={editMode === 'visual' ? '#a29bfe' : 'var(--text)'}
      />

      {/* ── 当前脚本名 ── */}
      <ScriptNameDisplay />

      <div style={{ flex: 1 }} />

      {/* ── 窗口控制按钮（无边框窗口） ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginRight: -28, height: '100%' }}>
        <WindowControlButton label="─" title="最小化" onClick={() => window.electronAPI?.minimizeWindow()} />
        <WindowControlButton label="✕" title="关闭" onClick={() => window.electronAPI?.closeWindow()} close />
      </div>
    </div>
  )
}

/** 当前脚本名显示 */
function ScriptNameDisplay(): JSX.Element {
  const filePath = useProjectStore((s) => s.filePath)
  const name = filePath ? filePath.split(/[/\\]/).pop()! : '新建脚本'
  return (
    <span
      style={{
        fontSize: 12,
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 200,
        userSelect: 'none',
        fontFamily: 'inherit'
      }}
      title={filePath || '新建脚本'}
    >
      {name}
    </span>
  )
}

function WindowControlButton({
  label,
  title,
  onClick,
  close
}: {
  label: string
  title: string
  onClick: () => void
  close?: boolean
}): JSX.Element {
  const [hover, setHover] = useState(false)
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 46,
        height: '100%',
        border: 'none',
        background: hover
          ? close ? '#e81123' : 'var(--bg-input)'
          : 'transparent',
        color: hover && close ? '#fff' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s, color 0.15s',
        fontFamily: 'inherit'
      }}
    >
      {label}
    </button>
  )
}

function ToolbarButton({
  label,
  shortcut,
  tooltip,
  onClick,
  color
}: {
  label: string
  shortcut?: string
  tooltip?: string
  onClick: () => void
  color?: string
}): JSX.Element {
  return (
    <button
      onClick={(e) => {
        // 点击时添加脉冲动画
        e.currentTarget.style.animation = 'buttonPulse 0.4s ease-out'
        setTimeout(() => { e.currentTarget.style.animation = '' }, 400)
        onClick()
      }}
      style={{
        padding: '5px 14px',
        height: 34,
        background: 'none',
        border: '1px solid var(--border)',
        color: color ?? 'var(--text)',
        cursor: 'pointer',
        borderRadius: 0,
        fontSize: 13,
        letterSpacing: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 0.2s ease',
        fontFamily: 'inherit',
        position: 'relative'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-input)'
        e.currentTarget.style.borderColor = 'var(--text)'
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.boxShadow = '0 2px 8px var(--shadow)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
      title={tooltip ?? (shortcut ? `${label} (${shortcut})` : label)}
    >
      {label}
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
        height: 34,
        background: visible ? 'var(--bg-input)' : 'none',
        border: `1px solid ${visible ? 'var(--text)' : 'var(--border)'}`,
        color: visible ? 'var(--text)' : 'var(--text-secondary)',
        cursor: 'pointer',
        borderRadius: 0,
        fontSize: 13,
        letterSpacing: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all 0.2s ease',
        fontFamily: 'inherit'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-input)'
        e.currentTarget.style.borderColor = 'var(--text)'
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.boxShadow = '0 2px 8px var(--shadow)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = visible ? 'var(--bg-input)' : 'none'
        e.currentTarget.style.borderColor = visible ? 'var(--text)' : 'var(--border)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
      title={`切换${label}面板`}
    >
      {label}
    </button>
  )
}
