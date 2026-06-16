import { useEffect, useState, useRef } from 'react'
import { useSettingsStore } from '../../store/settingsStore'

interface SettingsProps {
  onBack: () => void
}

/** 开关组件 */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-block',
        width: 44,
        height: 24,
        cursor: 'pointer',
        flexShrink: 0
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: checked ? 'var(--accent)' : 'var(--bg-input)',
          border: '1px solid var(--border)',
          transition: 'all 0.25s',
          display: 'flex',
          alignItems: 'center',
          padding: '0 3px'
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            background: checked ? '#fff' : 'var(--text-muted)',
            transition: 'all 0.25s',
            transform: checked ? 'translateX(20px)' : 'translateX(0)'
          }}
        />
      </span>
    </label>
  )
}

/** 卡片 */
function Card({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--text-muted)',
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 10,
          paddingLeft: 2
        }}
      >
        {title}
      </div>
      <div
        style={{
          padding: '16px 20px',
          background: 'var(--panel-bg)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** 设置行 */
function SettingRow({
  label,
  desc,
  children
}: {
  label: string
  desc?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div style={{ padding: '6px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {label}
        </span>
        {children}
      </div>
      {desc && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            marginTop: 4,
            maxWidth: 420
          }}
        >
          {desc}
        </div>
      )}
    </div>
  )
}

/** 步进控件 */
function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  suffix?: string
}): JSX.Element {
  const btn: React.CSSProperties = {
    width: 28,
    height: 28,
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    userSelect: 'none'
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <button style={btn} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span
        style={{
          minWidth: 36,
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--text)',
          fontFamily: "'JetBrains Mono', monospace"
        }}
      >
        {value}
      </span>
      <button style={btn} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
      {suffix && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{suffix}</span>}
    </div>
  )
}

/** 数字输入 */
function NumInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) {
            if (min !== undefined && v < min) return
            if (max !== undefined && v > max) return
            onChange(v)
          }
        }}
        style={{
          width: 72,
          padding: '4px 8px',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          fontSize: 13,
          fontFamily: 'inherit',
          outline: 'none',
          textAlign: 'right'
        }}
        step={step}
        min={min}
        max={max}
      />
      {suffix && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{suffix}</span>}
    </div>
  )
}

