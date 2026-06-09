import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { useProjectStore } from '../../store/projectStore'

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

  useEffect(() => {
    if (!containerRef.current) return

    // Register Udseen language
    monaco.languages.register({ id: 'udseen' })

    // Enable comment toggling (Ctrl+/)
    monaco.languages.setLanguageConfiguration('udseen', {
      comments: {
        lineComment: '//',
        blockComment: ['/*', '*/']
      }
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
      container.removeEventListener('keydown', preventAlt, true)
      document.getElementById('monaco-execution-line-style')?.remove()
      editor.dispose()
      editorRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
