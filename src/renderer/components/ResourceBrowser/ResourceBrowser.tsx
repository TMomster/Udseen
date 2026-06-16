import { useEffect, useState, useCallback, useRef } from 'react'
import { useAssetStore } from '../../store/assetStore'
import { useSettingsStore } from '../../store/settingsStore'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  fullPath: string
  /** null = 主目录, string = 虚拟路径来源（显示用） */
  virtualSource: string | null
}

/** 用于操作的文件信息（可能来自虚拟路径，需区分来源） */
interface OperationEntry extends FileEntry {
  isVirtual: boolean
}

interface ResourceBrowserProps {
  /** 当从资源区拖拽资源到编辑器时回调 */
  onResourceDrag?: (path: string, type: 'image' | 'audio') => void
}

export function ResourceBrowser({ onResourceDrag }: ResourceBrowserProps): JSX.Element {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [publicDir, setPublicDir] = useState('')
  const [loading, setLoading] = useState(true)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry | null } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  // 解析相对路径，显示面包屑
  const pathParts = currentPath ? currentPath.replace(/\\/g, '/').split('/').filter(Boolean) : []

  const loadDir = useCallback(async (dirPath: string) => {
    if (!window.electronAPI) return
    try {
      setLoading(true)
      const baseDir = publicDir || await window.electronAPI.getPublicDir()
      if (!publicDir) setPublicDir(baseDir)

      // 获取有效的虚拟路径
      const { virtualPaths } = useSettingsStore.getState()
      const validVirtualPaths = virtualPaths.filter(v => v.valid && v.path).map(v => v.path)

      const allEntries: FileEntry[] = []
      const seenNames = new Set<string>()

      // 1. 读取主目录
      const primaryTarget = dirPath ? `${baseDir}/${dirPath}` : baseDir
      try {
        const primaryEntries = await window.electronAPI.readDir(primaryTarget)
        for (const e of primaryEntries) {
          if (e.name.startsWith('.')) continue
          seenNames.add(e.name)
          allEntries.push({
            name: e.name,
            path: dirPath ? `${dirPath}/${e.name}` : e.name,
            isDirectory: e.isDirectory,
            fullPath: `${baseDir}/${dirPath ? dirPath + '/' : ''}${e.name}`,
            virtualSource: null
          })
        }
      } catch (err) {
        console.error('加载主资源目录失败:', err)
      }

      // 2. 读取每个虚拟路径（同名文件以主目录优先，虚拟路径不覆盖）
      for (const vp of validVirtualPaths) {
        const vpTarget = dirPath ? `${vp}/${dirPath}` : vp
        try {
          const vpEntries = await window.electronAPI.readDir(vpTarget)
          for (const e of vpEntries) {
            if (e.name.startsWith('.')) continue
            if (seenNames.has(e.name)) continue // 主目录优先
            seenNames.add(e.name)
            allEntries.push({
              name: e.name,
              path: dirPath ? `${dirPath}/${e.name}` : e.name,
              isDirectory: e.isDirectory,
              fullPath: `${vp}/${dirPath ? dirPath + '/' : ''}${e.name}`,
              virtualSource: vp
            })
          }
        } catch {
          // 虚拟路径可能没有该子目录，静默跳过
        }
      }

      // 目录排前，按名称排序
      allEntries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(allEntries)
    } catch (err) {
      console.error('加载资源目录失败:', err)
    } finally {
      setLoading(false)
    }
  }, [publicDir])

  useEffect(() => {
    loadDir(currentPath)
  }, [currentPath, loadDir])

  // 刷新
  const refresh = useCallback(() => loadDir(currentPath), [currentPath, loadDir])

  // 进入目录
  const enterDir = (entry: FileEntry) => {
    if (entry.isDirectory) {
      setCurrentPath(entry.path)
    }
  }

  // 返回上级
  const goUp = () => {
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    setCurrentPath(parts.join('/'))
  }

  // 上下文菜单
  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry | null) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }

  const closeContextMenu = () => setContextMenu(null)

  // 删除
  const handleDelete = async (entry: FileEntry) => {
    if (!window.electronAPI) return
    closeContextMenu()
    const confirmMsg = `确定删除 "${entry.name}"？`
    if (!window.confirm(confirmMsg)) return
    try {
      if (entry.isDirectory) {
        await window.electronAPI.deleteDir(entry.fullPath)
      } else {
        await window.electronAPI.deleteFile(entry.fullPath)
      }
      refresh()
    } catch (err) {
      console.error('删除失败:', err)
    }
  }

  // ---- 悬浮资源预览 ----
  const [preview, setPreview] = useState<{
    visible: boolean
    x: number
    y: number
    entry: FileEntry | null
    dataUrl?: string
    loading?: boolean
    error?: string
  }>({ visible: false, x: 0, y: 0, entry: null })
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewCacheRef = useRef<Map<string, string>>(new Map())

  const hidePreview = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
    setPreview({ visible: false, x: 0, y: 0, entry: null })
  }, [])

  const showPreview = useCallback(async (entry: FileEntry, clientX: number, clientY: number) => {
    const ext = entry.name.split('.').pop()?.toLowerCase() || ''
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
    const audioExts = ['mp3', 'ogg', 'opus', 'wav', 'aac', 'm4a', 'flac']
    const isImage = imageExts.includes(ext)
    const isAudio = audioExts.includes(ext)
    if (!isImage && !isAudio) return

    // 计算预览窗口位置（鼠标右下方，防出边界）
    let left = clientX + 15
    let top = clientY + 15
    const pw = isImage ? 260 : 200
    const ph = isImage ? 220 : 60
    if (left + pw > window.innerWidth) left = clientX - pw - 15
    if (top + ph > window.innerHeight) top = window.innerHeight - ph - 15
    left = Math.max(10, left)
    top = Math.max(10, top)

    // 先显示加载状态
    setPreview({ visible: true, x: left, y: top, entry, loading: true })

    try {
      if (isImage) {
        // 检查缓存
        const cached = previewCacheRef.current.get(entry.fullPath)
        if (cached) {
          setPreview({ visible: true, x: left, y: top, entry, dataUrl: cached })
          return
        }
        const dataUrl = await window.electronAPI.readBinary(entry.fullPath)
        previewCacheRef.current.set(entry.fullPath, dataUrl)
        setPreview({ visible: true, x: left, y: top, entry, dataUrl })
      } else {
        // 音频：仅显示文件名
        setPreview({ visible: true, x: left, y: top, entry, loading: false })
      }
    } catch {
      setPreview({ visible: true, x: left, y: top, entry, error: '加载失败' })
    }
  }, [])

  // 重命名
  const startRename = (entry: FileEntry) => {
    closeContextMenu()
    setRenaming(entry.path)
    setRenameValue(entry.name)
    setTimeout(() => renameRef.current?.select(), 50)
  }

  const finishRename = async () => {
    if (!window.electronAPI || !renaming) return
    const entry = entries.find((e) => e.path === renaming)
    if (!entry || !renameValue.trim() || renameValue.trim() === entry.name) {
      setRenaming(null)
      return
    }
    try {
      const baseDir = publicDir || await window.electronAPI.getPublicDir()
      const parentPath = renaming.substring(0, renaming.lastIndexOf('/'))
      const newFullPath = parentPath
        ? `${baseDir}/${parentPath}/${renameValue.trim()}`
        : `${baseDir}/${renameValue.trim()}`
      await window.electronAPI.rename(entry.fullPath, newFullPath)
      refresh()
    } catch (err) {
      console.error('重命名失败:', err)
    }
    setRenaming(null)
  }

  // 新建文件夹
  const handleNewFolder = async () => {
    if (!window.electronAPI) return
    closeContextMenu()
    const baseDir = publicDir || await window.electronAPI.getPublicDir()
    const targetDir = currentPath ? `${baseDir}/${currentPath}` : baseDir
    let idx = 1
    let folderName = '新建文件夹'
    while (true) {
      try {
        const exists = await window.electronAPI.fileExists(`${targetDir}/${folderName}`)
        if (!exists) break
        idx++
        folderName = `新建文件夹 ${idx}`
      } catch {
        break
      }
    }
    try {
      await window.electronAPI.mkdir(`${targetDir}/${folderName}`)
      refresh()
    } catch (err) {
      console.error('创建文件夹失败:', err)
    }
  }

  // 拖拽开始
  const handleDragStart = (e: React.DragEvent, entry: FileEntry) => {
    if (entry.isDirectory) return
    const ext = entry.name.split('.').pop()?.toLowerCase() || ''
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
    const audioExts = ['mp3', 'ogg', 'opus', 'wav', 'aac', 'm4a', 'flac', 'webm']
    const type = imageExts.includes(ext) ? 'image' : audioExts.includes(ext) ? 'audio' : 'unknown'
    if (type === 'unknown') {
      e.preventDefault()
      return
    }
    // 资源路径从 public 算起，包含 category 级别（character/background/audio）
    // 需要去掉第一级目录，因为引擎加载时不再需要该分类前缀
    const rawPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
    const pathParts = rawPath.split('/')
    if (pathParts.length > 1) pathParts.shift()
    const cleanPath = pathParts.join('/')
    e.dataTransfer.setData('application/udseen-resource', JSON.stringify({
      path: cleanPath,
      type
    }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  // 获取文件图标和颜色
  const getFileInfo = (entry: FileEntry) => {
    if (entry.isDirectory) return { icon: '📁', color: '#7cc5ea' }
    const ext = entry.name.split('.').pop()?.toLowerCase() || ''
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
    const audioExts = ['mp3', 'ogg', 'opus', 'wav', 'aac', 'm4a', 'flac']
    if (imageExts.includes(ext)) return { icon: '🖼', color: '#7bed9f' }
    if (audioExts.includes(ext)) return { icon: '🎵', color: '#ffa502' }
    return { icon: '📄', color: '#888' }
  }

  // 获取资源类型标识
  const getResourceType = (name: string): 'image' | 'audio' | null => {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
    const audioExts = ['mp3', 'ogg', 'opus', 'wav', 'aac', 'm4a', 'flac']
    if (imageExts.includes(ext)) return 'image'
    if (audioExts.includes(ext)) return 'audio'
    return null
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontSize: 13,
        userSelect: 'none'
      }}
      onContextMenu={(e) => handleContextMenu(e, null)}
      onClick={closeContextMenu}
    >
      {/* 标题栏 */}
      <div style={{
        padding: '8px 14px',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--text-secondary)',
        letterSpacing: 1,
        textTransform: 'uppercase' as const,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <span>资源</span>
        <button
          onClick={refresh}
          title="刷新"
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 13,
            padding: '2px 8px',
            lineHeight: '20px'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; e.currentTarget.style.borderColor = 'var(--text)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          ↻
        </button>
      </div>

      {/* 面包屑导航 */}
      <div style={{
        padding: '4px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        overflowX: 'auto'
      }}>
        <span
          onClick={() => setCurrentPath('')}
          style={{ cursor: 'pointer', color: currentPath ? 'var(--accent)' : 'var(--text-secondary)', whiteSpace: 'nowrap', padding: '2px 4px' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-input)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          根目录
        </span>
        {pathParts.map((part, idx) => (
          <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--border)' }}>/</span>
            <span
              onClick={() => setCurrentPath(pathParts.slice(0, idx + 1).join('/'))}
              style={{
                cursor: 'pointer',
                color: idx === pathParts.length - 1 ? 'var(--text)' : 'var(--accent)',
                whiteSpace: 'nowrap',
                padding: '2px 4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-input)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {part}
            </span>
          </span>
        ))}
      </div>

      {/* 文件列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
            <div>资源目录为空</div>
            <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>将图片/音频放入 assets/public 目录</div>
          </div>
        ) : (
          entries.map((entry) => {
            const info = getFileInfo(entry)
            const isRenaming = renaming === entry.path
            return (
              <div
                key={entry.path}
                draggable={!entry.isDirectory}
                onDragStart={(e) => handleDragStart(e, entry)}
                onDoubleClick={() => enterDir(entry)}
                onContextMenu={(e) => handleContextMenu(e, entry)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 14px',
                  cursor: entry.isDirectory ? 'pointer' : 'default',
                  transition: 'background 0.1s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-input)'
                  if (!entry.isDirectory && previewTimerRef.current === null) {
                    previewTimerRef.current = setTimeout(() => {
                      previewTimerRef.current = null
                      showPreview(entry, e.clientX, e.clientY)
                    }, 400)
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  if (previewTimerRef.current) {
                    clearTimeout(previewTimerRef.current)
                    previewTimerRef.current = null
                  }
                  hidePreview()
                }}
              >
                <span style={{ fontSize: 16, opacity: entry.virtualSource ? 0.6 : 1 }}>{info.icon}</span>
                {/* 虚拟路径标记 */}
                {entry.virtualSource && (
                  <span
                    title={`来自虚拟路径: ${entry.virtualSource}`}
                    style={{
                      fontSize: 9,
                      padding: '1px 4px',
                      borderRadius: 3,
                      background: 'rgba(255, 165, 2, 0.2)',
                      color: '#ffa502',
                      fontWeight: 600,
                      flexShrink: 0
                    }}
                  >
                    V
                  </span>
                )}
                {isRenaming ? (
                  <input
                    ref={renameRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={finishRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishRename()
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    autoFocus
                    style={{
                      flex: 1,
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-focus)',
                      color: 'var(--text)',
                      padding: '2px 6px',
                      fontSize: 12,
                      outline: 'none',
                      fontFamily: 'inherit'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: entry.virtualSource ? 'var(--text-muted)' : (entry.isDirectory ? 'var(--text)' : 'var(--text-secondary)')
                  }}>
                    {entry.name}
                  </span>
                )}
                {!entry.isDirectory && !isRenaming && (
                  <span style={{ fontSize: 10, color: info.color, flexShrink: 0 }}>
                    {getResourceType(entry.name) === 'image' ? 'img' : getResourceType(entry.name) === 'audio' ? 'audio' : ''}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 状态栏 */}
      <div style={{
        padding: '4px 14px',
        borderTop: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <span>{entries.filter((e) => !e.isDirectory).length} 文件</span>
        <span>
          {entries.filter((e) => e.isDirectory).length} 文件夹
          {entries.some((e) => e.virtualSource) && (
            <span style={{ marginLeft: 8, color: '#ffa502', fontSize: 10 }}>
              | {entries.filter((e) => e.virtualSource).length} 虚拟
            </span>
          )}
        </span>
      </div>

      {/* 悬浮资源预览 */}
      {preview.visible && preview.entry && !preview.entry.isDirectory && (
        <div
          style={{
            position: 'fixed',
            left: preview.x,
            top: preview.y,
            zIndex: 100000,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            padding: 10,
            boxShadow: '0 6px 20px var(--shadow-hover)',
            pointerEvents: 'none',
            maxWidth: 320,
            fontSize: 13,
            color: 'var(--text)'
          }}
        >
          <div style={{ marginBottom: 6, color: 'var(--text-secondary)' }}>
            {preview.dataUrl ? (
              <>
                <span style={{ color: '#7bed9f' }}>[C]</span> {preview.entry.name}
              </>
            ) : preview.error ? (
              <span style={{ color: 'var(--error)' }}>⚠ {preview.error}</span>
            ) : preview.loading ? (
              <span style={{ color: 'var(--text-muted)' }}>加载中...</span>
            ) : (
              <>
                <span style={{ color: '#ffa502' }}>[A]</span> {preview.entry.name}
              </>
            )}
          </div>
          {preview.dataUrl && (
            <img
              src={preview.dataUrl}
              style={{ maxWidth: 260, maxHeight: 200, border: '1px solid var(--border)', display: 'block' }}
              alt={preview.entry.name}
            />
          )}
        </div>
      )}

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 20px var(--shadow-hover)',
            zIndex: 10000,
            minWidth: 160,
            padding: '4px 0',
            fontSize: 13
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.entry ? (
            <>
              {contextMenu.entry.isDirectory && (
                <MenuItem label="进入文件夹" onClick={() => { enterDir(contextMenu.entry!); closeContextMenu() }} />
              )}
              {contextMenu.entry.virtualSource ? (
                <MenuItem label="虚拟资源（只读）" onClick={closeContextMenu} color="var(--text-muted)" />
              ) : (
                <>
                  <MenuItem label="重命名" onClick={() => startRename(contextMenu.entry!)} />
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
                  <MenuItem label="删除" onClick={() => handleDelete(contextMenu.entry!)} color="var(--error)" />
                </>
              )}
            </>
          ) : (
            <>
              <MenuItem label="新建文件夹" onClick={handleNewFolder} />
              <MenuItem label="刷新" onClick={() => { refresh(); closeContextMenu() }} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({ label, onClick, color }: { label: string; onClick: () => void; color?: string }): JSX.Element {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 16px',
        cursor: 'pointer',
        color: color || 'var(--text)',
        fontSize: 13,
        transition: 'background 0.1s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-input)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {label}
    </div>
  )
}
