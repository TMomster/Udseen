/**
 * 解析器入口模块
 *
 * 包含两个解析器：
 * 1. generated/ – Langium CLI 自动生成的解析器（用于 LSP 语法高亮、自动补全）
 * 2. 下方手写递归下降解析器 – 功能完整的脚本执行用解析器
 *
 * 第一次搭建或修改 .langium 语法后需要运行：npm run langium:generate
 */

/**
 * Langium LSP 语言服务
 * 这些导出用于 Monaco Editor 的 LSP 集成（语法高亮、自动补全等）
 */
import {
  UdseenLanguageMetaData as LangiumLanguageMetaData,
  UdseenGeneratedModule as LangiumGeneratedModule,
  UdseenGeneratedSharedModule as LangiumGeneratedSharedModule
} from './generated/module'
export const UdseenLanguageMetaData = LangiumLanguageMetaData
export const UdseenGeneratedModule = LangiumGeneratedModule
export const UdseenGeneratedSharedModule = LangiumGeneratedSharedModule

// AST 节点类型定义
export interface ScriptNode {
  type: 'Script'
  statements: StatementNode[]
}

export type StatementNode =
  | VariableDeclNode
  | AssignmentNode
  | FunctionDefNode
  | ObjectFunctionDefNode
  | ObjectMethodCallNode
  | IfStatementNode
  | WhileStatementNode
  | BlockNode
  | AsyncBlockNode
  | WaitNode
  | ExpressionStatementNode
  | ArrDeclNode
  | MapDeclNode
  | ChoiceStatementNode

export interface WaitNode {
  type: 'Wait'
  time: ExpressionNode
  statement: StatementNode
}

export interface ChoiceStatementNode {
  type: 'ChoiceStatement'
  choices: { text: string; block: BlockNode }[]
}

export interface AsyncBlockNode {
  type: 'AsyncBlock'
  statements: StatementNode[]
  /** 可选的等待时间参数：async(time) { ... }
   *   time=0（或不指定）：等待组内所有动作完成后继续执行
   *   time>0：有限等待，time 毫秒后继续执行后续脚本（组内未完成动作在后台继续）
   *   ⚠ 有限等待可能不安全——后续脚本操作正在执行动画的对象可能导致未预期的视觉行为 */
  time?: ExpressionNode
}

export interface VariableDeclNode {
  type: 'VariableDecl'
  name: string
  varType: string | null  // optional type annotation: num, str, bool, arr, map
  value: ExpressionNode
}

export interface AssignmentNode {
  type: 'Assignment'
  name: string
  index: ExpressionNode | null
  value: ExpressionNode
}

export interface FunctionDefNode {
  type: 'FunctionDef'
  name: string
  params: string[]
  autoZeroParams: boolean[]
  block: BlockNode
}

export interface ObjectFunctionDefNode {
  type: 'ObjectFunctionDef'
  name: string
  /** 可选的类型限定列表（如 ["Character"] 或 ["Background", "Character"]），空数组表示通用函数 */
  typeNames: string[]
  params: string[]
  autoZeroParams: boolean[]
  block: BlockNode
}

export interface ArrDeclNode {
  type: 'ArrDecl'
  name: string
  elementType: string | null  // optional element type, e.g. num
  value: ExpressionNode
}

export interface MapDeclNode {
  type: 'MapDecl'
  name: string
  entries: MapEntryNode[]
}

export interface MapEntryNode {
  key: string
  valueType: string | null  // optional type annotation
  value: ExpressionNode
}

export interface MapLiteralNode {
  type: 'MapLiteral'
  entries: { key: string; value: ExpressionNode }[]
}

export interface ObjectMethodCallNode {
  type: 'ObjectMethodCall'
  obj: ExpressionNode
  method: string
  args: ExpressionNode[]
}

export interface IfStatementNode {
  type: 'IfStatement'
  condition: ExpressionNode
  thenBlock: BlockNode
  elseBlock: BlockNode | null
}

export interface WhileStatementNode {
  type: 'WhileStatement'
  condition: ExpressionNode
  block: BlockNode
}

export interface BlockNode {
  type: 'Block'
  statements: StatementNode[]
}

export interface ExpressionStatementNode {
  type: 'ExpressionStatement'
  expression: ExpressionNode
}

