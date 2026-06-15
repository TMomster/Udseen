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
        background: 'linear-gradient(180deg, #1c1c30 0%, #1a1a2a 100%)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '7px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#8888aa',
          background: 'rgba(0,0,0,0.15)'
        }}
      >
        <span style={{ fontWeight: 600, letterSpacing: 0.3 }}>运行日志</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isRunning && (
            <span style={{ color: '#4caf50', fontSize: 11 }}>● 运行中</span>
          )}
          <button
            onClick={clearLogs}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#8888aa',
              cursor: 'pointer',
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 11,
              transition: 'all 0.12s'
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
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
          <div style={{ color: '#555', padding: 8, textAlign: 'center' }}>
            暂无日志，点击"运行"开始
          </div>
        ) : (
          logs.map((log, idx) => (
            <div
              key={idx}
              style={{
                padding: '2px 8px',
                color: log.type === 'error' ? '#f44336' : log.type === 'warning' ? '#ffa726' : '#ccc',
                borderBottom: '1px solid #2a2a3a'
              }}
            >
              <span style={{ color: '#666', marginRight: 8 }}>
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
