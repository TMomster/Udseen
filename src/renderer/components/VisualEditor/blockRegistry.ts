/**
 * 卡片块注册表：定义所有可用的卡片类型
 */
import type { VisualBlock } from '../../../types/visualBlocks'

let idCounter = 0
export function genId(): string { return `vb_${++idCounter}_${Date.now()}` }

export interface PaletteItem {
  type: string
  category: string
  label: string
  labelEn: string
  color: string
  create: (id: string) => VisualBlock
}

function mkPort(align: 'top' | 'bottom' | 'right', kind: 'flow' | 'value', label: string, acceptType?: 'number' | 'string' | 'boolean' | 'any' | 'resource') {
  return { id: genId(), align, kind, label, ...(acceptType ? { acceptType } : {}) }
}

function baseBlock(id: string, blockType: string, label: string, labelEn: string, color: string, valuePorts: any[], data: any) {
  return {
    id, blockType, label, labelEn, x: 0, y: 0, width: 0, height: 0, color,
    inputPort: { id: genId(), align: 'top' as const, kind: 'flow' as const, label: '' },
    outputPort: { id: genId(), align: 'bottom' as const, kind: 'flow' as const, label: '' },
    valuePorts, nextBlockId: null, childBlockIds: [] as string[], data, selected: false
  }
}

function containerBlock(id: string, blockType: string, label: string, labelEn: string, color: string, valuePorts: any[], data: any) {
  return {
    ...baseBlock(id, blockType, label, labelEn, color, valuePorts, data),
    childBlockIds: [] as string[]
  }
}