export interface ChoiceExpressionNode {
  type: 'ChoiceExpression'
  choices: { text: string; action: ExpressionNode }[]
}

export interface PropertyAccessNode {
  type: 'PropertyAccess'
  obj: ExpressionNode
  property: string
}

export interface GroupExpressionNode {
  type: 'GroupExpression'
  elements: ExpressionNode[]
}

export type ExpressionNode =
  | NumberLiteralNode
  | StringLiteralNode
  | BooleanLiteralNode
  | NullLiteralNode
  | ReferenceCallNode
  | ArrayLiteralNode
  | MapLiteralNode
  | BinaryOpNode
  | UnaryOpNode
  | ChoiceExpressionNode
  | GroupExpressionNode
  | PropertyAccessNode
  | ObjectMethodCallNode

export interface NumberLiteralNode {
  type: 'NumberLiteral'
  value: number
}

export interface StringLiteralNode {
  type: 'StringLiteral'
  value: string
}

export interface BooleanLiteralNode {
  type: 'BooleanLiteral'
  value: boolean
}

export interface NullLiteralNode {
  type: 'NullLiteral'
}

export interface ReferenceCallNode {
  type: 'ReferenceCall'
  ref: string
  args: ExpressionNode[] | null
}

export interface ArrayLiteralNode {
  type: 'ArrayLiteral'
  elements: ExpressionNode[]
}

export interface BinaryOpNode {
  type: 'BinaryOp'
  left: ExpressionNode
  op: string
  right: ExpressionNode
}

export interface UnaryOpNode {
  type: 'UnaryOp'
  op: string
  expr: ExpressionNode
}

export type ParseSuccess<T> = { success: true; ast: T; lineMap: Map<StatementNode, number> }
export type ParseFailure = { success: false; error: string; position: number; errorLine: number }
export type ParseResult<T> = ParseSuccess<T> | ParseFailure

/**
 * 构建行偏移表：将字符偏移转换为 1-based 行号
 * lineStarts[i] = 第 i 行第一个字符在源字符串中的偏移（从 0 开始）
 */
function buildLineStarts(content: string): number[] {
  const starts: number[] = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      starts.push(i + 1)
    }
  }
  return starts
}

/** 根据行偏移表将字符偏移转换为 1-based 行号 */
function posToLine(lineStarts: number[], pos: number): number {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (lineStarts[mid] <= pos) low = mid
    else high = mid - 1
  }
  return low + 1
}

/**
 * 从错误消息中提取字符偏移位置
 */
function extractPos(msg: string): number {
  const m = msg.match(/at position (\d+)/)
  return m ? parseInt(m[1], 10) : -1
}

/**
 * 将原始解析器错误转换为用户友好的消息
 */
function formatParseError(msg: string, content: string, pos: number): string {
  const lineStarts = buildLineStarts(content)
  const line = pos >= 0 ? posToLine(lineStarts, pos) : 0
  let friendly: string

  if (msg.includes('Unexpected token')) {
    const token = msg.match(/'([^']+)'/)
    friendly = `意外的符号 '${token?.[1] ?? ''}'`
  } else if (msg.includes('Unexpected character')) {
    const ch = msg.match(/'([^']+)'/)
    friendly = `意外的字符 '${ch?.[1] ?? ''}'`
  } else if (msg.includes('Expected')) {
    friendly = `意外的调用方式`
  } else if (msg.includes('Unterminated multi-line comment')) {
    friendly = `多行注释未闭合`
  } else if (msg.includes('Unterminated string')) {
    friendly = `字符串未闭合`
  } else {
    // 保留已有的中文错误消息（如「变量 'X' 需要初始化」）
    friendly = msg
  }

  if (line > 0) {
    return `第 ${line} 行: ${friendly}`
  }
  return friendly
}

/**
 * 简单的递归下降解析器，将 .ykn 剧本字符串解析为 AST
 */
export function parseScript(content: string): ParseResult<ScriptNode> {
  try {
    const tokens = tokenize(content)
    const lineStarts = buildLineStarts(content)
    const parser = new Parser(tokens, lineStarts)
    const statements: StatementNode[] = []
    while (parser.pos < parser.tokens.length) {
      const stmt = parser.parseStatement()
      if (stmt) statements.push(stmt)
      else break
    }
    return { success: true, ast: { type: 'Script', statements }, lineMap: parser.lineMap }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const pos = extractPos(msg)
    const lineStarts = buildLineStarts(content)
    const errorLine = pos >= 0 ? posToLine(lineStarts, pos) : 0
    const friendly = formatParseError(msg, content, pos)
    return { success: false, error: friendly, position: pos >= 0 ? pos : 0, errorLine }
  }
}

