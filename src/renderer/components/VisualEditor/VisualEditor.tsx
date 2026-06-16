/**
 * 可视化编辑器主组件 - 卡片列表模式
 * 卡片以垂直列表呈现，支持拖拽排序，与代码编辑模式明确对应
 */
import { useCallback, useRef, useEffect, useState, useMemo } from 'react'
import type { VisualBlock } from '../../../types/visualBlocks'
import { useVisualEditorStore } from '../../store/visualEditorStore'
import { useProjectStore } from '../../store/projectStore'
import { createBlockByType } from './blockRegistry'
import { blocksToCode, buildBlockLineMap } from './blocksToCode'
import { codeToBlocks } from './codeToBlocks'
import { BlockPalette } from './BlockPalette'
import { CardRenderer } from './CardRenderer'
import { ContextMenu } from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'

export function VisualEditor(): JSX.Element {
  const {
    canvas, addBlock, selectBlock, removeBlock,
    canvas: { blocks },
    updateBlock, selectedBlockId, moveBlockToIndex
  } = useVisualEditorStore()

  const projectContent = useProjectStore((s) => s.content)
  const editMode = useProjectStore((s) => s.editMode)

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [copiedBlock, setCopiedBlock] = useState<VisualBlock | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 获取顶层块（Start 单独处理，始终排在首位）
  const startBlock = blocks.find((b) => b.blockType === 'Start')
  const topLevelBlocks = blocks.filter(
    (b) => b.blockType !== 'Start' && !blocks.some((p) => p.childBlockIds.includes(b.id))
  )

  const copyBlock = useCallback((b: VisualBlock) => setCopiedBlock({ ...b, id: '' }), [])

  const pasteBlock = useCallback(() => {
    if (!copiedBlock) return
    const nb = createBlockByType(copiedBlock.blockType)
    nb.data = { ...copiedBlock.data }
    addBlock(nb)
  }, [copiedBlock, addBlock])

  // ========== 实时双向同步（代码 ↔ 卡片） ==========
  // 监听 projectContent 变化 → 重新解析为卡片块
  useEffect(() => {
    if (editMode !== 'visual') return
    const snapshot = useVisualEditorStore.getState().codeSnapshot
    if (projectContent !== snapshot) {
      try {
        const parsed = codeToBlocks(projectContent)
        useVisualEditorStore.getState().setBlocks(parsed)
        useVisualEditorStore.getState().takeCodeSnapshot(projectContent)
      } catch (err) {
        console.error('[VisualEditor] codeToBlocks 解析失败:', err)
        // 如果解析失败，至少更新 codeSnapshot 避免反复重试
        useVisualEditorStore.getState().takeCodeSnapshot(projectContent)
      }
    }
  }, [projectContent, editMode])

  // 监听 blocks 变化 → 自动生成代码并更新 store，同时构建行号→块ID映射
  useEffect(() => {
    if (editMode !== 'visual' || blocks.length === 0) return
    const generatedCode = blocksToCode(blocks)
    const snapshot = useVisualEditorStore.getState().codeSnapshot
    if (generatedCode !== snapshot && projectContent !== generatedCode) {
      // 构建行号→块ID映射，供运行时卡片高亮使用
      const blockLineMap = buildBlockLineMap(blocks)
      useProjectStore.getState().setBlockLineMap(blockLineMap)
      useProjectStore.getState().setContent(generatedCode)
      useVisualEditorStore.getState().takeCodeSnapshot(generatedCode)
    }
    // 编辑 blocks 时清理执行中的卡片高亮（仅在运行时有效）
    const pState = useProjectStore.getState()
    if (pState.executionBlockId) {
      pState.setExecutionBlockId(null)
    }
  }, [blocks, editMode])

  // 播放时自动滚动到正在执行的卡片 + 自动选中
  useEffect(() => {
    const unsub = useProjectStore.subscribe((state, prev) => {
      const blockId = state.executionBlockId
      if (!blockId || !listRef.current) return
      // 找到对应的卡片 DOM 元素
      const cardEl = listRef.current.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null
      if (!cardEl) return
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      // 自动选中该卡片
      useVisualEditorStore.getState().selectBlock(blockId)
    })
    return unsub
  }, [])

  // 从调色板添加卡片（禁止创建 Start 块）
  const handleAddBlock = useCallback((type: string) => {
    if (type === 'Start') return
    const block = createBlockByType(type)
    addBlock(block)
  }, [addBlock])

  // 根据 blockId 删除卡片（处理 nextBlockId 链与 childBlockIds 清理）
  const handleDeleteBlockId = useCallback((blockId: string) => {
    const store = useVisualEditorStore.getState()
    const block = store.canvas.blocks.find((b) => b.id === blockId)
    if (!block || block.blockType === 'Start') return
    const prev = store.canvas.blocks.find((b) => b.nextBlockId === block.id)
    if (prev) store.updateBlock(prev.id, { nextBlockId: block.nextBlockId })
    const parent = store.canvas.blocks.find((b) => b.childBlockIds.includes(block.id))
    if (parent) store.updateBlock(parent.id, { childBlockIds: parent.childBlockIds.filter((cid) => cid !== block.id) })
    store.removeBlock(blockId)
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // 右键菜单
  const handleBlockContextMenu = useCallback((e: React.MouseEvent, blockId: string) => {
    e.preventDefault()
    e.stopPropagation()
    selectBlock(blockId)
    const block = blocks.find((b) => b.id === blockId)
    if (!block) return
    const items: ContextMenuItem[] = [
      ...(block.blockType !== 'Start'
        ? [{ label: '删除', onClick: () => {
            const prev = blocks.find((b) => b.nextBlockId === block.id)
            if (prev) updateBlock(prev.id, { nextBlockId: block.nextBlockId })
            const parent = blocks.find((b) => b.childBlockIds.includes(block.id))
            if (parent) updateBlock(parent.id, { childBlockIds: parent.childBlockIds.filter((cid) => cid !== block.id) })
            removeBlock(blockId)
          }, shortcut: 'Del', danger: true } as ContextMenuItem,
          { label: '复制', onClick: () => copyBlock(block), shortcut: 'Ctrl+C' } as ContextMenuItem,
        ]
        : [{ label: 'Start 块（不可删除）', disabled: true, onClick: () => {} } as ContextMenuItem]),
    ]
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }, [blocks, selectBlock, removeBlock, updateBlock, copyBlock])

  const handleListContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: '粘贴卡片', onClick: () => pasteBlock(), shortcut: 'Ctrl+V', disabled: !copiedBlock },
      ]
    })
  }, [pasteBlock, copiedBlock])

  // 计算每张卡片的序号（对应代码行号）
  const sequenceNumbers = useMemo(() => {
    const map = new Map<string, string>()
    topLevelBlocks.forEach((block, idx) => {
      map.set(block.id, String(idx + 1))
    })
    return map
  }, [topLevelBlocks])

  // 拖拽排序
  const handleDragStart = useCallback((blockId: string) => setDraggedId(blockId), [])
  const handleDragEnd = useCallback(() => { setDraggedId(null); setDragOverIdx(null) }, [])
  const handleDragLeaveList = useCallback(() => {
    // 当从工具箱拖入但离开列表区域时清除指示器
    setDragOverIdx(null)
  }, [])

  const handleDragOverList = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!listRef.current) return

    // 从工具箱拖入
    if (e.dataTransfer.types.includes('application/udseen-block')) {
      // 同样显示插入指示器
      const rect = listRef.current.getBoundingClientRect()
      const y = e.clientY - rect.top
      const cardEls = listRef.current.querySelectorAll('[data-block-id]')
      let idx = topLevelBlocks.length
      cardEls.forEach((el) => {
        const elRect = el.getBoundingClientRect()
        const mid = elRect.top - rect.top + elRect.height / 2
        if (y > mid) {
          const id = el.getAttribute('data-block-id')
          idx = topLevelBlocks.findIndex((b) => b.id === id) + 1
        } else if (idx === topLevelBlocks.length) {
          const id = el.getAttribute('data-block-id')
          const foundIdx = topLevelBlocks.findIndex((b) => b.id === id)
          if (foundIdx !== -1) idx = foundIdx
        }
      })
      setDragOverIdx(Math.max(0, Math.min(idx, topLevelBlocks.length)))
      return
    }

    // 卡片拖拽排序（必须有 draggedId）
    if (!draggedId) return
    const rect = listRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const cardEls = listRef.current.querySelectorAll('[data-block-id]')
    let idx = topLevelBlocks.length
    cardEls.forEach((el) => {
      const elRect = el.getBoundingClientRect()
      const mid = elRect.top - rect.top + elRect.height / 2
      if (y > mid) {
        const id = el.getAttribute('data-block-id')
        idx = topLevelBlocks.findIndex((b) => b.id === id) + 1
      } else if (idx === topLevelBlocks.length) {
        const id = el.getAttribute('data-block-id')
        const foundIdx = topLevelBlocks.findIndex((b) => b.id === id)
        if (foundIdx !== -1) idx = foundIdx
      }
    })
    setDragOverIdx(Math.max(0, Math.min(idx, topLevelBlocks.length)))
  }, [draggedId, topLevelBlocks])

  const handleDrop = useCallback((e: React.DragEvent) => {
    // Case 1: 从工具箱拖入的新卡片（palette -> editor）
    const paletteType = e.dataTransfer.getData('application/udseen-block')
    if (paletteType) {
      e.preventDefault()
      const block = createBlockByType(paletteType)
      // 从资源池拖入时携带对象名称
      const objectName = e.dataTransfer.getData('application/udseen-object-name')
      if (objectName && paletteType === 'ObjectReference') {
        block.data.objectName = objectName
        block.data.target = objectName
      }
      addBlock(block)
      setDragOverIdx(null)
      return
    }

    // Case 2: 卡片列表内的拖拽排序（card -> card）
    if (draggedId && dragOverIdx !== null) {
      const fromIdx = topLevelBlocks.findIndex((b) => b.id === draggedId)
      if (fromIdx !== -1) {
        // 顶层块之间的拖拽排序
        const globalFromIdx = blocks.findIndex((b) => b.id === draggedId)
        if (globalFromIdx !== -1) {
          const targetBlock = dragOverIdx < topLevelBlocks.length ? topLevelBlocks[dragOverIdx] : null
          const globalToIdx = targetBlock ? blocks.findIndex((b) => b.id === targetBlock.id) : blocks.length - 1
          moveBlockToIndex(draggedId, globalToIdx >= 0 ? globalToIdx : blocks.length - 1)
        }
      } else {
        // 子卡片拖出父级 → 成为顶层块
        const draggedBlock = blocks.find((b) => b.id === draggedId)
        if (draggedBlock) {
          const parent = blocks.find((b) => b.childBlockIds.includes(draggedId))
          if (parent) {
            // 从父级的 childBlockIds 中移除
            updateBlock(parent.id, { childBlockIds: parent.childBlockIds.filter((cid) => cid !== draggedId) })
          }
          // 移动到目标位置
          const targetBlock = dragOverIdx < topLevelBlocks.length ? topLevelBlocks[dragOverIdx] : null
          const globalToIdx = targetBlock ? blocks.findIndex((b) => b.id === targetBlock.id) : blocks.length - 1
          moveBlockToIndex(draggedId, globalToIdx >= 0 ? globalToIdx : blocks.length - 1)
        }
      }
    }
    setDraggedId(null)
    setDragOverIdx(null)
  }, [draggedId, dragOverIdx, topLevelBlocks, blocks, moveBlockToIndex, handleAddBlock])

  // 键盘快捷键
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (editMode !== 'visual' || contextMenu) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const id = useVisualEditorStore.getState().selectedBlockId
        if (id) { const b = blocks.find((b) => b.id === id); if (b) copyBlock(b) }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') pasteBlock()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [editMode, contextMenu, blocks, copyBlock, pasteBlock])

  const cardColor = (idx: number) => dragOverIdx === idx ? 'var(--border-focus)' : 'transparent'

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}
      onContextMenu={handleListContextMenu}>
      <BlockPalette onDragBlock={handleAddBlock} onDeleteBlock={handleDeleteBlockId} />

      {/* 卡片列表区 */}
      <div ref={listRef}
        onDragOver={handleDragOverList}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onDragLeave={handleDragLeaveList}
        onClick={() => { selectBlock(null); closeContextMenu() }}
        style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        {/* 实时同步提示 */}
        {blocks.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
            实时同步模式
          </div>
        )}

        {/* 空白提示 */}
        {blocks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>暂无卡片</div>
            <div style={{ fontSize: 11 }}>从左侧调色板点击添加，或切换代码编辑器编写脚本</div>
          </div>
        )}

        {/* Start 块 - 固定显示在顶部，不可拖拽删除 */}
        {startBlock && (
          <div key={startBlock.id} style={{ marginBottom: 12 }}>
            <div style={{
              padding: '8px 16px', background: 'var(--bg-input)',
              border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)',
              display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none'
            }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
              <span>▶ 开始 (Start)</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>入口块·自动生成</span>
            </div>
          </div>
        )}

        {/* 卡片列表 */}
        {topLevelBlocks.map((block, idx) => (
          <div key={block.id} data-block-id={block.id}>
            {/* 拖拽插入指示器 */}
            <div style={{ height: 4, borderRadius: 2, background: cardColor(idx), marginBottom: 2, transition: 'height 0.15s' }} />
            <CardRenderer
              block={block}
              sequenceNumber={sequenceNumbers.get(block.id)}
              onContextMenu={handleBlockContextMenu}
              onCardDragStart={handleDragStart}
              onCardDragEnd={handleDragEnd}
            />
          </div>
        ))}
        <div style={{ height: 4, borderRadius: 2, background: cardColor(topLevelBlocks.length), marginBottom: 2 }} />

        {/* 添加卡片按钮 */}
        {blocks.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={() => { const last = topLevelBlocks[topLevelBlocks.length - 1]; handleAddBlock('Wait') }}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '8px 24px', fontSize: 11 }}>
              + 从左侧调色板点击添加卡片
            </button>
          </div>
        )}
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={closeContextMenu} />}
    </div>
  )
}
