/**
 * 卡片调色板 - 左侧可拖入的卡片列表
 * 支持实时搜索筛选和中文/英文显示切换
 */
import { useCallback, useState, useMemo } from 'react'
import { paletteGroups } from './blockRegistry'
import type { PaletteItem } from './blockRegistry'
import { useVisualEditorStore } from '../../store/visualEditorStore'

interface BlockPaletteProps {
  onDragBlock: (type: string) => void
  /** 当从编辑器拖入卡片到工具箱时调用，用于删除卡片 */
  onDeleteBlock?: (blockId: string) => void
}

export function BlockPalette({ onDragBlock, onDeleteBlock }: BlockPaletteProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const [dropTarget, setDropTarget] = useState(false)
  const [resourcePoolOpen, setResourcePoolOpen] = useState(true)
  const useChineseLabel = useVisualEditorStore((s) => s.useChineseLabel)
  const setUseChineseLabel = useVisualEditorStore((s) => s.setUseChineseLabel)

  // 从当前所有块中提取已创建的对象（资源池）
  const allBlocks = useVisualEditorStore((s) => s.canvas.blocks)
  const resourceObjects = useMemo(() => {
    const objects: Array<{ name: string; type: string; color: string }> = []
    const seen = new Set<string>()
    for (const b of allBlocks) {
      if (b.blockType === 'CreateCharacter' && b.data.tagName) {
        const key = String(b.data.tagName)
        if (!seen.has(key)) { seen.add(key); objects.push({ name: key, type: 'Character', color: '#e17055' }) }
      } else if (b.blockType === 'CreateBackground' && b.data.tagName) {
        const key = String(b.data.tagName)
        if (!seen.has(key)) { seen.add(key); objects.push({ name: key, type: 'Background', color: '#00cec9' }) }
      } else if (b.blockType === 'CreateAudio' && b.data.tagName) {
        const key = String(b.data.tagName)
        if (!seen.has(key)) { seen.add(key); objects.push({ name: key, type: 'Audio', color: '#00cec9' }) }
      } else if (b.blockType === 'CreateFilter' && b.data.tagName) {
        const key = String(b.data.tagName)
        if (!seen.has(key)) { seen.add(key); objects.push({ name: key, type: 'Filter', color: '#2d3436' }) }
      } else if (b.blockType === 'CreateText' && b.data.tagName) {
        const key = String(b.data.tagName)
        if (!seen.has(key)) { seen.add(key); objects.push({ name: key, type: 'Text', color: '#a29bfe' }) }
      } else if (b.blockType === 'ObjectFunctionDef' && b.data.typeName) {
        // ObjectFunctionDef 内部提供默认 obj 参数，代表函数第一个参数（目标对象）
        const objKey = 'obj'
        if (!seen.has(objKey)) {
          seen.add(objKey)
          const typeName = String(b.data.typeName)
          const typeColors: Record<string, string> = { Character: '#e17055', Background: '#00cec9', Audio: '#00cec9', Filter: '#2d3436' }
          objects.push({ name: 'obj', type: typeName, color: typeColors[typeName] || '#7c6ff0' })
        }
      }
    }
    return objects
  }, [allBlocks])

  const handleDragStart = useCallback((e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData('application/udseen-block', item.type)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handleResourceDragStart = useCallback((e: React.DragEvent, name: string) => {
    e.dataTransfer.setData('application/udseen-block', 'ObjectReference')
    e.dataTransfer.setData('application/udseen-object-name', name)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  // 从编辑器拖入卡片到工具箱 → 删除卡片
  const handleDragOverPalette = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/udseen-block-id')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(true)
    }
  }, [])

  const handleDragLeavePalette = useCallback(() => {
    setDropTarget(false)
  }, [])

  const handleDropOnPalette = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDropTarget(false)
    const blockId = e.dataTransfer.getData('application/udseen-block-id')
    if (blockId && onDeleteBlock) {
      onDeleteBlock(blockId)
    }
  }, [onDeleteBlock])

  // 根据搜索词筛选卡片项
  const filterItems = (items: PaletteItem[]): PaletteItem[] => {
    if (!searchQuery.trim()) return items
    const lowerQuery = searchQuery.toLowerCase()
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(lowerQuery) ||
        item.labelEn.toLowerCase().includes(lowerQuery) ||
        item.type.toLowerCase().includes(lowerQuery) ||
        item.category.toLowerCase().includes(lowerQuery)
    )
  }

  // 筛选后还有内容的分类
  const filteredGroups = Object.entries(paletteGroups)
    .map(([category, items]) => ({
      category,
      items: filterItems(items)
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div
      onDragOver={handleDragOverPalette}
      onDragLeave={handleDragLeavePalette}
      onDrop={handleDropOnPalette}
      style={{
        width: 220,
        height: '100%',
        background: dropTarget ? 'rgba(255,50,50,0.12)' : 'var(--panel-bg)',
        borderRight: dropTarget ? '2px solid rgba(255,50,50,0.5)' : 'var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'background 0.15s, border-color 0.15s'
      }}>
      <div style={{
        padding: '10px 12px',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--accent)',
        borderBottom: 'var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>卡片工具箱</span>
          {/* 拖入删除提示 */}
          {dropTarget && (
            <span style={{ fontSize: 10, color: '#ff6b6b', fontWeight: 700 }}>释放删除</span>
          )}
          {/* 语言切换开关 */}
        <label style={{
          fontSize: 9,
          color: 'rgba(255,255,255,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          userSelect: 'none'
        }}>
          <span>EN</span>
          <div style={{
            width: 28,
            height: 14,
            borderRadius: 7,
            background: useChineseLabel ? 'var(--accent)' : 'rgba(255,255,255,0.2)',
            position: 'relative',
            transition: 'background 0.2s'
          }}
            onClick={(e) => { e.stopPropagation(); setUseChineseLabel(!useChineseLabel) }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 2,
              left: useChineseLabel ? 16 : 2,
              transition: 'left 0.2s'
            }} />
          </div>
          <span>中</span>
        </label>
      </div>
      </div>

      {/* 资源池 — 动态检测到的对象 */}
      {resourceObjects.length > 0 && (
        <div style={{
          borderBottom: 'var(--border)',
          padding: '6px 10px'
        }}>
          <div
            onClick={() => setResourcePoolOpen(!resourcePoolOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontSize: 10,
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              userSelect: 'none'
            }}
          >
            <span>资源池 ({resourceObjects.length})</span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              style={{
                transform: resourcePoolOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s'
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          {resourcePoolOpen && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              marginTop: 6
            }}>
              {resourceObjects.map((obj) => (
                <div
                  key={obj.name}
                  draggable
                  onDragStart={(e) => handleResourceDragStart(e, obj.name)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    cursor: 'grab',
                    color: 'var(--text)',
                    background: `${obj.color}22`,
                    border: `1px solid ${obj.color}44`,
                    userSelect: 'none',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${obj.color}44`
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `${obj.color}22`
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: obj.color,
                    flexShrink: 0
                  }} />
                  {obj.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 搜索栏 */}
      <div style={{
        padding: '8px 10px',
        borderBottom: 'var(--border)'
      }}>
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center'
        }}>
          <svg
            style={{
              position: 'absolute',
              left: 8,
              width: 12,
              height: 12,
              color: 'rgba(255,255,255,0.3)',
              pointerEvents: 'none'
            }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索卡片..."
            style={{
              width: '100%',
              padding: '6px 8px 6px 26px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 11,
              outline: 'none',
              transition: 'border-color 0.15s'
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 6,
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.3)',
                cursor: 'pointer',
                fontSize: 11,
                padding: '2px 4px'
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 卡片列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {filteredGroups.length === 0 ? (
          <div style={{
            padding: '20px 8px',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.3)',
            fontSize: 11
          }}>
            {searchQuery ? `未找到 "${searchQuery}"` : '暂无卡片'}
          </div>
        ) : (
          filteredGroups.map(({ category, items }) => (
            <div key={category} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 10,
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 6,
                paddingLeft: 4
              }}>
                {category}
                {/* 显示该分类下的匹配数量 */}
                {items.length < paletteGroups[category]?.length && (
                  <span style={{
                    marginLeft: 6,
                    fontSize: 9,
                    color: '#7c6ff0',
                    fontWeight: 600
                  }}>
                    {items.length}/{paletteGroups[category].length}
                  </span>
                )}
              </div>
              {items.map((item) => (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                  onClick={() => onDragBlock(item.type)}
                  style={{
                    padding: '6px 10px',
                    marginBottom: 4,
                    borderRadius: 6,
                    cursor: 'grab',
                    fontSize: 12,
                    color: '#e0e0f0',
                    background: `${item.color}22`,
                    borderLeft: `3px solid ${item.color}`,
                    transition: 'all 0.15s',
                    userSelect: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${item.color}44`
                    e.currentTarget.style.transform = 'translateX(2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `${item.color}22`
                    e.currentTarget.style.transform = 'translateX(0)'
                  }}
                >
                  {useChineseLabel ? item.label : item.labelEn}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