// ---- Tokenization ----

type Token = { type: string; value: string | number | boolean; raw: string; pos: number }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const wsRegex = /^\s+/

  while (i < input.length) {
    // Skip whitespace
    let m = input.slice(i).match(wsRegex)
    if (m) { i += m[0].length; continue }

    // Single-line comments
    if (input[i] === '/' && input[i + 1] === '/') {
      const end = input.indexOf('\n', i)
      i = end === -1 ? input.length : end + 1
      continue
    }

    // Multi-line comments
    if (input[i] === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2)
      if (end === -1) throw new Error(`Unterminated multi-line comment at position ${i}`)
      i = end + 2
      continue
    }

    // Number
    const numMatch = input.slice(i).match(/^-?[0-9]+(\.[0-9]+)?/)
    if (numMatch && !isIDChar(input[i - 1]) && isIDEnd(input[i + numMatch[0].length])) {
      tokens.push({ type: 'NUMBER', value: parseFloat(numMatch[0]), raw: numMatch[0], pos: i })
      i += numMatch[0].length
      continue
    }

    // String (double or single quotes)
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i]
      const start = i
      i++ // skip opening quote
      let str = ''
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\') {
          i++
          if (i < input.length) {
            const esc: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', "'": "'", '\\': '\\' }
            str += esc[input[i]] || input[i]
            i++
          }
        } else {
          str += input[i]
          i++
        }
      }
      if (i >= input.length) throw new Error(`Unterminated string starting at position ${start}`)
      i++ // skip closing quote
      tokens.push({ type: 'STRING', value: str, raw: input.slice(start, i), pos: start })
      continue
    }

      // Multi-char operators
    const op2 = input.slice(i, i + 2)
    if (['==', '!=', '<=', '>=', '||', '&&', '::'].includes(op2)) {
      tokens.push({ type: op2 === '::' ? 'DOUBLECOLON' : 'OPERATOR', value: op2, raw: op2, pos: i })
      i += 2
      continue
    }

    // Single-char operators and punctuation
    const singleChars = ['=', '+', '-', '*', '/', '%', '<', '>', '!', '(', ')', '{', '}', '[', ']', ',', '.', ';', ':', '?']
    if (singleChars.includes(input[i])) {
      const type = input[i] === ':' ? 'COLON' : input[i] === '.' ? 'DOT' : input[i] === ',' ? 'COMMA' : input[i] === ';' ? 'SEMICOLON' : input[i] === '?' ? 'QUESTION' : input[i] === '=' ? 'OPERATOR' : /[+\-*/%<>!]/.test(input[i]) ? 'OPERATOR' : input[i] === '(' ? 'LPAREN' : input[i] === ')' ? 'RPAREN' : input[i] === '{' ? 'LBRACE' : input[i] === '}' ? 'RBRACE' : input[i] === '[' ? 'LBRACKET' : input[i] === ']' ? 'RBRACKET' : 'PUNCTUATOR'
      tokens.push({ type, value: input[i], raw: input[i], pos: i })
      i++
      continue
    }

    // Identifier or keyword
    if (isIDStart(input[i])) {
      const start = i
      while (i < input.length && isIDChar(input[i])) i++
      const word = input.slice(start, i)
      if (['true', 'false'].includes(word)) {
        tokens.push({ type: 'BOOLEAN', value: word === 'true', raw: word, pos: start })
      } else if (['let', 'function', 'ObjectFunction', 'if', 'else', 'while', 'null', 'choice', 'group', 'arr', 'map', 'async', 'case', 'wait'].includes(word)) {
        tokens.push({ type: 'KEYWORD', value: word, raw: word, pos: start })
      } else {
        tokens.push({ type: 'ID', value: word, raw: word, pos: start })
      }
      continue
    }

    throw new Error(`Unexpected character '${input[i]}' at position ${i}`)
  }

  tokens.push({ type: 'EOF', value: '', raw: '', pos: input.length })
  return tokens
}

