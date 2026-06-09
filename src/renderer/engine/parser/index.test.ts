import { describe, it, expect } from 'vitest'
import { parseScript } from './index'

describe('parseScript', () => {
  it('应该解析空脚本', () => {
    const result = parseScript('')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.ast.statements).toEqual([])
    }
  })

  it('应该解析变量声明', () => {
    const result = parseScript('let x = 42;')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.ast.statements).toHaveLength(1)
      const stmt = result.ast.statements[0]
      expect(stmt.type).toBe('VariableDecl')
      if (stmt.type === 'VariableDecl') {
        expect(stmt.name).toBe('x')
        expect(stmt.value.type).toBe('NumberLiteral')
      }
    }
  })

  it('应该解析对象方法调用', () => {
    const result = parseScript('lily.move(600, 300, 1000);')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.ast.statements).toHaveLength(1)
      const stmt = result.ast.statements[0]
      expect(stmt.type).toBe('ObjectMethodCall')
    }
  })

  it('应该解析 ObjectFunction 定义', () => {
    const script = `ObjectFunction jump(obj, time) {
  y0 = obj.getY();
  obj.moveToY(y0 - 20, time/2);
}`
    const result = parseScript(script)
    expect(result.success).toBe(true)
    if (result.success) {
      const stmt = result.ast.statements[0]
      expect(stmt.type).toBe('ObjectFunctionDef')
      if (stmt.type === 'ObjectFunctionDef') {
        expect(stmt.name).toBe('jump')
        expect(stmt.typeNames).toEqual([])
      }
    }
  })

  it('应该解析多类型限定的 ObjectFunction 定义', () => {
    const script = `ObjectFunction (Background, Character)::fadeIn(obj, time) {
  obj.setAlpha(0, 0);
  obj.setAlpha(1, time);
}`
    const result = parseScript(script)
    expect(result.success).toBe(true)
    if (result.success) {
      const stmt = result.ast.statements[0]
      expect(stmt.type).toBe('ObjectFunctionDef')
      if (stmt.type === 'ObjectFunctionDef') {
        expect(stmt.name).toBe('fadeIn')
        expect(stmt.typeNames).toEqual(['Background', 'Character'])
        expect(stmt.params).toEqual(['obj', 'time'])
      }
    }
  })

  it('应该解析单类型限定的 ObjectFunction 定义（向后兼容）', () => {
    const script = `ObjectFunction Character::jump(obj, time) {
  obj.moveToY(obj.getY() + 100, time);
}`
    const result = parseScript(script)
    expect(result.success).toBe(true)
    if (result.success) {
      const stmt = result.ast.statements[0]
      expect(stmt.type).toBe('ObjectFunctionDef')
      if (stmt.type === 'ObjectFunctionDef') {
        expect(stmt.name).toBe('jump')
        expect(stmt.typeNames).toEqual(['Character'])
      }
    }
  })

  it('应该解析 if 语句', () => {
    const result = parseScript('if (x > 5) { y = 10; }')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.ast.statements[0].type).toBe('IfStatement')
    }
  })

  it('应该报告解析错误', () => {
    const result = parseScript('let x = ;')
    expect(result.success).toBe(false)
  })

  it('应该解析字符串字面量', () => {
    const result = parseScript('let name = "hello world";')
    expect(result.success).toBe(true)
  })

  it('应该处理注释', () => {
    const result = parseScript('// 这是注释\nlet x = 1;')
    expect(result.success).toBe(true)
  })
})
