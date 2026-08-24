import { AppScreen } from '@/components/AppScreen'
import { EmptyState } from '@/components/ui/StateViews'
import { Surface } from '@/components/ui/Surface'

export default function ActivitiesScreen() {
  return (
    <AppScreen title="活动">
      <Surface>
        <EmptyState message="活动列表与轮转码签到将于近期上线，敬请期待。" />
      </Surface>
    </AppScreen>
  )
}
