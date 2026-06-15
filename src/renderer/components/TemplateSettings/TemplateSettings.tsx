import { useEffect, useState, useCallback, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../../engine/render/PixiRenderer'
import { DialogBox, DialogStyle } from '../../engine/render/DialogBox'
import { ChoicePanel, ChoiceStyle } from '../../engine/render/ChoicePanel'
import { ControlBar, ControlBarStyle } from '../../engine/render/ControlBar'

// ---------- types ----------

type TemplateCategory = 'dialog' | 'choice' | 'controlbar'

interface SectionDef {
  id: string
  label: string
  category: TemplateCategory
  groupKey: string
  properties: PropDef[]
}

interface PropDef {
  key: string
  label: string
  type: 'number' | 'color-int' | 'color-hex' | 'string' | 'select'
  min?: number
  max?: number
  step?: number
  options?: (string | { label: string; value: string })[]
}

// ---------- section definitions ----------

/** 字体选项：{ label: 中文显示名, value: CSS font-family 值 } */
const COMMON_FONTS: { label: string; value: string }[] = [
  // ── 置顶：思源宋体 ──
  { label: '思源宋体',         value: "'Source Han Serif SC','Noto Serif SC',SimSun,serif" },
  { label: '思源宋体 Light',   value: "'Source Han Serif SC Light','Noto Serif SC ExtraLight',SimSun,serif" },
  { label: '思源宋体 Heavy',   value: "'Source Han Serif SC Heavy','Noto Serif SC Black',SimSun,serif" },
  // ── 置顶：思源黑体 ──
  { label: '思源黑体',         value: "'Source Han Sans SC','Noto Sans SC','Microsoft YaHei',SimHei,sans-serif" },
  { label: '思源黑体 Light',   value: "'Source Han Sans SC Light','Noto Sans SC ExtraLight','Microsoft YaHei Light',sans-serif" },
  { label: '思源黑体 Heavy',   value: "'Source Han Sans SC Heavy','Noto Sans SC Black','Microsoft YaHei UI',sans-serif" },
  // ── 其他常用字体 ──
  { label: '微软雅黑',         value: "'Microsoft YaHei',SimHei,sans-serif" },
  { label: '宋体',             value: "SimSun,serif" },
  { label: '楷体',             value: "KaiTi,serif" },
  { label: '仿宋',             value: "FangSong,serif" },
  { label: 'Arial',            value: "Arial,sans-serif" },
  { label: 'Arial Black',      value: "'Arial Black',sans-serif" },
  { label: 'Georgia',          value: "Georgia,serif" },
  { label: 'Times New Roman',  value: "'Times New Roman',serif" },
  { label: 'Courier New',      value: "'Courier New',monospace" },
  { label: 'Verdana',          value: "Verdana,sans-serif" },
  { label: 'Impact',           value: "Impact,sans-serif" },
  { label: 'Comic Sans MS',    value: "'Comic Sans MS',cursive" },
]

const SECTIONS: SectionDef[] = [
  // === 文本框 ===
  {
    id: 'dialog-box-avatar',
    label: '文本框（含头像）',
    category: 'dialog',
    groupKey: 'box',
    properties: [
      { key: 'height', label: '高度', type: 'number', min: 50, max: 600, step: 10 },
      { key: 'topMargin', label: '顶部边距（从顶定位）', type: 'number', min: 0, max: 900, step: 10 },
      { key: 'leftMargin', label: '左侧边距', type: 'number', min: 0, max: 500, step: 1 },
      { key: 'rightMargin', label: '右侧边距', type: 'number', min: 0, max: 500, step: 1 },
      { key: 'bottomMargin', label: '底部边距', type: 'number', min: 0, max: 200, step: 1 },
      { key: 'backgroundColor', label: '背景色', type: 'color-int' },
      { key: 'backgroundAlpha', label: '背景透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'borderColor', label: '描边颜色', type: 'color-int' },
      { key: 'borderAlpha', label: '描边透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'borderWidth', label: '描边宽度', type: 'number', min: 0, max: 10, step: 1 },
      { key: 'borderRadius', label: '边框圆角', type: 'number', min: 0, max: 30, step: 1 }
    ]
  },
  {
    id: 'dialog-box-shadow',
    label: '对话框阴影',
    category: 'dialog',
    groupKey: 'box',
    properties: [
      { key: 'shadowBlur', label: '阴影模糊', type: 'number', min: 0, max: 40, step: 1 },
      { key: 'shadowColor', label: '阴影颜色', type: 'color-int' },
      { key: 'shadowAlpha', label: '阴影透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'shadowOffsetX', label: '阴影水平偏移', type: 'number', min: -20, max: 20, step: 1 },
      { key: 'shadowOffsetY', label: '阴影垂直偏移', type: 'number', min: -20, max: 20, step: 1 }
    ]
  },
  {
    id: 'name-box',
    label: '姓名框',
    category: 'dialog',
    groupKey: 'nameBox',
    properties: [
      { key: 'width', label: '宽度', type: 'number', min: 40, max: 400, step: 5 },
      { key: 'height', label: '高度', type: 'number', min: 20, max: 120, step: 2 },
      { key: 'leftMargin', label: '左侧边距', type: 'number', min: 0, max: 200, step: 1 },
      { key: 'rightMargin', label: '右侧边距', type: 'number', min: 0, max: 200, step: 1 },
      { key: 'bottomMargin', label: '底部边距', type: 'number', min: 0, max: 200, step: 1 },
      { key: 'backgroundColor', label: '背景色', type: 'color-int' },
      { key: 'backgroundAlpha', label: '背景透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'borderColor', label: '描边颜色', type: 'color-int' },
      { key: 'borderAlpha', label: '描边透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'borderWidth', label: '描边宽度', type: 'number', min: 0, max: 10, step: 1 },
      { key: 'borderRadius', label: '边框圆角', type: 'number', min: 0, max: 30, step: 1 }
    ]
  },
  {
    id: 'avatar',
    label: '头像',
    category: 'dialog',
    groupKey: 'avatar',
    properties: [
      { key: 'width', label: '宽度', type: 'number', min: 20, max: 200, step: 2 },
      { key: 'height', label: '高度', type: 'number', min: 20, max: 200, step: 2 },
      { key: 'leftMargin', label: '左侧边距', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'rightMargin', label: '右侧边距', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'topMargin', label: '顶部边距', type: 'number', min: 0, max: 200, step: 1 },
      { key: 'bottomMargin', label: '底部边距', type: 'number', min: 0, max: 200, step: 1 },
      { key: 'borderRadius', label: '头像圆角', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'borderColor', label: '描边颜色', type: 'color-int' },
      { key: 'borderWidth', label: '描边宽度', type: 'number', min: 0, max: 8, step: 1 },
      { key: 'borderAlpha', label: '描边透明度', type: 'number', min: 0, max: 1, step: 0.01 }
    ]
  },
  {
    id: 'dialogue-text-style',
    label: '对话文本样式',
    category: 'dialog',
    groupKey: 'dialogueText',
    properties: [
      { key: 'fontFamily', label: '字体', type: 'select', options: COMMON_FONTS },
      { key: 'fontSize', label: '字号', type: 'number', min: 12, max: 60, step: 1 },
      { key: 'fontWeight', label: '字重', type: 'select', options: ['normal', 'bold'] },
      { key: 'fontStyle', label: '字形', type: 'select', options: ['normal', 'italic'] },
      { key: 'textAlign', label: '对齐方式', type: 'select', options: ['left', 'center', 'right'] },
      { key: 'color', label: '颜色', type: 'color-hex' },
      { key: 'topMargin', label: '顶部边距', type: 'number', min: 0, max: 200, step: 1 },
      { key: 'leftMargin', label: '左侧边距', type: 'number', min: 0, max: 200, step: 1 },
      { key: 'rightMargin', label: '右侧边距', type: 'number', min: 0, max: 200, step: 1 },
      { key: 'bottomMargin', label: '底部边距', type: 'number', min: 0, max: 200, step: 1 },
      { key: 'lineHeight', label: '行间距', type: 'number', min: 16, max: 80, step: 1 },
      { key: 'letterSpacing', label: '字间距', type: 'number', min: 0, max: 20, step: 0.5 },
      { key: 'strokeColor', label: '描边颜色', type: 'color-hex' },
      { key: 'strokeAlpha', label: '描边透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'strokeWidth', label: '描边宽度', type: 'number', min: 0, max: 5, step: 0.5 }
    ]
  },
  {
    id: 'name-text-style',
    label: '姓名文本样式',
    category: 'dialog',
    groupKey: 'nameText',
    properties: [
      { key: 'fontFamily', label: '字体', type: 'select', options: COMMON_FONTS },
      { key: 'fontSize', label: '字号', type: 'number', min: 12, max: 60, step: 1 },
      { key: 'fontWeight', label: '字重', type: 'select', options: ['normal', 'bold'] },
      { key: 'fontStyle', label: '字形', type: 'select', options: ['normal', 'italic'] },
      { key: 'color', label: '颜色', type: 'color-hex' },
      { key: 'leftMargin', label: '左侧边距', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'letterSpacing', label: '字间距', type: 'number', min: 0, max: 20, step: 0.5 },
      { key: 'strokeColor', label: '描边颜色', type: 'color-hex' },
      { key: 'strokeAlpha', label: '描边透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'strokeWidth', label: '描边宽度', type: 'number', min: 0, max: 5, step: 0.5 }
    ]
  },
  // === 自动播放进度环 ===
  {
    id: 'auto-progress-ring',
    label: '自动播放进度条',
    category: 'dialog',
    groupKey: 'autoProgress',
    properties: [
      { key: 'size', label: '圆环直径', type: 'number', min: 10, max: 80, step: 2 },
      { key: 'color', label: '圆环颜色', type: 'color-int' },
      { key: 'width', label: '圆环粗细', type: 'number', min: 1, max: 8, step: 1 },
      { key: 'rightMargin', label: '右侧边距', type: 'number', min: 0, max: 100, step: 1 }
    ]
  },
  // === 分支选项 ===
  {
    id: 'choice-panel',
    label: '选项面板定位',
    category: 'choice',
    groupKey: 'panel',
    properties: [
      { key: 'horizontalAlign', label: '水平对齐', type: 'select', options: ['center', 'left', 'right'] },
      { key: 'verticalAlign', label: '垂直对齐', type: 'select', options: ['center', 'top', 'bottom'] },
      { key: 'marginX', label: '水平边距', type: 'number', min: 0, max: 0.5, step: 0.01 },
      { key: 'marginY', label: '垂直边距', type: 'number', min: 0, max: 0.5, step: 0.01 }
    ]
  },
  {
    id: 'choice-button',
    label: '选项按钮',
    category: 'choice',
    groupKey: 'button',
    properties: [
      { key: 'width', label: '宽度', type: 'number', min: 100, max: 900, step: 10 },
      { key: 'height', label: '高度', type: 'number', min: 20, max: 100, step: 2 },
      { key: 'backgroundColor', label: '背景色', type: 'color-int' },
      { key: 'backgroundColorHover', label: '悬停背景色', type: 'color-int' },
      { key: 'backgroundAlpha', label: '背景透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'borderColor', label: '描边颜色', type: 'color-int' },
      { key: 'borderAlpha', label: '描边透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'borderWidth', label: '描边宽度', type: 'number', min: 0, max: 10, step: 1 },
      { key: 'borderRadius', label: '边框圆角', type: 'number', min: 0, max: 30, step: 1 },
      { key: 'textColorHover', label: '悬停文本色', type: 'color-hex' },
      { key: 'buttonGap', label: '按钮间距', type: 'number', min: 0, max: 50, step: 2 }
    ]
  },
  {
    id: 'choice-button-disabled',
    label: '选项按钮（禁用时）',
    category: 'choice',
    groupKey: 'buttonDisabled',
    properties: [
      { key: 'backgroundColor', label: '背景色', type: 'color-int' },
      { key: 'backgroundAlpha', label: '背景透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'borderColor', label: '描边颜色', type: 'color-int' },
      { key: 'borderAlpha', label: '描边透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'borderWidth', label: '描边宽度', type: 'number', min: 0, max: 10, step: 1 },
      { key: 'textColor', label: '文本颜色', type: 'color-hex' }
    ]
  },
  {
    id: 'choice-text-style',
    label: '文本样式',
    category: 'choice',
    groupKey: 'text',
    properties: [
      { key: 'textAlign', label: '文本对齐', type: 'select', options: ['center', 'left', 'right'] },
      { key: 'fontFamily', label: '字体', type: 'select', options: COMMON_FONTS },
      { key: 'fontSize', label: '字号', type: 'number', min: 12, max: 50, step: 1 },
      { key: 'fontWeight', label: '字重', type: 'select', options: ['normal', 'bold'] },
      { key: 'fontStyle', label: '字形', type: 'select', options: ['normal', 'italic'] },
      { key: 'color', label: '颜色', type: 'color-hex' },
      { key: 'leftMargin', label: '左侧边距', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'rightMargin', label: '右侧边距', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'bottomMargin', label: '底部边距', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'letterSpacing', label: '字间距', type: 'number', min: 0, max: 20, step: 0.5 },
      { key: 'strokeColor', label: '描边颜色', type: 'color-hex' },
      { key: 'strokeAlpha', label: '描边透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'strokeWidth', label: '描边宽度', type: 'number', min: 0, max: 5, step: 0.5 }
    ]
  },
  // === 菜单内按钮 ===
  {
    id: 'controlbar-bar',
    label: '菜单栏背景',
    category: 'controlbar',
    groupKey: 'bar',
    properties: [
      { key: 'height', label: '高度', type: 'number', min: 20, max: 120, step: 2 },
      { key: 'backgroundColor', label: '背景色', type: 'color-int' },
      { key: 'backgroundAlpha', label: '背景透明度', type: 'number', min: 0, max: 1, step: 0.01 }
    ]
  },
  {
    id: 'controlbar-button',
    label: '菜单栏按钮',
    category: 'controlbar',
    groupKey: 'button',
    properties: [
      { key: 'autoWidth', label: '按钮宽度', type: 'number', min: 40, max: 200, step: 2 },
      { key: 'height', label: '按钮高度', type: 'number', min: 16, max: 80, step: 2 },
      { key: 'borderRadius', label: '按钮圆角', type: 'number', min: 0, max: 20, step: 1 },
      { key: 'gap', label: '按钮间距', type: 'number', min: 0, max: 30, step: 2 },
      { key: 'fontFamily', label: '字体', type: 'select', options: COMMON_FONTS },
      { key: 'fontSize', label: '字号', type: 'number', min: 10, max: 30, step: 1 },
      { key: 'defaultColor', label: '默认文本色', type: 'color-hex' },
      { key: 'defaultBackground', label: '默认背景色', type: 'color-int' },
      { key: 'defaultBackgroundAlpha', label: '默认背景透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'defaultBorderColor', label: '默认描边色', type: 'color-int' },
      { key: 'defaultBorderAlpha', label: '默认描边透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'defaultFontWeight', label: '默认字重', type: 'select', options: ['normal', 'bold'] },
      { key: 'activeColor', label: '激活文本色', type: 'color-hex' },
      { key: 'activeBackground', label: '激活背景色', type: 'color-int' },
      { key: 'activeBackgroundAlpha', label: '激活背景透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'activeBorderColor', label: '激活描边色', type: 'color-int' },
      { key: 'activeBorderAlpha', label: '激活描边透明度', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'activeFontWeight', label: '激活字重', type: 'select', options: ['normal', 'bold'] }
    ]
  }
]

// ---------- helpers ----------

function intToHex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0')
}

function hexToInt(h: string): number {
  return parseInt(h.replace('#', ''), 16)
}



function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ---------- component ----------

interface TemplateSettingsProps {
  onBack: () => void
}

interface StyleData {
  [key: string]: Record<string, unknown>
}

interface SchemeInfo {
  id: string
  name: string
}

interface SchemesIndex {
  version: string
  activeScheme: string
  schemes: SchemeInfo[]
}

export function TemplateSettings({ onBack }: TemplateSettingsProps): JSX.Element {
  const [dialogStyle, setDialogStyle] = useState<StyleData>({})
  const [choiceStyle, setChoiceStyle] = useState<StyleData>({})
  const [controlbarStyle, setControlbarStyle] = useState<StyleData>({})
  const [activeSection, setActiveSection] = useState<string>('dialog-box-avatar')
  const [isSchemeLoaded, setIsSchemeLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [, _setAppPath] = useState<string>('')
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(1)

  // ---- 预览开关状态 ----
  const [showExampleCharacter, setShowExampleCharacter] = useState(true)
  const [showExampleBackground, setShowExampleBackground] = useState(true)
  const [showAvatarToggle, setShowAvatarToggle] = useState(true)
  const [showNameBoxToggle, setShowNameBoxToggle] = useState(true)
  const [showDialogBoxToggle, setShowDialogBoxToggle] = useState(true)

  // PixiJS 预览实例
  const pixiCanvasMountRef = useRef<HTMLDivElement>(null)
  const pixiAppRef = useRef<PIXI.Application | null>(null)
  const dialogBoxRef = useRef<DialogBox | null>(null)
  const choicePanelRef = useRef<ChoicePanel | null>(null)
  const controlBarRef = useRef<ControlBar | null>(null)
  // 预加载的精灵/纹理引用
  const bgSpriteRef = useRef<PIXI.Sprite | null>(null)
  const charSpriteRef = useRef<PIXI.Sprite | null>(null)
  const avatarTextureRef = useRef<PIXI.Texture | null>(null)

  // ---- 方案管理 ----
  const [schemes, setSchemes] = useState<SchemeInfo[]>([])
  const [activeSchemeId, setActiveSchemeId] = useState<string>('dark')
  const [schemesDir, setSchemesDir] = useState<string>('')
  // 方案名称编辑
  const [renamingSchemeId, setRenamingSchemeId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')

  // 根据预览容器尺寸计算 contain 缩放比例（与 PreviewCanvas 一致）
  useEffect(() => {
    const doResize = () => {
      if (!previewContainerRef.current) return
      const rect = previewContainerRef.current.getBoundingClientRect()
      const scale = Math.min(rect.width / VIRTUAL_WIDTH, rect.height / VIRTUAL_HEIGHT)
      setPreviewScale(Math.max(0.1, scale))
    }
    doResize()
    window.addEventListener('resize', doResize)
    return () => window.removeEventListener('resize', doResize)
  }, [])

  // ---- 级联开关：关闭对话框时自动关闭头像和姓名框 ----
  useEffect(() => {
    if (!showDialogBoxToggle) {
      setShowAvatarToggle(false)
      setShowNameBoxToggle(false)
    }
  }, [showDialogBoxToggle])

  // ---- 拖拽调整 ----
  const dragRef = useRef<{
    active: boolean
    type: string
    startX: number
    startY: number
    startVal1: number
    startVal2: number
    groupKey: string
  }>({ active: false, type: '', startX: 0, startY: 0, startVal1: 0, startVal2: 0, groupKey: '' })

  // 全局鼠标事件：拖拽时跟随鼠标更新属性
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag.active) return
      const dx = (e.clientX - drag.startX) / previewScale
      const dy = (e.clientY - drag.startY) / previewScale

      switch (drag.type) {
        case 'left-edge': {
          const newVal = clamp(Math.round(drag.startVal1 + dx), 0, 500)
          setDialogStyle((prev) => ({
            ...prev,
            box: { ...(prev.box as Record<string, unknown> ?? {}), leftMargin: newVal }
          }))
          break
        }
        case 'right-edge': {
          const newVal = clamp(Math.round(drag.startVal1 - dx), 0, 500)
          setDialogStyle((prev) => ({
            ...prev,
            box: { ...(prev.box as Record<string, unknown> ?? {}), rightMargin: newVal }
          }))
          break
        }
        case 'top-edge': {
          const newVal = clamp(Math.round(drag.startVal1 - dy), 50, 600)
          setDialogStyle((prev) => ({
            ...prev,
            box: { ...(prev.box as Record<string, unknown> ?? {}), height: newVal }
          }))
          break
        }
        case 'avatar-pos': {
          const newLM = clamp(Math.round(drag.startVal1 + dx), 0, 100)
          setDialogStyle((prev) => ({
            ...prev,
            avatar: { ...(prev.avatar as Record<string, unknown> ?? {}), leftMargin: newLM }
          }))
          break
        }
        case 'name-pos': {
          const newLM = clamp(Math.round(drag.startVal1 + dx), 0, 200)
          setDialogStyle((prev) => ({
            ...prev,
            nameBox: { ...(prev.nameBox as Record<string, unknown> ?? {}), leftMargin: newLM }
          }))
          break
        }
        case 'box-bottom-edge': {
          const newVal = clamp(Math.round(drag.startVal1 - dy), 0, 200)
          setDialogStyle((prev) => ({
            ...prev,
            box: { ...(prev.box as Record<string, unknown> ?? {}), bottomMargin: newVal }
          }))
          break
        }
        case 'avatar-w': {
          const newVal = clamp(Math.round(drag.startVal1 + dx), 20, 200)
          setDialogStyle((prev) => ({
            ...prev,
            avatar: { ...(prev.avatar as Record<string, unknown> ?? {}), width: newVal }
          }))
          break
        }
        case 'avatar-h': {
          const newVal = clamp(Math.round(drag.startVal1 + dy), 20, 200)
          setDialogStyle((prev) => ({
            ...prev,
            avatar: { ...(prev.avatar as Record<string, unknown> ?? {}), height: newVal }
          }))
          break
        }
        case 'name-w': {
          const newVal = clamp(Math.round(drag.startVal1 + dx), 40, 400)
          setDialogStyle((prev) => ({
            ...prev,
            nameBox: { ...(prev.nameBox as Record<string, unknown> ?? {}), width: newVal }
          }))
          break
        }
        case 'name-h': {
          const newVal = clamp(Math.round(drag.startVal1 + dy), 20, 120)
          setDialogStyle((prev) => ({
            ...prev,
            nameBox: { ...(prev.nameBox as Record<string, unknown> ?? {}), height: newVal }
          }))
          break
        }
        case 'text-left-edge': {
          const newVal = clamp(Math.round(drag.startVal1 + dx), 0, 200)
          setDialogStyle((prev) => ({
            ...prev,
            dialogueText: { ...(prev.dialogueText as Record<string, unknown> ?? {}), leftMargin: newVal }
          }))
          break
        }
        case 'text-right-edge': {
          const newVal = clamp(Math.round(drag.startVal1 - dx), 0, 200)
          setDialogStyle((prev) => ({
            ...prev,
            dialogueText: { ...(prev.dialogueText as Record<string, unknown> ?? {}), rightMargin: newVal }
          }))
          break
        }
        case 'text-bottom-edge': {
          const newVal = clamp(Math.round(drag.startVal1 - dy), 0, 200)
          setDialogStyle((prev) => ({
            ...prev,
            dialogueText: { ...(prev.dialogueText as Record<string, unknown> ?? {}), bottomMargin: newVal }
          }))
          break
        }
        case 'avatar-right': {
          const newVal = clamp(Math.round(drag.startVal1 + dx), 0, 100)
          setDialogStyle((prev) => ({
            ...prev,
            avatar: { ...(prev.avatar as Record<string, unknown> ?? {}), rightMargin: newVal }
          }))
          break
        }
        case 'avatar-bottom': {
          const newVal = clamp(Math.round(drag.startVal1 + dy), 0, 200)
          setDialogStyle((prev) => ({
            ...prev,
            avatar: { ...(prev.avatar as Record<string, unknown> ?? {}), bottomMargin: newVal }
          }))
          break
        }
      }
    }

    const handleMouseUp = () => {
      if (dragRef.current.active) {
        dragRef.current.active = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [previewScale])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  // ---- 方案管理辅助函数 ----
  const SCHEMES_JSON = 'schemes.json'

  /** 读取并返回方案索引，若不存在则从旧路径迁移 */
  async function loadOrMigrateSchemes(appPath: string): Promise<SchemesIndex> {
    const sd = `${appPath}/assets/template/schemes`
    try {
      const raw = await window.electronAPI.readFile(`${sd}/${SCHEMES_JSON}`)
      return JSON.parse(raw) as SchemesIndex
    } catch {
      // schemes.json 不存在 → 首次迁移：从旧路径读取，创建 dark 方案
      let oldDialog: StyleData = {}
      let oldChoice: StyleData = {}
      try {
        oldDialog = JSON.parse(await window.electronAPI.readFile(`${appPath}/assets/template/dialog/style.json`))
      } catch { /* 使用默认值 */ }
      try {
        oldChoice = JSON.parse(await window.electronAPI.readFile(`${appPath}/assets/template/choice/style.json`))
      } catch { /* 使用默认值 */ }
      // 确保 dark 目录存在
      const darkD = `${sd}/dark`
      const lightD = `${sd}/light`
      // 写 dark 方案（旧数据或默认值）
      await window.electronAPI.writeFile(`${darkD}/dialog.json`, JSON.stringify(oldDialog.version ? oldDialog : DEFAULT_DIALOG, null, 2))
      await window.electronAPI.writeFile(`${darkD}/choice.json`, JSON.stringify(oldChoice.version ? oldChoice : DEFAULT_CHOICE, null, 2))
      await window.electronAPI.writeFile(`${darkD}/controlbar.json`, JSON.stringify(DEFAULT_CONTROLBAR, null, 2))
      // 写 light 方案
      await window.electronAPI.writeFile(`${lightD}/dialog.json`, JSON.stringify(DEFAULT_LIGHT_DIALOG, null, 2))
      await window.electronAPI.writeFile(`${lightD}/choice.json`, JSON.stringify(DEFAULT_LIGHT_CHOICE, null, 2))
      await window.electronAPI.writeFile(`${lightD}/controlbar.json`, JSON.stringify(DEFAULT_LIGHT_CONTROLBAR, null, 2))
      // 写索引
      const idx: SchemesIndex = {
        version: '1.0',
        activeScheme: 'dark',
        schemes: [
          { id: 'dark', name: '深色主题' },
          { id: 'light', name: '浅色主题' }
        ]
      }
      await window.electronAPI.writeFile(`${sd}/${SCHEMES_JSON}`, JSON.stringify(idx, null, 2))
      return idx
    }
  }

  /** 从当前方案加载 dialog/choice/controlbar 样式 */
  async function loadSchemeStyles(appPath: string, schemeId: string): Promise<{ dialog: StyleData; choice: StyleData; controlbar: StyleData }> {
    const sd = `${appPath}/assets/template/schemes`
    let dialog: StyleData = DEFAULT_DIALOG
    let choice: StyleData = DEFAULT_CHOICE
    let controlbar: StyleData = DEFAULT_CONTROLBAR
    try {
      dialog = JSON.parse(await window.electronAPI.readFile(`${sd}/${schemeId}/dialog.json`))
    } catch { /* 使用默认 */ }
    try {
      choice = JSON.parse(await window.electronAPI.readFile(`${sd}/${schemeId}/choice.json`))
    } catch { /* 使用默认 */ }
    try {
      controlbar = JSON.parse(await window.electronAPI.readFile(`${sd}/${schemeId}/controlbar.json`))
    } catch { /* 使用默认 */ }
    return { dialog, choice, controlbar }
  }

  /** 将当前样式同步到引擎读取的旧路径 (dialog/style.json + choice/style.json + controlbar/style.json) */
  async function syncEngineFiles(appPath: string, dialog: StyleData, choice: StyleData, controlbar: StyleData): Promise<void> {
    await window.electronAPI.writeFile(`${appPath}/assets/template/dialog/style.json`, JSON.stringify(dialog, null, 2))
    await window.electronAPI.writeFile(`${appPath}/assets/template/choice/style.json`, JSON.stringify(choice, null, 2))
    await window.electronAPI.writeFile(`${appPath}/assets/template/controlbar/style.json`, JSON.stringify(controlbar, null, 2))
  }

  /** 将当前样式保存到指定方案目录 + 同步引擎文件 + 写入索引 */
  async function saveToScheme(appPath: string, schemeId: string, dialog: StyleData, choice: StyleData, controlbar: StyleData, schemeName?: string): Promise<void> {
    const sd = `${appPath}/assets/template/schemes`
    const dir = `${sd}/${schemeId}`
    await window.electronAPI.writeFile(`${dir}/dialog.json`, JSON.stringify(dialog, null, 2))
    await window.electronAPI.writeFile(`${dir}/choice.json`, JSON.stringify(choice, null, 2))
    await window.electronAPI.writeFile(`${dir}/controlbar.json`, JSON.stringify(controlbar, null, 2))
    await syncEngineFiles(appPath, dialog, choice, controlbar)
    // 更新索引中此方案的名称（如果有变更）
    if (schemeName) {
      const raw = await window.electronAPI.readFile(`${sd}/${SCHEMES_JSON}`)
      const idx = JSON.parse(raw) as SchemesIndex
      const s = idx.schemes.find((x) => x.id === schemeId)
      if (s) s.name = schemeName
      await window.electronAPI.writeFile(`${sd}/${SCHEMES_JSON}`, JSON.stringify(idx, null, 2))
    }
  }

  // 默认样式常量
  const DEFAULT_DIALOG: StyleData = {
    version: '1.3',
    box: { height: 220, leftMargin: 80, rightMargin: 80, bottomMargin: 30, backgroundColor: 987939, backgroundAlpha: 0.85, borderColor: 2955610, borderAlpha: 0.5, borderWidth: 1, borderRadius: 12, shadowBlur: 20, shadowColor: 0, shadowAlpha: 0.35, shadowOffsetX: 0, shadowOffsetY: 6 },
    nameBox: { width: 160, height: 40, leftMargin: 24, rightMargin: 24, bottomMargin: 8, backgroundColor: 1712698, backgroundAlpha: 0.9, borderColor: 6512563, borderAlpha: 0.4, borderWidth: 1, borderRadius: 6 },
    avatar: { width: 130, height: 130, leftMargin: 16, rightMargin: 14, bottomMargin: 12, topMargin: 0, borderRadius: 12, borderColor: 6512563, borderWidth: 2, borderAlpha: 0.5 },
    dialogueText: { fontFamily: 'Source Han Serif SC, Noto Serif SC, SimSun, serif', fontSize: 26, color: '#e8e8f0', leftMargin: 12, rightMargin: 12, bottomMargin: 16, lineHeight: 40, letterSpacing: 1, strokeColor: '#000000', strokeAlpha: 0, strokeWidth: 0, textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' },
    nameText: { fontFamily: 'Source Han Serif SC, Noto Serif SC, SimSun, serif', fontSize: 18, color: '#d4a843', letterSpacing: 2, strokeColor: '#000000', strokeAlpha: 0, strokeWidth: 0, leftMargin: 10, fontWeight: 'bold', fontStyle: 'normal' },
    autoProgress: { size: 36, color: 0x7c6ff0, width: 3, rightMargin: 16 },
  } as unknown as StyleData

  const DEFAULT_CHOICE: StyleData = {
    version: '1.3',
    panel: { horizontalAlign: 'center', verticalAlign: 'center', marginX: 0, marginY: 0 },
    button: { width: 600, height: 64, backgroundColor: 987939, backgroundColorHover: 1712698, backgroundAlpha: 0.85, borderColor: 4010859, borderAlpha: 0.4, borderWidth: 1, borderRadius: 8, buttonGap: 14, textColorHover: '#ffffff' },
    buttonDisabled: { backgroundColor: 4473924, backgroundAlpha: 0.4, borderColor: 5592405, borderAlpha: 0.3, borderWidth: 1, textColor: '#888888' },
    text: { textAlign: 'center', fontFamily: 'Source Han Serif SC, Noto Serif SC, SimSun, serif', fontSize: 26, color: '#e8e8f0', leftMargin: 16, rightMargin: 16, bottomMargin: 0, letterSpacing: 1, strokeColor: '#000000', strokeAlpha: 0, strokeWidth: 0, fontWeight: 'normal', fontStyle: 'normal' }
  } as unknown as StyleData

  const DEFAULT_LIGHT_DIALOG: StyleData = {
    version: '1.3',
    box: { height: 220, leftMargin: 80, rightMargin: 80, bottomMargin: 30, backgroundColor: 16119285, backgroundAlpha: 0.92, borderColor: 13421772, borderAlpha: 0.6, borderWidth: 1, borderRadius: 12, shadowBlur: 15, shadowColor: 0, shadowAlpha: 0.15, shadowOffsetX: 0, shadowOffsetY: 4 },
    nameBox: { width: 160, height: 40, leftMargin: 24, rightMargin: 24, bottomMargin: 8, backgroundColor: 4886745, backgroundAlpha: 0.9, borderColor: 3503805, borderAlpha: 0.3, borderWidth: 0, borderRadius: 6 },
    avatar: { width: 130, height: 130, leftMargin: 16, rightMargin: 14, bottomMargin: 12, topMargin: 0, borderRadius: 12, borderColor: 6710886, borderWidth: 2, borderAlpha: 0.4 },
    dialogueText: { fontFamily: 'Source Han Serif SC, Noto Serif SC, SimSun, serif', fontSize: 26, color: '#333333', leftMargin: 12, rightMargin: 12, bottomMargin: 16, lineHeight: 40, letterSpacing: 1, strokeColor: '#000000', strokeAlpha: 0, strokeWidth: 0, textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' },
    nameText: { fontFamily: 'Source Han Serif SC, Noto Serif SC, SimSun, serif', fontSize: 18, color: '#ffffff', letterSpacing: 2, strokeColor: '#000000', strokeAlpha: 0, strokeWidth: 0, leftMargin: 10, fontWeight: 'bold', fontStyle: 'normal' },
    autoProgress: { size: 36, color: 0x7c6ff0, width: 3, rightMargin: 16 },
  } as unknown as StyleData

  const DEFAULT_LIGHT_CHOICE: StyleData = {
    version: '1.3',
    panel: { horizontalAlign: 'center', verticalAlign: 'center', marginX: 0, marginY: 0 },
    button: { width: 600, height: 64, backgroundColor: 16777215, backgroundColorHover: 15790320, backgroundAlpha: 0.9, borderColor: 13421772, borderAlpha: 0.5, borderWidth: 1, borderRadius: 8, buttonGap: 14, textColorHover: '#000000' },
    buttonDisabled: { backgroundColor: 14737632, backgroundAlpha: 0.5, borderColor: 13421772, borderAlpha: 0.3, borderWidth: 1, textColor: '#999999' },
    text: { textAlign: 'center', fontFamily: 'Source Han Serif SC, Noto Serif SC, SimSun, serif', fontSize: 26, color: '#333333', leftMargin: 16, rightMargin: 16, bottomMargin: 0, letterSpacing: 1, strokeColor: '#000000', strokeAlpha: 0, strokeWidth: 0, fontWeight: 'normal', fontStyle: 'normal' }
  } as unknown as StyleData

  const DEFAULT_CONTROLBAR: StyleData = {
    bar: { height: 52, backgroundColor: 0, backgroundAlpha: 0.4 },
    button: {
      autoWidth: 84, height: 28, borderRadius: 4, gap: 8,
      fontFamily: 'Source Han Serif SC, Noto Serif SC, SimSun, serif', fontSize: 12,
      defaultColor: '#cccccc', defaultBackground: 0, defaultBackgroundAlpha: 0.5,
      defaultBorderColor: 16777215, defaultBorderAlpha: 0.2, defaultFontWeight: 'normal',
      activeColor: '#000000', activeBackground: 16766720, activeBackgroundAlpha: 0.7,
      activeBorderColor: 15125952, activeBorderAlpha: 0.3, activeFontWeight: 'bold'
    }
  } as unknown as StyleData

  const DEFAULT_LIGHT_CONTROLBAR: StyleData = {
    bar: { height: 52, backgroundColor: 0, backgroundAlpha: 0.3 },
    button: {
      autoWidth: 84, height: 28, borderRadius: 4, gap: 8,
      fontFamily: 'Source Han Serif SC, Noto Serif SC, SimSun, serif', fontSize: 12,
      defaultColor: '#333333', defaultBackground: 16777215, defaultBackgroundAlpha: 0.8,
      defaultBorderColor: 13421772, defaultBorderAlpha: 0.4, defaultFontWeight: 'normal',
      activeColor: '#000000', activeBackground: 16766720, activeBackgroundAlpha: 0.8,
      activeBorderColor: 15125952, activeBorderAlpha: 0.5, activeFontWeight: 'bold'
    }
  } as unknown as StyleData

  // Load styles on mount
  useEffect(() => {
    if (!window.electronAPI) return
    ;(async () => {
      const resolvedAppPath = await window.electronAPI.getAppPath()
      _setAppPath(resolvedAppPath)
      const sd = `${resolvedAppPath}/assets/template/schemes`
      setSchemesDir(sd)
      // 加载/迁移方案索引
      const idx = await loadOrMigrateSchemes(resolvedAppPath)
      setSchemes(idx.schemes)
      setActiveSchemeId(idx.activeScheme)
      // 加载当前方案样式
      const styles = await loadSchemeStyles(resolvedAppPath, idx.activeScheme)
      setDialogStyle(styles.dialog)
      setChoiceStyle(styles.choice)
      setControlbarStyle(styles.controlbar)
      setIsSchemeLoaded(true)
      // 同步到引擎文件
      await syncEngineFiles(resolvedAppPath, styles.dialog, styles.choice, styles.controlbar)
    })()
  }, [])

  // ---- PixiJS 渲染引擎预览（替换 CSS 预览，确保与演出区域效果一致） ----

  /** 初始化 PixiJS 预览（等待方案数据加载完成后再创建） */
  useEffect(() => {
    if (!isSchemeLoaded) return
    if (!pixiCanvasMountRef.current) return
    const mount = pixiCanvasMountRef.current

    const app = new PIXI.Application({
      width: VIRTUAL_WIDTH,
      height: VIRTUAL_HEIGHT,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      resolution: 1,
      autoDensity: true,
      powerPreference: 'high-performance'
    })

    const canvas = app.view as HTMLCanvasElement
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.top = '0'
    canvas.style.width = `${VIRTUAL_WIDTH}px`
    canvas.style.height = `${VIRTUAL_HEIGHT}px`
    mount.appendChild(canvas)

    const dialogBox = new DialogBox(app)
    const choicePanel = new ChoicePanel(app)
    const controlBar = new ControlBar(app)

    pixiAppRef.current = app
    dialogBoxRef.current = dialogBox
    choicePanelRef.current = choicePanel
    controlBarRef.current = controlBar

    // 预加载示例角色、头像、背景纹理
    ;(async () => {
      try {
        const bgTex = await PIXI.Assets.load('/assets/template/private/background/example_background.png')
        const bgSprite = new PIXI.Sprite(bgTex)
        bgSprite.width = VIRTUAL_WIDTH
        bgSprite.height = VIRTUAL_HEIGHT
        bgSprite.visible = false
        app.stage.addChildAt(bgSprite, 0)
        bgSpriteRef.current = bgSprite
      } catch { /* 背景加载失败，忽略 */ }

      try {
        const charTex = await PIXI.Assets.load('/assets/template/private/character/example_character.png')
        const charSprite = new PIXI.Sprite(charTex)
        // 等比例缩放到合适高度（约 900px，留出对话框空间）
        const charScale = 900 / charTex.height
        charSprite.scale.set(charScale)
        charSprite.x = 200
        charSprite.y = VIRTUAL_HEIGHT - charSprite.height
        charSprite.visible = false
        app.stage.addChildAt(charSprite, bgSpriteRef.current ? 1 : 0)
        charSpriteRef.current = charSprite
      } catch { /* 角色加载失败，忽略 */ }

      try {
        const avatarTex = await PIXI.Assets.load('/assets/template/private/character/example_avator.png')
        avatarTextureRef.current = avatarTex
      } catch { /* 头像加载失败，忽略 */ }
    })()

    return () => {
      dialogBox.destroy()
      choicePanel.destroy()
      if (controlBarRef.current) { controlBarRef.current.destroy(); controlBarRef.current = null }
      // 清理精灵
      if (bgSpriteRef.current) { bgSpriteRef.current.removeFromParent(); bgSpriteRef.current = null }
      if (charSpriteRef.current) { charSpriteRef.current.removeFromParent(); charSpriteRef.current = null }
      avatarTextureRef.current = null
      app.destroy(true, { children: true, texture: true })
      pixiAppRef.current = null
      dialogBoxRef.current = null
      choicePanelRef.current = null
    }
  }, [isSchemeLoaded])

  // ---- 样式类型转换（StyleData → DialogStyle / ChoiceStyle） ----
  function toDialogStyle(data: StyleData): DialogStyle {
    const box = (data.box ?? {}) as Record<string, unknown>
    const nameBox = (data.nameBox ?? {}) as Record<string, unknown>
    const avatar = (data.avatar ?? {}) as Record<string, unknown>
    const dialogueText = (data.dialogueText ?? {}) as Record<string, unknown>
    const nameText = (data.nameText ?? {}) as Record<string, unknown>
    return {
      box: {
        height: (box.height as number) ?? 220,
        leftMargin: (box.leftMargin as number) ?? 80,
        rightMargin: (box.rightMargin as number) ?? 80,
        bottomMargin: (box.bottomMargin as number) ?? 30,
        topMargin: (box.topMargin as number) ?? undefined,
        backgroundColor: (box.backgroundColor as number) ?? 0x0f0f23,
        backgroundAlpha: (box.backgroundAlpha as number) ?? 0.85,
        borderColor: (box.borderColor as number) ?? 0x2d2d5a,
        borderAlpha: (box.borderAlpha as number) ?? 0.5,
        borderWidth: (box.borderWidth as number) ?? 1,
        borderRadius: (box.borderRadius as number) ?? 12,
        shadowBlur: (box.shadowBlur as number) ?? 20,
        shadowColor: (box.shadowColor as number) ?? 0,
        shadowAlpha: (box.shadowAlpha as number) ?? 0.35,
        shadowOffsetX: (box.shadowOffsetX as number) ?? 0,
        shadowOffsetY: (box.shadowOffsetY as number) ?? 6
      },
      nameBox: {
        width: (nameBox.width as number) ?? 160,
        height: (nameBox.height as number) ?? 40,
        leftMargin: (nameBox.leftMargin as number) ?? 24,
        rightMargin: (nameBox.rightMargin as number) ?? 24,
        bottomMargin: (nameBox.bottomMargin as number) ?? 8,
        backgroundColor: (nameBox.backgroundColor as number) ?? 0x1a1a3a,
        backgroundAlpha: (nameBox.backgroundAlpha as number) ?? 0.9,
        borderColor: (nameBox.borderColor as number) ?? 0x6363b3,
        borderAlpha: (nameBox.borderAlpha as number) ?? 0.4,
        borderWidth: (nameBox.borderWidth as number) ?? 1,
        borderRadius: (nameBox.borderRadius as number) ?? 6
      },
      avatar: {
        width: (avatar.width as number) ?? 130,
        height: (avatar.height as number) ?? 130,
        leftMargin: (avatar.leftMargin as number) ?? 16,
        rightMargin: (avatar.rightMargin as number) ?? 14,
        topMargin: (avatar.topMargin as number) ?? 0,
        bottomMargin: (avatar.bottomMargin as number) ?? 12,
        borderRadius: (avatar.borderRadius as number) ?? undefined,
        borderColor: (avatar.borderColor as number) ?? undefined,
        borderWidth: (avatar.borderWidth as number) ?? undefined,
        borderAlpha: (avatar.borderAlpha as number) ?? undefined
      },
      dialogueText: {
        fontFamily: (dialogueText.fontFamily as string) ?? 'Microsoft YaHei, SimHei, sans-serif',
        fontSize: (dialogueText.fontSize as number) ?? 26,
        color: (dialogueText.color as string) ?? '#e8e8f0',
        topMargin: (dialogueText.topMargin as number) ?? 8,
        leftMargin: (dialogueText.leftMargin as number) ?? 12,
        rightMargin: (dialogueText.rightMargin as number) ?? 12,
        bottomMargin: (dialogueText.bottomMargin as number) ?? 16,
        lineHeight: (dialogueText.lineHeight as number) ?? 40,
        letterSpacing: (dialogueText.letterSpacing as number) ?? 1,
        strokeColor: (dialogueText.strokeColor as string) ?? '#000000',
        strokeAlpha: (dialogueText.strokeAlpha as number) ?? 0,
        strokeWidth: (dialogueText.strokeWidth as number) ?? 0,
        textAlign: (dialogueText.textAlign as 'left' | 'center' | 'right') ?? undefined,
        fontWeight: (dialogueText.fontWeight as string) ?? undefined,
        fontStyle: (dialogueText.fontStyle as string) ?? undefined
      },
      nameText: {
        fontFamily: (nameText.fontFamily as string) ?? 'Microsoft YaHei, SimHei, sans-serif',
        fontSize: (nameText.fontSize as number) ?? 18,
        color: (nameText.color as string) ?? '#d4a843',
        letterSpacing: (nameText.letterSpacing as number) ?? 2,
        strokeColor: (nameText.strokeColor as string) ?? '#000000',
        strokeAlpha: (nameText.strokeAlpha as number) ?? 0,
        strokeWidth: (nameText.strokeWidth as number) ?? 0,
        topMargin: (nameText.topMargin as number) ?? undefined,
        leftMargin: (nameText.leftMargin as number) ?? undefined,
        bottomMargin: (nameText.bottomMargin as number) ?? undefined,
        fontWeight: (nameText.fontWeight as string) ?? undefined,
        fontStyle: (nameText.fontStyle as string) ?? undefined
      },
      autoProgress: (() => {
        const ap = (data.autoProgress ?? {}) as Record<string, unknown>
        return {
          size: (ap.size as number) ?? 36,
          color: (ap.color as number) ?? 0x7c6ff0,
          width: (ap.width as number) ?? 3,
          rightMargin: (ap.rightMargin as number) ?? 16,
        }
      })(),
    }
  }

  function toChoiceStyle(data: StyleData): ChoiceStyle {
    const panel = (data.panel ?? {}) as Record<string, unknown>
    const button = (data.button ?? {}) as Record<string, unknown>
    const buttonDisabled = (data.buttonDisabled ?? {}) as Record<string, unknown>
    const text = (data.text ?? {}) as Record<string, unknown>
    return {
      panel: {
        horizontalAlign: (panel.horizontalAlign as 'center' | 'left' | 'right') ?? 'center',
        verticalAlign: (panel.verticalAlign as 'center' | 'top' | 'bottom') ?? 'center',
        marginX: (panel.marginX as number) ?? 0,
        marginY: (panel.marginY as number) ?? 0
      },
      button: {
        width: (button.width as number) ?? 600,
        height: (button.height as number) ?? 64,
        gap: (button.buttonGap as number) ?? 14,
        borderRadius: (button.borderRadius as number) ?? 8,
        backgroundColor: (button.backgroundColor as number) ?? 0x0f0f23,
        backgroundAlpha: (button.backgroundAlpha as number) ?? 0.85,
        backgroundColorHover: (button.backgroundColorHover as number) ?? 0x1a1a3a,
        borderColor: (button.borderColor as number) ?? 0x3d3d6b,
        borderAlpha: (button.borderAlpha as number) ?? 0.4,
        borderWidth: (button.borderWidth as number) ?? 1,
        textColorHover: (button.textColorHover as string) ?? undefined
      },
      buttonDisabled: {
        backgroundColor: (buttonDisabled.backgroundColor as number) ?? 0x444444,
        backgroundAlpha: (buttonDisabled.backgroundAlpha as number) ?? 0.4,
        borderColor: (buttonDisabled.borderColor as number) ?? 0x555555,
        borderAlpha: (buttonDisabled.borderAlpha as number) ?? 0.3,
        borderWidth: (buttonDisabled.borderWidth as number) ?? 1,
        textColor: (buttonDisabled.textColor as string) ?? undefined
      },
      text: {
        fontFamily: (text.fontFamily as string) ?? 'Microsoft YaHei, SimHei, sans-serif',
        fontSize: (text.fontSize as number) ?? 26,
        color: (text.color as string) ?? '#e8e8f0',
        textAlign: (text.textAlign as 'center' | 'left' | 'right') ?? 'center',
        leftMargin: (text.leftMargin as number) ?? 16,
        rightMargin: (text.rightMargin as number) ?? 16,
        bottomMargin: (text.bottomMargin as number) ?? 0,
        fontWeight: (text.fontWeight as string) ?? undefined,
        fontStyle: (text.fontStyle as string) ?? undefined
      }
    }
  }

  function toControlBarStyle(data: StyleData): ControlBarStyle {
    const bar = (data.bar ?? {}) as Record<string, unknown>
    const button = (data.button ?? {}) as Record<string, unknown>
    return {
      bar: {
        height: (bar.height as number) ?? 52,
        backgroundColor: (bar.backgroundColor as number) ?? 0,
        backgroundAlpha: (bar.backgroundAlpha as number) ?? 0.4,
      },
      button: {
        normalWidth: 72,
        autoWidth: (button.autoWidth as number) ?? 84,
        height: (button.height as number) ?? 28,
        borderRadius: (button.borderRadius as number) ?? 4,
        gap: (button.gap as number) ?? 8,
        fontFamily: (button.fontFamily as string) ?? 'Microsoft YaHei, SimHei, sans-serif',
        fontSize: (button.fontSize as number) ?? 12,
        defaultColor: (button.defaultColor as string) ?? '#cccccc',
        defaultBackground: (button.defaultBackground as number) ?? 0,
        defaultBackgroundAlpha: (button.defaultBackgroundAlpha as number) ?? 0.5,
        defaultBorderColor: (button.defaultBorderColor as number) ?? 0xffffff,
        defaultBorderAlpha: (button.defaultBorderAlpha as number) ?? 0.2,
        defaultFontWeight: (button.defaultFontWeight as string) ?? 'normal',
        activeColor: (button.activeColor as string) ?? '#000000',
        activeBackground: (button.activeBackground as number) ?? 0xffcc00,
        activeBackgroundAlpha: (button.activeBackgroundAlpha as number) ?? 0.7,
        activeBorderColor: (button.activeBorderColor as number) ?? 0xe6b800,
        activeBorderAlpha: (button.activeBorderAlpha as number) ?? 0.3,
        activeFontWeight: (button.activeFontWeight as string) ?? 'bold',
      }
    }
  }

  /** 当前预览模式（必须最先声明，被 showAvatarPreview / showNameBox / showDialogueText 引用） */
  const previewMode: 'dialog' | 'choice' | 'controlbar' =
    ['choice-button', 'choice-button-disabled', 'choice-text-style', 'choice-panel'].includes(activeSection) ? 'choice' :
    ['controlbar-bar', 'controlbar-button'].includes(activeSection) ? 'controlbar' : 'dialog'

  /** 当前预览是否显示头像（仅由按钮开关控制，不随左侧导航变化） */
  const showAvatarPreview = showDialogBoxToggle && showAvatarToggle && previewMode === 'dialog'

  /** 当前预览是否显示姓名框（仅由按钮开关控制，不随左侧导航变化） */
  const showNameBox = showDialogBoxToggle && showNameBoxToggle && previewMode === 'dialog'

  /** 当前预览是否显示对话文本（受对话框总开关控制） */
  const showDialogueText = showDialogBoxToggle && previewMode === 'dialog'

  // ---- 样式变更时重绘 PixiJS 预览 ----
  useEffect(() => {
    if (!isSchemeLoaded) return
    const db = dialogBoxRef.current
    const cp = choicePanelRef.current
    const cb = controlBarRef.current
    if (!db || !cp) return

    // 控制背景精灵
    if (bgSpriteRef.current) {
      bgSpriteRef.current.visible = showExampleBackground
    }
    // 控制角色精灵
    if (charSpriteRef.current) {
      charSpriteRef.current.visible = showExampleCharacter
    }

    if (previewMode === 'controlbar') {
      db.hide()
      cp.hide()
      if (cb) cb.preview(toControlBarStyle(controlbarStyle))
    } else if (previewMode === 'dialog') {
      cp.hide()
      if (cb) cb.hide()
      if (showDialogBoxToggle) {
        const ds = toDialogStyle(dialogStyle)
        db.preview(
          ds,
          showAvatarToggle,
          showNameBoxToggle ? '示例角色' : null,
          '你好，欢迎使用Udseen！'
        )
        // 将头像纹理传递给 DialogBox 的实际头像显示
        if (db.hasAvatar && avatarTextureRef.current) {
          // 替换占位图形为实际纹理
          db.avatarContainer.removeChildren()
          const avatarSprite = new PIXI.Sprite(avatarTextureRef.current)
          const frameW = ds.avatar.width
          const frameH = ds.avatar.height
          const scale = Math.min(frameW / avatarTextureRef.current.width, frameH / avatarTextureRef.current.height)
          avatarSprite.scale.set(scale)
          avatarSprite.anchor.set(0.5)
          avatarSprite.position.set(frameW / 2, frameH / 2)
          // 圆形遮罩
          const mask = new PIXI.Graphics()
          mask.beginFill(0xffffff)
          mask.drawRoundedRect(0, 0, frameW, frameH, Math.min(frameW, frameH) / 2)
          mask.endFill()
          db.avatarContainer.addChild(avatarSprite)
          db.avatarContainer.addChild(mask)
          avatarSprite.mask = mask
        }
      } else {
        db.hide()
      }
    } else {
      cp.preview(toChoiceStyle(choiceStyle))
      db.hide()
      if (cb) cb.hide()
    }
  }, [dialogStyle, choiceStyle, controlbarStyle, previewMode, showAvatarPreview, showDialogBoxToggle, showAvatarToggle, showNameBoxToggle, showExampleCharacter, showExampleBackground, isSchemeLoaded])

  const activeSectionDef = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]

  const currentStyle = activeSectionDef.category === 'dialog' ? dialogStyle : activeSectionDef.category === 'choice' ? choiceStyle : controlbarStyle
  const currentGroup = currentStyle[activeSectionDef.groupKey] as Record<string, unknown> | undefined ?? {}

  const updateProp = useCallback((groupKey: string, propKey: string, value: unknown) => {
    const updater = (prev: StyleData): StyleData => ({
      ...prev,
      [groupKey]: {
        ...(prev[groupKey] as Record<string, unknown> ?? {}),
        [propKey]: value
      }
    })
    if (activeSectionDef.category === 'dialog') {
      setDialogStyle(updater)
    } else if (activeSectionDef.category === 'choice') {
      setChoiceStyle(updater)
    } else {
      setControlbarStyle(updater)
    }
  }, [activeSectionDef.category])

  /** 切换到指定方案 */
  const handleSwitchScheme = useCallback(async (schemeId: string) => {
    if (!window.electronAPI || !schemesDir) return
    if (schemeId === activeSchemeId) return
    try {
      const appPath = await window.electronAPI.getAppPath()
      const styles = await loadSchemeStyles(appPath, schemeId)
      setDialogStyle(styles.dialog)
      setChoiceStyle(styles.choice)
      setControlbarStyle(styles.controlbar)
      setActiveSchemeId(schemeId)
      await syncEngineFiles(appPath, styles.dialog, styles.choice, styles.controlbar)
      // 更新索引中的 activeScheme
      const raw = await window.electronAPI.readFile(`${schemesDir}/${SCHEMES_JSON}`)
      const idx = JSON.parse(raw) as SchemesIndex
      idx.activeScheme = schemeId
      await window.electronAPI.writeFile(`${schemesDir}/${SCHEMES_JSON}`, JSON.stringify(idx, null, 2))
      showToast(`已切换到「${schemes.find((s) => s.id === schemeId)?.name ?? schemeId}」`)
    } catch {
      showToast('切换方案失败')
    }
  }, [activeSchemeId, schemesDir, schemes, showToast])

  /** 重置当前方案为深色默认样式 */
  const handleReset = useCallback(async () => {
    if (!confirm('确定要将当前方案重置为默认样式吗？此操作不可撤销。')) return
    if (!window.electronAPI || !schemesDir) return
    try {
      const appPath = await window.electronAPI.getAppPath()
      setDialogStyle(DEFAULT_DIALOG as StyleData)
      setChoiceStyle(DEFAULT_CHOICE as StyleData)
      setControlbarStyle(DEFAULT_CONTROLBAR as StyleData)
      // 保存到当前方案
      await saveToScheme(appPath, activeSchemeId, DEFAULT_DIALOG as StyleData, DEFAULT_CHOICE as StyleData, DEFAULT_CONTROLBAR as StyleData)
      showToast('已重置为默认样式')
    } catch {
      showToast('重置失败')
    }
  }, [activeSchemeId, schemesDir, showToast])

  /** 保存当前方案 */
  const handleSave = useCallback(async () => {
    if (!window.electronAPI) return
    setSaving(true)
    try {
      const appPath = await window.electronAPI.getAppPath()
      await saveToScheme(appPath, activeSchemeId, dialogStyle, choiceStyle, controlbarStyle)
      showToast('保存成功')
    } catch {
      showToast('保存失败')
    }
    setSaving(false)
  }, [dialogStyle, choiceStyle, controlbarStyle, activeSchemeId, showToast])

  /** 另存为新方案 */
  const handleSaveAs = useCallback(async () => {
    if (!window.electronAPI || !schemesDir) return
    const name = prompt('请输入新方案名称：')
    if (!name || !name.trim()) return
    const id = 'custom-' + Date.now().toString(36)
    try {
      const appPath = await window.electronAPI.getAppPath()
      const sd = `${appPath}/assets/template/schemes`
      // 写入新方案文件
      const dir = `${sd}/${id}`
      await window.electronAPI.writeFile(`${dir}/dialog.json`, JSON.stringify(dialogStyle, null, 2))
      await window.electronAPI.writeFile(`${dir}/choice.json`, JSON.stringify(choiceStyle, null, 2))
      await window.electronAPI.writeFile(`${dir}/controlbar.json`, JSON.stringify(controlbarStyle, null, 2))
      // 更新索引
      const raw = await window.electronAPI.readFile(`${schemesDir}/${SCHEMES_JSON}`)
      const idx = JSON.parse(raw) as SchemesIndex
      const newScheme: SchemeInfo = { id, name: name.trim() }
      idx.schemes.push(newScheme)
      idx.activeScheme = id
      await window.electronAPI.writeFile(`${schemesDir}/${SCHEMES_JSON}`, JSON.stringify(idx, null, 2))
      setSchemes([...idx.schemes])
      setActiveSchemeId(id)
      await syncEngineFiles(appPath, dialogStyle, choiceStyle, controlbarStyle)
      showToast(`已创建新方案「${name.trim()}」`)
    } catch {
      showToast('另存失败')
    }
  }, [dialogStyle, choiceStyle, schemesDir, showToast])

  /** 删除自定义方案 */
  const handleDeleteScheme = useCallback(async (schemeId: string) => {
    if (schemeId === 'dark' || schemeId === 'light') {
      showToast('默认方案不可删除')
      return
    }
    const schemeName = schemes.find((s) => s.id === schemeId)?.name ?? schemeId
    if (!confirm(`确定要删除方案「${schemeName}」吗？此操作不可撤销。`)) return
    if (!window.electronAPI || !schemesDir) return
    try {
      const appPath = await window.electronAPI.getAppPath()
      const sd = `${appPath}/assets/template/schemes`
      // 从索引中移除
      const raw = await window.electronAPI.readFile(`${schemesDir}/${SCHEMES_JSON}`)
      const idx = JSON.parse(raw) as SchemesIndex
      idx.schemes = idx.schemes.filter((s) => s.id !== schemeId)
      if (idx.activeScheme === schemeId) {
        idx.activeScheme = 'dark'
      }
      await window.electronAPI.writeFile(`${schemesDir}/${SCHEMES_JSON}`, JSON.stringify(idx, null, 2))
      setSchemes([...idx.schemes])
      // 如果删除的是当前方案，切换到 dark
      if (activeSchemeId === schemeId) {
        const styles = await loadSchemeStyles(appPath, 'dark')
        setDialogStyle(styles.dialog)
        setChoiceStyle(styles.choice)
        setControlbarStyle(styles.controlbar)
        setActiveSchemeId('dark')
        await syncEngineFiles(appPath, styles.dialog, styles.choice, styles.controlbar)
      }
      showToast(`已删除方案「${schemeName}」`)
    } catch {
      showToast('删除失败')
    }
  }, [schemes, activeSchemeId, schemesDir, showToast])

  /** 重命名方案 */
  const handleRename = useCallback(async (schemeId: string, newName: string) => {
    if (!newName.trim() || !window.electronAPI || !schemesDir) return
    try {
      const raw = await window.electronAPI.readFile(`${schemesDir}/${SCHEMES_JSON}`)
      const idx = JSON.parse(raw) as SchemesIndex
      const s = idx.schemes.find((x) => x.id === schemeId)
      if (s) s.name = newName.trim()
      await window.electronAPI.writeFile(`${schemesDir}/${SCHEMES_JSON}`, JSON.stringify(idx, null, 2))
      setSchemes([...idx.schemes])
      setRenamingSchemeId(null)
      showToast(`已重命名为「${newName.trim()}」`)
    } catch {
      showToast('重命名失败')
    }
  }, [schemesDir, showToast])

  // 从样式数据提取拖拽手柄定位所需的像素值
  const d = dialogStyle
  const box = (d.box ?? {}) as Record<string, unknown>
  const av = (d.avatar ?? {}) as Record<string, unknown>
  const dt = (d.dialogueText ?? {}) as Record<string, unknown>
  const nb = (d.nameBox ?? {}) as Record<string, unknown>

  // ---- 对话框大小（像素值计算） ----
  const boxH = (box.height as number) ?? 200
  const boxLM = (box.leftMargin as number) ?? 60
  const boxRM = (box.rightMargin as number) ?? 60
  const boxBM = (box.bottomMargin as number) ?? 10

  // ---- 姓名框 ----
  const nbW = (nb.width as number) ?? 120
  const nbH = (nb.height as number) ?? 36
  const nbLM = (nb.leftMargin as number) ?? 20

  // ---- 头像 ----
  const avW = (av.width as number) ?? 64
  const avH = (av.height as number) ?? 64
  const avLM = (av.leftMargin as number) ?? 12
  const avRM = (av.rightMargin as number) ?? 12
  const avBM = (av.bottomMargin as number) ?? 12

  /** 头像占据的水平总空间 = 头像宽度 + 左侧间距 + 右侧间距 */
  const avatarTotalWidth = avW + avLM + avRM

  /** 内容区域左侧额外偏移：带头像时由头像宽度决定，无头像时为零（与引擎 textLeftShift 逻辑一致） */
  const contentPaddingLeft = showAvatarPreview ? avatarTotalWidth : 0

  // 文本框位置（使用虚拟舞台坐标 1920×1080，与游戏引擎一致）
  const boxW = VIRTUAL_WIDTH - boxLM - boxRM
  const boxX = boxLM
  const boxY = VIRTUAL_HEIGHT - boxH - boxBM

  // 对话文本在对话框内的垂直偏移（与 DialogBox.ts 一致）
  const nameBoxBottom = 6 + (nb.height as number ?? 36)
  const textAreaTopOffset = showNameBox ? nameBoxBottom + 0 : 8
  const textAvailableHeight = boxH - textAreaTopOffset - (dt.bottomMargin as number ?? 8)

  const dtLM = (dt.leftMargin as number) ?? 0
  const dtRM = (dt.rightMargin as number) ?? 0
  const dtBM = (dt.bottomMargin as number) ?? 8
  const textX = boxX + contentPaddingLeft + dtLM
  const textY = boxY + textAreaTopOffset
  const textW = boxW - contentPaddingLeft - dtLM - dtRM
  const textMaxH = Math.max(4, textAvailableHeight)

  // ---------- render property controls ----------

  function renderPropControl(def: PropDef, groupKey: string): JSX.Element {
    const key = def.key
    const value = currentGroup[key]

    const onChange = (newVal: unknown) => updateProp(groupKey, key, newVal)

    const labelStyle: React.CSSProperties = {
      fontSize: 13,
      color: '#a0a0c0',
      marginBottom: 4,
      minWidth: 100
    }
    const rowStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8
    }

    switch (def.type) {
      case 'number': {
        const numVal = typeof value === 'number' ? value : (def.min ?? 0)
        return (
          <div key={key} style={rowStyle}>
            <span style={labelStyle}>{def.label}</span>
            <input
              type="range"
              min={def.min ?? 0}
              max={def.max ?? 100}
              step={def.step ?? 1}
              value={numVal}
              onChange={(e) => onChange(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#7c6ff0' }}
            />
            <input
              type="number"
              min={def.min ?? 0}
              max={def.max ?? 100}
              step={def.step ?? 1}
              value={numVal}
              onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0, def.min ?? 0, def.max ?? 100))}
              style={{
                width: 64,
                padding: '2px 4px',
                background: '#2a2a3e',
                border: '1px solid #444',
                color: '#cdd6f4',
                borderRadius: 4,
                fontSize: 13,
                textAlign: 'center'
              }}
            />
          </div>
        )
      }
      case 'color-int': {
        const hex = typeof value === 'number' ? intToHex(value) : '#000000'
        return (
          <div key={key} style={rowStyle}>
            <span style={labelStyle}>{def.label}</span>
            <input
              type="color"
              value={hex}
              onChange={(e) => onChange(hexToInt(e.target.value))}
              style={{ width: 36, height: 28, padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
            />
            <span style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>{hex}</span>
          </div>
        )
      }
      case 'color-hex': {
        const h = typeof value === 'string' ? value : '#ffffff'
        return (
          <div key={key} style={rowStyle}>
            <span style={labelStyle}>{def.label}</span>
            <input
              type="color"
              value={h}
              onChange={(e) => onChange(e.target.value)}
              style={{ width: 36, height: 28, padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
            />
            <input
              type="text"
              value={h}
              onChange={(e) => {
                const v = e.target.value
                if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
              }}
              style={{
                width: 80,
                padding: '2px 4px',
                background: '#2a2a3e',
                border: '1px solid #444',
                color: '#cdd6f4',
                borderRadius: 4,
                fontSize: 13,
                fontFamily: 'monospace'
              }}
            />
          </div>
        )
      }
      case 'string': {
        const s = typeof value === 'string' ? value : ''
        return (
          <div key={key} style={rowStyle}>
            <span style={labelStyle}>{def.label}</span>
            <input
              type="text"
              value={s}
              onChange={(e) => onChange(e.target.value)}
              style={{
                flex: 1,
                padding: '3px 6px',
                background: '#2a2a3e',
                border: '1px solid #444',
                color: '#cdd6f4',
                borderRadius: 4,
                fontSize: 13
              }}
            />
          </div>
        )
      }
      case 'select': {
        const toOpt = (o: string | { label: string; value: string }): { label: string; value: string } =>
          typeof o === 'string' ? { label: o, value: o } : o
        const opts = (def.options ?? []).map(toOpt)
        const cur = typeof value === 'string' ? value : (opts[0]?.value ?? '')
        return (
          <div key={key} style={rowStyle}>
            <span style={labelStyle}>{def.label}</span>
            <select
              value={cur}
              onChange={(e) => onChange(e.target.value)}
              style={{
                flex: 1,
                padding: '3px 6px',
                background: '#2a2a3e',
                border: '1px solid #444',
                color: '#cdd6f4',
                borderRadius: 4,
                fontSize: 13
              }}
            >
              {opts.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )
      }
    }
  }

  // ---------- styles ----------

  const sidebarItem = (id: string, label: string, _category: TemplateCategory): JSX.Element => {
    const isActive = activeSection === id
    return (
      <div
        key={id}
        onClick={() => setActiveSection(id)}
        style={{
          padding: '6px 12px 6px 28px',
          cursor: 'pointer',
          fontSize: 13,
          color: isActive ? '#fff' : '#888',
          background: isActive ? 'rgba(124,111,240,0.2)' : 'transparent',
          borderLeft: isActive ? '3px solid #7c6ff0' : '3px solid transparent',
          transition: 'all 0.15s',
          borderRadius: '0 4px 4px 0',
          userSelect: 'none'
        }}
        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
        onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        {label}
      </div>
    )
  }

  /** 渲染预览开关切换按钮 */
  const renderToggle = (
    label: string,
    value: boolean,
    onChange: (v: boolean) => void,
    enabled: boolean
  ): JSX.Element => (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: 4, cursor: enabled ? 'pointer' : 'not-allowed',
        color: value ? '#cdd6f4' : '#555', opacity: enabled ? 1 : 0.4, userSelect: 'none'
      }}
      onClick={enabled ? () => onChange(!value) : undefined}
    >
      <div style={{
        width: 32, height: 16, borderRadius: 8, position: 'relative',
        background: value ? '#7c6ff0' : '#3a3a5a', transition: 'background 0.2s'
      }}>
        <div style={{
          position: 'absolute', top: 2, left: value ? 18 : 2,
          width: 12, height: 12, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s'
        }} />
      </div>
      <span>{label}</span>
    </label>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e2e' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: '#252540',
          borderBottom: '1px solid #333',
          flexShrink: 0
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: '#cdd6f4' }}>模板设置</div>
        {/* 方案选择器 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            value={activeSchemeId}
            onChange={(e) => handleSwitchScheme(e.target.value)}
            style={{
              padding: '5px 8px',
              background: '#2a2a42',
              border: '1px solid #444',
              color: '#cdd6f4',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {/* 重命名 */}
          {renamingSchemeId === activeSchemeId ? (
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onBlur={() => handleRename(activeSchemeId, renameInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(activeSchemeId, renameInput)
                if (e.key === 'Escape') setRenamingSchemeId(null)
              }}
              style={{
                width: 90,
                padding: '4px 6px',
                background: '#2a2a3e',
                border: '1px solid #7c6ff0',
                color: '#cdd6f4',
                borderRadius: 4,
                fontSize: 13,
                outline: 'none'
              }}
              autoFocus
            />
          ) : (
            <button
              onClick={() => {
                const cur = schemes.find((s) => s.id === activeSchemeId)
                setRenameInput(cur?.name ?? '')
                setRenamingSchemeId(activeSchemeId)
              }}
              title="重命名方案"
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: '1px solid #444',
                color: '#888',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12
              }}
            >✏</button>
          )}
          {/* 删除方案（仅自定义方案） */}
          {activeSchemeId !== 'dark' && activeSchemeId !== 'light' && (
            <button
              onClick={() => handleDeleteScheme(activeSchemeId)}
              title="删除方案"
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: '1px solid #844',
                color: '#c66',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12
              }}
            >🗑</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSaveAs}
            style={{
              padding: '6px 12px',
              background: '#2a3a4a',
              border: '1px solid #457',
              color: '#8cf',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            另存为
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: '6px 12px',
              background: '#5a3a3a',
              border: '1px solid #855',
              color: '#f4cdcd',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            重置
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '6px 16px',
              background: saving ? '#555' : '#7c6ff0',
              border: 'none',
              color: '#fff',
              borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={onBack}
            style={{
              padding: '6px 16px',
              background: '#3a3a5a',
              border: '1px solid #555',
              color: '#cdd6f4',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13
            }}
          >
            返回
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            background: '#1a1a30',
            borderRight: '1px solid #333',
            overflowY: 'auto',
            padding: '8px 0'
          }}
        >
          <div style={{ padding: '8px 12px', fontSize: 12, color: '#667', fontWeight: 600, letterSpacing: 1 }}>文本框</div>
          {SECTIONS.filter((s) => s.category === 'dialog').map((s) => sidebarItem(s.id, s.label, s.category))}
          <div style={{ padding: '12px 12px 8px', fontSize: 12, color: '#667', fontWeight: 600, letterSpacing: 1 }}>分支选项</div>
          {SECTIONS.filter((s) => s.category === 'choice').map((s) => sidebarItem(s.id, s.label, s.category))}
          <div style={{ padding: '12px 12px 8px', fontSize: 12, color: '#667', fontWeight: 600, letterSpacing: 1 }}>菜单内按钮</div>
          {SECTIONS.filter((s) => s.category === 'controlbar').map((s) => sidebarItem(s.id, s.label, s.category))}
        </div>

        {/* Properties Panel */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            background: '#22223a',
            borderRight: '1px solid #333',
            overflowY: 'auto',
            padding: 16
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 16 }}>
            {activeSectionDef.label}
          </div>
          {activeSectionDef.properties.map((p) =>
            renderPropControl(p, activeSectionDef.groupKey)
          )}
        </div>

        {/* Live Preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1a1a2e', overflow: 'hidden' }}>
          <div style={{ padding: '8px 16px', fontSize: 12, color: '#667', borderBottom: '1px solid #333' }}>
            实时预览
          </div>
          <div
            ref={previewContainerRef}
            style={{
              flex: 1,
              position: 'relative',
              margin: 24,
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid #333'
            }}
          >
            {/* 等比例缩放的虚拟舞台区域（1920×1080，与 PreviewCanvas 的 contain 缩放一致） */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: VIRTUAL_WIDTH,
                height: VIRTUAL_HEIGHT,
                transform: `translate(-50%, -50%) scale(${previewScale})`,
                transformOrigin: 'center',
                background: 'linear-gradient(135deg, #2a1a3a 0%, #1a2a3a 100%)'
              }}
            >
            {/* 方案加载中提示 */}
            {!isSchemeLoaded && (
              <div style={{
                position: 'absolute', left: 0, top: 0, width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#667', fontSize: 16, fontFamily: 'sans-serif',
                background: 'linear-gradient(135deg, #2a1a3a 0%, #1a2a3a 100%)',
                zIndex: 100,
              }}>
                正在加载方案&#8230;
              </div>
            )}
            {/* PixiJS 实时预览 - 使用 DialogBox / ChoicePanel 引擎组件渲染，与演出区域完全一致 */}
            <div ref={pixiCanvasMountRef} style={{ position: 'absolute', left: 0, top: 0, width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT, pointerEvents: 'none' }} />

                {/* ---- 拖拽调整手柄 ---- */}
                {/* 对话框左边缘：调整左侧边距 */}
                <div
                  style={{
                    position: 'absolute',
                    left: boxX - 5,
                    top: boxY,
                    width: 10,
                    height: boxH,
                    cursor: 'ew-resize',
                    zIndex: 10,
                    background: 'rgba(124,111,240,0.3)',
                    borderRadius: 2,
                    transition: 'background 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8,
                    color: 'rgba(124,111,240,0.6)'
                  }}				  
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,111,240,0.7)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,111,240,0.3)' }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    document.body.style.cursor = 'ew-resize'
                    dragRef.current = {
                      active: true, type: 'left-edge',
                      startX: e.clientX, startY: e.clientY,
                      startVal1: boxLM, startVal2: 0,
                      groupKey: 'box'
                    }
                  }}
                />
                {/* 对话框右边缘：调整右侧边距 */}
                <div
                  style={{
                    position: 'absolute',
                    left: boxX + boxW - 4,
                    top: boxY,
                    width: 8,
                    height: boxH,
                    cursor: 'ew-resize',
                    zIndex: 10,
                    background: 'rgba(124,111,240,0.3)',
                    borderRadius: 2,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,111,240,0.7)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,111,240,0.3)' }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    document.body.style.cursor = 'ew-resize'
                    dragRef.current = {
                      active: true, type: 'right-edge',
                      startX: e.clientX, startY: e.clientY,
                      startVal1: boxRM, startVal2: 0,
                      groupKey: 'box'
                    }
                  }}
                />
                {/* 对话框上边缘：调整高度 */}
                <div
                  style={{
                    position: 'absolute',
                    left: boxX,
                    top: boxY - 4,
                    width: boxW,
                    height: 8,
                    cursor: 'ns-resize',
                    zIndex: 10,
                    background: 'rgba(124,111,240,0.3)',
                    borderRadius: 2,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,111,240,0.7)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,111,240,0.3)' }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    document.body.style.cursor = 'ns-resize'
                    dragRef.current = {
                      active: true, type: 'top-edge',
                      startX: e.clientX, startY: e.clientY,
                      startVal1: boxH, startVal2: 0,
                      groupKey: 'box'
                    }
                  }}
                />

                {/* ---- 新增拖拽手柄 ---- */}

                {/* 对话框底部边缘：调整底部边距 */}
                <div
                  style={{
                    position: 'absolute',
                    left: boxX,
                    top: boxY + boxH - 4,
                    width: boxW,
                    height: 8,
                    cursor: 'ns-resize',
                    zIndex: 10,
                    background: 'rgba(124,111,240,0.3)',
                    borderRadius: 2,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,111,240,0.7)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,111,240,0.3)' }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    document.body.style.cursor = 'ns-resize'
                    dragRef.current = {
                      active: true, type: 'box-bottom-edge',
                      startX: e.clientX, startY: e.clientY,
                      startVal1: boxBM, startVal2: 0,
                      groupKey: 'box'
                    }
                  }}
                />

                {/* 头像右边缘：调整宽度 */}
                {showAvatarPreview && (
                  <div
                    style={{
                      position: 'absolute',
                      left: boxX + avLM + avW - 4,
                      top: boxY,
                      width: 8,
                      height: avH,
                      cursor: 'ew-resize',
                      zIndex: 10,
                      background: 'rgba(0,200,120,0.3)',
                      borderRadius: 2,
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,200,120,0.7)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,200,120,0.3)' }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      document.body.style.cursor = 'ew-resize'
                      dragRef.current = {
                        active: true, type: 'avatar-w',
                        startX: e.clientX, startY: e.clientY,
                        startVal1: avW, startVal2: 0,
                        groupKey: 'avatar'
                      }
                    }}
                  />
                )}
                {/* 头像底边缘：调整高度 */}
                {showAvatarPreview && (
                  <div
                    style={{
                      position: 'absolute',
                      left: boxX + avLM,
                      top: boxY + avH - 4,
                      width: avW,
                      height: 8,
                      cursor: 'ns-resize',
                      zIndex: 10,
                      background: 'rgba(0,200,120,0.3)',
                      borderRadius: 2,
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,200,120,0.7)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,200,120,0.3)' }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      document.body.style.cursor = 'ns-resize'
                      dragRef.current = {
                        active: true, type: 'avatar-h',
                        startX: e.clientX, startY: e.clientY,
                        startVal1: avH, startVal2: 0,
                        groupKey: 'avatar'
                      }
                    }}
                  />
                )}
                {/* 头像右侧间距：调整 rightMargin */}
                {showAvatarPreview && (
                  <div
                    style={{
                      position: 'absolute',
                      left: boxX + avLM + avW,
                      top: boxY + avH / 2 - 12,
                      width: avRM > 0 ? avRM : 12,
                      height: 24,
                      cursor: 'ew-resize',
                      zIndex: 10,
                      background: 'rgba(0,200,120,0.15)',
                      borderRadius: 2,
                      transition: 'background 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      color: 'rgba(0,200,120,0.5)'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,200,120,0.5)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,200,120,0.15)' }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      document.body.style.cursor = 'ew-resize'
                      dragRef.current = {
                        active: true, type: 'avatar-right', startX: e.clientX, startY: e.clientY, startVal1: avRM, startVal2: 0, groupKey: 'avatar'
                      }
                    }}
                  >⇔</div>
                )}
                {/* 头像底部间距：调整 bottomMargin */}
                {showAvatarPreview && (
                  <div
                    style={{
                      position: 'absolute',
                      left: boxX + avLM,
                      top: boxY + avH,
                      width: avW,
                      height: avBM > 0 ? avBM : 12,
                      cursor: 'ns-resize',
                      zIndex: 10,
                      background: 'rgba(0,200,120,0.15)',
                      borderRadius: 2,
                      transition: 'background 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      color: 'rgba(0,200,120,0.5)'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,200,120,0.5)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,200,120,0.15)' }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      document.body.style.cursor = 'ns-resize'
                      dragRef.current = {
                        active: true, type: 'avatar-bottom', startX: e.clientX, startY: e.clientY, startVal1: avBM, startVal2: 0, groupKey: 'avatar'
                      }
                    }}
                  >⇕</div>
                )}

                {/* 姓名框右边缘：调整宽度 */}
                {showNameBox && (
                  <div
                    style={{
                      position: 'absolute',
                      left: boxX + contentPaddingLeft + nbLM + nbW - 4,
                      top: boxY + 6,
                      width: 8,
                      height: nbH,
                      cursor: 'ew-resize',
                      zIndex: 10,
                      background: 'rgba(255,180,40,0.3)',
                      borderRadius: 2,
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,180,40,0.7)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,180,40,0.3)' }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      document.body.style.cursor = 'ew-resize'
                      dragRef.current = {
                        active: true, type: 'name-w',
                        startX: e.clientX, startY: e.clientY,
                        startVal1: nbW, startVal2: 0,
                        groupKey: 'nameBox'
                      }
                    }}
                  />
                )}
                {/* 姓名框底边缘：调整高度 */}
                {showNameBox && (
                  <div
                    style={{
                      position: 'absolute',
                      left: boxX + contentPaddingLeft + nbLM,
                      top: boxY + 6 + nbH - 4,
                      width: nbW,
                      height: 8,
                      cursor: 'ns-resize',
                      zIndex: 10,
                      background: 'rgba(255,180,40,0.3)',
                      borderRadius: 2,
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,180,40,0.7)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,180,40,0.3)' }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      document.body.style.cursor = 'ns-resize'
                      dragRef.current = {
                        active: true, type: 'name-h',
                        startX: e.clientX, startY: e.clientY,
                        startVal1: nbH, startVal2: 0,
                        groupKey: 'nameBox'
                      }
                    }}
                  />
                )}

                {/* 对话文本左边缘：调整左侧边距 */}
                {showDialogueText && (
                  <div
                    style={{
                      position: 'absolute',
                      left: textX - 4,
                      top: textY,
                      width: 8,
                      height: textMaxH,
                      cursor: 'ew-resize',
                      zIndex: 10,
                      background: 'rgba(100,200,255,0.3)',
                      borderRadius: 2,
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(100,200,255,0.7)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(100,200,255,0.3)' }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      document.body.style.cursor = 'ew-resize'
                      dragRef.current = {
                        active: true, type: 'text-left-edge',
                        startX: e.clientX, startY: e.clientY,
                        startVal1: dtLM, startVal2: 0,
                        groupKey: 'dialogueText'
                      }
                    }}
                  />
                )}
                {/* 对话文本右边缘：调整右侧边距 */}
                {showDialogueText && (
                  <div
                    style={{
                      position: 'absolute',
                      left: textX + textW - 4,
                      top: textY,
                      width: 8,
                      height: textMaxH,
                      cursor: 'ew-resize',
                      zIndex: 10,
                      background: 'rgba(100,200,255,0.3)',
                      borderRadius: 2,
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(100,200,255,0.7)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(100,200,255,0.3)' }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      document.body.style.cursor = 'ew-resize'
                      dragRef.current = {
                        active: true, type: 'text-right-edge',
                        startX: e.clientX, startY: e.clientY,
                        startVal1: dtRM, startVal2: 0,
                        groupKey: 'dialogueText'
                      }
                    }}
                  />
                )}
                {/* 对话文本底边缘：调整底部边距 */}
                {showDialogueText && (
                  <div
                    style={{
                      position: 'absolute',
                      left: textX,
                      top: textY + textMaxH - 4,
                      width: textW,
                      height: 8,
                      cursor: 'ns-resize',
                      zIndex: 10,
                      background: 'rgba(100,200,255,0.3)',
                      borderRadius: 2,
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(100,200,255,0.7)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(100,200,255,0.3)' }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      document.body.style.cursor = 'ns-resize'
                      dragRef.current = {
                        active: true, type: 'text-bottom-edge',
                        startX: e.clientX, startY: e.clientY,
                        startVal1: dtBM, startVal2: 0,
                        groupKey: 'dialogueText'
                      }
                    }}
                  />
                )}

            {/* PixiJS 实时预览 - 由 ChoicePanel.preview() 绘制，与演出区域一致 */}
            {previewMode === 'choice' && null}
          </div>{/* end inner virtual stage div */}
          </div>{/* end preview ref container */}

          {/* ---- 预览开关工具栏 ---- */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
            padding: '6px 16px', background: '#1e1e32', borderTop: '1px solid #333',
            flexShrink: 0, fontSize: 12
          }}>
            {renderToggle('示例角色', showExampleCharacter, setShowExampleCharacter, true)}
            {renderToggle('示例背景', showExampleBackground, setShowExampleBackground, true)}
            {renderToggle('对话框', showDialogBoxToggle, setShowDialogBoxToggle, true)}
            {renderToggle('头像', showAvatarToggle, (v) => { if (showDialogBoxToggle) setShowAvatarToggle(v) }, showDialogBoxToggle)}
            {renderToggle('姓名框', showNameBoxToggle, (v) => { if (showDialogBoxToggle) setShowNameBoxToggle(v) }, showDialogBoxToggle)}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 40,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 24px',
            background: '#333',
            color: '#cdd6f4',
            borderRadius: 8,
            fontSize: 14,
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
