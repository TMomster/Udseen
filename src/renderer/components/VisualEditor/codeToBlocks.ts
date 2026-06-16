/**
 * 将 Udseen 源代码解析为可视化卡片块
 * 实现 "代码 → 卡片" 双向同步的解析部分
 */
import type { VisualBlock, BlockPort } from '../../../types/visualBlocks'
import { genId, getBlockColor, getBlockLabelEn } from './blockRegistry'

let idCounter = 0

function nextId(): string {
  return `vb_${++idCounter}_${Date.now()}`
}

function createPort(align: 'top' | 'bottom' | 'right', kind: 'flow' | 'value', label = ''): BlockPort {
  return { id: genId(), align, kind, label }
}

/** 解析结果：一对卡片+内部子块列表的 ID */
interface ParsedBlock {
  block: VisualBlock
  children: ParsedBlock[]
  /** 子块代码块的缩进层级 */
  indent: number
}

/** 语句解析结果 */
interface Statement {
  type: string
  indent: number
  lineNum: number
  text: string
}

/**
 * 将源代码按行解析为结构化的语句列表
 * 支持缩进感知（用于 if/while/function 等块结构）
 */
function parseStatements(code: string): Statement[] {
  const lines = code.split('\n')
  const statements: Statement[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // 跳过空行、注释、和仅包含大括号的行（{ 或 }）
    if (!trimmed || trimmed.startsWith('//') || /^[{}]\s*$/.test(trimmed)) continue

    const indentLevel = Math.floor((line.length - trimmed.length) / 2)
    // 去除末尾可选的分号（.ykn 语法中分号可有可无）
    const cleanText = trimmed.replace(/;\s*$/, '')

    // === 检测链式调用续行（.method(...) 行）===
    if (/^\.\w+\s*\(/.test(cleanText) && statements.length > 0) {
      const prev = statements[statements.length - 1]
      prev.text += '\n' + cleanText
      // 重新推断类型（可能变为 ChainedMethodCall）
      if (prev.type === 'Unknown' || prev.type === 'ObjectMethodCall') {
        prev.type = inferType(prev.text)
      }
      continue
    }

    // === 纯变量名 + 后续 .method() 链 ===
    if (/^\w+$/.test(cleanText) && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim()
      if (/^\.\w+\s*\(/.test(nextTrimmed)) {
        let mergedText = cleanText
        let j = i + 1
        while (j < lines.length) {
          const t = lines[j].trim()
          if (/^\.\w+\s*\(/.test(t)) {
            mergedText += '\n' + t
            j++
          } else {
            break
          }
        }
        statements.push({
          type: inferType(mergedText),
          indent: indentLevel,
          lineNum: i + 1,
          text: mergedText
        })
        i = j - 1
        continue
      }
    }

    // 单行链式调用：obj.method1(args1).method2(args2)  → 转为多行 ObjectReference 格式
    const singleLineChainMatch = cleanText.match(/^(\w+)((?:\.\w+\s*\([^)]*\)){2,})$/)
    if (singleLineChainMatch) {
      const methodLines = singleLineChainMatch[2].match(/\.\w+\s*\([^)]*\)/g) || []
      const mergedText = singleLineChainMatch[1] + '\n' + methodLines.join('\n')
      statements.push({
        type: 'ObjectReference',
        indent: indentLevel,
        lineNum: i + 1,
        text: mergedText
      })
      continue
    }

    statements.push({
      type: inferType(cleanText),
      indent: indentLevel,
      lineNum: i + 1,
      text: cleanText
    })
  }

  return statements
}

/** 根据语句文本推断类型 */
function inferType(text: string): string {
  // 内置 API 函数检测（需在 ObjectMethodCall 之前匹配）
  if (/^pause\s*\(/.test(text)) return 'Pause'
  if (/^speech\s*\(\s*0\s*\)/.test(text)) return 'HideDialog'
  if (/^speech\s*\(\s*1\s*\)/.test(text)) return 'ShowDialog'
  if (/^Math\.random\s*\(/.test(text)) return 'MathRandom'
  if (/^Math\.floor\s*\(/.test(text)) return 'MathFloor'
  if (/^Math\.ceil\s*\(/.test(text)) return 'MathCeil'
  if (/^Math\.round\s*\(/.test(text)) return 'MathRound'
  if (/^Math\.abs\s*\(/.test(text)) return 'MathAbs'
  if (/^Math\.min\s*\(/.test(text)) return 'MathMin'
  if (/^Math\.max\s*\(/.test(text)) return 'MathMax'
  if (/^Math\.sin\s*\(/.test(text)) return 'MathSin'
  if (/^Math\.cos\s*\(/.test(text)) return 'MathCos'
  if (/^sequence/.test(text)) return 'SequenceBlock'

  if (/^let\s+\w+\s*=\s*Character\.set\s*\(/.test(text)) return 'CreateCharacter'
  if (/^\w+\s*=\s*Character\.set\s*\(/.test(text)) return 'CreateCharacter'
  if (/^let\s+\w+\s*=\s*Background\.set\s*\(/.test(text)) return 'CreateBackground'
  if (/^\w+\s*=\s*Background\.set\s*\(/.test(text)) return 'CreateBackground'
  if (/^let\s+\w+/.test(text)) return 'VariableDecl'
  if (/^\w+\s*=/.test(text) && !/^(let|if|while|function|ObjectFunction|choice|async|parallel|sequence|case|return)/.test(text)) return 'Assignment'
  if (/^if\s*\(/.test(text)) return 'IfStatement'
  if (/^while\s*\(/.test(text)) return 'WhileStatement'
  if (/^wait\s*\(/.test(text)) return 'Wait'
  if (/^async/.test(text)) return 'AsyncBlock'
  if (/^choice/.test(text)) return 'ChoiceStatement'
  if (/^function\s+\w+/.test(text)) return 'FunctionDef'
  if (/^ObjectFunction\s+\w+(?:\.|::)[\w\u4e00-\u9fff]+/.test(text)) return 'ObjectFunctionDef'
  // 链式方法调用（多行合并后含 \n）
  if (text.includes('\n') && /^\w+\n\.\w+\s*\(/.test(text)) return 'ObjectReference'
  // === 新增对象方法调用模式（在 ObjectMethodCall 通用匹配之前）===
  if (/^\w+\.say\s*\(/.test(text)) return 'ObjSay'
  if (/^\w+\.begin\s*\(/.test(text)) return 'ObjBegin'
  if (/^\w+\.visible\s*\(/.test(text)) return 'ObjVisible'
  if (/^\w+\.autobegin\s*\(/.test(text)) return 'Autobegin'
  if (/^\w+\.hide\s*\(/.test(text)) return 'ObjVisible'
  if (/^\w+\.end\s*\(/.test(text)) return 'ObjEnd'
  if (/^\w+\.setPos\s*\(/.test(text)) return 'SetPos'
  if (/^\w+\.move\s*\(/.test(text)) return 'MoveBy'
  if (/^\w+\.alpha\s*\(/.test(text)) return 'Alpha'
  if (/^\w+\.scale\s*\(/.test(text)) return 'Scale'
  if (/^\w+\.rotate\s*\(/.test(text)) return 'RotateBy'
  if (/^\w+\.index\s*\(/.test(text)) return 'SetLayer'
  if (/^\w+\.setTint\s*\(/.test(text)) return 'SetTint'
  if (/^\w+\.loop\s*\(/.test(text)) return 'ObjLoop'
  if (/^\w+\.pause\s*\(/.test(text)) return 'AnimPause'
  if (/^\w+\.stop\s*\(/.test(text)) return 'AnimStop'
  if (/^\w+\.speed\s*\(/.test(text)) return 'SetSpeed'
  if (/^\w+\.blur\s*\(/.test(text)) return 'Blur'
  if (/^\w+\.brightness\s*\(/.test(text)) return 'Brightness'
  if (/^\w+\.contrast\s*\(/.test(text)) return 'Contrast'
  if (/^\w+\.saturation\s*\(/.test(text)) return 'Saturation'
  if (/^\w+\.bw\s*\(/.test(text)) return 'Bw'
  if (/^\w+\.distort\s*\(/.test(text)) return 'Distort'
  if (/^\w+\.psychedelic\s*\(/.test(text)) return 'Psychedelic'
  if (/^\w+\.rgb\s*\(/.test(text)) return 'RgbFilter'
  if (/^\w+\.clearFilters\s*\(/.test(text)) return 'ClearFilters'
  if (/^\w+\.volume\s*\(/.test(text)) return 'SetVolume'
  if (/^\w+\.fadeOut\s*\(/.test(text)) return 'AudioFadeOut'
  if (/^print\s*\(/.test(text)) return 'Print'
  if (/^return\s+/.test(text)) return 'Return'
  if (/^\w+\s*=\s*Audio\.set\s*\(/.test(text)) return 'CreateAudio'
  if (/^\w+\s*=\s*Filter\.set\s*\(/.test(text)) return 'CreateFilter'
  if (/^\w+\s*=\s*Background\.set\s*\(/.test(text)) return 'CreateBackground'
  if (/^let\s+\w+\s*=\s*Background\.set\s*\(/.test(text)) return 'CreateBackground'
  if (/^say\s*\(/.test(text)) return 'Say'
  if (/^speech\s*\(/.test(text)) return 'Say'
  // === Text 对象方法 ===
  if (/^\w+\.size\s*\(/.test(text)) return 'TextSize'
  if (/^\w+\.px\s*\(/.test(text)) return 'TextSize'
  if (/^\w+\.bold\s*\(/.test(text)) return 'TextBold'
  if (/^\w+\.italic\s*\(/.test(text)) return 'TextItalic'
  if (/^\w+\.uline\s*\(/.test(text)) return 'TextUline'
  if (/^\w+\.deline\s*\(/.test(text)) return 'TextDeline'
  // Text.set 创建文本
  if (/^let\s+\w+\s*=\s*Text\.set\s*\(/.test(text)) return 'CreateText'
  if (/^\w+\s*=\s*Text\.set\s*\(/.test(text)) return 'CreateText'
  if (/^\w+\.\w+\s*\(/.test(text)) return 'ObjectMethodCall'
  if (/^parallel/.test(text)) return 'AsyncBlock'
  if (/^case\s+/.test(text)) return 'CaseStatement'
  if (/^jump\s*\(/.test(text)) return 'ObjectMethodCall'
  if (/^set\s*\(/.test(text)) return 'ObjectMethodCall'
  return 'Unknown'
}

/**
 * 将一条语句文本解析为卡片块的 data
 */
function parseBlockData(type: string, text: string): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  switch (type) {
    case 'VariableDecl': {
      const match = text.match(/^let\s+(\w+)\s*=\s*(.*)$/)
      if (match) {
        data.name = match[1]
        data.value = match[2].trimEnd()
      }
      break
    }
    case 'Assignment': {
      const match = text.match(/^(\w+)\s*=\s*(.*)$/)
      if (match) {
        data.name = match[1]
        data.value = match[2].trimEnd()
      }
      break
    }
    case 'IfStatement': {
      const match = text.match(/^if\s*\((.+)\)/)
      if (match) data.condition = match[1].trim()
      break
    }
    case 'WhileStatement': {
      const match = text.match(/^while\s*\((.+)\)/)
      if (match) data.condition = match[1].trim()
      break
    }
    case 'Wait': {
      const match = text.match(/wait\s*\(\s*(\d+)\s*\)/)
      if (match) data.time = match[1]
      if (!data.time) data.time = '1000'
      break
    }
    case 'AsyncBlock': {
      const match = text.match(/async\s*(?:\(\s*(\d+)\s*\))?/)
      if (match && match[1]) data.timeout = match[1]
      if (!data.timeout) data.timeout = '0'
      break
    }
    case 'ChoiceStatement': {
      // 从后续 case 行提取，这里只初始化
      data.choices = []
      break
    }
    case 'ObjectMethodCall': {
      const match = text.match(/^(\w+(?:\.\w+)*)\.(\w+)\s*\(([^)]*)\)/)
      if (match) {
        data.target = match[1]
        data.method = match[2]
        data.args = match[3].trim()
      } else {
        // fallback: try simpler pattern for `jump("x")`, `set("x")` etc.
        const simpleMatch = text.match(/^(\w+)\s*\(([^)]*)\)/)
        if (simpleMatch) {
          data.target = simpleMatch[1]
          data.method = 'call'
          data.args = simpleMatch[2].trim()
        }
      }
      break
    }
    case 'Say': {
      const match = text.match(/^(?:speech|say)\s*\(\s*"([^"]*)"\s*(?:,\s*"([^"]*)")?\s*\)/)
      if (match) {
        data.text = match[1]
        if (match[2]) data.audio = match[2]
      } else {
        const simpleMatch = text.match(/^(?:speech|say)\s*\(\s*([^)]+)\s*\)/)
        if (simpleMatch) data.text = simpleMatch[1].trim()
      }
      break
    }
    case 'FunctionDef': {
      const match = text.match(/^function\s+(\w+)\s*\(\s*([^)]*)\s*\)/)
      if (match) {
        data.name = match[1]
        data.params = match[2].trim()
      }
      break
    }
    case 'ObjectFunctionDef': {
      const match = text.match(/^ObjectFunction\s+(\w+)(?:\.|::)([\w\u4e00-\u9fff]+)\s*\(\s*([^)]*)\s*\)/)
      if (match) {
        data.typeName = match[1]
        data.name = match[2]
        data.params = match[3].trim()
      }
      break
    }
    // === 角色创建 & 背景设置 ===
    case 'CreateCharacter': {
      // [let] tagName = Character.set("resourcePath", "displayName", "avatarPath")
      const match = text.match(/^(?:let\s+)?(\w+)\s*=\s*Character\.set\s*\(\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)/)
      if (match) {
        data.tagName = match[1]
        data.resourcePath = match[2]
        data.displayName = match[3] || ''
        data.avatarPath = match[4] || ''
      } else {
        // Fallback: try without quotes
        const fallbackMatch = text.match(/^(?:let\s+)?(\w+)\s*=\s*Character\.set\s*\(\s*([^),]*)(?:\s*,\s*([^),]*))?(?:\s*,\s*([^),]*))?\s*\)/)
        if (fallbackMatch) {
          data.tagName = fallbackMatch[1]
          data.resourcePath = fallbackMatch[2]?.replace(/"/g, '') || ''
          data.displayName = fallbackMatch[3]?.replace(/"/g, '') || ''
          data.avatarPath = fallbackMatch[4]?.replace(/"/g, '') || ''
        }
      }
      break
    }
    case 'CreateBackground': {
      // [let] tagName = Background.set("resourcePath")
      const m = text.match(/^(?:let\s+)?(\w+)\s*=\s*Background\.set\s*\(\s*"([^"]*)"\s*\)/)
      if (m) {
        data.tagName = m[1]
        data.resourcePath = m[2]
      } else {
        const fm = text.match(/^(?:let\s+)?(\w+)\s*=\s*Background\.set\s*\(\s*([^)]+)\s*\)/)
        if (fm) {
          data.tagName = fm[1]
          data.resourcePath = fm[2]?.replace(/"/g, '') || ''
        }
      }
      break
    }
    // === 对象引用（链式调用容器） ===
    case 'ObjectReference': {
      const lines = text.split('\n')
      data.objectName = lines[0].trim()
      data.target = lines[0].trim()
      // 提取链式方法信息用于创建子动作块（支持单行多方法如 .scale(2).begin()）
      const chainMethods: Array<{ method: string; args: string }> = []
      for (let ci = 1; ci < lines.length; ci++) {
        const line = lines[ci].trim()
        // 全局匹配同一行中的所有 .method(args)
        const globalRe = /\.(\w+)\s*\(([^)]*)\)/g
        let m: RegExpExecArray | null
        while ((m = globalRe.exec(line)) !== null) {
          chainMethods.push({ method: m[1], args: m[2].trim() })
        }
      }
      if (chainMethods.length > 0) data._chainMethods = chainMethods
      break
    }

    // === 链式方法调用（旧格式兼容） ===
    case 'ChainedMethodCall': {
      const lines = text.split('\n')
      data.target = lines[0].trim()
      const chain = lines.slice(1).map(line => {
        const m = line.match(/\.(\w+)\s*\(([^)]*)\)/)
        if (m) return { method: m[1], args: m[2].trim() }
        return null
      }).filter(Boolean)
      data.chain = chain
      break
    }
    // === 内置 API 函数 ===
    case 'MathFloor':
    case 'MathCeil':
    case 'MathRound':
    case 'MathAbs':
    case 'MathSin':
    case 'MathCos': {
      const m = text.match(/Math\.\w+\s*\(\s*([^)]*)\s*\)/)
      if (m) data.x = m[1].trim()
      break
    }
    case 'MathMin':
    case 'MathMax': {
      const m = text.match(/Math\.\w+\s*\(\s*([^)]*)\s*\)/)
      if (m) {
        const parts = m[1].split(',').map(s => s.trim())
        data.a = parts[0] || ''
        data.b = parts[1] || ''
      }
      break
    }
    // === 文本创建 & 全屏背景 ===
    case 'CreateText': {
      // [let] tagName = Text.set("content", "tagName")
      const m = text.match(/^(?:let\s+)?(\w+)\s*=\s*Text\.set\s*\(\s*"([^"]*)"\s*(?:,\s*"([^"]*)")?\s*\)/)
      if (m) {
        data.text = m[2]
        data.tagName = m[3] || m[1]
      } else {
        const fm = text.match(/^(?:let\s+)?(\w+)\s*=\s*Text\.set\s*\(\s*([^)]+)\s*\)/)
        if (fm) {
          const parts = fm[2].split(',').map(s => s.trim().replace(/"/g, ''))
          data.text = parts[0] || ''
          data.tagName = parts[1] || fm[1]
        }
      }
      break
    }
    case 'BgIndex': {
      const m = text.match(/^(\w+)\.index\s*\(\s*([^)]+)\s*\)/)
      if (m) { data.target = m[1]; data.index = m[2].trim() }
      break
    }
    case 'BgVisible': {
      const m = text.match(/^(\w+)\.visible\s*\(\s*(\w+)\s*\)/)
      if (m) { data.target = m[1]; data.able = m[2] }
      break
    }
    // === 文本属性方法 ===
    case 'TextSize': {
      const m = text.match(/^(\w+)\.(?:size|px)\s*\(\s*([^)]+)\s*\)/)
      if (m) { data.target = m[1]; data.val = m[2].trim() }
      break
    }
    case 'TextBold': {
      const m = text.match(/^(\w+)\.bold\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'TextItalic': {
      const m = text.match(/^(\w+)\.italic\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'TextUline': {
      const m = text.match(/^(\w+)\.uline\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'TextDeline': {
      const m = text.match(/^(\w+)\.deline\s*\(/)
      if (m) data.target = m[1]
      break
    }
    // === 新增卡片块解析模式 ===
    case 'ObjSay': {
      const m = text.match(/^(\w+)\.say\s*\(\s*"([^"]*)"\s*(?:,\s*"([^"]*)")?\s*\)/)
      if (m) { data.target = m[1]; data.text = m[2]; if (m[3]) data.audio = m[3] }
      break
    }
    case 'ObjBegin': {
      const m = text.match(/^(\w+)\.begin\s*\(\s*(\w+)?\s*\)/)
      if (m) { data.target = m[1]; data.visible = m[2] || 'true' }
      break
    }
    case 'ObjVisible': {
      // obj.visible(able, time?) or old obj.hide()
      const m = text.match(/^(\w+)\.visible\s*\(\s*(\w+)\s*(?:,\s*(\d+))?\s*\)/)
      if (m) {
        data.target = m[1]
        data.able = m[2]
        if (m[3]) data.time = m[3]
      } else {
        const hideMatch = text.match(/^(\w+)\.hide\s*\(/)
        if (hideMatch) { data.target = hideMatch[1]; data.able = 'false'; data.time = '' }
      }
      break
    }
    case 'Autobegin': {
      const m = text.match(/^(\w+)\.autobegin\s*\(\s*(\w+)?\s*\)/)
      if (m) { data.target = m[1]; data.visible = m[2] || 'true' }
      break
    }
    case 'ObjEnd': {
      const m = text.match(/^(\w+)\.end\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'SetPos': {
      const m = text.match(/^(\w+)\.setPos\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*(?:,\s*([^)]+))?\s*\)/)
      if (m) { data.target = m[1]; data.x = m[2].trim(); data.y = m[3].trim(); if (m[4]) data.time = m[4].trim() }
      break
    }
    case 'MoveBy': {
      const m = text.match(/^(\w+)\.move\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*(?:,\s*([^)]+))?\s*\)/)
      if (m) { data.target = m[1]; data.dx = m[2].trim(); data.dy = m[3].trim(); if (m[4]) data.time = m[4].trim() }
      break
    }
    case 'Alpha': case 'Scale': case 'Brightness': case 'Contrast': case 'Saturation':
    case 'Blur': case 'SetSpeed': {
      const methodMap: Record<string, string> = { Alpha: 'alpha', Scale: 'scale', Brightness: 'brightness', Contrast: 'contrast', Saturation: 'saturation', Blur: 'blur', SetSpeed: 'speed' }
      const method = methodMap[type] || type.toLowerCase()
      const m = text.match(new RegExp(`^(\\w+)\\.${method}\\s*\\(\\s*([^,]+)\\s*(?:,\\s*([^)]+))?\\s*\\)`))
      if (m) { data.target = m[1]; data.val = m[2].trim(); if (m[3]) data.time = m[3].trim() }
      break
    }
    case 'Bw': {
      // .bw(val, time?, intensity?)
      const m = text.match(/^(\w+)\.bw\s*\(\s*([^,]+)\s*(?:,\s*([^,]+))?\s*(?:,\s*([^)]+))?\s*\)/)
      if (m) {
        data.target = m[1]; data.val = m[2].trim()
        if (m[3]) data.time = m[3].trim()
        if (m[4]) data.intensity = m[4].trim()
      }
      break
    }
    case 'Distort': {
      const m = text.match(/^(\w+)\.distort\s*\(\s*([^,]+)\s*(?:,\s*([^,]+))?\s*(?:,\s*([^)]+))?\s*\)/)
      if (m) {
        data.target = m[1]; data.val = m[2].trim()
        if (m[3]) data.time = m[3].trim()
        if (m[4]) data.intensity = m[4].trim()
      }
      break
    }
    case 'Psychedelic': {
      const m = text.match(/^(\w+)\.psychedelic\s*\(\s*([^,]+)\s*(?:,\s*([^,]+))?\s*(?:,\s*([^)]+))?\s*\)/)
      if (m) {
        data.target = m[1]; data.val = m[2].trim()
        if (m[3]) data.time = m[3].trim()
        if (m[4]) data.intensity = m[4].trim()
      }
      break
    }
    case 'RotateBy': {
      const m = text.match(/^(\w+)\.rotate\s*\(\s*([^,]+)\s*(?:,\s*([^)]+))?\s*\)/)
      if (m) { data.target = m[1]; data.angle = m[2].trim(); if (m[3]) data.time = m[3].trim() }
      break
    }
    case 'SetLayer': {
      const m = text.match(/^(\w+)\.index\s*\(\s*([^)]+)\s*\)/)
      if (m) { data.target = m[1]; data.index = m[2].trim() }
      break
    }
    case 'SetTint': {
      const m = text.match(/^(\w+)\.setTint\s*\(\s*([^)]+)\s*\)/)
      if (m) { data.target = m[1]; data.color = m[2].trim() }
      break
    }
    case 'ObjLoop': {
      const m = text.match(/^(\w+)\.loop\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'AnimPause': {
      const m = text.match(/^(\w+)\.pause\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'AnimStop': {
      const m = text.match(/^(\w+)\.stop\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'RgbFilter': {
      const m = text.match(/^(\w+)\.rgb\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*(?:,\s*([^)]+))?\s*\)/)
      if (m) { data.target = m[1]; data.r = m[2].trim(); data.g = m[3].trim(); data.b = m[4].trim(); if (m[5]) data.time = m[5].trim() }
      break
    }
    case 'ClearFilters': {
      const m = text.match(/^(\w+)\.clearFilters\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'CreateAudio': {
      const m = text.match(/^(?:let\s+)?(\w+)\s*=\s*Audio\.set\s*\(\s*"([^"]*)"\s*\)/)
      if (m) { data.tagName = m[1]; data.path = m[2] } else { const fm = text.match(/^(?:let\s+)?(\w+)\s*=\s*Audio\.set\s*\(\s*([^)]+)\s*\)/); if (fm) { data.tagName = fm[1]; data.path = (fm[2] || '').replace(/"/g,'') } }
      break
    }
    case 'CreateFilter': {
      const m = text.match(/^(?:let\s+)?(\w+)\s*=\s*Filter\.set\s*\(/)
      if (m) data.tagName = m[1]
      break
    }
    case 'AudioPlay': {
      const m = text.match(/^(\w+)\.begin\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'AudioLoop': {
      const m = text.match(/^(\w+)\.loop\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'AudioPause': {
      const m = text.match(/^(\w+)\.pause\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'AudioStop': {
      const m = text.match(/^(\w+)\.stop\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'SetVolume': {
      const m = text.match(/^(\w+)\.volume\s*\(\s*([^,]+)\s*(?:,\s*([^)]+))?\s*\)/)
      if (m) { data.target = m[1]; data.vol = m[2].trim(); if (m[3]) data.time = m[3].trim() }
      break
    }
    case 'AudioFadeOut': {
      const m = text.match(/^(\w+)\.fadeOut\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'FilterApply': {
      const m = text.match(/^(\w+)\.begin\s*\(/)
      if (m) data.target = m[1]
      break
    }
    case 'CaseStatement': {
      const match = text.match(/case\s+"([^"]*)"/)
      if (match) data.label = match[1]
      break
    }
    case 'Pause':
      // pause() 不带参数，data 保持为空
      break
    case 'Print': {
      const m = text.match(/^print\s*\(\s*(.*)\s*\)/)
      if (m) data.value = m[1].trim()
      break
    }
    case 'Return': {
      const m = text.match(/^return\s+(.*)$/)
      if (m) data.value = m[1].trim()
      break
    }
  }

  return data
}

/**
 * 根据类型创建卡片（无位置信息）
 */
function createBlockFromStatement(
  type: string,
  data: Record<string, unknown>,
  bodyStatements: Statement[],
): ParsedBlock {
  try {
    return createBlockFromStatementInner(type, data, bodyStatements)
  } catch (err) {
    console.error(`[createBlockFromStatement] 创建块失败 type=${type}:`, err)
    // 返回一个基本的 fallback 块以避免彻底崩溃
    const id = nextId()
    const color = getBlockColor(type)
    const label = getBlockLabel(type)
    const labelEn = getBlockLabelEn(type)
    const block: VisualBlock = {
      id, blockType: type, label, labelEn,
      x: 0, y: 0, width: 0, height: 0, color,
      inputPort: createPort('top', 'flow'),
      outputPort: createPort('bottom', 'flow'),
      valuePorts: [], nextBlockId: null, childBlockIds: [], data: {}, selected: false
    }
    return { block, children: [], indent: 0 }
  }
}

function createBlockFromStatementInner(
  type: string,
  data: Record<string, unknown>,
  bodyStatements: Statement[],
): ParsedBlock {
  // 自动填充默认参数（time=0、滤镜强度=100 等）
  fillDefaultArgs(type, data)
  const id = nextId()
  const color = getBlockColor(type)
  const label = getBlockLabel(type)
  const labelEn = getBlockLabelEn(type)

  // 预先声明 children/prevChild，供 ChoiceStatement 块使用
  const children: ParsedBlock[] = []
  let prevChild: ParsedBlock | null = null

  const valuePorts = buildValuePorts(type, data)
  const block: VisualBlock = {
    id,
    blockType: type,
    label,
    labelEn,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    color,
    inputPort: type !== 'Start' ? createPort('top', 'flow') : undefined,
    outputPort: createPort('bottom', 'flow'),
    valuePorts,
    nextBlockId: null,
    childBlockIds: [],
    data,
    selected: false
  }

  // 如果是选择语句，从 body 提取 choices 并按 case 分组
  if (type === 'ChoiceStatement') {
    const choices: string[] = []
    const caseGroups: Array<{ text: string; stmts: Statement[] }> = []
    let currentCase: { text: string; stmts: Statement[] } | null = null
    for (const stmt of bodyStatements) {
      if (stmt.type === 'CaseStatement') {
        const match = stmt.text.match(/case\s+"([^"]*)"/)
        const text = match ? match[1] : ''
        choices.push(text)
        currentCase = { text, stmts: [] }
        caseGroups.push(currentCase)
      } else if (currentCase) {
        currentCase.stmts.push(stmt)
      }
    }
    data.choices = choices.length > 0 ? choices : ['']

    // 为每个 case 创建 CaseStatement 区块（含子体块）
    for (const cg of caseGroups) {
      const caseData = { label: cg.text }
      const caseParsed = createBlockFromStatement('CaseStatement', caseData, cg.stmts)
      if (prevChild) {
        prevChild.block.nextBlockId = caseParsed.block.id
      }
      prevChild = caseParsed
      children.push(caseParsed)
    }

    block.childBlockIds = children.map((c) => c.block.id)
    return { block, children, indent: 0 }
  }

  // ObjectReference: 从 data._chainMethods 解析子动作块
  if (type === 'ObjectReference') {
    const chainMethods = data._chainMethods as Array<{ method: string; args: string }> | undefined
    if (chainMethods && chainMethods.length > 0) {
      delete data._chainMethods
      const target = data.target as string
      for (const cm of chainMethods) {
        const reconstructed = `${target}.${cm.method}(${cm.args})`
        const childType = inferType(reconstructed)
        const childData = parseBlockData(childType, reconstructed)
        fillDefaultArgs(childType, childData)
        delete childData.target
        const childParsed = createBlockFromStatement(childType, childData, [])
        if (prevChild) {
          prevChild.block.nextBlockId = childParsed.block.id
        }
        prevChild = childParsed
        children.push(childParsed)
      }
    }
  }

  // 使用索引迭代处理子语句，每处理一个块后跳过其所有子级语句，避免重复处理
  let si = 0
  while (si < bodyStatements.length) {
    const stmt = bodyStatements[si]
    si++
    // 跳过 case 标记行（已由 ChoiceStatement 的 case 分组处理）
    if (stmt.type === 'CaseStatement') continue

    const childData = parseBlockData(stmt.type, stmt.text)
    const childIndent = stmt.indent
    const childBody: Statement[] = []
    while (si < bodyStatements.length && bodyStatements[si].indent > childIndent) {
      childBody.push(bodyStatements[si])
      si++
    }

    let childParsed = createBlockFromStatement(stmt.type, childData, childBody)

    // 如果子动作块有 target，包裹在 ObjectReference 中
    if (ACTION_TYPES_WITH_TARGET.has(stmt.type) && childData.target) {
      const targetName = childData.target as string
      delete childParsed.block.data.target
      const objRefData = { objectName: targetName, target: targetName }
      const objRefParsed = createBlockFromStatement('ObjectReference', objRefData, [])
      objRefParsed.children.push(childParsed)
      objRefParsed.block.childBlockIds.push(childParsed.block.id)
      childParsed = objRefParsed
    }

    if (prevChild) {
      prevChild.block.nextBlockId = childParsed.block.id
    }
    prevChild = childParsed
    children.push(childParsed)
  }

  block.childBlockIds = children.map((c) => c.block.id)
  return { block, children, indent: 0 }
}

/** 包含 target 数据的动作块类型（需要包裹在 ObjectReference 中） */
const ACTION_TYPES_WITH_TARGET = new Set([
  'SetPos', 'MoveBy', 'Alpha', 'Scale', 'RotateBy', 'SetLayer', 'SetTint',
  'ObjLoop', 'AnimPause', 'AnimStop', 'SetSpeed',
  'Blur', 'Brightness', 'Contrast', 'Saturation', 'RgbFilter', 'ClearFilters',
  'Bw', 'Distort', 'Psychedelic',
  'ObjSay', 'ObjBegin', 'ObjVisible', 'Autobegin', 'ObjEnd', 'BgBegin', 'BgFit', 'BgIndex', 'BgVisible',
  'AudioPlay', 'AudioLoop', 'AudioPause', 'AudioStop', 'SetVolume', 'AudioFadeOut',
  'FilterApply', 'ObjectMethodCall',
  'TextSize', 'TextBold', 'TextItalic', 'TextUline', 'TextDeline'
])

function getBlockLabel(type: string): string {
  const labels: Record<string, string> = {
    'Start': '开始',
    'ObjectReference': '对象引用',
    'VariableDecl': '声明变量',
    'Assignment': '赋值',
    'IfStatement': '如果',
    'WhileStatement': '循环',
    'Wait': '等待',
    'AsyncBlock': '异步并行',
    'ChoiceStatement': '选项',
    'ObjectMethodCall': '对象方法调用',
    'ChainedMethodCall': '动画链调用',
    'Say': '旁白',
    'FunctionDef': '定义函数',
    'ObjectFunctionDef': '对象函数定义',
    'CreateCharacter': '创建角色',
    'CreateBackground': '设置背景',
    'CreateText': '创建文本',
    'Pause': '暂停等待',
    'SequenceBlock': '顺序执行',
    'ShowDialog': '显示对话框',
    'HideDialog': '隐藏对话框',
    'MathRandom': '随机数',
    'MathFloor': '向下取整',
    'MathCeil': '向上取整',
    'MathRound': '四舍五入',
    'MathAbs': '绝对值',
    'MathMin': '最小值',
    'MathMax': '最大值',
    'MathSin': '正弦',
    'MathCos': '余弦',
    'CaseStatement': '选项分支',
    'Unknown': '代码块',
    'ObjSay': '角色说话',
    'ObjBegin': '登场',
    'ObjVisible': '可见性',
    'Autobegin': '自动登场',
    'ObjEnd': '销毁',
    'BgBegin': '显示背景',
    'BgFit': '智能缩放',
    'BgIndex': '背景层级',
    'BgVisible': '可见性',
    'SetPos': '移动坐标',
    'MoveBy': '相对移动',
    'Alpha': '透明度',
    'Scale': '缩放',
    'RotateBy': '旋转',
    'SetLayer': '图层',
    'SetTint': '色调',
    'ObjLoop': '循环播放',
    'AnimPause': '暂停动画',
    'AnimStop': '停止动画',
    'SetSpeed': '播放速度',
    'Blur': '模糊',
    'Brightness': '明度',
    'Contrast': '对比度',
    'Saturation': '饱和度',
    'Bw': '黑白',
    'Distort': '失真',
    'Psychedelic': '迷幻',
    'RgbFilter': 'RGB颜色',
    'ClearFilters': '清除滤镜',
    'CreateAudio': '创建音频',
    'TextSize': '字号',
    'TextBold': '加粗',
    'TextItalic': '斜体',
    'TextUline': '下划线',
    'TextDeline': '删除线',
    'AudioPlay': '播放',
    'AudioLoop': '循环播放',
    'AudioPause': '暂停',
    'AudioStop': '停止',
    'SetVolume': '音量',
    'AudioFadeOut': '淡出',
    'CreateFilter': '创建滤镜',
    'FilterApply': '应用滤镜',
    'Print': '打印输出',
    'Return': '返回值'
  }
  return labels[type] || type
}

function buildValuePorts(type: string, data: Record<string, unknown>): BlockPort[] {
  const ports: BlockPort[] = []

  switch (type) {
    case 'VariableDecl':
    case 'Assignment':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '名称', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '值', acceptType: 'any' })
      break
    case 'IfStatement':
    case 'WhileStatement':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '条件', acceptType: 'any' })
      break
    case 'Wait':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '毫秒', acceptType: 'number' })
      break
    case 'AsyncBlock':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '超时(ms)', acceptType: 'number' })
      break
    case 'ChoiceStatement':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '选项文本', acceptType: 'string' })
      break
    case 'ObjectReference':
      // ObjectReference 无可编辑端口
      break
    case 'ChainedMethodCall':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      break
    case 'ObjectMethodCall':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '方法', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '参数', acceptType: 'any' })
      break
    case 'Say':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '文本', acceptType: 'string' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '音频(可选)', acceptType: 'resource' })
      break
    case 'FunctionDef':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '函数名', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '参数', acceptType: 'any' })
      break
    case 'ObjectFunctionDef':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '类型', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '函数名', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '参数', acceptType: 'any' })
      break
    // === 角色创建 & 背景设置 ===
    case 'CreateCharacter':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '角色标识', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '资源路径', acceptType: 'resource' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对话名称', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '头像路径', acceptType: 'resource' })
      break
    case 'CreateBackground':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '标识', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '资源路径', acceptType: 'resource' })
      break
    // === 内置 API 单参数 ===
    case 'MathFloor':
    case 'MathCeil':
    case 'MathRound':
    case 'MathAbs':
    case 'MathSin':
    case 'MathCos':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '数值', acceptType: 'number' })
      break
    // === 内置 API 双参数 ===
    case 'MathMin':
    case 'MathMax':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: 'a', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: 'b', acceptType: 'number' })
      break
    // === 新增卡片块 value 端口 ===
    case 'ObjSay':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '文本', acceptType: 'string' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '音频(可选)', acceptType: 'resource' })
      break
    case 'ObjBegin':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '模式', acceptType: 'any' })
      break
    case 'ObjEnd':
    case 'ObjLoop':
    case 'AnimPause':
    case 'AnimStop':
    case 'ClearFilters':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      break
    case 'SetPos':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: 'x', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: 'y', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '时间(可选)', acceptType: 'number' })
      break
    case 'MoveBy':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: 'dx', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: 'dy', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '时间(可选)', acceptType: 'number' })
      break
    case 'Alpha':
    case 'Scale':
    case 'Brightness':
    case 'Contrast':
    case 'Saturation':
    case 'Blur':
    case 'SetSpeed':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '值', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '时间(可选)', acceptType: 'number' })
      break
    case 'RotateBy':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '角度', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '时间(可选)', acceptType: 'number' })
      break
    case 'SetLayer':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '图层索引', acceptType: 'number' })
      break
    case 'SetTint':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '颜色', acceptType: 'string' })
      break
    case 'RgbFilter':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: 'R', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: 'G', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: 'B', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '时间(可选)', acceptType: 'number' })
      break
    case 'CreateAudio':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '标识', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '音频路径', acceptType: 'resource' })
      break
    case 'AudioPlay':
    case 'AudioLoop':
    case 'AudioPause':
    case 'AudioStop':
    case 'AudioFadeOut':
    case 'FilterApply':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      break
    // === 新增类型端口 ===
    case 'Autobegin':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '可见(可选)', acceptType: 'boolean' })
      break
    case 'ObjVisible':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '可见', acceptType: 'boolean' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '时间(可选)', acceptType: 'number' })
      break
    case 'Bw':
    case 'Distort':
    case 'Psychedelic':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '强度', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '时间(可选)', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '透明度', acceptType: 'number' })
      break
    case 'SetVolume':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '音量', acceptType: 'number' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '时间(可选)', acceptType: 'number' })
      break
    case 'CreateFilter':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '标识', acceptType: 'any' })
      break
    case 'CreateText':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '文本内容', acceptType: 'string' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '标识', acceptType: 'any' })
      break
    case 'BgFit':
      // 无端口，纯动作块
      break
    case 'BgIndex':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '层级', acceptType: 'number' })
      break
    case 'BgVisible':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '可见', acceptType: 'boolean' })
      break
    case 'TextSize':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '字号', acceptType: 'number' })
      break
    case 'TextBold':
    case 'TextItalic':
    case 'TextUline':
    case 'TextDeline':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '对象', acceptType: 'any' })
      break
    case 'CaseStatement':
      break
    case 'Print':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '值', acceptType: 'any' })
      break
    case 'Return':
      ports.push({ id: genId(), align: 'right', kind: 'value', label: '返回值', acceptType: 'any' })
      break
  }

  return ports
}

/**
 * 自动填充默认参数值
 * 如 time→0（默认时间）、val→100（滤镜强度）等
 */
function fillDefaultArgs(type: string, data: Record<string, unknown>): void {
  // 滤镜强度默认 1
  if (['Blur', 'Brightness', 'Contrast', 'Saturation'].includes(type)) {
    if (data.val === undefined || data.val === '') data.val = '1'
  }
  // 新滤镜默认强度 1
  if (['Bw', 'Distort', 'Psychedelic'].includes(type)) {
    if (data.val === undefined || data.val === '') data.val = '1'
    if (data.intensity === undefined || data.intensity === '') data.intensity = '1'
  }
  // SetSpeed 默认 1.0
  if (type === 'SetSpeed') {
    if (data.val === undefined || data.val === '') data.val = '1.0'
  }
  // Alpha 默认 1.0
  if (type === 'Alpha') {
    if (data.val === undefined || data.val === '') data.val = '1.0'
  }
  // Scale 默认 1.0
  if (type === 'Scale') {
    if (data.val === undefined || data.val === '') data.val = '1.0'
  }
  // ObjVisible able 默认 true
  if (type === 'ObjVisible') {
    if (data.able === undefined || data.able === '') data.able = 'true'
  }
  // Autobegin visible 默认 true
  if (type === 'Autobegin') {
    if (data.visible === undefined || data.visible === '') data.visible = 'true'
  }
  // TextSize 默认 32
  if (type === 'TextSize') {
    if (data.val === undefined || data.val === '') data.val = '32'
  }
}

/** 收集没有被嵌套在其他块中的顶层块 */
function collectTopLevelParsedBlocks(stmts: Statement[]): ParsedBlock[] {
  const result: ParsedBlock[] = []
  let i = 0

  while (i < stmts.length) {
    const stmt = stmts[i]
    if (stmt.indent > 0) {
      i++
      continue // 跳过嵌套块，由父块处理
    }

    // 找到该块的子语句（缩进更大的行）
    const bodyStmts: Statement[] = []
    let j = i + 1
    while (j < stmts.length && stmts[j].indent > stmt.indent) {
      bodyStmts.push(stmts[j])
      j++
    }

    // 多行链式调用 → ObjectReference 容器 + 子动作块
    if (stmt.type === 'ChainedMethodCall' || stmt.type === 'ObjectReference') {
      const lines = stmt.text.split('\n')
      const target = lines[0].trim()

      const objRefData = { objectName: target, target }
      const objRefParsed = createBlockFromStatement('ObjectReference', objRefData, [])

      for (let ci = 1; ci < lines.length; ci++) {
        const line = lines[ci].trim()
        const globalRe = /\.(\w+)\s*\(([^)]*)\)/g
        let m: RegExpExecArray | null
        while ((m = globalRe.exec(line)) !== null) {
          const reconstructed = `${target}.${m[1]}(${m[2].trim()})`
          const childType = inferType(reconstructed)
          const childData = parseBlockData(childType, reconstructed)
          fillDefaultArgs(childType, childData)
          delete childData.target
          const childParsed = createBlockFromStatement(childType, childData, [])
          objRefParsed.children.push(childParsed)
          objRefParsed.block.childBlockIds.push(childParsed.block.id)
        }
      }

      result.push(objRefParsed)
      i = j
      continue
    }

    const data = parseBlockData(stmt.type, stmt.text)

    // 特殊处理：查找 ChoiceStatement 的 case 子句
    if (stmt.type === 'ChoiceStatement') {
      const choices: string[] = []
      for (const bs of bodyStmts) {
        if (bs.type === 'CaseStatement') {
          const match = bs.text.match(/case\s+"([^"]*)"/)
          if (match) choices.push(match[1])
        }
      }
      if (choices.length > 0) data.choices = choices
    }

    const parsed = createBlockFromStatement(stmt.type, data, bodyStmts)

    // 如果是有 target 的动作块，包裹在 ObjectReference 中
    if (ACTION_TYPES_WITH_TARGET.has(stmt.type) && data.target) {
      const targetName = data.target as string
      delete parsed.block.data.target

      const objRefData = { objectName: targetName, target: targetName }
      const objRefParsed = createBlockFromStatement('ObjectReference', objRefData, [])
      objRefParsed.children.push(parsed)
      objRefParsed.block.childBlockIds.push(parsed.block.id)
      result.push(objRefParsed)
    } else {
      result.push(parsed)
    }
    i = j
  }

  return result
}

