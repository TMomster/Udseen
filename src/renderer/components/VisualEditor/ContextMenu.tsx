/**
 * 通用右键菜单组件
 * 支持分隔线、快捷键提示、禁用状态
 */
import { useEffect, useRef, useCallback } from 'react'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  divider?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      onClose()
    }
  }, [onClose])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    // 延迟添加监听，避免触发自身右键
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleClickOutside, handleKeyDown])

  // 确保菜单不超出视口
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 32 - 16)

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 99999,
        background: '#252540',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        padding: '4px 0',
        minWidth: 180,
        backdropFilter: 'blur(8px)'
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.divider) {
          return (
            <div
              key={i}
              style={{
                height: 1,
                background: 'rgba(255,255,255,0.08)',
                margin: '4px 8px'
              }}
            />
          )
        }

        return (
          <div
            key={i}
            onClick={() => {
              if (!item.disabled) {
                item.onClick()
                onClose()
              }
            }}
            style={{
              padding: '6px 16px',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              fontSize: 12,
              color: item.danger ? '#ff6b6b' : item.disabled ? 'rgba(255,255,255,0.25)' : '#cdd6f4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              transition: 'background 0.1s',
              opacity: item.disabled ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.background = 'rgba(124,111,240,0.2)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 16 }}>
                {item.shortcut}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
