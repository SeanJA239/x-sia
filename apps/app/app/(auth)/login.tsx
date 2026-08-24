import { Link } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { colors, fontFamily } from '@/constants/theme'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export default function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async () => {
    setError(null)
    if (!email.trim() || !password) {
      setError('请填写校内邮箱与密码。')
      return
    }
    setSubmitting(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="登录"
      subtitle="使用校内邮箱登录 X-SIA 成员平台。"
      footer={
        <Link href="/register" asChild>
          <Pressable>
            <Text style={styles.link}>还没有账号？去注册</Text>
          </Pressable>
        </Link>
      }
    >
      <TextField
        label="校内邮箱"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@stu.xjtlu.edu.cn"
      />
      <TextField
        label="密码"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        placeholder="********"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="登录" onPress={onSubmit} loading={submitting} />
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  link: {
    color: colors.link,
    fontSize: 14,
    fontFamily: fontFamily.sans,
    fontWeight: '600',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontFamily: fontFamily.sans,
  },
})
