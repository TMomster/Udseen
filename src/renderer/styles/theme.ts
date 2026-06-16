/**
 * 设计令牌 - 基于 Monote 极简风格
 * 配色方案来自参考 UI：暗色主题为 #111115 基调，亮色主题为 #f8f6f0 基调
 */

export const theme = {
  // === 暗色主题 ===
  dark: {
    bg: '#111115',
    bgCard: '#1a1a1f',
    bgInput: '#222228',
    bgHover: '#2a2a30',
    text: '#e0e0e0',
    textSecondary: '#999',
    textMuted: '#666',
    border: '#333340',
    borderFocus: '#888',
    accent: '#c0c0c0',
    accentHover: '#aaa',
    error: '#e06060',
    errorBg: '#2a1515',
    success: '#60b060',
    shadow: 'rgba(0,0,0,0.2)',
    shadowHover: 'rgba(0,0,0,0.3)',
    headerBg: '#111115',
    // 视觉块颜色 (保持原色彩系统)
    blockColors: {
      character: '#e17055',
      background: '#00cec9',
      audio: '#00cec9',
      filter: '#2d3436',
      text: '#a29bfe',
      object: '#6c5ce7',
      system: '#4a9eff',
    },
  },

  // === 亮色主题 ===
  light: {
    bg: '#f8f6f0',
    bgCard: '#ffffff',
    bgInput: '#f3f1eb',
    bgHover: '#efede7',
    text: '#2c2c2c',
    textSecondary: '#6b6b6b',
    textMuted: '#999',
    border: '#d0cec6',
    borderFocus: '#2c2c2c',
    accent: '#2c2c2c',
    accentHover: '#555',
    error: '#b33a3a',
    errorBg: '#fdf0f0',
    success: '#3a7b3a',
    shadow: 'rgba(0,0,0,0.04)',
    shadowHover: 'rgba(0,0,0,0.07)',
    headerBg: '#f8f6f0',
    blockColors: {
      character: '#e17055',
      background: '#00cec9',
      audio: '#00cec9',
      filter: '#2d3436',
      text: '#a29bfe',
      object: '#6c5ce7',
      system: '#4a9eff',
    },
  },

  // === 通用字体 ===
  fontFamily: "'DengXian Light','DengXian','Microsoft YaHei Light','微软雅黑 Light','Noto Sans SC',sans-serif",
  fontMono: "'JetBrains Mono','Fira Code',monospace",

  // === 间距 ===
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },

  // === 圆角 ===
  radius: {
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
  },

  // === 过渡 ===
  transition: 'all 0.2s ease',
} as const

export type ThemeVariant = 'dark' | 'light'

/** 获取当前主题（基于 CSS data-theme 或默认暗色） */
export function getCurrentTheme(): ThemeVariant {
  if (typeof document !== 'undefined') {
    const theme = document.documentElement.getAttribute('data-theme')
    if (theme === 'light' || theme === 'dark') return theme
  }
  return 'dark'
}

/** 获取当前主题的全部 token */
export function useTheme(variant?: ThemeVariant) {
  const t = variant ?? getCurrentTheme()
  return theme[t]
}