const PALETTE_ITEMS: PaletteItem[] = [
  // === 对象引用 (Object Reference) ===
  {
    type: 'ObjectReference', category: '引用', label: '对象引用', labelEn: 'Object Ref', color: '#4ecdc4',
    create: (id) => ({
      ...containerBlock(id, 'ObjectReference', '对象引用', 'Object Ref', '#4ecdc4', [],
        { objectName: '', objectType: 'Character' }),
    })
  },

  // === 对话 (Dialogue) ===
  {
    type: 'Say', category: '对话', label: '旁白', labelEn: 'Narrate', color: '#00b894',
    create: (id) => baseBlock(id, 'Say', '旁白', 'Narrate', '#00b894', [
      mkPort('right', 'value', '文本', 'string'),
      mkPort('right', 'value', '音频(可选)', 'resource'),
    ], { text: '', audio: '' })
  },
  {
    type: 'ObjSay', category: '对话', label: '角色说话', labelEn: 'Character Say', color: '#00b894',
    create: (id) => baseBlock(id, 'ObjSay', '角色说话', 'Character Say', '#00b894', [
      mkPort('right', 'value', '文本', 'string'),
      mkPort('right', 'value', '音频(可选)', 'resource'),
    ], { text: '', audio: '' })
  },
  {
    type: 'ShowDialog', category: '对话', label: '显示对话框', labelEn: 'Show Dialog', color: '#55efc4',
    create: (id) => baseBlock(id, 'ShowDialog', '显示对话框', 'Show Dialog', '#55efc4', [], {})
  },
  {
    type: 'HideDialog', category: '对话', label: '隐藏对话框', labelEn: 'Hide Dialog', color: '#55efc4',
    create: (id) => baseBlock(id, 'HideDialog', '隐藏对话框', 'Hide Dialog', '#55efc4', [], {})
  },

  // === 角色 (Character) ===
  {
    type: 'CreateCharacter', category: '角色', label: '创建角色', labelEn: 'Create Character', color: '#e17055',
    create: (id) => baseBlock(id, 'CreateCharacter', '创建角色', 'Create Character', '#e17055', [
      mkPort('right', 'value', '角色标识', 'any'),
      mkPort('right', 'value', '资源路径', 'resource'),
      mkPort('right', 'value', '对话名称', 'any'),
      mkPort('right', 'value', '头像路径', 'resource'),
    ], { tagName: 'char1', resourcePath: '', displayName: '', avatarPath: '' })
  },
  {
    type: 'ObjBegin', category: '角色', label: '登场', labelEn: 'Appear', color: '#e17055',
    create: (id) => baseBlock(id, 'ObjBegin', '登场', 'Appear', '#e17055', [
      mkPort('right', 'value', '模式', 'number'),
    ], { mode: 0 })
  },
  {
    type: 'ObjHide', category: '角色', label: '退场', labelEn: 'Hide', color: '#e17055',
    create: (id) => baseBlock(id, 'ObjHide', '退场', 'Hide', '#e17055', [], {})
  },
  {
    type: 'ObjEnd', category: '角色', label: '销毁', labelEn: 'Destroy', color: '#e17055',
    create: (id) => baseBlock(id, 'ObjEnd', '销毁', 'Destroy', '#e17055', [], {})
  },

  // === 背景 (Background) ===
  {
    type: 'CreateBackground', category: '背景', label: '设置背景', labelEn: 'Set Background', color: '#00cec9',
    create: (id) => baseBlock(id, 'CreateBackground', '设置背景', 'Set Background', '#00cec9', [
      mkPort('right', 'value', '标识', 'any'),
      mkPort('right', 'value', '资源路径', 'resource'),
    ], { tagName: 'bg', resourcePath: '' })
  },
  {
    type: 'BgBegin', category: '背景', label: '显示背景', labelEn: 'Show Background', color: '#00cec9',
    create: (id) => baseBlock(id, 'BgBegin', '显示背景', 'Show Background', '#00cec9', [], {})
  },

  // === 位置 (Position) ===
  {
    type: 'SetPos', category: '位置', label: '移动坐标', labelEn: 'Move To', color: '#fdcb6e',
    create: (id) => baseBlock(id, 'SetPos', '移动坐标', 'Move To', '#fdcb6e', [
      mkPort('right', 'value', 'X', 'number'),
      mkPort('right', 'value', 'Y', 'number'),
      mkPort('right', 'value', '时间(ms)', 'number'),
    ], { x: 0, y: 0, time: 0 })
  },
  {
    type: 'MoveBy', category: '位置', label: '相对移动', labelEn: 'Move By', color: '#fdcb6e',
    create: (id) => baseBlock(id, 'MoveBy', '相对移动', 'Move By', '#fdcb6e', [
      mkPort('right', 'value', 'ΔX', 'number'),
      mkPort('right', 'value', 'ΔY', 'number'),
      mkPort('right', 'value', '时间(ms)', 'number'),
    ], { dx: 0, dy: 0, time: 0 })
  },

  // === 变换 (Transform) ===
  {
    type: 'Alpha', category: '变换', label: '透明度', labelEn: 'Alpha', color: '#6c5ce7',
    create: (id) => baseBlock(id, 'Alpha', '透明度', 'Alpha', '#6c5ce7', [
      mkPort('right', 'value', '数值(0~1)', 'number'),
      mkPort('right', 'value', '时间(ms)', 'number'),
    ], { val: 1, time: 0 })
  },
  {
    type: 'Scale', category: '变换', label: '缩放', labelEn: 'Scale', color: '#6c5ce7',
    create: (id) => baseBlock(id, 'Scale', '缩放', 'Scale', '#6c5ce7', [
      mkPort('right', 'value', '倍数', 'number'),
      mkPort('right', 'value', '时间(ms)', 'number'),
    ], { val: 1, time: 0 })
  },
  {
    type: 'RotateBy', category: '变换', label: '旋转', labelEn: 'Rotate', color: '#6c5ce7',
    create: (id) => baseBlock(id, 'RotateBy', '旋转', 'Rotate', '#6c5ce7', [
      mkPort('right', 'value', '角度', 'number'),
      mkPort('right', 'value', '时间(ms)', 'number'),
    ], { angle: 0, time: 0 })
  },
  {
    type: 'SetLayer', category: '变换', label: '图层', labelEn: 'Layer', color: '#6c5ce7',
    create: (id) => baseBlock(id, 'SetLayer', '图层', 'Layer', '#6c5ce7', [
      mkPort('right', 'value', '层级', 'number'),
    ], { index: 0 })
  },
  {
    type: 'SetTint', category: '变换', label: '色调', labelEn: 'Tint', color: '#6c5ce7',
    create: (id) => baseBlock(id, 'SetTint', '色调', 'Tint', '#6c5ce7', [
      mkPort('right', 'value', '颜色值', 'any'),
    ], { color: '' })
  },

  // === 动画控制 (Animation) ===
  {
    type: 'ObjLoop', category: '动画控制', label: '循环播放', labelEn: 'Loop', color: '#e84393',
    create: (id) => baseBlock(id, 'ObjLoop', '循环播放', 'Loop', '#e84393', [], {})
  },
  {
    type: 'AnimPause', category: '动画控制', label: '暂停动画', labelEn: 'Pause Anim', color: '#e84393',
    create: (id) => baseBlock(id, 'AnimPause', '暂停动画', 'Pause Anim', '#e84393', [], {})
  },
  {
    type: 'AnimStop', category: '动画控制', label: '停止动画', labelEn: 'Stop Anim', color: '#e84393',
    create: (id) => baseBlock(id, 'AnimStop', '停止动画', 'Stop Anim', '#e84393', [], {})
  },
  {
    type: 'SetSpeed', category: '动画控制', label: '播放速度', labelEn: 'Speed', color: '#e84393',
    create: (id) => baseBlock(id, 'SetSpeed', '播放速度', 'Speed', '#e84393', [
      mkPort('right', 'value', '速度', 'number'),
    ], { val: 1 })
  },

  // === 滤镜效果 (Filter Effects) ===
  {
    type: 'Blur', category: '滤镜效果', label: '模糊', labelEn: 'Blur', color: '#0984e3',
    create: (id) => baseBlock(id, 'Blur', '模糊', 'Blur', '#0984e3', [
      mkPort('right', 'value', '强度(0~2)', 'number'),
      mkPort('right', 'value', '时间(ms)', 'number'),
    ], { val: 1, time: 0 })
  },
  {
    type: 'Brightness', category: '滤镜效果', label: '明度', labelEn: 'Brightness', color: '#0984e3',
    create: (id) => baseBlock(id, 'Brightness', '明度', 'Brightness', '#0984e3', [
      mkPort('right', 'value', '强度(0~2)', 'number'),
      mkPort('right', 'value', '时间(ms)', 'number'),
    ], { val: 1, time: 0 })
  },
  {
    type: 'Contrast', category: '滤镜效果', label: '对比度', labelEn: 'Contrast', color: '#0984e3',
    create: (id) => baseBlock(id, 'Contrast', '对比度', 'Contrast', '#0984e3', [
      mkPort('right', 'value', '强度(0~2)', 'number'),
      mkPort('right', 'value', '时间(ms)', 'number'),
    ], { val: 1, time: 0 })
  },
  {
    type: 'Saturation', category: '滤镜效果', label: '饱和度', labelEn: 'Saturation', color: '#0984e3',
    create: (id) => baseBlock(id, 'Saturation', '饱和度', 'Saturation', '#0984e3', [
      mkPort('right', 'value', '强度(0~2)', 'number'),
      mkPort('right', 'value', '时间(ms)', 'number'),
    ], { val: 1, time: 0 })
  },
  {
    type: 'RgbFilter', category: '滤镜效果', label: 'RGB颜色', labelEn: 'RGB Filter', color: '#0984e3',
    create: (id) => baseBlock(id, 'RgbFilter', 'RGB颜色', 'RGB Filter', '#0984e3', [
      mkPort('right', 'value', 'R(0~255)', 'number'),
      mkPort('right', 'value', 'G(0~255)', 'number'),
      mkPort('right', 'value', 'B(0~255)', 'number'),
      mkPort('right', 'value', '时间(ms)', 'number'),
    ], { r: 255, g: 255, b: 255, time: 0 })
  },
  {
    type: 'ClearFilters', category: '滤镜效果', label: '清除滤镜', labelEn: 'Clear Filters', color: '#0984e3',
    create: (id) => baseBlock(id, 'ClearFilters', '清除滤镜', 'Clear Filters', '#0984e3', [], {})
  },

  // === 音频 (Audio) ===
  {
    type: 'CreateAudio', category: '音频', label: '创建音频', labelEn: 'Create Audio', color: '#00cec9',
    create: (id) => baseBlock(id, 'CreateAudio', '创建音频', 'Create Audio', '#00cec9', [
      mkPort('right', 'value', '标识', 'any'),
      mkPort('right', 'value', '音频路径', 'resource'),
    ], { tagName: 'audio1', path: '' })
  },
  {
    type: 'AudioPlay', category: '音频', label: '播放', labelEn: 'Play', color: '#00cec9',
    create: (id) => baseBlock(id, 'AudioPlay', '播放', 'Play', '#00cec9', [], {})
  },
  {
    type: 'AudioLoop', category: '音频', label: '循环播放', labelEn: 'Loop', color: '#00cec9',
    create: (id) => baseBlock(id, 'AudioLoop', '循环播放', 'Loop', '#00cec9', [], {})
  },
  {
    type: 'AudioPause', category: '音频', label: '暂停', labelEn: 'Pause', color: '#00cec9',
    create: (id) => baseBlock(id, 'AudioPause', '暂停', 'Pause', '#00cec9', [], {})
  },
  {
    type: 'AudioStop', category: '音频', label: '停止', labelEn: 'Stop', color: '#00cec9',
    create: (id) => baseBlock(id, 'AudioStop', '停止', 'Stop', '#00cec9', [], {})
  },
  {
    type: 'SetVolume', category: '音频', label: '音量', labelEn: 'Volume', color: '#00cec9',
    create: (id) => baseBlock(id, 'SetVolume', '音量', 'Volume', '#00cec9', [
      mkPort('right', 'value', '音量(0~100)', 'number'),
      mkPort('right', 'value', '时间(ms)', 'number'),
    ], { vol: 100, time: 0 })
  },
  {
    type: 'AudioFadeOut', category: '音频', label: '淡出', labelEn: 'Fade Out', color: '#00cec9',
    create: (id) => baseBlock(id, 'AudioFadeOut', '淡出', 'Fade Out', '#00cec9', [], {})
  },

  // === 全局滤镜 (Screen Filter) ===
  {
    type: 'CreateFilter', category: '全局滤镜', label: '创建滤镜', labelEn: 'Create Filter', color: '#2d3436',
    create: (id) => baseBlock(id, 'CreateFilter', '创建滤镜', 'Create Filter', '#2d3436', [
      mkPort('right', 'value', '标识', 'any'),
    ], { tagName: '' })
  },
  {
    type: 'FilterApply', category: '全局滤镜', label: '应用滤镜', labelEn: 'Apply', color: '#2d3436',
    create: (id) => baseBlock(id, 'FilterApply', '应用滤镜', 'Apply', '#2d3436', [], {})
  },

  // === 控制 (Control) ===
  {
    type: 'IfStatement', category: '控制', label: '条件判断', labelEn: 'If', color: '#ff6b6b',
    create: (id) => ({
      ...containerBlock(id, 'IfStatement', '如果', 'If', '#ff6b6b', [
        mkPort('right', 'value', '条件', 'any'),
      ], { condition: '' }),
    })
  },
  {
    type: 'WhileStatement', category: '控制', label: '循环', labelEn: 'Loop', color: '#ff6b6b',
    create: (id) => ({
      ...containerBlock(id, 'WhileStatement', '循环', 'Loop', '#ff6b6b', [
        mkPort('right', 'value', '条件', 'any'),
      ], { condition: '' }),
    })
  },
  {
    type: 'AsyncBlock', category: '控制', label: '异步并行', labelEn: 'Parallel', color: '#a29bfe',
    create: (id) => ({
      ...containerBlock(id, 'AsyncBlock', '异步并行', 'Parallel', '#a29bfe', [
        mkPort('right', 'value', '超时(ms)', 'number'),
      ], { timeout: 0 }),
    })
  },
  {
    type: 'ChoiceStatement', category: '控制', label: '选项', labelEn: 'Choice', color: '#fd79a8',
    create: (id) => ({
      ...containerBlock(id, 'ChoiceStatement', '选项', 'Choice', '#fd79a8', [
        mkPort('right', 'value', '选项文本', 'string'),
      ], { choices: ['选项1'] }),
    })
  },
  {
    type: 'SequenceBlock', category: '控制', label: '顺序执行', labelEn: 'Sequence', color: '#9980FA',
    create: (id) => ({
      ...containerBlock(id, 'SequenceBlock', '顺序执行', 'Sequence', '#9980FA', [], {}),
    })
  },
  {
    type: 'Wait', category: '控制', label: '等待', labelEn: 'Wait', color: '#fdcb6e',
    create: (id) => baseBlock(id, 'Wait', '等待', 'Wait', '#fdcb6e', [
      mkPort('right', 'value', '毫秒', 'number'),
    ], { time: 1000 })
  },
  {
    type: 'Print', category: '控制', label: '打印输出', labelEn: 'Print', color: '#fdcb6e',
    create: (id) => baseBlock(id, 'Print', '打印输出', 'Print', '#fdcb6e', [
      mkPort('right', 'value', '值', 'any'),
    ], { value: '' })
  },
  {
    type: 'Return', category: '控制', label: '返回值', labelEn: 'Return', color: '#fdcb6e',
    create: (id) => baseBlock(id, 'Return', '返回值', 'Return', '#fdcb6e', [
      mkPort('right', 'value', '值', 'any'),
    ], { value: '' })
  },
  {
    type: 'Pause', category: '控制', label: '暂停等待', labelEn: 'Pause', color: '#f39c12',
    create: (id) => baseBlock(id, 'Pause', '暂停等待', 'Pause', '#f39c12', [], {})
  },

  // === 运算 (Math) ===
  {
    type: 'MathRandom', category: '运算', label: '随机数', labelEn: 'Random', color: '#0abde3',
    create: (id) => baseBlock(id, 'MathRandom', '随机数', 'Random', '#0abde3', [], {})
  },
  {
    type: 'MathFloor', category: '运算', label: '向下取整', labelEn: 'Floor', color: '#0abde3',
    create: (id) => baseBlock(id, 'MathFloor', '向下取整', 'Floor', '#0abde3', [
      mkPort('right', 'value', '数值', 'number'),
    ], { x: '' })
  },
  {
    type: 'MathCeil', category: '运算', label: '向上取整', labelEn: 'Ceil', color: '#0abde3',
    create: (id) => baseBlock(id, 'MathCeil', '向上取整', 'Ceil', '#0abde3', [
      mkPort('right', 'value', '数值', 'number'),
    ], { x: '' })
  },
  {
    type: 'MathRound', category: '运算', label: '四舍五入', labelEn: 'Round', color: '#0abde3',
    create: (id) => baseBlock(id, 'MathRound', '四舍五入', 'Round', '#0abde3', [
      mkPort('right', 'value', '数值', 'number'),
    ], { x: '' })
  },
  {
    type: 'MathAbs', category: '运算', label: '绝对值', labelEn: 'Absolute', color: '#0abde3',
    create: (id) => baseBlock(id, 'MathAbs', '绝对值', 'Absolute', '#0abde3', [
      mkPort('right', 'value', '数值', 'number'),
    ], { x: '' })
  },
  {
    type: 'MathMin', category: '运算', label: '最小值', labelEn: 'Minimum', color: '#0abde3',
    create: (id) => baseBlock(id, 'MathMin', '最小值', 'Minimum', '#0abde3', [
      mkPort('right', 'value', 'a', 'number'),
      mkPort('right', 'value', 'b', 'number'),
    ], { a: '', b: '' })
  },
  {
    type: 'MathMax', category: '运算', label: '最大值', labelEn: 'Maximum', color: '#0abde3',
    create: (id) => baseBlock(id, 'MathMax', '最大值', 'Maximum', '#0abde3', [
      mkPort('right', 'value', 'a', 'number'),
      mkPort('right', 'value', 'b', 'number'),
    ], { a: '', b: '' })
  },
  {
    type: 'MathSin', category: '运算', label: '正弦', labelEn: 'Sine', color: '#0abde3',
    create: (id) => baseBlock(id, 'MathSin', '正弦', 'Sine', '#0abde3', [
      mkPort('right', 'value', '角度', 'number'),
    ], { x: '' })
  },
  {
    type: 'MathCos', category: '运算', label: '余弦', labelEn: 'Cosine', color: '#0abde3',
    create: (id) => baseBlock(id, 'MathCos', '余弦', 'Cosine', '#0abde3', [
      mkPort('right', 'value', '角度', 'number'),
    ], { x: '' })
  },

  // === 变量 (Variable) ===
  {
    type: 'VariableDecl', category: '变量', label: '声明变量', labelEn: 'Declare Variable', color: '#7c6ff0',
    create: (id) => baseBlock(id, 'VariableDecl', '声明变量', 'Declare Variable', '#7c6ff0', [
      mkPort('right', 'value', '名称', 'any'),
      mkPort('right', 'value', '值', 'any'),
    ], { name: '', value: '' })
  },
  {
    type: 'Assignment', category: '变量', label: '赋值', labelEn: 'Assign', color: '#7c6ff0',
    create: (id) => baseBlock(id, 'Assignment', '赋值', 'Assign', '#7c6ff0', [
      mkPort('right', 'value', '变量', 'any'),
      mkPort('right', 'value', '值', 'any'),
    ], { name: '', value: '' })
  },

  // === 函数 (Function) ===
  {
    type: 'FunctionDef', category: '函数', label: '定义函数', labelEn: 'Function', color: '#f7a440',
    create: (id) => ({
      ...containerBlock(id, 'FunctionDef', '定义函数', 'Function', '#f7a440', [
        mkPort('right', 'value', '函数名', 'any'),
        mkPort('right', 'value', '参数', 'any'),
      ], { name: 'myFunc', params: '' }),
    })
  },
  {
    type: 'ObjectFunctionDef', category: '函数', label: '对象函数', labelEn: 'Object Function', color: '#f7a440',
    create: (id) => ({
      ...containerBlock(id, 'ObjectFunctionDef', '对象函数', 'Object Function', '#f7a440', [
        mkPort('right', 'value', '类型', 'any'),
        mkPort('right', 'value', '函数名', 'any'),
        mkPort('right', 'value', '参数', 'any'),
      ], { typeName: 'Character', name: 'funcName', params: '' }),
    })
  },

  // === 对象 (Object) ===
  {
    type: 'ObjectMethodCall', category: '对象', label: '自定义方法', labelEn: 'Custom Method', color: '#4ecdc4',
    create: (id) => baseBlock(id, 'ObjectMethodCall', '自定义方法', 'Custom Method', '#4ecdc4', [
      mkPort('right', 'value', '方法', 'any'),
      mkPort('right', 'value', '参数', 'any'),
    ], { method: 'begin', args: '' })
  },
]

// === 导出工具函数 ===

const paletteMap = new Map<string, PaletteItem>(PALETTE_ITEMS.map((item) => [item.type, item]))

export const paletteGroups: Record<string, PaletteItem[]> = {}
PALETTE_ITEMS.forEach((item) => {
  if (!paletteGroups[item.category]) paletteGroups[item.category] = []
  paletteGroups[item.category].push(item)
})

export function createBlockByType(type: string): VisualBlock {
  const item = paletteMap.get(type)
  if (!item) throw new Error(`Unknown block type: ${type}`)
  return item.create(genId())
}

export function getBlockColor(type: string): string {
  return paletteMap.get(type)?.color ?? '#888'
}

export function getBlockLabelEn(type: string): string {
  return paletteMap.get(type)?.labelEn ?? type
}