import { config } from '@vue/test-utils'
import ElementPlus from 'element-plus'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock

config.global.stubs = {
  transition: false,
  'transition-group': false,
}
config.global.plugins = [ElementPlus]
