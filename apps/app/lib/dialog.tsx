import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/ui/Button'
import { colors, fontFamily, radius, spacing } from '@/constants/theme'

/**
 * react-native-web 的 Alert.alert 是完全的空操作（源码里就是 `static alert() {}`），
 * 在 web 端调用了等于什么都没发生——包括「删除帖子」这种确认对话框，点了也不会真的删。
 * 这里自建一套跨平台的弹窗，三端行为一致，而不是退化到丑陋的浏览器原生 confirm/alert。
 */

type AlertOptions = { title: string; body?: string }
type ConfirmOptions = {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type DialogContextValue = {
  alert: (options: AlertOptions) => Promise<void>
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const DialogContext = createContext<DialogContextValue | null>(null)

type InternalState =
  | { type: 'none' }
  | { type: 'alert'; options: AlertOptions }
  | { type: 'confirm'; options: ConfirmOptions }

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InternalState>({ type: 'none' })
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const close = useCallback((result: boolean) => {
    setState({ type: 'none' })
    resolveRef.current?.(result)
    resolveRef.current = null
  }, [])

  const alert = useCallback(
    (options: AlertOptions) =>
      new Promise<void>((resolve) => {
        resolveRef.current = () => resolve()
        setState({ type: 'alert', options })
      }),
    [],
  )

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve
        setState({ type: 'confirm', options })
      }),
    [],
  )

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      <Modal
        visible={state.type !== 'none'}
        transparent
        animationType="fade"
        onRequestClose={() => close(false)}
      >
        {state.type !== 'none' ? (
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <Text style={styles.title}>{state.options.title}</Text>
              {state.options.body ? <Text style={styles.body}>{state.options.body}</Text> : null}
              <View style={styles.buttonRow}>
                {state.type === 'confirm' ? (
                  <Button
                    title={state.options.cancelLabel ?? '取消'}
                    variant="secondary"
                    onPress={() => close(false)}
                    style={styles.button}
                  />
                ) : null}
                <Button
                  title={state.type === 'confirm' ? (state.options.confirmLabel ?? '确定') : '好的'}
                  variant="primary"
                  onPress={() => close(true)}
                  style={styles.button}
                />
              </View>
            </View>
          </View>
        ) : null}
      </Modal>
    </DialogContext.Provider>
  )
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog 必须在 DialogProvider 内使用')
  return ctx
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.sans,
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: fontFamily.sans,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    minWidth: 88,
  },
})
