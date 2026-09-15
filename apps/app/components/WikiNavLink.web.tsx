import { Feather } from '@expo/vector-icons'

import { colors, fontFamily } from '@/constants/theme'

/** Wiki 由独立 React Router 应用提供，必须整页导航，不能交给 Expo Router。 */
export function WikiNavLink({ variant }: { variant: 'top' | 'bottom' }) {
  const bottom = variant === 'bottom'
  return (
    <a
      href="/wiki/"
      aria-label="Wiki"
      style={{
        display: 'flex',
        flexDirection: bottom ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: bottom ? 2 : 6,
        flex: bottom ? 1 : undefined,
        padding: bottom ? 0 : '8px 0',
        fontFamily: fontFamily.sans,
        fontSize: bottom ? 11 : 14,
        fontWeight: '500',
        color: bottom ? colors.textMuted : colors.textSecondary,
        textDecoration: 'none',
      }}
    >
      <Feather
        name="book-open"
        size={bottom ? 20 : 15}
        color={bottom ? colors.textMuted : colors.textSecondary}
      />
      <span>Wiki</span>
    </a>
  )
}
