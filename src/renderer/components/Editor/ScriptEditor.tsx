import { useEffect, useRef, useCallback, useState } from 'react'
import * as monaco from 'monaco-editor'
import { useProjectStore } from '../../store/projectStore'
import { ContextMenu } from '../VisualEditor/ContextMenu'
import type { ContextMenuItem } from '../VisualEditor/ContextMenu'

/** 执行行高亮装饰样式类名 */
const EXECUTION_LINE_CLASS_NAME = 'execution-line-highlight'

// ---- 配置 Monaco Editor Web Worker ----
// 使用 Vite 的 ?worker 后缀导入 worker 脚本
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

;(self as typeof window & { MonacoEnvironment?: Record<string, unknown> }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker()
    }
    return new editorWorker()
  }
}

/**
 * Monaco Editor 封装组件
 */
export function ScriptEditor(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const { content, setContent, executionLine, executionError } = useProjectStore()
  const prevDecorationsRef = useRef<string[]>([])
  const colorDecorationsRef = useRef<string[]>([])

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    // Register Udseen language
    monaco.languages.register({ id: 'udseen' })

    // Enable comment toggling (Ctrl+/) / auto-closing pairs / auto-indentation
    monaco.languages.setLanguageConfiguration('udseen', {
      comments: {
        lineComment: '//',
        blockComment: ['/*', '*/']
      },
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"', notIn: ['string'] },
        { open: '\'', close: '\'', notIn: ['string'] }
      ],
      surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: '\'', close: '\'' }
      ],
      onEnterRules: [
        {
          // 在 {} 对之间按回车：缩进新行，同时右花括号不缩进
          beforeText: /\{\s*$/,
          afterText: /^\s*\}/,
          action: { indentAction: monaco.languages.IndentAction.IndentOutdent }
        },
        {
          // 在 { 后（无紧跟 }）按回车 → 缩进
          beforeText: /\{\s*$/,
          action: { indentAction: monaco.languages.IndentAction.Indent }
        },
        {
          // 在 } 前按回车 → 减少缩进
          beforeText: /^\s*\}/,
          action: { indentAction: monaco.languages.IndentAction.Outdent }
        }
      ]
    })

    // Define tokenizer
    monaco.languages.setMonarchTokensProvider('udseen', {
      tokenizer: {
        root: [
          [/\/\/.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/".*?"/, 'string'],
          [/'[^']*'/, 'string'],
          [/\b(let|function|ObjectFunction|if|else|while|return|true|false|null|choice|group|async|case|wait)\b/, 'keyword'],
          [/\b(Character|Background|Audio|Filter)\b/, 'type'],
          [/\b(parallel|sequence|move|rotate|rotateTo|setPos|set|begin|hide|end|jump|moveTo|moveToX|moveToY|setAlpha|setScale|setTint|getX|getY|getPos|getPosX|getPosY|say|speech|scale|scaleTo|alpha|index|blur|brightness|contrast|saturation|gamma|rgb|hex|clearFilters|glow|dropShadow|noise|loop|pause|volume)\b/, 'builtin'],
          [/\b[0-9]+(\.[0-9]+)?\b/, 'number'],
          [/[{}()\[\]]/, 'delimiter'],
          [/[.;,:]/, 'delimiter'],
          [/[+\-*/%<>=!&|]+/, 'operator'],
          [/[a-zA-Z_]\w*/, 'identifier']
        ],
        comment: [
          [/[^*/]+/, 'comment'],
          [/\*\//, 'comment', '@pop'],
          [/[*\/]/, 'comment']
        ]
      }
    })

    // ---- 自定义 DOM 悬浮覆盖层：资源预览 ----
    const hoverOverlay = document.createElement('div')
    hoverOverlay.id = 'resource-hover-overlay'
    hoverOverlay.style.cssText =
      'position:fixed;z-index:100000;display:none;' +
      'background:#252526;border:1px solid #454545;border-radius:6px;' +
      'padding:10px;box-shadow:0 6px 20px rgba(0,0,0,0.6);' +
      'pointer-events:auto;max-width:340px;font-family:system-ui,sans-serif;'
    document.body.appendChild(hoverOverlay)

    let hoverTimer: ReturnType<typeof setTimeout> | null = null
    let currentHoverKey: string | null = null
    /** 缓存上次嗅探的资源路径，同路径不在同一行内不重复加载 */
    let lastResourceKey: string | null = null

    const hideOverlay = (): void => {
      if (hoverTimer !== null) {
        clearTimeout(hoverTimer)
        hoverTimer = null
      }
      hoverOverlay.style.display = 'none'
      currentHoverKey = null
      lastResourceKey = null
    }

    /** 从行文本 + 列号解析资源上下文（按 API 参数位置嗅探） */
    const RESOURCE_PARAM_POSITIONS: Record<string, Set<number>> = {
      Character: new Set([0, 2]),   // arg0=立绘, arg2=头像
      Background: new Set([0]),      // arg0=背景图
      Audio: new Set([0])            // arg0=音频文件
    }

    const getResourceContext = (
      lineText: string,
      column: number
    ): { factoryType: string; path: string } | null => {
      const stringRegex = /(["'])([^"']*?)\1/g
      let match: RegExpExecArray | null
      while ((match = stringRegex.exec(lineText)) !== null) {
        const start = match.index
        const end = match.index + match[0].length
        if (column >= start + 1 && column <= end - 1) {
          const pathInString = match[2]
          if (!pathInString || pathInString.startsWith('#')) continue

          const textBefore = lineText.substring(0, start).trimEnd()
          const openParenIdx = textBefore.lastIndexOf('(')
          if (openParenIdx < 0) return null

          const funcPrefix = textBefore.substring(0, openParenIdx).trimEnd()
          const factoryMatch = funcPrefix.match(/(Character|Background|Audio)\.set$/)
          if (!factoryMatch) return null

          const factoryName = factoryMatch[1]

          // 计算参数位置：统计当前字符串前的顶层逗号数
          const argsBefore = textBefore.substring(openParenIdx + 1)
          const commaCount = (argsBefore.match(/,/g) || []).length

          // 检查该参数位置是否应嗅探
          const validPositions = RESOURCE_PARAM_POSITIONS[factoryName]
          if (!validPositions || !validPositions.has(commaCount)) return null

          return {
            factoryType: factoryName === 'Character' ? 'character' : factoryName === 'Background' ? 'background' : 'audio',
            path: pathInString
          }
        }
      }
      return null
    }

    /** HTML 转义 */
    const escapeHtml = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    /** 异步加载资源并渲染覆盖层内容 */
    const showResourcePreview = async (
      factoryType: string,
      path: string,
      hoverKey: string
    ): Promise<void> => {
      try {
        const appPath = await window.electronAPI.getAppPath()
        const fullPath = `${appPath}/assets/public/${factoryType}/${path}`
        const exists = await window.electronAPI.fileExists(fullPath)

        // 如果鼠标已移走，不再渲染
        if (currentHoverKey !== hoverKey) return

        if (!exists) {
          if (currentHoverKey !== hoverKey) return
          hoverOverlay.innerHTML =
            `<div style="color:#f44;padding:4px 8px;font-size:13px;">⚠ 文件未找到: <code>${escapeHtml(path)}</code></div>`
          return
        }

        if (currentHoverKey !== hoverKey) return

        const typePrefix = factoryType === 'audio' ? '[A]' : factoryType === 'background' ? '[B]' : '[C]'

        if (factoryType === 'audio') {
          // 仅显示文件名，不需要播放
          hoverOverlay.innerHTML =
            `<div style="font-size:13px;color:#ccc;">${typePrefix} ${escapeHtml(path)}</div>`
        } else {
          const dataUrl = await window.electronAPI.readBinary(fullPath)
          if (currentHoverKey !== hoverKey) return
          hoverOverlay.innerHTML =
            `<div style="margin-bottom:6px;font-size:13px;color:#ccc;">${typePrefix} ${escapeHtml(path)}</div>` +
            `<img src="${dataUrl}" style="max-width:300px;max-height:250px;border-radius:4px;border:1px solid #444;display:block;" />`
        }
      } catch {
        if (currentHoverKey !== hoverKey) return
        hoverOverlay.innerHTML =
          `<div style="color:#f44;padding:4px 8px;font-size:13px;">⚠ 加载失败: <code>${escapeHtml(path)}</code></div>`
      }
    }

    // Register completion provider
    monaco.languages.registerCompletionItemProvider('udseen', {
      provideCompletionItems: (
        _model: monaco.editor.ITextModel,
        _position: monaco.Position,
        _context: monaco.languages.CompletionContext,
        _token: monaco.CancellationToken
      ) => {
        const keywords = [
          'let', 'function', 'ObjectFunction', 'if', 'else',
          'while', 'true', 'false', 'null', 'choice', 'group', 'async', 'case', 'wait'
        ]

        // 默认内置类型（工厂对象）
        const factoryTypes = ['Character', 'Background', 'Audio', 'Filter']

        // 全局内置函数（非对象方法）
        const globalBuiltins = [
          'parallel', 'sequence', 'set', 'jump', 'speech', 'pause'
        ]

        // SceneObject 方法（通过 obj.method() 调用）
        const objectMethods = [
          'begin', 'hide', 'end',
          'move', 'setPos', 'rotate', 'rotateTo',
          'moveToX', 'moveToY',
          'getPos', 'getPosX', 'getPosY', 'getX', 'getY',
          'scale', 'scaleTo', 'alpha', 'index',
          'setAlpha', 'setScale', 'setTint',
          'blur', 'brightness', 'contrast', 'saturation', 'gamma',
          'rgb', 'hex', 'clearFilters',
          'glow', 'dropShadow', 'noise',
          'say'
        ]

        // 音频对象方法（stop 已移除，使用 end 替代）
        const audioMethods = ['loop', 'pause', 'volume']

        // 滤镜对象方法
        const filterMethods = [
          'hex', 'rgb', 'blur', 'brightness', 'contrast', 'saturation', 'gamma',
          'intensity',
          'glow', 'dropShadow', 'noise',
          'begin', 'end'
        ]

        const suggestions: monaco.languages.CompletionItem[] = [
          // 关键字
          ...keywords.map((k) => ({
            label: k,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: k,
            range: undefined as unknown as monaco.IRange
          })),
          // 内置工厂类型
          ...factoryTypes.map((t) => ({
            label: t,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t,
            range: undefined as unknown as monaco.IRange
          })),
          // 全局内置函数
          ...globalBuiltins.map((b) => ({
            label: b,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: b,
            range: undefined as unknown as monaco.IRange
          })),
          // 对象方法
          ...objectMethods.map((m) => ({
            label: m,
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: m,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: undefined as unknown as monaco.IRange
          })),
          // 音频方法
          ...audioMethods.map((m) => ({
            label: m,
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: m,
            range: undefined as unknown as monaco.IRange
          })),
          // 滤镜方法
          ...filterMethods.map((m) => ({
            label: m,
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: m,
            range: undefined as unknown as monaco.IRange
          }))
        ]
        return { suggestions }
      }
    })

    // Create editor
    const editor = monaco.editor.create(containerRef.current, {
      value: content,
      language: 'udseen',
      theme: 'vs-dark',
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      lineNumbers: 'on',
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      tabSize: 2,
      renderWhitespace: 'selection',
      cursorBlinking: 'smooth',
      smoothScrolling: true
    })

    editor.onMouseMove((e) => {
      if (!useProjectStore.getState().resourcePreview) {
        hideOverlay()
        return
      }

      // 防御性 null-check：Monaco 可能在某些编辑区域返回 null target
      const target = e.target
      if (!target) return

      // 允许 CONTENT_TEXT（文本内容）和 CONTENT_EMPTY（行尾空白）两种类型
      // 部分场景下 Monaco 可能将带文本的行尾区域标记为 CONTENT_EMPTY
      const position = target.position
      if (!position) return
      if (target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT && target.type !== monaco.editor.MouseTargetType.CONTENT_EMPTY) return

      const hoverKey = `${position.lineNumber}:${position.column}`

      // 同一位置不做重复处理
      if (currentHoverKey === hoverKey) return

      const model = editor.getModel()
      if (!model) return

      const lineText = model.getLineContent(position.lineNumber)
      const context = getResourceContext(lineText, position.column)

      if (!context) {
        hideOverlay()
        return
      }

      const resourceKey = `${context.factoryType}:${context.path}`

      // 同一资源路径 → 只更新位置，不重新嗅探
      if (lastResourceKey === resourceKey) {
        currentHoverKey = hoverKey
        // 只需更新位置
        let left = e.event.browserEvent.clientX + 15
        let top = e.event.browserEvent.clientY + 15
        if (left + 340 > window.innerWidth) left = e.event.browserEvent.clientX - 340 - 15
        if (top + 300 > window.innerHeight) top = window.innerHeight - 300 - 15
        hoverOverlay.style.left = `${Math.max(10, left)}px`
        hoverOverlay.style.top = `${Math.max(10, top)}px`
        hoverOverlay.style.display = 'block'
        return
      }

      lastResourceKey = resourceKey

      // 有匹配 → 取消之前的计时器
      if (hoverTimer !== null) {
        clearTimeout(hoverTimer)
      }

      currentHoverKey = hoverKey

      // 计算覆盖层位置（相对于视口）
      let left = e.event.browserEvent.clientX + 15
      let top = e.event.browserEvent.clientY + 15

      // 防出视口右/下边界
      if (left + 340 > window.innerWidth) left = e.event.browserEvent.clientX - 340 - 15
      if (top + 300 > window.innerHeight) top = window.innerHeight - 300 - 15

      hoverOverlay.style.left = `${Math.max(10, left)}px`
      hoverOverlay.style.top = `${Math.max(10, top)}px`

      // 先显示加载占位
      hoverOverlay.innerHTML = '<div style="color:#888;padding:4px 8px;font-size:13px;">加载中…</div>'
      hoverOverlay.style.display = 'block'

      // 鼠标悬停立即加载预览，不再延迟
      showResourcePreview(context.factoryType, context.path, hoverKey)
    })

    editor.onMouseLeave(() => {
      hideOverlay()
    })

    editor.onDidScrollChange(() => {
      hideOverlay()
    })

    editor.onDidChangeModelContent(() => {
      const value = editor.getValue()
      setContent(value)
      // 用户编辑时清除运行相关的高亮（红/绿行高亮）
      // 直接操作 Monaco 装饰，避免依赖 React 状态更新的时序
      const oldIds = prevDecorationsRef.current
      if (oldIds.length > 0) {
        const newIds = editor.deltaDecorations(oldIds, [])
        prevDecorationsRef.current = newIds
      }
      useProjectStore.getState().setExecutionLine(null)
      useProjectStore.getState().setExecutionError(null)
    })

    editorRef.current = editor

    // ---- 颜色预览：RGB/Hex 行左侧色块 + 点击调色盘 ----
    // 使用 beforeContentClassName decoration + CSS 渲染小方块，纯 IDE 风格
    // 每次点击色块创建临时 <input type="color"> 触发系统调色盘，避免状态残留

    /** 解析行中的 rgb/hex 颜色值，返回 hex、匹配文本、额外参数（针对多参数 hex） */
    const parseLineColor = (lineText: string): { hex: string; suffix: string; extraArgs?: string } | null => {
      const rgbMatch = lineText.match(/\.rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
      if (rgbMatch) {
        const r = Math.min(255, Math.max(0, parseInt(rgbMatch[1])))
        const g = Math.min(255, Math.max(0, parseInt(rgbMatch[2])))
        const b = Math.min(255, Math.max(0, parseInt(rgbMatch[3])))
        const hex = `${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
        return { hex, suffix: rgbMatch[0] }
      }
      // 支持 .hex("#RRGGBB") 以及 .hex("#RRGGBB", arg1, arg2, ...)
      const hexMatch = lineText.match(/\.hex\s*\(\s*"#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})"([^)]*)\)/)
      if (hexMatch) {
        let h = hexMatch[1]
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
        const r = parseInt(h.substring(0, 2), 16)
        const g = parseInt(h.substring(2, 4), 16)
        const b = parseInt(h.substring(4, 6), 16)
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return { hex: h, suffix: hexMatch[0], extraArgs: hexMatch[2] }
      }
      return null
    }

    // 动态 style 元素，注入所有色块 CSS
    let swatchStyleEl: HTMLStyleElement | null = null

    /** 渲染/刷新所有颜色色块（通过 Monaco decoration + CSS beforeContentClassName） */
    const updateColorSwatches = (): void => {
      // 移除旧 CSS
      if (swatchStyleEl) swatchStyleEl.remove()
      swatchStyleEl = null

      const model = editor.getModel()
      if (!model) return

      const newDecorations: monaco.editor.IModelDeltaDecoration[] = []
      const cssLines: string[] = []

      for (let line = 1; line <= model.getLineCount(); line++) {
        const lineText = model.getLineContent(line)
        const colorInfo = parseLineColor(lineText)
        if (!colorInfo) continue

        const { hex } = colorInfo
        const cls = `csw-${line}`

        cssLines.push(
          `.monaco-editor .${cls} { display:inline-block !important; width:13px !important; height:13px !important; background:#${hex}; border-radius:3px; border:1px solid rgba(255,255,255,0.15); margin:0 4px 0 0; vertical-align:middle; cursor:pointer; }`
        )

        newDecorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: false,
            beforeContentClassName: cls
          }
        })
      }

      if (cssLines.length > 0) {
        swatchStyleEl = document.createElement('style')
        swatchStyleEl.id = 'color-swatch-style'
        swatchStyleEl.textContent = cssLines.join('\n')
        document.head.appendChild(swatchStyleEl)
      }

      // 通过 deltaDecorations 更新色块（保留非颜色类 decorations）
      colorDecorationsRef.current = editor.deltaDecorations(colorDecorationsRef.current, newDecorations)
    }

    // 初始渲染色块
    updateColorSwatches()

    // 内容变化时刷新色块
    const contentChangeListener = editor.onDidChangeModelContent(() => {
      updateColorSwatches()
    })

    // 滚动仅触发色块位置刷新
    editor.onDidScrollChange(() => {
      updateColorSwatches()
    })

    // 点击色块（行首位置）→ 打开调色盘
    // beforeContentClassName 渲染的元素不可点击，改为检测 GUTTER_GLYPH_MARGIN / 行首 TEXT 区域
    editor.onMouseDown((e) => {
      const lineNumber = e.target.position?.lineNumber
      if (!lineNumber) return

      // 允许：glyph margin 点击 或 行首 column <= 2 的文本点击
      const isGlyphMargin = e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
      const isLineStart = e.target.position && e.target.position.column <= 2
      if (!isGlyphMargin && !isLineStart) return

      const model = editor.getModel()
      if (!model) return
      const lineText = model.getLineContent(lineNumber)
      const colorInfo = parseLineColor(lineText)
      if (!colorInfo) return

      const { hex } = colorInfo

      // 每次创建临时 input，避免复用导致状态残留
      const tempPicker = document.createElement('input')
      tempPicker.type = 'color'
      tempPicker.style.cssText = 'position:fixed;z-index:100001;opacity:0;width:0;height:0;pointer-events:none;'
      tempPicker.value = `#${hex}`
      document.body.appendChild(tempPicker)

      tempPicker.addEventListener('input', () => {
        const newHex = tempPicker.value.replace('#', '')
        dispatchColorUpdate(lineNumber, newHex)
      })

      // 用户关闭调色盘（点击 OK / Cancel）后清理临时元素
      tempPicker.addEventListener('blur', () => {
        tempPicker.remove()
      }, { once: true })

      tempPicker.click()
    })

    /** 根据选取的颜色更新编辑器行内容 */
    const dispatchColorUpdate = (line: number, hex: string): void => {
      const model = editor.getModel()
      if (!model) return
      const lineText = model.getLineContent(line)
      const colorInfo = parseLineColor(lineText)
      if (!colorInfo) return

      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)

      const matchIdx = lineText.indexOf(colorInfo.suffix)
      if (matchIdx === -1) return

      const isRgb = colorInfo.suffix.startsWith('.rgb')
      const extraArgs = (colorInfo as any).extraArgs ?? ''
      const replacement = isRgb
        ? `.rgb(${r}, ${g}, ${b})`
        : `.hex("#${hex.toUpperCase()}"${extraArgs})`

      const range = new monaco.Range(
        line, matchIdx + 1,
        line, matchIdx + colorInfo.suffix.length + 1
      )
      editor.executeEdits('color-picker', [{ range, text: replacement }])
    }

    // 注入自定义 CSS 到 document head，用于执行行高亮装饰
    const styleEl = document.createElement('style')
    styleEl.id = 'monaco-execution-line-style'
    styleEl.textContent = `
.${EXECUTION_LINE_CLASS_NAME} { background: rgba(130, 220, 80, 0.3); border-left: 3px solid #82dc50; }
.${EXECUTION_LINE_CLASS_NAME}-error { background: rgba(244, 67, 54, 0.3); border-left: 3px solid #f44336; }
`
    document.head.appendChild(styleEl)

    // 禁止 Alt 键的列选择功能
    const container = containerRef.current
    const preventAlt = (e: KeyboardEvent) => {
      if (e.altKey || e.key === 'Alt') {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    container.addEventListener('keydown', preventAlt, true)

    return () => {
      hideOverlay()
      container.removeEventListener('keydown', preventAlt, true)
      document.getElementById('monaco-execution-line-style')?.remove()
      document.getElementById('resource-hover-overlay')?.remove()
      document.getElementById('color-swatch-style')?.remove()
      // 清除颜色 decorations
      editor.deltaDecorations(colorDecorationsRef.current, [])
      contentChangeListener.dispose()
      swatchStyleEl?.remove()
      editor.dispose()
      editorRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+鼠标滚轮缩放
  const editorFontSizeRef = useRef(14)
  useEffect(() => {
    const container = containerRef.current
    if (!container || !editorRef.current) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const editor = editorRef.current
      if (!editor) return
      const delta = e.deltaY < 0 ? 1 : -1
      const newSize = Math.max(10, Math.min(40, editorFontSizeRef.current + delta))
      editorFontSizeRef.current = newSize
      editor.updateOptions({ fontSize: newSize })
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [])

  // Update editor content when store changes (e.g., file open)
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== content) {
      editorRef.current.setValue(content)
    }
  }, [content])

  // 执行行高亮装饰（支持正常绿色 + 错误红色两种状态）
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    if (executionLine === null) {
      // 清除所有装饰
      const oldIds = prevDecorationsRef.current
      if (oldIds.length > 0) {
        const newDecorations = editor.deltaDecorations(oldIds, [])
        prevDecorationsRef.current = newDecorations
      }
    } else {
      const lineNumber = Math.max(1, executionLine)
      // 有错误信息时使用红色高亮，否则使用绿色高亮
      const className = executionError
        ? `${EXECUTION_LINE_CLASS_NAME}-error`
        : EXECUTION_LINE_CLASS_NAME
      const newDecorations = editor.deltaDecorations(prevDecorationsRef.current, [
        {
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            className
          }
        }
      ])
      prevDecorationsRef.current = newDecorations
      // 滚动到当前执行行，使其在编辑器中居中可见
      editor.revealLineInCenter(lineNumber)
    }
  }, [executionLine, executionError]) // eslint-disable-line react-hooks/exhaustive-deps

  // 从 ResourceBrowser 拖入资源
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/udseen-resource')) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const resourceData = e.dataTransfer.getData('application/udseen-resource')
    if (!resourceData) return

    const editor = editorRef.current
    if (!editor) return

    let resource: { path: string; type: string }
    try {
      resource = JSON.parse(resourceData)
    } catch {
      return
    }

    if (!resource.path) return

    // 获取当前光标位置，退回到文档末尾
    const position = editor.getPosition()
    if (!position) return

    // 插入带引号的路径字符串
    const quotedPath = `"${resource.path}"`
    const range = new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    )

    editor.executeEdits('resource-drop', [{ range, text: quotedPath }])
    editor.focus()
  }, [])

  // 右键菜单处理
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const editor = editorRef.current
      if (!editor) return

      // 获取选中文本信息
      const selection = editor.getSelection()
      const hasSelection = selection && !selection.isEmpty()
      const model = editor.getModel()
      const wordAtPos = model?.getWordAtPosition(
        editor.getPosition() || new monaco.Position(1, 1)
      )

      const items: ContextMenuItem[] = [
        {
          label: '复制',
          onClick: () => editor.trigger(null, 'editor.action.clipboardCopyAction', undefined),
          shortcut: 'Ctrl+C',
          disabled: !hasSelection
        },
        {
          label: '剪切',
          onClick: () => editor.trigger(null, 'editor.action.clipboardCutAction', undefined),
          shortcut: 'Ctrl+X',
          disabled: !hasSelection
        },
        {
          label: '粘贴',
          onClick: () => editor.trigger(null, 'editor.action.clipboardPasteAction', undefined),
          shortcut: 'Ctrl+V'
        },
        { divider: true, label: '', onClick: () => {} },
        {
          label: '全选',
          onClick: () => editor.trigger(null, 'editor.action.selectAll', undefined),
          shortcut: 'Ctrl+A'
        },
        {
          label: '切换注释',
          onClick: () => editor.trigger(null, 'editor.action.commentLine', undefined),
          shortcut: 'Ctrl+/'
        },
        { divider: true, label: '', onClick: () => {} },
        {
          label: '格式化',
          onClick: () => {
            editor.getAction('editor.action.formatDocument')?.run()
          },
          shortcut: 'Shift+Alt+F'
        },
        { divider: true, label: '', onClick: () => {} },
        ...(wordAtPos
          ? [
              {
                label: `查找 "${wordAtPos.word}"`,
                onClick: () => {
                  editor.trigger(null, 'actions.find', undefined)
                },
                shortcut: 'Ctrl+F'
              }
            ]
          : [
              {
                label: '查找',
                onClick: () => editor.trigger(null, 'actions.find', undefined),
                shortcut: 'Ctrl+F'
              }
            ]),
        {
          label: '查找并替换',
          onClick: () => editor.trigger(null, 'editor.action.startFindReplaceAction', undefined),
          shortcut: 'Ctrl+H'
        }
      ]

      setContextMenu({ x: e.clientX, y: e.clientY, items })
    }

    container.addEventListener('contextmenu', handleContextMenu)
    return () => container.removeEventListener('contextmenu', handleContextMenu)
  }, [setContextMenu])

  // 禁用 Monaco 自带的右键菜单
  useEffect(() => {
    // 在 container 上禁用默认右键菜单并在初始化时配置 editor 不显示自带菜单
    const container = containerRef.current
    if (!container) return
    const preventDefault = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest('.monaco-editor')) {
        // 阻止浏览器的默认菜单但让我们的自定义菜单触发
      }
    }
    container.addEventListener('contextmenu', preventDefault)
    return () => container.removeEventListener('contextmenu', preventDefault)
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      )}
    </div>
  )
}