/** 选择框 */
function Select({
  value,
  options,
  onChange
}: {
  value: number | string
  options: { label: string; value: number | string }[]
  onChange: (v: number | string) => void
}): JSX.Element {
  return (
    <select
      value={String(value)}
      onChange={(e) => {
        const opt = options.find((o) => String(o.value) === e.target.value)
        if (opt) onChange(opt.value)
      }}
      style={{
        padding: '4px 8px',
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        fontSize: 13,
        fontFamily: 'inherit',
        outline: 'none',
        cursor: 'pointer',
        flexShrink: 0
      }}
    >
      {options.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

/** 滑块 */
function Slider({
  value,
  onChange,
  min,
  max,
  step,
  suffix
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  suffix?: string
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step || 1}
        style={{ width: 100, cursor: 'pointer', accentColor: 'var(--accent)' }}
      />
      <span
        style={{
          minWidth: 28,
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--text)',
          fontFamily: "'JetBrains Mono', monospace"
        }}
      >
        {value}
      </span>
      {suffix && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{suffix}</span>}
    </div>
  )
}

export function Settings({ onBack }: SettingsProps): JSX.Element {
  const store = useSettingsStore()
  const [enterAnim, setEnterAnim] = useState(false)
  const [exitAnim, setExitAnim] = useState(false)
  const cardRefs = useRef(new Map<string, HTMLElement>())

  // 进入渐变
  useEffect(() => {
    requestAnimationFrame(() => setEnterAnim(true))
  }, [])

  useEffect(() => {
    if (!store.loaded) {
      store.loadConfig()
    }
  }, [store.loaded, store.loadConfig])



  const handleBack = (): void => {
    setExitAnim(true)
    setTimeout(() => {
      store.clearRestartFlag()
      onBack()
    }, 200)
  }

  const [selectingDir, setSelectingDir] = useState(false)

  const handleAddVirtualPath = async (): Promise<void> => {
    setSelectingDir(true)
    try {
      const dir = await window.electronAPI?.selectDirectory()
      if (dir) {
        await store.addVirtualPath(dir)
      }
    } finally {
      setSelectingDir(false)
    }
  }

  const contentOpacity = enterAnim && !exitAnim ? 1 : 0

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        color: 'var(--text)',
        overflow: 'hidden',
        opacity: exitAnim ? 0 : 1,
        transition: 'opacity 0.2s ease'
      }}
    >
      {/* ── 标题栏 ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 52,
          padding: '0 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          gap: 10
        }}
      >
        <button
          onClick={handleBack}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '5px 14px',
            fontSize: 13,
            fontFamily: 'inherit',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-input)'
            e.currentTarget.style.color = 'var(--text)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          ← 返回
        </button>
        <span style={{ fontSize: 15, letterSpacing: 1.5, fontWeight: 300 }}>设置</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={() => window.electronAPI?.minimizeWindow()}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px 10px',
              fontSize: 13,
              fontFamily: 'inherit',
              lineHeight: 1
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            title="最小化"
          >
            —
          </button>
          <button
            onClick={() => window.electronAPI?.closeWindow()}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px 10px',
              fontSize: 13,
              fontFamily: 'inherit',
              lineHeight: 1
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244,67,54,0.15)'; e.currentTarget.style.borderColor = '#f44336'; e.currentTarget.style.color = '#f44336' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            title="关闭"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── 设置内容 ── */}
      <div
        data-settings-content
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px 24px',
          opacity: contentOpacity,
          transition: 'opacity 0.3s ease'
        }}
      >
        {!store.loaded ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载配置中...</div>
        ) : (
          <div
            style={{
              maxWidth: 680,
              margin: '0 auto'
            }}
          >
            {/* ── 编辑器 ── */}
            <Card title="编辑器">
              <SettingRow
                label="编辑器字体"
                desc="代码编辑器使用的字体样式"
              >
                <input
                  type="text"
                  value={store.fontFamily}
                  onChange={(e) => store.updateSetting('fontFamily', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none',
                    minWidth: 200
                  }}
                />
              </SettingRow>
              <SettingRow
                label="编辑器字号"
                desc="代码编辑器中的字号大小"
              >
                <Stepper
                  value={store.fontSize}
                  onChange={(v) => store.updateSetting('fontSize', v)}
                  min={10}
                  max={40}
                  suffix="px"
                />
              </SettingRow>
              <SettingRow
                label="自动保存间隔"
                desc="自动保存当前正在编辑的脚本文件，设为「关闭」停用"
              >
                <Select
                  value={store.autoSaveInterval}
                  options={[
                    { label: '关闭', value: 0 },
                    { label: '30 秒', value: 30 },
                    { label: '1 分钟', value: 60 },
                    { label: '2 分钟', value: 120 },
                    { label: '5 分钟', value: 300 },
                    { label: '10 分钟', value: 600 }
                  ]}
                  onChange={(v) => store.updateSetting('autoSaveInterval', v as number)}
                />
              </SettingRow>
            </Card>

            {/* ── 预览与运行 ── */}
            <Card title="预览与运行">
              <SettingRow
                label="自动播放延迟"
                desc="无音频时每 3 个字符的延迟时间"
              >
                <NumInput
                  value={store.autoPlayCharDelay}
                  onChange={(v) => store.updateSetting('autoPlayCharDelay', v)}
                  min={100}
                  max={10000}
                  step={100}
                  suffix="ms"
                />
              </SettingRow>
              <SettingRow
                label="自动播放最短延迟"
                desc="自动模式下的最小等待时间"
              >
                <NumInput
                  value={store.autoPlayMinDelay}
                  onChange={(v) => store.updateSetting('autoPlayMinDelay', v)}
                  min={100}
                  max={10000}
                  step={100}
                  suffix="ms"
                />
              </SettingRow>
              <SettingRow
                label="音频额外延时"
                desc="音频播放完毕后额外等待的时间"
              >
                <NumInput
                  value={store.audioExtraDelay}
                  onChange={(v) => store.updateSetting('audioExtraDelay', v)}
                  min={0}
                  max={10000}
                  step={100}
                  suffix="ms"
                />
              </SettingRow>
              <SettingRow
                label="帧率限制"
                desc="Udseen演出渲染的帧率限制，暂不支持无限制"
              >
                  <Select
                    value={store.fpsLimit}
                    options={[
                      { label: '与显示器同步', value: 0 },
                      { label: '25 FPS', value: 25 },
                      { label: '30 FPS', value: 30 },
                      { label: '60 FPS', value: 60 },
                      { label: '90 FPS', value: 90 },
                      { label: '120 FPS', value: 120 },
                      { label: '160 FPS', value: 160 }
                    ]}
                    onChange={(v) => store.updateSetting('fpsLimit', v as number)}
                  />
                </SettingRow>
              <SettingRow
                label="开场动画效果"
                desc="Udseen启动动画的播放速度"
              >
                <Select
                  value={store.openingSpeed}
                  options={[
                    { label: '标准', value: 'standard' },
                    { label: '快', value: 'fast' }
                  ]}
                  onChange={(v) => store.updateSetting('openingSpeed', v as 'standard' | 'fast')}
                />
                </SettingRow>
              </Card>

            {/* ── 音频 ── */}
            <div ref={(el) => { if (el) cardRefs.current.set('audio', el) }}>
              <Card title="音频" searchable="音频 声音 音量">
                <SettingRow
                  label="音频播放器音量"
                  desc="BGM / SFX 的播放音量上限"
                  searchLabel="音频 音量 audioVolume"
                >
                  <Slider
                    value={store.audioVolume}
                    onChange={(v) => store.updateSetting('audioVolume', v)}
                    min={0}
                    max={100}
                    step={5}
                    suffix="/100"
                  />
                </SettingRow>
              </Card>
            </div>

            {/* ── 显示 ── */}
            <Card title="显示">
              <SettingRow
                label="GPU 硬件加速"
                desc="使用设备GPU辅助渲染，降低CPU压力，如果您的设备支持独立显卡尤其建议开启"
              >
                <Toggle
                  checked={store.gpuAcceleration}
                  onChange={(v) => store.setGpuAcceleration(v)}
                />
              </SettingRow>
              {store.needRestart && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(200,200,200,0.08)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                    marginTop: 4
                  }}
                >
                  GPU 加速设置需要重启应用才能生效。请保存当前工作后手动重启 Udseen。
                </div>
              )}
            </Card>

            {/* ── 资源管理 ── */}
            <Card title="资源管理">
              <SettingRow
                label="资源目录"
                desc="默认资源文件夹路径（相对于应用根目录）"
              >
                <input
                  type="text"
                  value={store.resourceDir}
                  onChange={(e) => store.updateSetting('resourceDir', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none',
                    minWidth: 200
                  }}
                />
              </SettingRow>

                {/* 虚拟资源路径 */}
                <div style={{ marginTop: 14 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 6
                    }}
                  >
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      虚拟资源路径
                    </span>
                    <button
                      onClick={handleAddVirtualPath}
                      disabled={selectingDir}
                      style={{
                        padding: '3px 12px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        cursor: selectingDir ? 'default' : 'pointer',
                        fontSize: 12,
                        fontFamily: 'inherit',
                        opacity: selectingDir ? 0.5 : 1
                      }}
                    >
                      + 添加目录
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>
                    添加额外的资源目录。程序会将这些目录与默认资源目录合并解析。
                    如果某个路径是另一个路径的子路径，该条目将被标记为无效。
                  </div>
                  {store.virtualPaths.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>
                      暂无虚拟路径
                    </div>
                  )}
                  {store.virtualPaths.map((vp, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '5px 8px',
                        marginBottom: 3,
                        background: vp.valid
                          ? 'var(--bg-input)'
                          : 'rgba(244,67,54,0.08)',
                        border: `1px solid ${vp.valid ? 'var(--border)' : 'rgba(244,67,54,0.3)'}`,
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', monospace"
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: vp.valid ? '#4caf50' : '#f44336'
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          color: vp.valid ? 'var(--text)' : 'var(--text-muted)',
                          textDecoration: vp.valid ? 'none' : 'line-through',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={vp.path}
                      >
                        {vp.path}
                      </span>
                      {!vp.valid && vp.reason && (
                        <span style={{ color: '#f44336', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {vp.reason}
                        </span>
                      )}
                      <button
                        onClick={async () => { await store.removeVirtualPath(idx) }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: 13,
                          padding: '0 4px',
                          flexShrink: 0,
                          fontFamily: 'inherit'
                        }}
                        title="移除"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </Card>

            {/* ── 应用按钮 ── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
              <button
                onClick={() => {
                  // 设置已实时保存，此按钮仅用于视觉确认
                }}
                style={{
                  padding: '8px 28px',
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#fff',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  letterSpacing: 1,
                  transition: 'opacity 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                应用
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
