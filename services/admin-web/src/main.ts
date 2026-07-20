import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { router, installRouterGuards } from './router'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
installRouterGuards(router, pinia)
app.use(router)
app.mount('#app')
