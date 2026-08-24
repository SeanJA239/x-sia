import { useRouter } from 'expo-router'

import { AdminShell } from '@/components/AdminShell'
import { EventForm } from '@/components/EventForm'
import { Surface } from '@/components/ui/Surface'
import { api } from '@/lib/api'
import type { EventInput } from '@/lib/types'

export default function NewEventScreen() {
  const router = useRouter()

  const onSubmit = async (input: EventInput) => {
    await api.admin.createEvent(input)
    router.replace('/activities')
  }

  return (
    <AdminShell title="创建活动" backHref="/activities">
      <Surface>
        <EventForm submitLabel="创建" onSubmit={onSubmit} />
      </Surface>
    </AdminShell>
  )
}
