import { index, type RouteConfig, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('paths', 'routes/learning-paths.tsx'),
  route('learn/:volume', 'routes/curriculum-volume.tsx'),
  route('learn/:volume/print', 'routes/curriculum-print.tsx'),
  route('learn/:volume/:chapter', 'routes/curriculum-chapter.tsx'),
  route('p/:slug', 'routes/article.tsx'),
  route('login', 'routes/login.tsx'),
  route('manage', 'routes/manage.tsx'),
  route('new', 'routes/editor.tsx', { id: 'wiki-new' }),
  route('edit/:id', 'routes/editor.tsx', { id: 'wiki-edit' }),
] satisfies RouteConfig
