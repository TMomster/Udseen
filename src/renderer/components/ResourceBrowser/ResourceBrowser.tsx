import { useEffect, useState, useCallback, useRef } from 'react'
import { useAssetStore } from '../../store/assetStore'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  fullPath: string
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
      const targetPath = dirPath ? `${baseDir}/${dirPath}` : baseDir
      const fileEntries = await window.electronAPI.readDir(targetPath)
      const list: FileEntry[] = (fileEntries as Array<{ name: string; isDirectory: boolean }>)
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          path: dirPath ? `${dirPath}/${e.name}` : e.name,
          isDirectory: e.isDirectory,
          fullPath: `${baseDir}/${dirPath ? dirPath + '/' : ''}${e.name}`
        }))
      // 目录排前，按名称排序
      list.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(list)
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
        background: '#16162a',
        color: '#cdd6f4',
        fontSize: 13,
        userSelect: 'none'
      }}
      onContextMenu={(e) => handleContextMenu(e, null)}
      onClick={closeContextMenu}
    >
      {/* 标题栏 */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontSize: 12,
        fontWeight: 600,
        color: '#7c6ff0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <span>资源管理器</span>
        <button
          onClick={refresh}
          title="刷新"
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: 14,
            padding: '2px 6px',
            borderRadius: 4
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#ccc'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
        >
          ↻
        </button>
      </div>

      {/* 面包屑导航 */}
      <div style={{
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        color: '#888',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        flexShrink: 0,
        overflowX: 'auto'
      }}>
        <span
          onClick={() => setCurrentPath('')}
          style={{ cursor: 'pointer', color: currentPath ? '#7c6ff0' : '#aaa', whiteSpace: 'nowrap', padding: '2px 4px', borderRadius: 3 }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(124,111,240,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          根目录
        </span>
        {pathParts.map((part, idx) => (
          <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#555' }}>/</span>
            <span
              onClick={() => setCurrentPath(pathParts.slice(0, idx + 1).join('/'))}
              style={{
                cursor: 'pointer',
                color: idx === pathParts.length - 1 ? '#cdd6f4' : '#7c6ff0',
                whiteSpace: 'nowrap',
                padding: '2px 4px',
                borderRadius: 3
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(124,111,240,0.1)'}
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
          <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>加载中...</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
            <div>资源目录为空</div>
            <div style={{ fontSize: 11, marginTop: 4, color: '#555' }}>将图片/音频放入 assets/public 目录</div>
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
                  padding: '5px 12px',
                  cursor: entry.isDirectory ? 'pointer' : 'default',
                  borderRadius: 4,
                  margin: '0 4px',
                  transition: 'background 0.1s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
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
                <span style={{ fontSize: 16 }}>{info.icon}</span>
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
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid #7c6ff0',
                      color: '#cdd6f4',
                      padding: '2px 6px',
                      borderRadius: 3,
                      fontSize: 12,
                      outline: 'none'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: entry.isDirectory ? '#cdd6f4' : '#b0b0d0'
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
        padding: '4px 12px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        fontSize: 11,
        color: '#666',
        display: 'flex',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <span>{entries.filter((e) => !e.isDirectory).length} 个文件</span>
        <span>{entries.filter((e) => e.isDirectory).length} 个文件夹</span>
      </div>

      {/* 悬浮资源预览 */}
      {preview.visible && preview.entry && !preview.entry.isDirectory && (
        <div
          style={{
            position: 'fixed',
            left: preview.x,
            top: preview.y,
            zIndex: 100000,
            background: '#252526',
            border: '1px solid #454545',
            borderRadius: 6,
            padding: 10,
            boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
            maxWidth: 320,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            color: '#ccc'
          }}
        >
          <div style={{ marginBottom: 6, color: '#aaa' }}>
            {preview.dataUrl ? (
              <>
                <span style={{ color: '#7bed9f' }}>[C]</span> {preview.entry.name}
              </>
            ) : preview.error ? (
              <span style={{ color: '#f44' }}>⚠ {preview.error}</span>
            ) : preview.loading ? (
              <span style={{ color: '#888' }}>加载中...</span>
            ) : (
              <>
                <span style={{ color: '#ffa502' }}>[A]</span> {preview.entry.name}
              </>
            )}
          </div>
          {preview.dataUrl && (
            <img
              src={preview.dataUrl}
              style={{ maxWidth: 260, maxHeight: 200, borderRadius: 4, border: '1px solid #444', display: 'block' }}
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
            background: '#22223a',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
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
              <MenuItem label="重命名" onClick={() => startRename(contextMenu.entry!)} />
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 8px' }} />
              <MenuItem label="删除" onClick={() => handleDelete(contextMenu.entry!)} color="#f44336" />
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
        color: color || '#cdd6f4',
        fontSize: 13,
        transition: 'background 0.1s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(124,111,240,0.15)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {label}
    </div>
  )
}