/**
 * 扁平化 ParsedBlock 树为 VisualBlock[]，同时设置连接关系
 */
function flattenParsedBlocks(parsedBlocks: ParsedBlock[]): VisualBlock[] {
  const blocks: VisualBlock[] = []

  function walk(parsed: ParsedBlock): void {
    blocks.push(parsed.block)
    for (const child of parsed.children) {
      walk(child)
    }
  }

  // 按数组顺序建立 nextBlockId 链
  for (let i = 0; i < parsedBlocks.length; i++) {
    if (i < parsedBlocks.length - 1) {
      parsedBlocks[i].block.nextBlockId = parsedBlocks[i + 1].block.id
    }
    walk(parsedBlocks[i])
  }

  return blocks
}

/**
 * 主要入口：将源代码解析为卡片块列表
 */
export function codeToBlocks(code: string): VisualBlock[] {
  // 清理代码
  const cleaned = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // 解析语句
  const statements = parseStatements(cleaned)

  // 如果没有有效语句，返回空（加一个 Start 块占位）
  if (statements.length === 0) {
    const startBlock: VisualBlock = {
      id: nextId(),
      blockType: 'Start',
      label: '开始',
      labelEn: 'Start',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      color: '#4a9eff',
      inputPort: undefined,
      outputPort: { id: genId(), align: 'bottom', kind: 'flow', label: '' },
      valuePorts: [],
      nextBlockId: null,
      childBlockIds: [],
      data: {},
      selected: false
    }
    return [startBlock]
  }

  // 先查找是否有显式的开始块标记（代码中通过 // Start 注释标记）
  // 如果没有，自动添加 Start 块
  const startBlock: VisualBlock = {
    id: nextId(),
    blockType: 'Start',
    label: '开始',
    labelEn: 'Start',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    color: '#4a9eff',
    inputPort: undefined,
    outputPort: { id: genId(), align: 'bottom', kind: 'flow', label: '' },
    valuePorts: [],
    nextBlockId: null,
    childBlockIds: [],
    data: {},
    selected: false
  }

  // 收集顶层块
  const topLevelParsed = collectTopLevelParsedBlocks(statements)

  // 连接 Start 到第一个顶层块
  if (topLevelParsed.length > 0) {
    startBlock.nextBlockId = topLevelParsed[0].block.id

    // 建立顶层块之间的连接
    for (let i = 0; i < topLevelParsed.length - 1; i++) {
      topLevelParsed[i].block.nextBlockId = topLevelParsed[i + 1].block.id
    }

    // 处理不完整的连接
    // 确保每个块的 nextBlockId 指向真正顺序中的下一个，防止内部连接干扰
  }

  // 收集所有块
  const allBlocks = [startBlock, ...flattenParsedBlocks(topLevelParsed)]

  return allBlocks
}
