/**
 * 将可视化卡片块转换回 Udseen 代码
 * 实现 "卡片 → 代码" 双向同步的序列化部分
 */
import type { VisualBlock } from '../../../types/visualBlocks'

/** 生成缩进字符串 */
function indent(level: number): string {
  return '  '.repeat(level)
}

/** 根据 block.data 安全获取字符串值 */
function str(data: Record<string, unknown>, key: string, fallback = ''): string {
  const v = data[key]
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return fallback
}

/** ObjectReference 类型列表（用作链式调用的容器父块） */
const OBJECT_REF_TYPES = new Set(['ObjectReference'])

/**
 * 生成内联块代码（用于 ObjectReference 的链式调用，返回不换行的字符串，不推送 codeLines）
 */
function blockToInlineStr(block: VisualBlock): string {
  switch (block.blockType) {
    case 'ObjectMethodCall': {
      const method = str(block.data, 'method', 'begin')
      const args = str(block.data, 'args', '')
      return args ? `.${method}(${args})` : `.${method}()`
    }
    case 'ObjSay': {
      const text = str(block.data, 'text', '')
      const audio = str(block.data, 'audio', '')
      return `.say("${text}"${audio ? `, "${audio}"` : ''})`
    }
    case 'ObjBegin': {
      const modeVal = block.data.mode
      const mode = typeof modeVal === 'string' || typeof modeVal === 'number' ? String(modeVal) : ''
      return mode ? `.begin(${mode})` : '.begin()'
    }
    case 'ObjHide': return '.hide()'
    case 'ObjEnd': return '.end()'
    case 'BgBegin': return '.begin()'
    case 'SetPos': {
      const x = str(block.data, 'x', '0')
      const y = str(block.data, 'y', '0')
      const t = str(block.data, 'time', '')
      return `.setPos(${x}, ${y}${t ? `, ${t}` : ''})`
    }
    case 'MoveBy': {
      const dx = str(block.data, 'dx', '0')
      const dy = str(block.data, 'dy', '0')
      const t = str(block.data, 'time', '')
      return `.move(${dx}, ${dy}${t ? `, ${t}` : ''})`
    }
    case 'Alpha': {
      const val = str(block.data, 'val', '1')
      const t = str(block.data, 'time', '')
      return `.alpha(${val}${t ? `, ${t}` : ''})`
    }
    case 'Scale': {
      const val = str(block.data, 'val', '1')
      const t = str(block.data, 'time', '')
      return `.scale(${val}${t ? `, ${t}` : ''})`
    }
    case 'RotateBy': {
      const angle = str(block.data, 'angle', '0')
      const t = str(block.data, 'time', '')
      return `.rotate(${angle}${t ? `, ${t}` : ''})`
    }
    case 'SetLayer': return `.index(${str(block.data, 'index', '0')})`
    case 'SetTint': return `.setTint(${str(block.data, 'color', '#ffffff')})`
    case 'ObjLoop': return '.loop()'
    case 'AnimPause': return '.pause()'
    case 'AnimStop': return '.stop()'
    case 'SetSpeed': return `.speed(${str(block.data, 'val', '1')})`
    case 'Blur': {
      const val = str(block.data, 'val', '0')
      const t = str(block.data, 'time', '')
      return `.blur(${val}${t ? `, ${t}` : ''})`
    }
    case 'Brightness': {
      const val = str(block.data, 'val', '1')
      const t = str(block.data, 'time', '')
      return `.brightness(${val}${t ? `, ${t}` : ''})`
    }
    case 'Contrast': {
      const val = str(block.data, 'val', '1')
      const t = str(block.data, 'time', '')
      return `.contrast(${val}${t ? `, ${t}` : ''})`
    }
    case 'Saturation': {
      const val = str(block.data, 'val', '1')
      const t = str(block.data, 'time', '')
      return `.saturation(${val}${t ? `, ${t}` : ''})`
    }
    case 'RgbFilter': {
      const r = str(block.data, 'r', '0')
      const g = str(block.data, 'g', '0')
      const b = str(block.data, 'b', '0')
      const t = str(block.data, 'time', '')
      return `.rgb(${r}, ${g}, ${b}${t ? `, ${t}` : ''})`
    }
    case 'ClearFilters': return '.clearFilters()'
    case 'AudioPlay': return '.begin()'
    case 'AudioLoop': return '.loop()'
    case 'AudioPause': return '.pause()'
    case 'AudioStop': return '.stop()'
    case 'SetVolume': {
      const vol = str(block.data, 'vol', '1')
      const t = str(block.data, 'time', '')
      return `.volume(${vol}${t ? `, ${t}` : ''})`
    }
    case 'AudioFadeOut': return '.fadeOut()'
    case 'FilterApply': return '.begin()'
    default: return ''
  }
}