function isIDStart(ch: string): boolean {
  return /[\p{L}_]/u.test(ch)
}
function isIDChar(ch: string): boolean {
  return /[\p{L}\p{N}_]/u.test(ch)
}
function isIDEnd(ch: string): boolean {
  return !ch || !/[\p{L}\p{N}_]/u.test(ch)
}

/**
 * 展开链式调用（嵌套 ObjectMethodCall）为扁平的方法调用列表
 * 例如：a.b().c().d() 展开为 base=a, calls=[b(), c(), d()]
 */
function expandChain(expr: ExpressionNode): { baseObject: ExpressionNode; calls: Array<{ method: string; args: ExpressionNode[] }> } {
  const calls: Array<{ method: string; args: ExpressionNode[] }> = []
  let current = expr
  while (current.type === 'ObjectMethodCall') {
    const mc = current as ObjectMethodCallNode
    calls.unshift({ method: mc.method, args: mc.args })
    current = mc.obj
  }
  return { baseObject: current, calls }
}

// ---- Parser ----

class Parser {
  pos = 0
  lineMap = new Map<StatementNode, number>()
  private lineStarts: number[]

  constructor(public tokens: Token[], lineStarts: number[]) {
    this.lineStarts = lineStarts
  }

  /** 获取当前 token 位置的 1-based 行号 */
  private curLine(): number {
    return posToLine(this.lineStarts, this.peek().pos)
  }

  peek(): Token {
    return this.tokens[this.pos]
  }

  consume(type?: string): Token {
    const tok = this.tokens[this.pos]
    if (!tok || tok.type === 'EOF') throw new Error(`Unexpected end of input`)
    if (type && tok.type !== type) throw new Error(`Expected ${type} but got ${tok.type} ('${tok.raw}') at position ${tok.pos}`)
    this.pos++
    return tok
  }

  match(type: string): boolean {
    if (this.pos < this.tokens.length && this.tokens[this.pos].type === type) {
      this.pos++
      return true
    }
    return false
  }

  check(type: string, value?: string): boolean {
    const tok = this.tokens[this.pos]
    if (!tok || tok.type !== type) return false
    if (value !== undefined && tok.value !== value) return false
    return true
  }

