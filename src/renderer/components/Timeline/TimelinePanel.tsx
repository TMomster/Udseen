import { usePreviewStore } from '../../store/previewStore'

/**
 * 时间轴面板 - 显示运行时日志
 */
export function TimelinePanel(): JSX.Element {
  const { logs, isRunning, clearLogs } = usePreviewStore()

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '7px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'var(--text-secondary)',
          flexShrink: 0
        }}
      >
        <span style={{ letterSpacing: 0.5 }}>运行日志</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isRunning && (
            <span style={{ color: 'var(--success)', fontSize: 11 }}>● 运行中</span>
          )}
          <button
            onClick={clearLogs}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '3px 10px',
              fontSize: 11,
              transition: 'all 0.12s',
              fontFamily: 'inherit'
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--text)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
          >
            清除
          </button>
        </div>
      </div>

      {/* Log List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 4,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: 8, textAlign: 'center' }}>
            暂无日志
          </div>
        ) : (
          logs.map((log, idx) => (
            <div
              key={idx}
              style={{
                padding: '2px 8px',
                color: log.type === 'error' ? 'var(--error)' : log.type === 'warning' ? '#ffa726' : 'var(--text)',
                borderBottom: '1px solid var(--border)'
              }}
            >
              <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
