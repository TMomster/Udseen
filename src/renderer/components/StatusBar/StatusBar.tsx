import { useState, useEffect, useRef, useCallback } from 'react'
import { useStatusStore } from '../../store/statusStore'
import { useProjectStore } from '../../store/projectStore'

/**
 * 底部状态栏
 * - 显示即时日志（已保存、打开文件等）
 * - 3 秒无新日志后自动切换到 "就绪 - {文件名}"
 */
export function StatusBar(): JSX.Element {
  const logs = useStatusStore((s) => s.logs)
  const filePath = useProjectStore((s) => s.filePath)

  const [displayMessage, setDisplayMessage] = useState('')
  const [isLog, setIsLog] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevLogsLen = useRef(logs.length)

  const getReadyMessage = useCallback(() => {
    const name = filePath ? filePath.split(/[/\\]/).pop()! : '新建脚本'
    return `就绪 - ${name}`
  }, [filePath])

  // 初始化 & 文件变化时更新就绪消息
  useEffect(() => {
    if (!isLog) {
      setDisplayMessage(getReadyMessage())
    }
  }, [getReadyMessage, isLog])

  // 首次挂载
  useEffect(() => {
    setDisplayMessage(getReadyMessage())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 新日志到达
  useEffect(() => {
    if (logs.length > prevLogsLen.current) {
      const latest = logs[logs.length - 1]
      setDisplayMessage(latest)
      setIsLog(true)

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setIsLog(false)
        setDisplayMessage(getReadyMessage())
      }, 3000)
    }
    prevLogsLen.current = logs.length
  }, [logs, getReadyMessage])

  // 卸载清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div
      style={{
        height: 28,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 28px',
        gap: 8,
        background: 'var(--header-bg)',
        borderTop: '1px solid var(--border)',
        fontSize: 12,
        color: 'var(--text-secondary)',
        userSelect: 'none',
        overflow: 'hidden'
      }}
    >
      {/* 状态指示点 */}
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: isLog ? '#60b0ff' : 'var(--success)',
          flexShrink: 0,
          transition: 'background 0.3s ease, box-shadow 0.3s ease',
          boxShadow: isLog
            ? '0 0 6px rgba(96,176,255,0.5)'
            : '0 0 4px rgba(96,176,96,0.3)'
        }}
      />

      {/* 消息文本 — 带淡入动画 */}
      <span
        key={displayMessage}
        style={{
          opacity: 1,
          transition: 'opacity 0.15s ease'
        }}
      >
        {displayMessage}
      </span>
    </div>
  )
}