  parseStatement(): StatementNode | null {
    if (this.check('EOF')) return null
    const line = this.curLine()

    // try keywords
    if (this.check('KEYWORD', 'let')) {
      const stmt = this.parseVariableDecl()
      this.lineMap.set(stmt, line)
      return stmt
    }
    if (this.check('KEYWORD', 'function')) {
      const stmt = this.parseFunctionDef()
      this.lineMap.set(stmt, line)
      return stmt
    }
    if (this.check('KEYWORD', 'ObjectFunction')) {
      const stmt = this.parseObjectFunctionDef()
      this.lineMap.set(stmt, line)
      return stmt
    }
    if (this.check('KEYWORD', 'if')) {
      const stmt = this.parseIfStatement()
      this.lineMap.set(stmt, line)
      return stmt
    }
    if (this.check('KEYWORD', 'while')) {
      const stmt = this.parseWhileStatement()
      this.lineMap.set(stmt, line)
      return stmt
    }
    if (this.check('KEYWORD', 'arr')) {
      const stmt = this.parseArrDecl()
      this.lineMap.set(stmt, line)
      return stmt
    }
    if (this.check('KEYWORD', 'map')) {
      const stmt = this.parseMapDecl()
      this.lineMap.set(stmt, line)
      return stmt
    }
    if (this.check('KEYWORD', 'async')) {
      const stmt = this.parseAsyncBlock()
      this.lineMap.set(stmt, line)
      return stmt
    }
    if (this.check('KEYWORD', 'choice')) {
      const stmt = this.parseChoiceStatement()
      this.lineMap.set(stmt, line)
      return stmt
    }
    if (this.check('KEYWORD', 'wait')) {
      const stmt = this.parseWaitStatement()
      this.lineMap.set(stmt, line)
      return stmt
    }
    if (this.check('LBRACE')) {
      const stmt = this.parseBlock()
      this.lineMap.set(stmt, line)
      return stmt
    }

    // expression statement or object method call
    const expr = this.parseExpression()
    if (!expr) return null

    // Detect and expand chained method calls: obj.method1().method2()
    // 链式调用展开为多个独立的 ObjectMethodCall 语句
    if (expr.type === 'ObjectMethodCall' && (expr as ObjectMethodCallNode).obj.type === 'ObjectMethodCall') {
      const { baseObject, calls } = expandChain(expr)
      const statements: StatementNode[] = calls.map((c) => ({
        type: 'ObjectMethodCall',
        obj: baseObject,
        method: c.method,
        args: c.args
      }) as ObjectMethodCallNode)
      this.match('SEMICOLON')
      const stmt: StatementNode = { type: 'Block', statements }
      this.lineMap.set(stmt, line)
      return stmt
    }

    // Single method call (not a chain)
    if (expr.type === 'ObjectMethodCall') {
      this.match('SEMICOLON')
      this.lineMap.set(expr, line)
      return expr
    }

    // Detect method call: obj.method(...) (fallback, handled by parsePrimary loop now)
    if (expr.type === 'ReferenceCall' && this.check('DOT')) {
      const stmt = this.parseObjectMethodCall(expr as ReferenceCallNode)
      this.lineMap.set(stmt, line)
      return stmt
    }

    // Check for assignment
    if (expr.type === 'ReferenceCall' && (this.check('OPERATOR', '=') || this.check('LBRACKET'))) {
      const ref = expr as ReferenceCallNode
      if (this.check('LBRACKET')) {
        this.consume('LBRACKET')
        const index = this.parseExpression()
        this.consume('RBRACKET')
        this.match('OPERATOR')
        const value = this.parseExpression()
        this.match('SEMICOLON')
        const stmt: StatementNode = { type: 'Assignment', name: ref.ref, index, value }
        this.lineMap.set(stmt, line)
        return stmt
      }
      if (this.check('OPERATOR', '=')) {
        this.consume('OPERATOR')
        const value = this.parseExpression()
        this.match('SEMICOLON')
        const stmt: StatementNode = { type: 'Assignment', name: ref.ref, index: null, value }
        this.lineMap.set(stmt, line)
        return stmt
      }
    }

    this.match('SEMICOLON')
    const stmt: StatementNode = { type: 'ExpressionStatement', expression: expr }
    this.lineMap.set(stmt, line)
    return stmt
  }

  parseVariableDecl(): VariableDeclNode {
    // let 关键字可选
    this.match('KEYWORD') // 可选的 let
    const name = this.consume('ID').value as string
    // Auto-zero syntax: varname?
    const autoZero = this.match('QUESTION')
    // optional type annotation: : type
    let varType: string | null = null
    if (this.check('COLON')) {
      this.consume('COLON')
      varType = this.consume('ID').value as string
    }
    let value: ExpressionNode
    if (this.check('OPERATOR', '=')) {
      this.consume('OPERATOR') // =
      value = this.parseExpression()
    } else if (autoZero) {
      // v2? 没有初始值，默认 0
      value = { type: 'NumberLiteral', value: 0 }
    } else {
      throw new Error(`变量 '${name}' 需要初始化`)
    }
    this.match('SEMICOLON')
    return { type: 'VariableDecl', name, varType, value }
  }

  parseFunctionDef(): FunctionDefNode {
    this.consume('KEYWORD') // function
    const name = this.consume('ID').value as string
    this.consume('LPAREN')
    const params: string[] = []
    const autoZeroParams: boolean[] = []
    if (!this.check('RPAREN')) {
      let pName = this.consume('ID').value as string
      const pAutoZero = this.match('QUESTION')
      params.push(pName)
      autoZeroParams.push(pAutoZero)
      while (this.match('COMMA')) {
        pName = this.consume('ID').value as string
        const nextAutoZero = this.match('QUESTION')
        params.push(pName)
        autoZeroParams.push(nextAutoZero)
      }
    }
    this.consume('RPAREN')
    const block = this.parseBlock()
    return { type: 'FunctionDef', name, params, autoZeroParams, block }
  }

