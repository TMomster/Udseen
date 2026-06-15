/**
 * 单个卡片块的渲染组件
 */
import { useCallback, useState } from 'react'
import type { VisualBlock } from '../../../types/visualBlocks'
import { useVisualEditorStore } from '../../store/visualEditorStore'

interface BlockRendererProps {
  block: VisualBlock
  onContextMenu?: (e: React.MouseEvent, blockId: string) => void
}

export function BlockRenderer({ block, onContextMenu }: BlockRendererProps): JSX.Element {
  const { selectedBlockId, selectBlock, startDrag, updateBlock } = useVisualEditorStore()
  const isSelected = selectedBlockId === block.id
  const [editingPort, setEditingPort] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.port-input')) return
    e.stopPropagation()
    selectBlock(block.id)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    startDrag(block.id, e.clientX - rect.left + block.x, e.clientY - rect.top + block.y)
  }, [block.id, block.x, block.y, selectBlock, startDrag])

  const handlePortClick = useCallback((portId: string, currentValue: string) => {
    setEditingPort(portId)
    setEditValue(String(currentValue ?? ''))
  }, [])

  const handlePortBlur = useCallback((portId: string, field: string) => {
    setEditingPort(null)
    updateBlock(block.id, {
      data: { ...block.data, [field]: editValue }
    })
  }, [block.id, block.data, editValue, updateBlock])

  // 根据卡片类型渲染不同的内容区域
  const renderBody = () => {
    switch (block.blockType) {
      case 'IfStatement':
      case 'WhileStatement':
        return renderWithConditionSlot()
      case 'ObjectMethodCall':
        return renderMethodCallBody()
      case 'SayBlock':
        return renderSayBody()
      case 'ChoiceStatement':
        return renderChoiceBody()
      case 'VariableDecl':
      case 'Assignment':
        return renderVarBody()
      case 'FunctionDef':
        return renderFuncDefBody()
      case 'ObjectFunctionDef':
        return renderObjFuncDefBody()
      case 'Wait':
      case 'AsyncBlock':
        return renderSimpleBody()
      case 'Start':
        return null
      default:
        return <div style={{ padding: 4, fontSize: 11, color: '#888' }}>{block.blockType}</div>
    }
  }

  const renderPortInput = (portId: string, field: string, label: string, value: string, placeholder: string) => {
    const isEditing = editingPort === portId
    const displayValue = block.data[field] as string ?? value
    return (
      <div className="port-input" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{label}=</span>
        {isEditing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handlePortBlur(portId, field)}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePortBlur(portId, field) }}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 3,
              padding: '2px 6px',
              color: '#fff',
              fontSize: 11,
              outline: 'none',
              minWidth: 40
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); handlePortClick(portId, displayValue) }}
            style={{
              flex: 1,
              padding: '2px 6px',
              borderRadius: 3,
              background: displayValue ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
              border: '1px dashed rgba(255,255,255,0.15)',
              color: displayValue ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 11,
              cursor: 'text',
              minWidth: 30,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {displayValue || placeholder}
          </span>
        )}
      </div>
    )
  }

  const renderWithConditionSlot = () => (
    <div style={{ padding: '8px 12px' }}>
      {renderPortInput(block.valuePorts[0]?.id ?? 'cond', 'condition', '条件', block.data.condition as string, '输入条件')}
      <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
        内部卡片请放置于此块下方
      </div>
    </div>
  )

  const renderMethodCallBody = () => (
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {renderPortInput(block.valuePorts[0]?.id ?? 'target', 'target', '对象', block.data.target as string, 'obj')}
      {renderPortInput(block.valuePorts[1]?.id ?? 'method', 'method', '方法', block.data.method as string, 'begin')}
      {renderPortInput(block.valuePorts[2]?.id ?? 'args', 'args', '参数', block.data.args as string, '...')}
    </div>
  )

  const renderSayBody = () => (
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {renderPortInput(block.valuePorts[0]?.id ?? 'text', 'text', '文本', block.data.text as string, '输入对话文本')}
      {renderPortInput(block.valuePorts[1]?.id ?? 'audio', 'audio', '音频', block.data.audio as string, '可选音频路径')}
    </div>
  )

  const renderChoiceBody = () => (
    <div style={{ padding: '8px 12px' }}>
      {renderPortInput(block.valuePorts[0]?.id ?? 'choices', 'choices', '选项', 
        Array.isArray(block.data.choices) ? (block.data.choices as string[]).join(', ') : '',
        '逗号分隔选项')}
    </div>
  )

  const renderVarBody = () => (
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {renderPortInput(block.valuePorts[0]?.id ?? 'name', 'name', '名称', block.data.name as string, '变量名')}
      {renderPortInput(block.valuePorts[1]?.id ?? 'value', 'value', '值', block.data.value as string, '初始值')}
    </div>
  )

  const renderFuncDefBody = () => (
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {renderPortInput(block.valuePorts[0]?.id ?? 'name', 'name', '函数名', block.data.name as string, 'myFunc')}
      {renderPortInput(block.valuePorts[1]?.id ?? 'params', 'params', '参数', block.data.params as string, '逗号分隔')}
    </div>
  )

  const renderObjFuncDefBody = () => (
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {renderPortInput(block.valuePorts[0]?.id ?? 'typeName', 'typeName', '类型', block.data.typeName as string, 'Character')}
      {renderPortInput(block.valuePorts[1]?.id ?? 'name', 'name', '函数名', block.data.name as string, 'funcName')}
      {renderPortInput(block.valuePorts[2]?.id ?? 'params', 'params', '参数', block.data.params as string, '逗号分隔')}
    </div>
  )

  const renderSimpleBody = () => (
    <div style={{ padding: '8px 12px' }}>
      {renderPortInput(block.valuePorts[0]?.id ?? 'val', 
        block.blockType === 'Wait' ? 'time' : 'timeout',
        '', '',
        block.blockType === 'Wait' ? '毫秒' : '超时(ms)')}
    </div>
  )

  const hasFlowOutput = !!block.outputPort

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (onContextMenu) {
      onContextMenu(e, block.id)
    }
  }, [onContextMenu, block.id])

  return (
    <div
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      style={{
        position: 'absolute',
        left: block.x,
        top: block.y,
        width: block.width,
        background: `linear-gradient(135deg, ${block.color}33 0%, ${block.color}22 100%)`,
        border: `2px solid ${isSelected ? '#fff' : block.color}`,
        borderRadius: 10,
        cursor: 'grab',
        boxShadow: isSelected
          ? `0 0 20px ${block.color}66, 0 4px 12px rgba(0,0,0,0.3)`
          : '0 2px 8px rgba(0,0,0,0.2)',
        transition: hasFlowOutput ? undefined : 'box-shadow 0.15s',
        zIndex: isSelected ? 10 : 1,
        // 底部凹口（流出口）
        ...(hasFlowOutput ? {
          borderBottom: 'none',
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          paddingBottom: 0,
        } : {}),
        minHeight: block.height
      }}
    >
      {/* 块头部标签 */}
      <div style={{
        padding: '6px 12px',
        background: `${block.color}44`,
        borderRadius: '8px 8px 0 0',
        borderBottom: `1px solid ${block.color}33`,
        fontSize: 11,
        fontWeight: 600,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: block.color,
          display: 'inline-block'
        }} />
        {block.label}
      </div>

      {/* 块体内容 */}
      {renderBody()}

      {/* 底部凹口（流连接口可视化） */}
      {block.outputPort && (
        <div style={{
          height: 12,
          background: `${block.color}22`,
          borderBottom: `2px solid ${block.color}`,
          borderRadius: '0 0 8px 8px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative'
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: block.color,
            opacity: 0.6
          }} />
        </div>
      )}
    </div>
  )
}