/**
 * 将单个卡片块转换为代码并追加到 codeLines，
 * 同时在 blockLineMap 中记录该块对应的行号范围。
 */
function blockToCode(
  block: VisualBlock,
  blocks: VisualBlock[],
  level: number,
  codeLines: string[],
  blockLineMap: Map<number, string>
): void {
  const ind = indent(level)
  // 记录当前行数，以便映射该块生成的所有行
  const startLine = codeLines.length + 1

  switch (block.blockType) {
    case 'ObjectReference': {
      const target = str(block.data, 'objectName', str(block.data, 'target', 'obj'))
      let code = `${ind}${target}`
      for (const cid of block.childBlockIds) {
        const child = blocks.find((b) => b.id === cid)
        if (!child) continue
        code += blockToInlineStr(child)
      }
      codeLines.push(code)
      break
    }

    case 'VariableDecl': {
      const name = str(block.data, 'name', 'var')
      const value = str(block.data, 'value', 'null')
      codeLines.push(`${ind}let ${name} = ${value}`)
      break
    }

    case 'Assignment': {
      const name = str(block.data, 'name', 'var')
      const value = str(block.data, 'value', 'null')
      codeLines.push(`${ind}${name} = ${value}`)
      break
    }

    case 'IfStatement': {
      const condition = str(block.data, 'condition', 'true')
      codeLines.push(`${ind}if (${condition}) {`)
      renderChildBlocks(block, blocks, level + 1, codeLines, blockLineMap)
      codeLines.push(`${ind}}`)
      break
    }

    case 'WhileStatement': {
      const condition = str(block.data, 'condition', 'true')
      codeLines.push(`${ind}while (${condition}) {`)
      renderChildBlocks(block, blocks, level + 1, codeLines, blockLineMap)
      codeLines.push(`${ind}}`)
      break
    }

    case 'Wait': {
      const time = str(block.data, 'time', '1000')
      codeLines.push(`${ind}wait(${time})`)
      break
    }

    case 'AsyncBlock': {
      const timeout = str(block.data, 'timeout', '0')
      const prefix = timeout && timeout !== '0' ? `async(${timeout})` : 'async'
      codeLines.push(`${ind}${prefix} {`)
      renderChildBlocks(block, blocks, level + 1, codeLines, blockLineMap)
      codeLines.push(`${ind}}`)
      break
    }

    case 'ChoiceStatement': {
      codeLines.push(`${ind}choice {`)
      renderChildBlocks(block, blocks, level + 1, codeLines, blockLineMap)
      codeLines.push(`${ind}}`)
      break
    }

    case 'CaseStatement': {
      const label = str(block.data, 'label', '')
      codeLines.push(`${ind}case "${label}" {`)
      renderChildBlocks(block, blocks, level + 1, codeLines, blockLineMap)
      codeLines.push(`${ind}}`)
      break
    }

    case 'ChainedMethodCall': {
      const target = str(block.data, 'target', 'obj')
      const chain = block.data.chain as Array<{ method: string; args: string }> | undefined
      if (!chain || chain.length === 0) {
        codeLines.push(`${ind}${target}`)
        break
      }
      const chainStr = chain.map((c) => `.${c.method}(${c.args})`).join('')
      codeLines.push(`${ind}${target}${chainStr}`)
      break
    }

    case 'ObjectMethodCall': {
      const method = str(block.data, 'method', 'begin')
      const args = str(block.data, 'args', '')
      if (args) {
        codeLines.push(`${ind}.${method}(${args})`)
      } else {
        codeLines.push(`${ind}.${method}()`)
      }
      break
    }

    case 'Say': {
      const text = str(block.data, 'text', '')
      const audio = str(block.data, 'audio', '')
      codeLines.push(`${ind}say("${text}"${audio ? `, "${audio}"` : ''})`)
      break
    }

    case 'FunctionDef': {
      const name = str(block.data, 'name', 'myFunc')
      const params = str(block.data, 'params', '')
      codeLines.push(`${ind}function ${name}(${params}) {`)
      renderChildBlocks(block, blocks, level + 1, codeLines, blockLineMap)
      codeLines.push(`${ind}}`)
      break
    }

    case 'ObjectFunctionDef': {
      const typeName = str(block.data, 'typeName', 'Character')
      const name = str(block.data, 'name', 'funcName')
      const params = str(block.data, 'params', '')
      codeLines.push(`${ind}ObjectFunction ${typeName}::${name}(${params}) {`)
      renderChildBlocks(block, blocks, level + 1, codeLines, blockLineMap)
      codeLines.push(`${ind}}`)
      break
    }

    // === 内置 API 块 ===

    case 'Pause':
      codeLines.push(`${ind}pause()`)
      break

    case 'ShowDialog':
      codeLines.push(`${ind}speech(1)`)
      break

    case 'HideDialog':
      codeLines.push(`${ind}speech(0)`)
      break

    case 'MathRandom':
      codeLines.push(`${ind}Math.random()`)
      break

    case 'MathFloor':
      codeLines.push(`${ind}Math.floor(${str(block.data, 'x', '0')})`)
      break

    case 'MathCeil':
      codeLines.push(`${ind}Math.ceil(${str(block.data, 'x', '0')})`)
      break

    case 'MathRound':
      codeLines.push(`${ind}Math.round(${str(block.data, 'x', '0')})`)
      break

    case 'MathAbs':
      codeLines.push(`${ind}Math.abs(${str(block.data, 'x', '0')})`)
      break

    case 'MathMin':
      codeLines.push(`${ind}Math.min(${str(block.data, 'a', '0')}, ${str(block.data, 'b', '0')})`)
      break

    case 'MathMax':
      codeLines.push(`${ind}Math.max(${str(block.data, 'a', '0')}, ${str(block.data, 'b', '0')})`)
      break

    case 'MathSin':
      codeLines.push(`${ind}Math.sin(${str(block.data, 'x', '0')})`)
      break

    case 'MathCos':
      codeLines.push(`${ind}Math.cos(${str(block.data, 'x', '0')})`)
      break

    case 'SequenceBlock': {
      codeLines.push(`${ind}sequence {`)
      renderChildBlocks(block, blocks, level + 1, codeLines, blockLineMap)
      codeLines.push(`${ind}}`)
      break
    }

    case 'CreateCharacter': {
      const tag = str(block.data, 'tagName', 'char1')
      const res = str(block.data, 'resourcePath', '')
      const name = str(block.data, 'displayName', '')
      const av = str(block.data, 'avatarPath', '')
      const args = [res ? `"${res}"` : undefined, name ? `"${name}"` : undefined, av ? `"${av}"` : undefined].filter(Boolean)
      if (!res) {
        codeLines.push(`${ind}// 创建角色 ${tag}（请设置资源路径）`)
        break
      }
      codeLines.push(`${ind}${tag} = Character.set(${args.join(', ')})`)
      break
    }

    case 'CreateBackground': {
      const tag = str(block.data, 'tagName', 'bg')
      const res = str(block.data, 'resourcePath', '')
      codeLines.push(`${ind}${tag} = Background.set("${res}")`)
      break
    }

    // === 对话 ===
    case 'ObjSay': {
      const text = str(block.data, 'text', '')
      const audio = str(block.data, 'audio', '')
      codeLines.push(`${ind}.say("${text}"${audio ? `, "${audio}"` : ''})`)
      break
    }

    // === 角色 ===
    case 'ObjBegin': {
      const modeVal = block.data.mode
      const mode = typeof modeVal === 'string' || typeof modeVal === 'number' ? String(modeVal) : ''
      codeLines.push(mode ? `${ind}.begin(${mode})` : `${ind}.begin()`)
      break
    }

    case 'ObjHide':
      codeLines.push(`${ind}.hide()`)
      break

    case 'ObjEnd':
      codeLines.push(`${ind}.end()`)
      break

    // === 背景 ===
    case 'BgBegin':
      codeLines.push(`${ind}.begin()`)
      break

    // === 位置 ===
    case 'SetPos': {
      const x = str(block.data, 'x', '0')
      const y = str(block.data, 'y', '0')
      const t = str(block.data, 'time', '')
      codeLines.push(`${ind}.setPos(${x}, ${y}${t ? `, ${t}` : ''})`)
      break
    }

    case 'MoveBy': {
      const dx = str(block.data, 'dx', '0')
      const dy = str(block.data, 'dy', '0')
      const t2 = str(block.data, 'time', '')
      codeLines.push(`${ind}.move(${dx}, ${dy}${t2 ? `, ${t2}` : ''})`)
      break
    }

    // === 变换 ===
    case 'Alpha': {
      const val = str(block.data, 'val', '1')
      const t3 = str(block.data, 'time', '')
      codeLines.push(`${ind}.alpha(${val}${t3 ? `, ${t3}` : ''})`)
      break
    }

    case 'Scale': {
      const val2 = str(block.data, 'val', '1')
      const t4 = str(block.data, 'time', '')
      codeLines.push(`${ind}.scale(${val2}${t4 ? `, ${t4}` : ''})`)
      break
    }

    case 'RotateBy': {
      const angle = str(block.data, 'angle', '0')
      const t5 = str(block.data, 'time', '')
      codeLines.push(`${ind}.rotate(${angle}${t5 ? `, ${t5}` : ''})`)
      break
    }

    case 'SetLayer':
      codeLines.push(`${ind}.index(${str(block.data, 'index', '0')})`)
      break

    case 'SetTint':
      codeLines.push(`${ind}.setTint(${str(block.data, 'color', '#ffffff')})`)
      break

    // === 动画控制 ===
    case 'ObjLoop':
      codeLines.push(`${ind}.loop()`)
      break

    case 'AnimPause':
      codeLines.push(`${ind}.pause()`)
      break

    case 'AnimStop':
      codeLines.push(`${ind}.stop()`)
      break

    case 'SetSpeed':
      codeLines.push(`${ind}.speed(${str(block.data, 'val', '1')})`)
      break

    // === 滤镜效果 ===
    case 'Blur': {
      const val3 = str(block.data, 'val', '0')
      const t6 = str(block.data, 'time', '')
      codeLines.push(`${ind}.blur(${val3}${t6 ? `, ${t6}` : ''})`)
      break
    }

    case 'Brightness': {
      const val4 = str(block.data, 'val', '1')
      const t7 = str(block.data, 'time', '')
      codeLines.push(`${ind}.brightness(${val4}${t7 ? `, ${t7}` : ''})`)
      break
    }

    case 'Contrast': {
      const val5 = str(block.data, 'val', '1')
      const t8 = str(block.data, 'time', '')
      codeLines.push(`${ind}.contrast(${val5}${t8 ? `, ${t8}` : ''})`)
      break
    }

    case 'Saturation': {
      const val6 = str(block.data, 'val', '1')
      const t9 = str(block.data, 'time', '')
      codeLines.push(`${ind}.saturation(${val6}${t9 ? `, ${t9}` : ''})`)
      break
    }

    case 'RgbFilter': {
      const r = str(block.data, 'r', '0')
      const g = str(block.data, 'g', '0')
      const b = str(block.data, 'b', '0')
      const t10 = str(block.data, 'time', '')
      codeLines.push(`${ind}.rgb(${r}, ${g}, ${b}${t10 ? `, ${t10}` : ''})`)
      break
    }

    case 'ClearFilters':
      codeLines.push(`${ind}.clearFilters()`)
      break

    // === 音频 ===
    case 'CreateAudio': {
      const path = str(block.data, 'path', '')
      if (!path) {
        codeLines.push(`${ind}// 创建音频（请设置路径）`)
        break
      }
      codeLines.push(`${ind}${str(block.data, 'tagName', 'audio1')} = Audio.set("${path}")`)
      break
    }

    case 'AudioPlay':
      codeLines.push(`${ind}.begin()`)
      break

    case 'AudioLoop':
      codeLines.push(`${ind}.loop()`)
      break

    case 'AudioPause':
      codeLines.push(`${ind}.pause()`)
      break

    case 'AudioStop':
      codeLines.push(`${ind}.stop()`)
      break

    case 'SetVolume': {
      const vol = str(block.data, 'vol', '1')
      const t11 = str(block.data, 'time', '')
      codeLines.push(`${ind}.volume(${vol}${t11 ? `, ${t11}` : ''})`)
      break
    }

    case 'AudioFadeOut':
      codeLines.push(`${ind}.fadeOut()`)
      break

    // === 全局滤镜 ===
    case 'CreateFilter':
      codeLines.push(`${ind}${str(block.data, 'tagName', 'filter1')} = Filter.set()`)
      break

    case 'FilterApply':
      codeLines.push(`${ind}.begin()`)
      break

    // === 控制 ===
    case 'Print':
      codeLines.push(`${ind}print(${str(block.data, 'value', '')})`)
      break

    case 'Return':
      codeLines.push(`${ind}return ${str(block.data, 'value', '')}`)
      break

    case 'Start':
      break // Start 块不产生代码

    default:
      codeLines.push(`${ind}// 未知块类型: ${block.blockType}`)
      break
  }

  // 将该块生成的所有行映射到 block.id
  const endLine = codeLines.length
  for (let line = startLine; line <= endLine; line++) {
    blockLineMap.set(line, block.id)
  }
}

