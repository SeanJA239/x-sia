import * as DocumentPicker from 'expo-document-picker'
import type { ReactNode } from 'react'

export type PickedFile = { uri: string; name: string; mimeType?: string | null }

/** 原生端用 expo-document-picker。 */
export function FilePicker({
  onSelect,
  children,
}: {
  onSelect: (file: PickedFile) => void
  children: (open: () => void) => ReactNode
}) {
  const open = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
    })
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0]
      onSelect({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType })
    }
  }

  return <>{children(open)}</>
}
