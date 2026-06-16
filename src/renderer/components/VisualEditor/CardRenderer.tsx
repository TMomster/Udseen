/**
 * 卡片渲染组件
 * 以垂直卡片列表呈现，支持拖入嵌入（动作卡片→ObjectReference，ObjectReference→容器）
 */
import { useCallback, useState, useRef } from 'react'
import type { VisualBlock } from '../../../types/visualBlocks'
import { useVisualEditorStore } from '../../store/visualEditorStore'
import { useProjectStore } from '../../store/projectStore'
import { createBlockByType } from './blockRegistry'

interface CardRendererProps {
  block: VisualBlock
  depth?: number
  isChild?: boolean
  onContextMenu?: (e: React.MouseEvent, blockId: string) => void
  onCardDragStart?: (blockId: string) => void
  onCardDragEnd?: () => void
  sequenceNumber?: string
}

export function CardRenderer({ block, depth = 0, isChild = false, onContextMenu, onCardDragStart, onCardDragEnd, sequenceNumber }: CardRendererProps): JSX.Element {
  const { selectedBlockId, selectBlock, updateBlock, useChineseLabel, addBlock } = useVisualEditorStore()
  const isSelected = selectedBlockId === block.id
  const [editingPort, setEditingPort] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [dropTargetType, setDropTargetType] = useState<'none' | 'append-child' | 'insert-before'>('none')
  const cardRef = useRef<HTMLDivElement>(null)

  const executionBlockId = useProjectStore((s) => s.executionBlockId)
  const executionError = useProjectStore((s) => s.executionError)
  const isExecuting = executionBlockId === block.id
  const isExecError = isExecuting && !!executionError

  const childBlocks = useVisualEditorStore((s) =>
    block.childBlockIds.map((id) => s.canvas.blocks.find((b) => b.id === id)).filter((b): b is VisualBlock => !!b)
  )

  const isObjectRef = block.blockType === 'ObjectReference'
  const isActionCard = isChild && !isObjectRef

  // resolve parent ObjectReference for action cards
  const parentObjRef = useVisualEditorStore((s) => {
    if (!isChild) return null
    return s.canvas.blocks.find((b) => b.childBlockIds.includes(block.id) && b.blockType === 'ObjectReference') ?? null
  })

  const handleClick = useCallback((e: React.MouseEvent) => { e.stopPropagation(); selectBlock(block.id) }, [block.id, selectBlock])
  const handleCtx = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onContextMenu?.(e, block.id) }, [block.id, onContextMenu])

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const store = useVisualEditorStore.getState()
    const prev = store.canvas.blocks.find((b) => b.nextBlockId === block.id)
    if (prev) store.updateBlock(prev.id, { nextBlockId: block.nextBlockId })
    const parent = store.canvas.blocks.find((b) => b.childBlockIds.includes(block.id))
    if (parent) store.updateBlock(parent.id, { childBlockIds: parent.childBlockIds.filter((cid) => cid !== block.id) })
    store.removeBlock(block.id)
  }, [block.id, block.nextBlockId])

  const handleDragOverCard = useCallback((e: React.DragEvent) => {
    const hasPalette = e.dataTransfer.types.includes('application/udseen-block')
    const hasCardId = e.dataTransfer.types.includes('application/udseen-block-id')
    if (!hasPalette && !hasCardId) return
    e.preventDefault()
    e.stopPropagation()
    if (isObjectRef || block.childBlockIds.length > 0 || ['AsyncBlock', 'SequenceBlock', 'IfStatement', 'WhileStatement'].includes(block.blockType)) {
      setDropTargetType('append-child')
    } else {
      setDropTargetType('insert-before')
    }
  }, [isObjectRef, block.blockType, block.childBlockIds.length])

  const handleDragLeaveCard = useCallback(() => setDropTargetType('none'), [])

  const handleDropOnCard = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTargetType('none')
    const store = useVisualEditorStore.getState()
    const paletteType = e.dataTransfer.getData('application/udseen-block')
    const cardId = e.dataTransfer.getData('application/udseen-block-id')

    if (!paletteType && !cardId) return

    if (dropTargetType === 'append-child') {
      if (paletteType) {
        // 从工具箱拖入 → 新建块并作为子级
        const newBlock = createBlockByType(paletteType)
        // 先更新父级 childBlockIds，再 addBlock，避免 addBlock 将父级 nextBlockId 错误指向子块
        const currentParent = store.canvas.blocks.find((b) => b.id === block.id)
        if (currentParent) {
          store.updateBlock(block.id, { childBlockIds: [...currentParent.childBlockIds, newBlock.id] })
        }
        store.addBlock(newBlock)
      } else if (cardId) {
        // 现有卡片拖入 → 从原位置移除并作为子级
        if (cardId === block.id) return // 不能将自己设为自己的子级
        // 防止循环引用：检查 target 是否已被拖入块的子级包含
        if (block.childBlockIds.includes(cardId)) return // 已经是子级，不需要重复添加
        // 从旧父级移除
        const oldParent = store.canvas.blocks.find((b) => b.childBlockIds.includes(cardId))
        if (oldParent) {
          store.updateBlock(oldParent.id, { childBlockIds: oldParent.childBlockIds.filter((cid) => cid !== cardId) })
        }
        // 加入到新父级
        store.updateBlock(block.id, { childBlockIds: [...block.childBlockIds, cardId] })
      }
    } else if (dropTargetType === 'insert-before' && cardId) {
      // 拖入到某卡片之前（仅限现有卡片）
      if (cardId === block.id) return
      // 如果卡片是子级，先从父级移除
      const oldParent = store.canvas.blocks.find((b) => b.childBlockIds.includes(cardId))
      if (oldParent) {
        store.updateBlock(oldParent.id, { childBlockIds: oldParent.childBlockIds.filter((cid) => cid !== cardId) })
      }
      // 将卡片移到目标块之前
      const globalFromIdx = store.canvas.blocks.findIndex((b) => b.id === cardId)
      const globalToIdx = store.canvas.blocks.findIndex((b) => b.id === block.id)
      if (globalFromIdx !== -1 && globalToIdx !== -1) {
        store.moveBlockToIndex(cardId, globalToIdx)
      }
    }
  }, [dropTargetType, block.id, block.childBlockIds])

  const renderEditable = (portId: string, field: string, label: string, val: string, placeholder: string, acceptFileDrop = false) => {
    const isEditing = editingPort === portId
    const display = (block.data[field] as string) ?? val
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        {label && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', minWidth: 50 }}>{label}</span>}
        {isEditing ? (
          <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => { setEditingPort(null); updateBlock(block.id, { data: { ...block.data, [field]: editValue } }) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { setEditingPort(null); updateBlock(block.id, { data: { ...block.data, [field]: editValue } }) }; if (e.key === 'Escape') setEditingPort(null) }}
            onClick={(e) => e.stopPropagation()}
            style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '3px 8px', color: '#fff', fontSize: 11, outline: 'none' }} />
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setEditingPort(portId); setEditValue(String(display ?? '')) }}
            onDragOver={acceptFileDrop ? (e) => { e.preventDefault(); e.stopPropagation() } : undefined}
            onDrop={acceptFileDrop ? (e) => {
              e.preventDefault()
              e.stopPropagation()
              const resourceData = e.dataTransfer.getData('application/udseen-resource')
              if (resourceData) {
                try {
                  const parsed = JSON.parse(resourceData)
                  if (parsed.path) {
                    updateBlock(block.id, { data: { ...block.data, [field]: parsed.path } })
                    return
                  }
                } catch { /* ignore */ }
              }
              const files = e.dataTransfer.files
              if (files.length > 0) {
                const path = (files[0] as any).path || files[0].name
                updateBlock(block.id, { data: { ...block.data, [field]: path } })
              }
            } : undefined}
            style={{ flex: 1, padding: '3px 8px', borderRadius: 4, background: display ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)', border: display ? `1px solid ${block.color}44` : '1px dashed rgba(255,255,255,0.15)', color: display ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 11, cursor: acceptFileDrop ? 'copy' : 'text', minHeight: 20 }}>
            {acceptFileDrop && !display ? (label === '资源路径' || label === '头像路径' ? '拖入文件或点击输入' : placeholder) : (display || placeholder)}
          </span>
        )}
      </div>
    )
  }

  const renderBody = () => {
    switch (block.blockType) {
      case 'Start': return null
      case 'ObjectReference': {
        const objName = String(block.data.objectName || '')
        const objType = String(block.data.objectType || '')
        return (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
            <span style={{ fontWeight: 600, color: '#4ecdc4' }}>{objName || '(未命名)'}</span>
            <span style={{ marginLeft: 6, fontSize: 9, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3 }}>{objType}</span>
            <div style={{ marginTop: 4, fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>拖入动作卡片建立链式调用</div>
          </div>
        )
      }
      case 'IfStatement':
      case 'WhileStatement':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'cond', 'condition', '条件', block.data.condition as string, '输入条件')}</>
      case 'ChainedMethodCall': {
        const target = String(block.data.target || '')
        const chain = block.data.chain as Array<{ method: string; args: string }> | undefined
        return (
          <>
            {renderEditable(block.valuePorts[0]?.id ?? 'target', 'target', '对象', target, 'obj')}
            {chain?.map((c, i) => (
              <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginLeft: 12, padding: '2px 0', fontFamily: 'monospace' }}>
                <span style={{ color: '#4ecdc4' }}>.{c.method}</span>(<span style={{ color: '#fdcb6e' }}>{c.args}</span>)
              </div>
            ))}
          </>
        )
      }
      case 'ObjectMethodCall':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'method', 'method', '方法', block.data.method as string, 'begin')}{renderEditable(block.valuePorts[1]?.id ?? 'args', 'args', '参数', block.data.args as string, '...')}</>
      case 'Say':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'text', 'text', '文本', block.data.text as string, '输入对话文本')}{renderEditable(block.valuePorts[1]?.id ?? 'audio', 'audio', '音频', block.data.audio as string, '可选音频路径')}</>
      case 'ObjSay':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'text', 'text', '文本', block.data.text as string, '对话文本')}{renderEditable(block.valuePorts[1]?.id ?? 'audio', 'audio', '音频', block.data.audio as string, '可选音频路径')}</>
      case 'VariableDecl':
      case 'Assignment':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'name', 'name', '名称', block.data.name as string, '变量名')}{renderEditable(block.valuePorts[1]?.id ?? 'value', 'value', '值', block.data.value as string, '值')}</>
      case 'FunctionDef':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'name', 'name', '函数名', block.data.name as string, 'myFunc')}{renderEditable(block.valuePorts[1]?.id ?? 'params', 'params', '参数', block.data.params as string, '逗号分隔')}</>
      case 'ObjectFunctionDef':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'typeName', 'typeName', '类型', block.data.typeName as string, 'Character')}{renderEditable(block.valuePorts[1]?.id ?? 'name', 'name', '函数名', block.data.name as string, 'funcName')}{renderEditable(block.valuePorts[2]?.id ?? 'params', 'params', '参数', block.data.params as string, '逗号分隔')}</>
      case 'ChoiceStatement':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'choices', 'choices', '选项', Array.isArray(block.data.choices) ? (block.data.choices as string[]).join(', ') : '', '逗号分隔')}</>
      case 'Wait':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'val', 'time', '', block.data.time as string, '毫秒')}</>
      case 'AsyncBlock':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'val', 'timeout', '', block.data.timeout as string, '超时(ms)')}</>
      case 'Pause':
      case 'ShowDialog':
      case 'HideDialog':
      case 'MathRandom':
      case 'ObjEnd':
      case 'Autobegin':
      case 'ObjLoop':
      case 'AnimPause':
      case 'AnimStop':
      case 'ClearFilters':
      case 'AudioPlay':
      case 'AudioLoop':
      case 'AudioPause':
      case 'AudioStop':
      case 'AudioFadeOut':
      case 'FilterApply':
      case 'BgBegin':
      case 'BgFit':
      case 'BgIndex':
      case 'BgVisible':
      case 'TextBold':
      case 'TextItalic':
      case 'TextUline':
      case 'TextDeline':
        return null
      case 'MathFloor':
      case 'MathCeil':
      case 'MathRound':
      case 'MathAbs':
      case 'MathSin':
      case 'MathCos':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'x', 'x', '数值', block.data.x as string, '0')}</>
      case 'MathMin':
      case 'MathMax':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'a', 'a', 'a', block.data.a as string, '0')}{renderEditable(block.valuePorts[1]?.id ?? 'b', 'b', 'b', block.data.b as string, '0')}</>
      case 'CreateCharacter':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'tag', 'tagName', '角色标识', block.data.tagName as string, 'char1')}{renderEditable(block.valuePorts[1]?.id ?? 'res', 'resourcePath', '资源路径', block.data.resourcePath as string, '图片路径...', true)}{renderEditable(block.valuePorts[2]?.id ?? 'name', 'displayName', '对话名称', block.data.displayName as string, '显示名')}{renderEditable(block.valuePorts[3]?.id ?? 'av', 'avatarPath', '头像路径', block.data.avatarPath as string, '可选头像...', true)}</>
      case 'ObjBegin':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'visible', 'visible', '可见', block.data.visible as string, 'true')}</>
      case 'CreateBackground':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'tag', 'tagName', '标识', block.data.tagName as string, 'bg')}{renderEditable(block.valuePorts[1]?.id ?? 'res', 'resourcePath', '资源路径', block.data.resourcePath as string, '图片路径...', true)}</>
      case 'SequenceBlock':
        return null
      case 'SetPos':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'x', 'x', 'X', block.data.x as string, '0')}{renderEditable(block.valuePorts[1]?.id ?? 'y', 'y', 'Y', block.data.y as string, '0')}{renderEditable(block.valuePorts[2]?.id ?? 'time', 'time', '时间', block.data.time as string, 'ms')}</>
      case 'MoveBy':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'dx', 'dx', 'DX', block.data.dx as string, '0')}{renderEditable(block.valuePorts[1]?.id ?? 'dy', 'dy', 'DY', block.data.dy as string, '0')}{renderEditable(block.valuePorts[2]?.id ?? 'time', 'time', '时间', block.data.time as string, 'ms')}</>
      case 'Alpha':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'val', 'val', '值', block.data.val as string, '0~1')}{renderEditable(block.valuePorts[1]?.id ?? 'time', 'time', '时间', block.data.time as string, 'ms')}</>
      case 'Scale':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'val', 'val', '值', block.data.val as string, '1.0')}{renderEditable(block.valuePorts[1]?.id ?? 'time', 'time', '时间', block.data.time as string, 'ms')}</>
      case 'RotateBy':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'angle', 'angle', '角度', block.data.angle as string, '0')}{renderEditable(block.valuePorts[1]?.id ?? 'time', 'time', '时间', block.data.time as string, 'ms')}</>
      case 'SetLayer':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'index', 'index', '层级', block.data.index as string, '0')}</>
      case 'SetTint':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'color', 'color', '颜色', block.data.color as string, '#ffffff')}</>
      case 'SetSpeed':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'val', 'val', '倍速', block.data.val as string, '1.0')}</>
      case 'Blur':
      case 'Brightness':
      case 'Contrast':
      case 'Saturation':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'val', 'val', '强度', block.data.val as string, '1')}{renderEditable(block.valuePorts[1]?.id ?? 'time', 'time', '时间', block.data.time as string, 'ms')}</>
      case 'RgbFilter':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'r', 'r', 'R', block.data.r as string, '0')}{renderEditable(block.valuePorts[1]?.id ?? 'g', 'g', 'G', block.data.g as string, '0')}{renderEditable(block.valuePorts[2]?.id ?? 'b', 'b', 'B', block.data.b as string, '0')}{renderEditable(block.valuePorts[3]?.id ?? 'time', 'time', '时间', block.data.time as string, 'ms')}</>
      case 'CreateAudio':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'tag', 'tagName', '音频标识', block.data.tagName as string, 'bgm1')}{renderEditable(block.valuePorts[1]?.id ?? 'path', 'path', '资源路径', block.data.path as string, '音频路径...', true)}</>
      case 'SetVolume':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'vol', 'vol', '音量', block.data.vol as string, '0~1')}{renderEditable(block.valuePorts[1]?.id ?? 'time', 'time', '时间', block.data.time as string, 'ms')}</>
      case 'CreateFilter':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'tag', 'tagName', '滤镜标识', block.data.tagName as string, 'filter1')}</>
      case 'Print':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'value', 'value', '值', block.data.value as string, '输出值')}</>
      case 'Return':
        return <>{renderEditable(block.valuePorts[0]?.id ?? 'value', 'value', '值', block.data.value as string, '返回值')}</>
      default:
        return <div style={{ padding: 4, fontSize: 11, color: '#888' }}>{block.blockType}</div>
    }
  }

  const marginLeft = isChild ? depth * 20 : 0
  const displayLabel = useChineseLabel ? block.label : (block.labelEn || block.label)

  const cardBorderColor = isExecError ? '#f44336' : isExecuting ? '#82dc50' : isObjectRef ? '#4ecdc4' : isSelected ? '#fff' : block.color
  const cardBorderStyle = dropTargetType === 'append-child'
    ? `2px dashed #4ecdc4`
    : isExecError
      ? `2px solid #f44336`
      : isExecuting
        ? `2px solid #82dc50`
        : `2px solid ${cardBorderColor}88`

  return (
    <>
      {/* 卡片本体 */}
      <div
        ref={cardRef}
        draggable
        onDragStart={(e) => {
          // 如果输入框/文本区域正在获得焦点，则取消拖拽以允许文本选择
          const active = document.activeElement
          if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) {
            e.preventDefault()
            return
          }
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('application/udseen-block-id', block.id)
          onCardDragStart?.(block.id)
        }}
        onDragEnd={() => onCardDragEnd?.()}
        onDragOver={handleDragOverCard}
        onDragLeave={handleDragLeaveCard}
        onDrop={handleDropOnCard}
        onClick={handleClick}
        onContextMenu={handleCtx}
        style={{
          marginLeft,
          marginBottom: 6,
          background: isExecError
            ? 'linear-gradient(135deg, #f4433644 0%, #f4433633 100%)'
            : isExecuting
              ? 'linear-gradient(135deg, #82dc5044 0%, #82dc5033 100%)'
              : isObjectRef
                ? 'linear-gradient(135deg, #4ecdc433 0%, #4ecdc422 100%)'
                : `linear-gradient(135deg, ${block.color}33 0%, ${block.color}22 100%)`,
          border: cardBorderStyle,
          borderRadius: 10,
          boxShadow: isExecError
            ? '0 0 24px rgba(244, 67, 54, 0.6), 0 4px 12px rgba(0,0,0,0.3)'
            : isExecuting
              ? '0 0 24px rgba(130, 220, 80, 0.6), 0 4px 12px rgba(0,0,0,0.3)'
              : isSelected
                ? `0 0 20px ${block.color}66, 0 4px 12px rgba(0,0,0,0.3)`
                : '0 2px 8px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          cursor: 'grab',
          opacity: isActionCard && !parentObjRef ? 0.5 : 1
        }}
      >
        {/* 卡片头部 */}
        <div style={{
          padding: '6px 12px',
          background: isExecError ? '#f4433644' : isExecuting ? '#82dc5044' : isObjectRef ? '#4ecdc444' : `${block.color}44`,
          borderBottom: isExecError ? '1px solid #f4433633' : isExecuting ? '1px solid #82dc5033' : `1px solid ${block.color}33`,
          fontSize: 11,
          fontWeight: 600,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          userSelect: 'none'
        }}>
          {sequenceNumber && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: `${block.color}aa`,
              background: 'rgba(0,0,0,0.25)', borderRadius: 4, padding: '1px 5px', marginRight: 2, fontFamily: 'monospace', lineHeight: '16px'
            }}>
              {sequenceNumber}
            </span>
          )}
          <span style={{ fontSize: 14, opacity: 0.5, cursor: 'grab' }}>{'\u22EE\u22EE'}</span>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: block.color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            {isObjectRef ? (String(block.data.objectName || '(对象)') + ' [引用]') : displayLabel}
          </span>
          {(isObjectRef || block.childBlockIds.length > 0) && (
            <span onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed) }}
              style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '2px 4px' }}>
              {collapsed ? '[展开]' : `[${block.childBlockIds.length}个子]`}
            </span>
          )}
          {block.blockType !== 'Start' && (
            <span onClick={handleDelete}
              style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,0,0,0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              ✕
            </span>
          )}
        </div>

        {/* 卡片主体 */}
        <div style={{ padding: '6px 12px' }}>
          {renderBody()}
        </div>
      </div>

      {/* 子块列表 */}
      {(isObjectRef || block.childBlockIds.length > 0) && !collapsed && (
        <div style={{ marginLeft: marginLeft + 20, marginBottom: 6 }}>
          {childBlocks.length === 0 && isObjectRef && (
            <div style={{
              padding: '8px 12px', marginBottom: 6, borderRadius: 6,
              border: '1px dashed rgba(78,205,196,0.3)',
              fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'center'
            }}>
              从工具箱拖入动作卡片至此
            </div>
          )}
          {childBlocks.map((child, childIdx) => (
            <CardRenderer
              key={child.id}
              block={child}
              depth={depth + 1}
              isChild
              onContextMenu={onContextMenu}
              onCardDragStart={onCardDragStart}
              onCardDragEnd={onCardDragEnd}
              sequenceNumber={sequenceNumber ? `${sequenceNumber}.${childIdx + 1}` : undefined}
            />
          ))}
        </div>
      )}
    </>
  )
}
