/**
 * 可视化编辑器 - 卡片块类型定义
 *
 * 卡片块模型用于在可视化编辑器画布中表示脚本 AST
 */

/** 连接端口位置 */
export type PortAlign = 'top' | 'bottom' | 'left' | 'right'

/** 端口类型：流端口（连接语句块）或值端口（连接表达式/参数） */
export type PortKind = 'flow' | 'value'

/** 连接端口 */
export interface BlockPort {
  id: string
  align: PortAlign
  kind: PortKind
  label: string
  /** 该端口接受的数据类型（值端口用） */
  acceptType?: 'number' | 'string' | 'boolean' | 'any' | 'resource'
  /** 当前连接的表达式卡片 ID */
  connectedBlockId?: string
}

/** 语句块接口 */
export interface VisualBlock {
  id: string
  /** 块类型，对应 AST 节点类型 */
  blockType: string
  /** 显示标签（中文） */
  label: string
  /** 显示标签（英文） */
  labelEn: string
  /** 在画布上的位置 */
  x: number
  y: number
  /** 块尺寸（自动计算或预设） */
  width: number
  height: number
  /** 颜色主题 */
  color: string
  /** 输入端口（通常是上方的流入口） */
  inputPort?: BlockPort
  /** 输出端口（通常是下方的流出口） */
  outputPort?: BlockPort
  /** 参数/值端口（右侧的参数槽） */
  valuePorts: BlockPort[]
  /** 下一语句块 ID（顺序执行链） */
  nextBlockId: string | null
  /** 如果该块是容器块（if/while/function等），内部语句块 ID 列表 */
  childBlockIds: string[]
  /** 自定义数据：各端口的值映射 */
  data: Record<string, unknown>
  /** 用户是否选中 */
  selected: boolean
}

/** 块之间的连接 */
export interface BlockConnection {
  id: string
  fromBlockId: string
  fromPortId: string
  toBlockId: string
  toPortId: string
}

/** 画布状态 */
export interface VisualCanvasState {
  blocks: VisualBlock[]
  connections: BlockConnection[]
}

/** 从 AST 到卡片块的转换选项 */
export interface AstToBlocksOptions {
  content: string
}
