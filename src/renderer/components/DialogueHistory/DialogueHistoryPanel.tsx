import { useEffect, useRef } from 'react'
import { HistoryEntry } from '../../engine/render/DialogBox'

interface DialogueHistoryPanelProps {
  history: HistoryEntry[]
  currentIndex: number
  onSelect: (index: number) => void
  onClose: () => void
  onPlayAudio: (audioPath: string) => void
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

  const isEmpty = history.length === 0

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(2px)',
        color: '#e8e8f0',
        fontFamily: "'Source Han Serif SC', 'Noto Serif SC', 'Microsoft YaHei', serif",
        userSelect: 'none',
      }}
    >
      {/* 顶栏：左侧标题 + 右侧关闭按钮 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 28px',
          flexShrink: 0,
          borderBottom: '1px solid rgba(100,100,180,0.12)',
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 700, color: '#d4a843', letterSpacing: 6 }}>
          对话历史
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(100,100,180,0.2)',
            borderRadius: 6,
            color: '#99aabb',
            width: 36,
            height: 36,
            fontSize: 18,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,70,70,0.15)'
            e.currentTarget.style.borderColor = 'rgba(255,70,70,0.3)'
            e.currentTarget.style.color = '#ff6b6b'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.borderColor = 'rgba(100,100,180,0.2)'
            e.currentTarget.style.color = '#99aabb'
          }}
        >
          &#x2715;
        </button>
      </div>

      {/* 列表区域 */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 28px',
        }}
      >
        {isEmpty ? (
          <div
            style={{
              textAlign: 'center',
              color: '#556',
              fontSize: 14,
              padding: '60px 0',
              letterSpacing: 2,
            }}
          >
            暂无对话历史
          </div>
        ) : (
          history.map((entry, i) => {
            const isActive = i === currentIndex
            const isNarration = !entry.speaker || entry.speaker === '旁白'
            const hasAudio = !!entry.audioPath

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
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: isActive
                    ? 'rgba(212,168,67,0.10)'
                    : i % 2 === 0
                      ? 'rgba(255,255,255,0.02)'
                      : 'transparent',
                  border: isActive ? '1px solid rgba(212,168,67,0.25)' : '1px solid transparent',
                  marginBottom: 6,
                  transition: 'all 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
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
                {/* 左侧：序号 + 音频播放按钮 */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    minWidth: 32,
                    paddingTop: 2,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: isActive ? '#d4a843' : '#556',
                      fontFamily: "'JetBrains Mono', monospace",
                      lineHeight: 1,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {hasAudio && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (entry.audioPath) onPlayAudio(entry.audioPath)
                      }}
                      title="播放此段音频"
                      style={{
                        background: 'rgba(100,180,255,0.08)',
                        border: '1px solid rgba(100,180,255,0.15)',
                        borderRadius: 4,
                        color: '#6bf',
                        fontSize: 10,
                        width: 28,
                        height: 22,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'inherit',
                        outline: 'none',
                        padding: 0,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(100,180,255,0.18)'
                        e.currentTarget.style.borderColor = 'rgba(100,180,255,0.35)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(100,180,255,0.08)'
                        e.currentTarget.style.borderColor = 'rgba(100,180,255,0.15)'
                      }}
                    >
                      &#x25B6;
                    </button>
                  )}
                </div>

                {/* 右侧：说话者标签 + 文本内容 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* 说话者标识：区分角色对话与旁白 */}
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isNarration ? '#7777aa' : isActive ? '#d4a843' : '#c8b878',
                      letterSpacing: 1,
                      marginBottom: 3,
                    }}
                  >
                    {isNarration ? '-- 旁白 --' : entry.speaker}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: isNarration ? '#9898b8' : isActive ? '#d4a843' : '#c8ccd8',
                      lineHeight: 1.6,
                      wordBreak: 'break-word',
                    }}
                  >
                    {entry.text}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 底部提示 */}
      <div
        style={{
          fontSize: 11,
          color: '#556',
          textAlign: 'center',
          padding: '12px 20px',
          borderTop: '1px solid rgba(100,100,180,0.1)',
          flexShrink: 0,
          letterSpacing: 1,
        }}
      >
        点击条目跳转至对应对话 | Esc 关闭
      </div>
    </div>
  )
}
