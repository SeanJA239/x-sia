import { Platform } from 'react-native'

/**
 * X-SIA 视觉 token（docs/decisions.md「视觉基调」章节的执行版本）。
 * 全站禁止在组件里散落硬编码色值 —— 一律从这里取。
 */

export const colors = {
  paper: '#F5F5F6',
  surface: '#FFFFFF',
  border: '#E2E2E2',
  hairline: '#EFEFEF',
  text: '#161616',
  textSecondary: '#757575',
  textMuted: '#9C9C9C',
  buttonBg: '#171717',
  buttonText: '#FAFAFA',
  link: '#2F5EEA',
  success: '#009756',
  warning: '#A05C00',
  danger: '#B3261E',
  numberGold: '#8A6A1E',
  numberGoldBg: '#F3ECDA',
} as const

/** 深色仅用于全屏卡片路由（/card）。 */
export const darkColors = {
  paper: '#121212',
  surface: '#1C1C1C',
  border: '#2C2C2C',
  hairline: '#2C2C2C',
  text: '#FAFAFA',
  textSecondary: '#B5B5B5',
  textMuted: '#7A7A7A',
  buttonBg: '#FAFAFA',
  buttonText: '#171717',
} as const

/** 会员卡卡面配色，三载体（网页 / Wallet / 实体卡）统一。 */
export const cardColors = {
  navy: '#101B33',
  navyDeep: '#0B1426',
  gold: '#E7C877',
  goldDim: 'rgba(231, 200, 119, 0.55)',
} as const

export const fontFamily = {
  sans: Platform.select({
    web: 'Geist, "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    default: undefined,
  }),
  mono: Platform.select({
    web: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    ios: 'Menlo',
    android: 'monospace',
    default: undefined,
  }),
  brand: Platform.select({
    web: 'Archivo, -apple-system, BlinkMacSystemFont, sans-serif',
    default: undefined,
  }),
} as const

export const radius = {
  sm: 6,
  md: 8,
  lg: 16,
  pill: 999,
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

/** 桌面双栏布局的断点：宽度 ≥ 880px 时切换顶部导航 + 内容流/右侧栏。 */
export const DESKTOP_BREAKPOINT = 880

/** 会员卡比例（信用卡标准比例）。 */
export const CARD_ASPECT_RATIO = 1.586

export type Colors = typeof colors
