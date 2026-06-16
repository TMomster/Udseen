import { useState, useCallback, useEffect } from 'react'
import { useSettingsStore } from '../../store/settingsStore'

interface StageSettingsPanelProps {
  currentSpeed: 'slow' | 'medium' | 'fast'
  onSpeedChange: (speed: 'slow' | 'medium' | 'fast') => void
  onClose: () => void
  /** 是否以全页面菜单模式渲染（而非居中弹窗） */
  fullPage?: boolean
}

type TabId = 'text' | 'audio' | 'shortcuts'

const SPEED_OPTIONS: Array<{ value: 'slow' | 'medium' | 'fast'; label: string; labelCn: string }> = [
  { value: 'slow', label: 'Slow', labelCn: '慢' },
  { value: 'medium', label: 'Medium', labelCn: '中' },
  { value: 'fast', label: 'Fast', labelCn: '快' },
]

const TABS: { id: TabId; label: string }[] = [
  { id: 'text', label: '文本' },
  { id: 'audio', label: '音频' },
  { id: 'shortcuts', label: '快捷键' },
]

// ---- 通用样式 ----

const panelBase: React.CSSProperties = {
  width: 440,
  maxHeight: '80vh',
  padding: '28px 32px',
  background: 'rgba(18, 18, 32, 0.96)',
  border: '1px solid rgba(100, 100, 180, 0.25)',
  borderRadius: 14,
  boxShadow: '0 10px 50px rgba(0,0,0,0.7)',
  color: '#e8e8f0',
  fontFamily: "'Source Han Serif SC', 'Noto Serif SC', 'Microsoft YaHei', serif",
  userSelect: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#99aabb',
  letterSpacing: 0.5,
  marginBottom: 8,
}

// ---- Tab 内容组件 ----

