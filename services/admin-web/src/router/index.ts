import type { Pinia } from 'pinia'
import { createRouter, createWebHistory, type Router } from 'vue-router'

import { useSessionStore } from '@/stores/session'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
        {
          path: 'administrators',
          name: 'administrators',
          component: () => import('@/views/AdminUsersView.vue'),
          meta: { superadmin: true },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export function installRouterGuards(target: Router, pinia: Pinia) {
  target.beforeEach(async (to) => {
    const session = useSessionStore(pinia)
    await session.restore()
    if (to.meta.public) return session.isAuthenticated && to.name === 'login' ? { name: 'dashboard' } : true
    if (!session.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
    if (to.meta.superadmin && !session.isSuperAdmin) return { name: 'dashboard' }
    return true
  })
}
