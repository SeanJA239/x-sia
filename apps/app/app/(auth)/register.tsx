import { Link } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text } from 'react-native'

import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { colors, fontFamily } from '@/constants/theme'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export default function RegisterScreen() {
  const { register } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async () => {
    setError(null)
    if (!displayName.trim() || !email.trim() || !password) {
      setError('请填写姓名、校内邮箱与密码。')
      return
    }
    if (password.length < 8) {
      setError('密码至少需要 8 位。')
      return
    }
    setSubmitting(true)
    try {
      await register(email.trim(), password, displayName.trim())
      Alert.alert('注册成功', '完成现场核验后即可开通，请留意社团工作人员的核实通知。')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '注册失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="注册"
      subtitle="用校内邮箱注册账号，现场核验后即可正式成为社员。"
      footer={
        <Link href="/login" asChild>
          <Pressable>
            <Text style={styles.link}>已有账号？去登录</Text>
          </Pressable>
        </Link>
      }
    >
      <TextField
        label="姓名"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="张三"
      />
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
        autoComplete="new-password"
        placeholder="至少 8 位"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="注册" onPress={onSubmit} loading={submitting} />
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