/**
 * 渲染块内部的子块
 */
function renderChildBlocks(
  parent: VisualBlock,
  blocks: VisualBlock[],
  level: number,
  codeLines: string[],
  blockLineMap: Map<number, string>
): void {
  // 优先使用 childBlockIds
  if (parent.childBlockIds.length > 0) {
    // 收集子块及其 nextBlockId 延续
    const allChildren: VisualBlock[] = []
    for (const cid of parent.childBlockIds) {
      const child = blocks.find((b) => b.id === cid)
      if (!child) continue
      allChildren.push(child)
      // 递归跟随子块的 nextBlockId
      let nextId = child.nextBlockId
      while (nextId) {
        const next = blocks.find((b) => b.id === nextId)
        if (!next) break
        if (parent.childBlockIds.includes(next.id)) break // 防重复
        allChildren.push(next)
        nextId = next.nextBlockId
      }
    }
    for (const child of allChildren) {
      blockToCode(child, blocks, level, codeLines, blockLineMap)
    }
  }
}

/**
 * 将全部可视块转换为代码字符串，同时返回行号→块ID映射表
 */
function generateCodeWithMap(blocks: VisualBlock[]): { code: string; blockLineMap: Map<number, string> } {
  const headerLines = [
    '// Udseen Editor',
    '// Developer: TMomster@github.com',
    '// 剧本文件保存类型为 *.ykn',
    ''
  ]
  const codeLines: string[] = [...headerLines]
  const blockLineMap = new Map<number, string>()

  if (!blocks || blocks.length === 0) {
    return { code: codeLines.join('\n'), blockLineMap }
  }

  const start = blocks.find((b) => b.blockType === 'Start')

  if (!start) {
    // 没有 Start 块，按数组顺序输出所有非 Start 块
    const topLevel = blocks.filter((b) => b.blockType !== 'Start')
    for (const block of topLevel) {
      blockToCode(block, blocks, 0, codeLines, blockLineMap)
    }
    return { code: codeLines.join('\n'), blockLineMap }
  }

  // 从 Start 的 nextBlockId 开始遍历
  const topLevelBlocks: VisualBlock[] = []
  let currentId = start.nextBlockId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const block = blocks.find((b) => b.id === currentId)
    if (!block) break
    if (block.blockType === 'Start') {
      currentId = block.nextBlockId
      continue
    }
    // 跳过已经是其他块子块的块
    const isChild = blocks.some((p) => p.childBlockIds.includes(block.id))
    if (isChild) {
      currentId = block.nextBlockId
      continue
    }
    topLevelBlocks.push(block)
    currentId = block.nextBlockId
  }

  for (const block of topLevelBlocks) {
    blockToCode(block, blocks, 0, codeLines, blockLineMap)
  }

  return { code: codeLines.join('\n'), blockLineMap }
}

/**
 * 将全部可视块转换为代码字符串（向后兼容）
 */
export function blocksToCode(blocks: VisualBlock[]): string {
  return generateCodeWithMap(blocks).code
}

/**
 * 从可视块构建行号→块ID映射，用于运行时的卡片高亮追踪
 */
export function buildBlockLineMap(blocks: VisualBlock[]): Map<number, string> {
  return generateCodeWithMap(blocks).blockLineMap
}
