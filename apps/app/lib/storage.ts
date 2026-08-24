import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const TOKEN_KEY = 'x-sia:token'

function webStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return webStorage()?.getItem(TOKEN_KEY) ?? null
  }
  return AsyncStorage.getItem(TOKEN_KEY)
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.setItem(TOKEN_KEY, token)
    return
  }
  await AsyncStorage.setItem(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.removeItem(TOKEN_KEY)
    return
  }
  await AsyncStorage.removeItem(TOKEN_KEY)
}
