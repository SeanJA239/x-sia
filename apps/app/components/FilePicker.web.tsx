import { createElement, type ReactNode, useRef } from 'react'

export type PickedFile = File

/** web 端用原生 `<input type="file">`，通过 ref 触发点击。 */
export function FilePicker({
  onSelect,
  children,
}: {
  onSelect: (file: PickedFile) => void
  children: (open: () => void) => ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      {children(() => inputRef.current?.click())}
      {createElement('input', {
        ref: inputRef,
        type: 'file',
        style: { display: 'none' },
        onChange: (e: { target: { files: FileList | null } }) => {
          const file = e.target.files?.[0]
          if (file) onSelect(file)
        },
      })}
    </>
  )
}
