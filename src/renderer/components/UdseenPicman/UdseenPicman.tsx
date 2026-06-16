import { useEffect, useRef, useState, useCallback } from 'react'

interface UdseenPicmanProps {
  imagePath: string
  imageName: string
  onClose: () => void
}

type ToolMode = 'magic-wand' | 'pan'

export function UdseenPicman({ imagePath, imageName, onClose }: UdseenPicmanProps): JSX.Element {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tool, setTool] = useState<ToolMode>('magic-wand')
  const [tolerance, setTolerance] = useState(30)
  const [hasSelection, setHasSelection] = useState(false)
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 })

  // 缩放与平移
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null)

  // 加载图片
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const dataUrl = await window.electronAPI?.readBinary(imagePath)
        if (cancelled || !dataUrl) return
        const img = new Image()
        img.onload = () => {
          if (cancelled) return
          imgRef.current = img
          setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
          setLoading(false)
          renderMain()
        }
        img.onerror = () => {
          if (cancelled) return
          setError('图片加载失败')
          setLoading(false)
        }
        img.src = dataUrl
      } catch {
        if (!cancelled) {
          setError('图片加载失败')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [imagePath])

  // 渲染主画布
  const renderMain = useCallback(() => {
    const img = imgRef.current
    const canvas = mainCanvasRef.current
    if (!img || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    ctx.drawImage(img, 0, 0)
  }, [])

  // 当图片尺寸变化时，自动适配缩放
  useEffect(() => {
    if (!imgNaturalSize.w || !imgNaturalSize.h) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const pad = 40
    const availableW = rect.width - pad * 2
    const availableH = rect.height - pad * 2
    const fitScale = Math.min(availableW / imgNaturalSize.w, availableH / imgNaturalSize.h, 1)
    setScale(fitScale)
    setOffset({ x: 0, y: 0 })
  }, [imgNaturalSize])

  // 获取画布坐标（client → canvas 像素坐标）
  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = mainCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    // CSS transform 已包含缩放+偏移，canvas.getBoundingClientRect() 返回的是变换后的位置
    const x = (clientX - rect.left) / scale
    const y = (clientY - rect.top) / scale
    return { x: Math.round(x), y: Math.round(y) }
  }, [scale])

  // ─── 魔棒工具 ──────────────────────────────────────────────
  const magicWand = useCallback((startX: number, startY: number) => {
    const canvas = mainCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!canvas || !maskCanvas) return

    const ctx = canvas.getContext('2d')
    const maskCtx = maskCanvas.getContext('2d')
    if (!ctx || !maskCtx) return

    const { width, height } = canvas
    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return

    const imageData = ctx.getImageData(0, 0, width, height)
    const { data } = imageData

    const mask = new Uint8Array(width * height)
    const visited = new Uint8Array(width * height)

    const targetIdx = (startY * width + startX) * 4
    const targetR = data[targetIdx]
    const targetG = data[targetIdx + 1]
    const targetB = data[targetIdx + 2]

    // BFS 四方向扩散
    const stack: [number, number][] = [[startX, startY]]
    while (stack.length > 0) {
      const [x, y] = stack.pop()!
      const i = y * width + x
      if (visited[i]) continue
      visited[i] = 1

      const pi = i * 4
      const dr = data[pi] - targetR
      const dg = data[pi + 1] - targetG
      const db = data[pi + 2] - targetB
      const dist = Math.sqrt(dr * dr + dg * dg + db * db)

      if (dist <= tolerance) {
        mask[i] = 255
        if (x > 0) stack.push([x - 1, y])
        if (x < width - 1) stack.push([x + 1, y])
        if (y > 0) stack.push([x, y - 1])
        if (y < height - 1) stack.push([x, y + 1])
      }
    }

    // 将蒙版绘制到 maskCanvas
    const maskImageData = maskCtx.createImageData(width, height)
    const maskPixels = maskImageData.data
    for (let i = 0; i < mask.length; i++) {
      const pi = i * 4
      if (mask[i] === 255) {
        // 半透明蓝色选区
        maskPixels[pi] = 59        // R
        maskPixels[pi + 1] = 130   // G
        maskPixels[pi + 2] = 246   // B
        maskPixels[pi + 3] = 100   // Alpha
      }
    }
    maskCtx.putImageData(maskImageData, 0, 0)
    setHasSelection(true)
  }, [tolerance])

  // ─── 取消选区 ──────────────────────────────────────────────
  const clearSelection = useCallback(() => {
    const canvas = maskCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSelection(false)
  }, [])

  // ─── 保存 ──────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const mainCanvas = mainCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!mainCanvas || !maskCanvas) return

    // 如果有选区，将选区部分保存为 PNG（背景透明）
    const hasMask = hasSelection
    const canvas = document.createElement('canvas')
    canvas.width = mainCanvas.width
    canvas.height = mainCanvas.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (hasMask) {
      // 读取蒙版
      const maskCtx = maskCanvas.getContext('2d')
      if (!maskCtx) return
      const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
      const maskPixels = maskData.data

      // 绘制原图，但只保留选区部分
      ctx.drawImage(mainCanvas, 0, 0)
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const pixels = imgData.data
      for (let i = 0; i < pixels.length / 4; i++) {
        const alpha = maskPixels[i * 4 + 3]
        if (alpha === 0) {
          pixels[i * 4 + 3] = 0 // 非选区全透明
        }
      }
      ctx.putImageData(imgData, 0, 0)
    } else {
      ctx.drawImage(mainCanvas, 0, 0)
    }

    const dataUrl = canvas.toDataURL('image/png')
    try {
      await window.electronAPI?.writeBinary(imagePath, dataUrl)
      // 刷新资源浏览器
      window.dispatchEvent(new CustomEvent('udseen-resource-refresh'))
    } catch {
      console.error('保存失败')
    }
  }, [imagePath, hasSelection])

  // ─── 鼠标事件 ──────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool === 'magic-wand') {
      const pt = clientToCanvas(e.clientX, e.clientY)
      if (!pt) return
      clearSelection()
      magicWand(pt.x, pt.y)
    } else if (tool === 'pan') {
      setDragStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y })
    }
  }, [tool, clientToCanvas, clearSelection, magicWand, offset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragStart) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    setOffset({ x: dragStart.ox + dx / scale, y: dragStart.oy + dy / scale })
  }, [dragStart, scale])

  const handleMouseUp = useCallback(() => {
    setDragStart(null)
  }, [])

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale((s) => Math.max(0.1, Math.min(10, s + delta)))
  }, [])

  // 检查是否为图片
  const ext = imageName.split('.').pop()?.toLowerCase() || ''
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#0d0d0d',
      color: '#e0e0e0',
      overflow: 'hidden',
      fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif",
      fontSize: 13
    }}>
      {/* ─── 顶部工具栏 ─────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        background: '#1a1a1a',
        borderBottom: '1px solid #333',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10
      }}>
        {/* 返回 */}
        <button
          onClick={onClose}
          style={toolBtnStyle}
          onMouseEnter={hoverBtn}
          onMouseLeave={leaveBtn}
          title="返回编辑器"
        >
          ← 返回
        </button>

        <div style={{ width: 1, height: 24, background: '#333', margin: '0 4px' }} />

        {/* 魔棒工具 */}
        <button
          onClick={() => setTool('magic-wand')}
          style={{
            ...toolBtnStyle,
            background: tool === 'magic-wand' ? '#3a3a3a' : undefined,
            border: tool === 'magic-wand' ? '1px solid #5a5a5a' : undefined
          }}
          title="魔棒工具 — 点击图片选择颜色相似区域"
        >
          <span style={{ fontSize: 16, marginRight: 4 }}>✨</span> 魔棒
        </button>

        {/* 平移工具 */}
        <button
          onClick={() => setTool('pan')}
          style={{
            ...toolBtnStyle,
            background: tool === 'pan' ? '#3a3a3a' : undefined,
            border: tool === 'pan' ? '1px solid #5a5a5a' : undefined
          }}
          title="平移视图"
        >
          <span style={{ fontSize: 16, marginRight: 4 }}>✋</span> 平移
        </button>

        <div style={{ width: 1, height: 24, background: '#333', margin: '0 4px' }} />

        {/* 容差滑块 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#888', fontSize: 12 }}>容差:</span>
          <input
            type="range"
            min={0}
            max={100}
            value={tolerance}
            onChange={(e) => setTolerance(Number(e.target.value))}
            style={{ width: 80, accentColor: '#3b82f6', cursor: 'pointer' }}
          />
          <span style={{ color: '#aaa', fontSize: 12, minWidth: 24 }}>{tolerance}</span>
        </div>

        <div style={{ width: 1, height: 24, background: '#333', margin: '0 4px' }} />

        {/* 取消选区 */}
        <button
          onClick={clearSelection}
          disabled={!hasSelection}
          style={{
            ...toolBtnStyle,
            opacity: hasSelection ? 1 : 0.4,
            cursor: hasSelection ? 'pointer' : 'default',
            border: '1px solid transparent'
          }}
          title="取消选区"
        >
          取消选区
        </button>

        {/* 保存 */}
        <button
          onClick={handleSave}
          title="保存修改"
          style={{
            ...toolBtnStyle,
            background: '#1e3a5f',
            border: '1px solid #2a5a8f',
            color: '#7ab7ff',
            marginLeft: 'auto'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#264b78' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#1e3a5f' }}
        >
          💾 保存
        </button>
      </div>

      {/* ─── 图片显示区域 ─────────────────────────────── */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          cursor: dragStart ? 'grabbing' : (tool === 'pan' ? 'grab' : 'crosshair')
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {loading && (
          <div style={{ color: '#888', fontSize: 14 }}>加载中...</div>
        )}
        {error && (
          <div style={{ color: '#ef4444', fontSize: 14 }}>{error}</div>
        )}
        {!loading && !error && !imageExts.includes(ext) && (
          <div style={{ color: '#888', fontSize: 14 }}>
            不支持的文件格式（.{ext}）
          </div>
        )}

        <div style={{
          position: 'relative',
          transform: `translate(${offset.x * scale}px, ${offset.y * scale}px)`,
          display: loading || error ? 'none' : undefined
        }}>
          {/* 主画布 */}
          <canvas
            ref={mainCanvasRef}
            style={{
              display: 'block',
              imageRendering: 'pixelated',
              width: imgNaturalSize.w * scale || undefined,
              height: imgNaturalSize.h * scale || undefined
            }}
          />
          {/* 选区蒙版画布 */}
          <canvas
            ref={maskCanvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
              width: imgNaturalSize.w * scale || undefined,
              height: imgNaturalSize.h * scale || undefined
            }}
          />
        </div>

        {/* 缩放指示 */}
        <div style={{
          position: 'absolute',
          bottom: 12,
          right: 16,
          color: '#666',
          fontSize: 11
        }}>
          {scale > 0 ? `${Math.round(scale * 100)}%` : ''}
        </div>
      </div>

      {/* ─── 底部状态栏 ─────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '4px 16px',
        background: '#1a1a1a',
        borderTop: '1px solid #333',
        fontSize: 11,
        color: '#666',
        flexShrink: 0
      }}>
        <span>UdseenPicman — {imageName}</span>
        <span>{imgNaturalSize.w > 0 ? `${imgNaturalSize.w} × ${imgNaturalSize.h}` : ''}</span>
        {hasSelection && <span style={{ color: '#3b82f6' }}>● 有选区</span>}
        <span style={{ marginLeft: 'auto' }}>
          滚轮缩放 · 魔棒点击选择 · 按 Shift+点击累加选区
        </span>
      </div>
    </div>
  )
}

// ─── 样式工具 ────────────────────────────────────────────────
const toolBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid transparent',
  color: '#ccc',
  padding: '5px 12px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'inherit',
  transition: 'background 0.1s, border-color 0.1s'
}

function hoverBtn(e: React.MouseEvent<HTMLButtonElement>): void {
  e.currentTarget.style.background = '#2a2a2a'
  e.currentTarget.style.borderColor = '#555'
}

function leaveBtn(e: React.MouseEvent<HTMLButtonElement>): void {
  e.currentTarget.style.background = 'transparent'
  e.currentTarget.style.borderColor = 'transparent'
}