function TabText({
  currentSpeed,
  onSpeedChange,
}: {
  currentSpeed: 'slow' | 'medium' | 'fast'
  onSpeedChange: (v: 'slow' | 'medium' | 'fast') => void
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 文本播放速度 */}
      <div>
        <div style={labelStyle}>文本播放速度</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {SPEED_OPTIONS.map((opt) => {
            const isActive = currentSpeed === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onSpeedChange(opt.value)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  border: isActive ? '1px solid #d4a843' : '1px solid rgba(100,100,180,0.25)',
                  borderRadius: 8,
                  background: isActive ? 'rgba(212, 168, 67, 0.15)' : 'rgba(255,255,255,0.04)',
                  color: isActive ? '#d4a843' : '#889',
                  fontSize: 15,
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  letterSpacing: 2,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#aab' }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#889' }
                }}
              >
                <div style={{ fontWeight: 600 }}>{opt.labelCn}</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{opt.label}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TabAudio(): JSX.Element {
  const audioVolume = useSettingsStore(s => s.audioVolume)
  const updateSetting = useSettingsStore(s => s.updateSetting)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={labelStyle}>BGM / SFX 音量</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="range" min={0} max={100} step={5}
            value={audioVolume}
            onChange={(e) => updateSetting('audioVolume', parseInt(e.target.value))}
            style={{ flex: 1, accentColor: '#d4a843', cursor: 'pointer' }} />
          <span style={{ fontSize: 12, color: '#aab', minWidth: 36, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>
            {audioVolume}
          </span>
        </div>
      </div>
    </div>
  )
}

function TabShortcuts(): JSX.Element {
  const shortcuts: { key: string; desc: string }[] = [
    { key: 'Esc', desc: '打开/关闭菜单' },
    { key: 'A', desc: '切换自动播放' },
    { key: 'Space / ↓', desc: '推进对话' },
    { key: '↑', desc: '回到上一条对话' },
    { key: 'Ctrl (按住)', desc: '跳过模式' },
    { key: 'F11', desc: '切换全屏' },
    { key: 'F3', desc: '调试面板' },
    { key: 'Ctrl+Shift+B', desc: '快速重启剧本' },
    { key: '鼠标滚轮 ↑', desc: '打开对话历史面板' },
    { key: '鼠标右键', desc: '切换 UI 显隐' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {shortcuts.map((sc, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 8px', borderRadius: 4,
          background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
        }}>
          <kbd style={{
            display: 'inline-block', padding: '2px 10px',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4, fontSize: 12, color: '#d4a843',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, minWidth: 80, textAlign: 'center',
          }}>
            {sc.key}
          </kbd>
          <span style={{ fontSize: 12, color: '#99aabb', marginLeft: 16 }}>{sc.desc}</span>
        </div>
      ))}
    </div>
  )
}

// ---- 主面板 ----

/**
 * 舞台设置面板 — 全屏演出时按 Esc 弹出的游戏风格设置界面
 * 包含：文本速度 / 音量控制 / 快捷键表
 */
export function StageSettingsPanel({ currentSpeed, onSpeedChange, onClose, fullPage }: StageSettingsPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('text')
  const [enterAnim, setEnterAnim] = useState(false)

  // 进入动画
  useEffect(() => {
    requestAnimationFrame(() => setEnterAnim(true))
  }, [])

  // 全页面菜单模式
  if (fullPage) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(12, 12, 28, 0.98)',
          color: '#e8e8f0',
          fontFamily: "'Source Han Serif SC', 'Noto Serif SC', 'Microsoft YaHei', serif",
          opacity: enterAnim ? 1 : 0,
          transition: 'opacity 0.25s ease',
          userSelect: 'none',
        }}
      >
        {/* 顶栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 24px',
            borderBottom: '1px solid rgba(100,100,180,0.15)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(100,100,180,0.2)',
              borderRadius: 6,
              color: '#d4a843',
              fontSize: 13,
              padding: '6px 18px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              outline: 'none',
              letterSpacing: 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,168,67,0.15)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
          >
            ← 返回游戏
          </button>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#d4a843', letterSpacing: 6, marginLeft: 20 }}>
            菜单
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: '#556', letterSpacing: 0.5 }}>
            Esc 关闭菜单
          </span>
        </div>

        {/* 主体内容 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            padding: '24px 32px',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              width: 520,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            {/* Tab 栏 */}
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
              {TABS.map((tab) => {
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      flex: 1, padding: '9px 0', fontSize: 14,
                      border: 'none', borderRadius: 6,
                      background: active ? 'rgba(212,168,67,0.15)' : 'transparent',
                      color: active ? '#d4a843' : '#778',
                      fontWeight: active ? 600 : 400,
                      cursor: 'pointer', outline: 'none',
                      transition: 'all 0.15s',
                      fontFamily: 'inherit', letterSpacing: 2,
                    }}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Tab 内容 */}
            <div style={{ minHeight: 180, padding: '8px 0' }}>
              {activeTab === 'text' && <TabText currentSpeed={currentSpeed} onSpeedChange={onSpeedChange} />}
              {activeTab === 'audio' && <TabAudio />}
              {activeTab === 'shortcuts' && <TabShortcuts />}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 原始居中弹窗模式（兼容旧调用）
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        ...panelBase,
        opacity: enterAnim ? 1 : 0,
        transform: enterAnim ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      }}
    >
      {/* 标题 */}
      <div style={{
        fontSize: 22, fontWeight: 700, textAlign: 'center',
        color: '#d4a843', letterSpacing: 6, paddingBottom: 8,
        borderBottom: '1px solid rgba(100,100,180,0.15)',
      }}>
        设置
      </div>

      {/* Tab 栏 */}
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '7px 0', fontSize: 13,
                border: 'none', borderRadius: 6,
                background: active ? 'rgba(212,168,67,0.15)' : 'transparent',
                color: active ? '#d4a843' : '#778',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer', outline: 'none',
                transition: 'all 0.15s',
                fontFamily: 'inherit', letterSpacing: 2,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab 内容 */}
      <div style={{ minHeight: 100, padding: '4px 0' }}>
        {activeTab === 'text' && <TabText currentSpeed={currentSpeed} onSpeedChange={onSpeedChange} />}
        {activeTab === 'audio' && <TabAudio />}
        {activeTab === 'shortcuts' && <TabShortcuts />}
      </div>

      {/* 底部提示 */}
      <div style={{
        fontSize: 11, color: '#556', textAlign: 'center',
        paddingTop: 10, borderTop: '1px solid rgba(100,100,180,0.1)',
      }}>
        Esc 关闭设置 | 滚轮 ↑ 对话历史
      </div>
    </div>
  )
}