  parseChoiceStatement(): ChoiceStatementNode {
    this.consume('KEYWORD') // choice
    this.consume('LBRACE')
    const choices: { text: string; block: BlockNode }[] = []
    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.consume('KEYWORD') // case
      const strTok = this.consume('STRING')
      const block = this.parseBlock()
      choices.push({ text: strTok.value as string, block })
    }
    this.consume('RBRACE')
    return { type: 'ChoiceStatement', choices }
  }

  parseObjectFunctionDef(): ObjectFunctionDefNode {
    this.consume('KEYWORD') // ObjectFunction
    let name: string
    let typeNames: string[] = []

    // 检查多类型列表语法：ObjectFunction (Background, Character)::func_name(...)
    if (this.check('LPAREN')) {
      this.consume('LPAREN')
      typeNames.push(this.consume('ID').value as string)
      while (this.match('COMMA')) {
        typeNames.push(this.consume('ID').value as string)
      }
      this.consume('RPAREN')
      this.consume('DOUBLECOLON')
      name = this.consume('ID').value as string
    } else {
      // 单类型或通用语法
      const firstId = this.consume('ID').value as string
      if (this.check('DOUBLECOLON')) {
        this.consume('DOUBLECOLON')
        typeNames = [firstId]
        name = this.consume('ID').value as string
      } else {
        name = firstId
      }
    }

    this.consume('LPAREN')
    const params: string[] = []
    const autoZeroParams: boolean[] = []
    if (!this.check('RPAREN')) {
      let pName = this.consume('ID').value as string
      const pAutoZero = this.match('QUESTION')
      params.push(pName)
      autoZeroParams.push(pAutoZero)
      while (this.match('COMMA')) {
        pName = this.consume('ID').value as string
        const nextAutoZero = this.match('QUESTION')
        params.push(pName)
        autoZeroParams.push(nextAutoZero)
      }
    }
    this.consume('RPAREN')
    const block = this.parseBlock()
    return { type: 'ObjectFunctionDef', name, typeNames, params, autoZeroParams, block }
  }

  parseIfStatement(): IfStatementNode {
    this.consume('KEYWORD') // if
    this.consume('LPAREN')
    const condition = this.parseExpression()
    this.consume('RPAREN')
    const thenBlock = this.parseBlock()
    let elseBlock: BlockNode | null = null
    if (this.check('KEYWORD', 'else')) {
      this.consume('KEYWORD') // else
      if (this.check('KEYWORD', 'if')) {
        // else if
        const inner = this.parseIfStatement()
        elseBlock = { type: 'Block', statements: [inner] }
      } else {
        elseBlock = this.parseBlock()
      }
    }
    return { type: 'IfStatement', condition, thenBlock, elseBlock }
  }

  parseWhileStatement(): WhileStatementNode {
    this.consume('KEYWORD') // while
    this.consume('LPAREN')
    const condition = this.parseExpression()
    this.consume('RPAREN')
    const block = this.parseBlock()
    return { type: 'WhileStatement', condition, block }
  }

  parseBlock(): BlockNode {
    this.consume('LBRACE')
    const statements: StatementNode[] = []
    while (!this.check('RBRACE') && !this.check('EOF')) {
      const stmt = this.parseStatement()
      if (stmt) statements.push(stmt)
      else break
    }
    this.consume('RBRACE')
    return { type: 'Block', statements }
  }

  /** wait(time) stmt：延迟开始执行某个语句 */
  parseWaitStatement(): WaitNode {
    this.consume('KEYWORD') // wait
    this.consume('LPAREN')
    const time = this.parseExpression()
    this.consume('RPAREN')
    const stmt = this.parseStatement()
    if (!stmt) throw new Error('wait() 后需要一个语句')
    return { type: 'Wait', time, statement: stmt }
  }

  /** async { ... } 或 async(time) { ... } 异步行为组：组内所有语句同时执行
   *   time=0（或不指定）→ 等待全部完成；time>0 → 有限等待 */
  /* async chain1().chain2() 或 async(time) chain1().chain2()：异步链式调用，展开为多语句 AsyncBlock */
  parseAsyncBlock(): AsyncBlockNode {
    this.consume('KEYWORD') // async
    let time: ExpressionNode | undefined = undefined
    // 支持 async(time) 语法——可选的时间参数
    if (this.check('LPAREN')) {
      this.consume('LPAREN')
      time = this.parseExpression()
      this.consume('RPAREN')
    }

    // async { ... } / async(time) { ... }：块模式
    if (this.check('LBRACE')) {
      this.consume('LBRACE')
      const statements: StatementNode[] = []
      while (!this.check('RBRACE') && !this.check('EOF')) {
        const stmt = this.parseStatement()
        if (stmt) statements.push(stmt)
        else break
      }
      this.consume('RBRACE')
      return { type: 'AsyncBlock', statements, time }
    }

    // async expr / async(time) expr：表达式模式（用于异步链式调用）
    const expr = this.parseExpression()
    if (!expr) throw new Error('async 后需要一个表达式')

    // 链式调用展开
    if (expr.type === 'ObjectMethodCall' && (expr as ObjectMethodCallNode).obj.type === 'ObjectMethodCall') {
      const { baseObject, calls } = expandChain(expr)
      const statements: StatementNode[] = calls.map((c) => ({
        type: 'ObjectMethodCall' as const,
        obj: baseObject,
        method: c.method,
        args: c.args
      }))
      this.match('SEMICOLON')
      return { type: 'AsyncBlock', statements, time }
    }

    // 单个表达式，包装为单语句的 AsyncBlock
    this.match('SEMICOLON')
    return { type: 'AsyncBlock', statements: [expr as StatementNode], time }
  }

  // --- Arr and Map Declarations ---

  parseArrDecl(): ArrDeclNode {
    this.consume('KEYWORD') // arr
    const name = this.consume('ID').value as string
    let elementType: string | null = null
    if (this.check('COLON')) {
      this.consume('COLON')
      elementType = this.consume('ID').value as string
    }
    this.consume('OPERATOR') // =
    // arr uses {} for array literal
    const value = this.parseExpression()
    this.match('SEMICOLON')
    return { type: 'ArrDecl', name, elementType, value }
  }

  parseMapDecl(): MapDeclNode {
    this.consume('KEYWORD') // map
    const name = this.consume('ID').value as string
    this.consume('OPERATOR') // =
    // map uses { key: type = value; ... }
    const entries: MapEntryNode[] = []
    this.consume('LBRACE')
    while (!this.check('RBRACE') && !this.check('EOF')) {
      const key = this.consume('ID').value as string
      this.consume('COLON')
      let valueType: string | null = null
      // Check if there's a type annotation before '='
      if (this.check('ID')) {
        valueType = this.consume('ID').value as string
      }
      this.consume('OPERATOR') // =
      const value = this.parseExpression()
      this.match('SEMICOLON')
      entries.push({ key, valueType, value })
    }
    this.consume('RBRACE')
    return { type: 'MapDecl', name, entries }
  }

  // --- Object Method Call ---

  parseObjectMethodCall(obj: ReferenceCallNode): ObjectMethodCallNode {
    // obj.func(args)
    this.consume('DOT')
    const method = this.consume('ID').value as string
    this.consume('LPAREN')
    const args: ExpressionNode[] = []
    if (!this.check('RPAREN')) {
      args.push(this.parseExpression())
      while (this.match('COMMA')) {
        args.push(this.parseExpression())
      }
    }
    this.consume('RPAREN')
    this.match('SEMICOLON')
    return { type: 'ObjectMethodCall', obj, method, args }
  }

  // --- Expression Parsing (Precedence Climbing) ---

  parseExpression(): ExpressionNode {
    return this.parseOr()
  }

  parseOr(): ExpressionNode {
    let left = this.parseAnd()
    while (this.check('OPERATOR', '||')) {
      const op = this.consume('OPERATOR').value as string
      const right = this.parseAnd()
      left = { type: 'BinaryOp', left, op, right }
    }
    return left
  }

  parseAnd(): ExpressionNode {
    let left = this.parseEquality()
    while (this.check('OPERATOR', '&&')) {
      const op = this.consume('OPERATOR').value as string
      const right = this.parseEquality()
      left = { type: 'BinaryOp', left, op, right }
    }
    return left
  }

  parseEquality(): ExpressionNode {
    let left = this.parseRelational()
    while (this.check('OPERATOR') && ['==', '!='].includes(this.tokens[this.pos].value as string)) {
      const op = this.consume('OPERATOR').value as string
      const right = this.parseRelational()
      left = { type: 'BinaryOp', left, op, right }
    }
    return left
  }

  parseRelational(): ExpressionNode {
    let left = this.parseAdditive()
    while (this.check('OPERATOR') && ['<', '<=', '>', '>='].includes(this.tokens[this.pos].value as string)) {
      const op = this.consume('OPERATOR').value as string
      const right = this.parseAdditive()
      left = { type: 'BinaryOp', left, op, right }
    }
    return left
  }

  parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative()
    while (this.check('OPERATOR') && ['+', '-'].includes(this.tokens[this.pos].value as string)) {
      const op = this.consume('OPERATOR').value as string
      const right = this.parseMultiplicative()
      left = { type: 'BinaryOp', left, op, right }
    }
    return left
  }

  parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary()
    while (this.check('OPERATOR') && ['*', '/', '%'].includes(this.tokens[this.pos].value as string)) {
      const op = this.consume('OPERATOR').value as string
      const right = this.parseUnary()
      left = { type: 'BinaryOp', left, op, right }
    }
    return left
  }

  parseUnary(): ExpressionNode {
    if (this.check('OPERATOR') && ['-', '!'].includes(this.tokens[this.pos].value as string)) {
      const op = this.consume('OPERATOR').value as string
      const expr = this.parseUnary()
      return { type: 'UnaryOp', op, expr }
    }
    return this.parsePrimary()
  }

  parsePrimary(): ExpressionNode {
    if (this.check('NUMBER')) {
      const tok = this.consume('NUMBER')
      return { type: 'NumberLiteral', value: tok.value as number }
    }
    if (this.check('STRING')) {
      const tok = this.consume('STRING')
      return { type: 'StringLiteral', value: tok.value as string }
    }
    if (this.check('BOOLEAN')) {
      const tok = this.consume('BOOLEAN')
      return { type: 'BooleanLiteral', value: tok.value as boolean }
    }
    if (this.check('KEYWORD', 'null')) {
      this.consume('KEYWORD')
      return { type: 'NullLiteral' }
    }
    if (this.check('KEYWORD', 'group')) {
      this.consume('KEYWORD')
      this.consume('LPAREN')
      const elements: ExpressionNode[] = []
      if (!this.check('RPAREN')) {
        elements.push(this.parseExpression())
        while (this.match('COMMA')) {
          elements.push(this.parseExpression())
        }
      }
      this.consume('RPAREN')
      return { type: 'GroupExpression', elements }
    }
    if (this.check('LBRACKET')) {
      this.consume('LBRACKET')
      const elements: ExpressionNode[] = []
      if (!this.check('RBRACKET')) {
        elements.push(this.parseExpression())
        while (this.match('COMMA')) {
          elements.push(this.parseExpression())
        }
      }
      this.consume('RBRACKET')
      return { type: 'ArrayLiteral', elements }
    }
    if (this.check('LPAREN')) {
      this.consume('LPAREN')
      const expr = this.parseExpression()
      this.consume('RPAREN')
      return expr
    }
    if (this.check('ID')) {
      const name = this.consume('ID').value as string
      let node: ExpressionNode = { type: 'ReferenceCall', ref: name, args: null }

      // Handle function call: name(...)
      if (this.check('LPAREN')) {
        this.consume('LPAREN')
        const args: ExpressionNode[] = []
        if (!this.check('RPAREN')) {
          args.push(this.parseExpression())
          while (this.match('COMMA')) {
            args.push(this.parseExpression())
          }
        }
        this.consume('RPAREN')
        node = { type: 'ReferenceCall', ref: name, args }
      }

      // Handle method call chain: .method(...) or property access: .prop
      // 循环支持链式调用：obj.method1().method2().method3()
      while (this.check('DOT')) {
        this.consume('DOT')
        const propName = this.consume('ID').value as string
        if (this.check('LPAREN')) {
          // Method call: .method(...)
          this.consume('LPAREN')
          const args: ExpressionNode[] = []
          if (!this.check('RPAREN')) {
            args.push(this.parseExpression())
            while (this.match('COMMA')) {
              args.push(this.parseExpression())
            }
          }
          this.consume('RPAREN')
          node = { type: 'ObjectMethodCall', obj: node, method: propName, args }
        } else {
          // Property access: .prop (e.g., Math.PI)
          node = { type: 'PropertyAccess', obj: node, property: propName }
          break  // 属性访问后不再继续链式调用
        }
      }

      return node
    }
    throw new Error(`Unexpected token '${this.peek()?.raw}' at position ${this.peek()?.pos}`)
  }
}
