import { useEffect, useRef } from 'react'
import { HistoryEntry } from '../../engine/render/DialogBox'

interface DialogueHistoryPanelProps {
  history: HistoryEntry[]
  currentIndex: number
  onSelect: (index: number) => void
  onClose: () => void
  onPlayAudio: (audioPath: string) => void
}

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 400,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.65)',
  userSelect: 'none',
}

const PANEL_STYLE: React.CSSProperties = {
  width: 520,
  maxHeight: '70vh',
  background: 'rgba(18, 18, 32, 0.97)',
  border: '1px solid rgba(100, 100, 180, 0.25)',
  borderRadius: 14,
  boxShadow: '0 10px 50px rgba(0,0,0,0.7)',
  color: '#e8e8f0',
  fontFamily: "'Source Han Serif SC', 'Noto Serif SC', 'Microsoft YaHei', serif",
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

/** 将条目格式化为预览文本（最多一行） */
function formatEntryText(entry: HistoryEntry, maxLen = 30): string {
  const speaker = entry.speaker ?? '旁白'
  const text = entry.text.length > maxLen ? entry.text.slice(0, maxLen) + '…' : entry.text
  return `${speaker}：${text}`
}

export function DialogueHistoryPanel({
  history,
  currentIndex,
  onSelect,
  onClose,
  onPlayAudio,
}: DialogueHistoryPanelProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const activeItemRef = useRef<HTMLDivElement>(null)

  // 进入时自动滚动到当前条目
  useEffect(() => {
    if (activeItemRef.current && listRef.current) {
      const list = listRef.current
      const item = activeItemRef.current
      const itemTop = item.offsetTop - list.offsetTop
      const itemBottom = itemTop + item.offsetHeight
      if (itemTop < list.scrollTop) {
        list.scrollTop = itemTop - 20
      } else if (itemBottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = itemBottom - list.clientHeight + 20
      }
    }
  }, [])

  const entries = history.length === 0
    ? [{ speaker: null, text: '(暂无对话历史)', avatar: undefined, audioPath: undefined }]
    : history

  return (
    <div style={OVERLAY_STYLE} onClick={onClose}>
      <div
        style={PANEL_STYLE}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px 12px',
            borderBottom: '1px solid rgba(100,100,180,0.15)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700, color: '#d4a843', letterSpacing: 4 }}>
            对话历史
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(100,100,180,0.2)',
              borderRadius: 6,
              color: '#99aabb',
              fontSize: 12,
              padding: '4px 12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          >
            关闭 (Esc)
          </button>
        </div>

        {/* 列表 */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 12px',
          }}
        >
          {entries.map((entry, i) => {
            const isActive = i === currentIndex
            const hasAudio = !!entry.audioPath
            const displayText = formatEntryText(entry)

            return (
              <div
                key={i}
                ref={isActive ? activeItemRef : undefined}
                onClick={() => {
                  onSelect(i)
                  onClose()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  cursor: history.length > 0 ? 'pointer' : 'default',
                  background: isActive
                    ? 'rgba(212,168,67,0.12)'
                    : i % 2 === 0
                      ? 'rgba(255,255,255,0.02)'
                      : 'transparent',
                  border: isActive ? '1px solid rgba(212,168,67,0.3)' : '1px solid transparent',
                  marginBottom: 4,
                  transition: 'all 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive && history.length > 0) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background =
                      i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
                  }
                }}
              >
                {/* 序号 */}
                <span
                  style={{
                    fontSize: 10,
                    color: isActive ? '#d4a843' : '#556',
                    minWidth: 22,
                    textAlign: 'center',
                    fontFamily: "'JetBrains Mono', monospace",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>

                {/* 文本内容 */}
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: isActive ? '#d4a843' : '#99aabb',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {displayText}
                </span>

                {/* 播放音频按钮 */}
                {hasAudio && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (entry.audioPath) onPlayAudio(entry.audioPath)
                    }}
                    title="播放此段音频"
                    style={{
                      background: 'rgba(100,180,255,0.1)',
                      border: '1px solid rgba(100,180,255,0.2)',
                      borderRadius: 4,
                      color: '#6bf',
                      fontSize: 11,
                      padding: '2px 8px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  >
                    ▶ 播放
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* 底部提示 */}
        <div
          style={{
            fontSize: 11,
            color: '#556',
            textAlign: 'center',
            padding: '10px 20px',
            borderTop: '1px solid rgba(100,100,180,0.1)',
            flexShrink: 0,
          }}
        >
          点击条目跳转至对应对话 | Esc 关闭
        </div>
      </div>
    </div>
  )
}
