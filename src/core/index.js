import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

// ! 初始化全局 API
initGlobalAPI(Vue)

// ! 新增属性 $isServer
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

// ! 新增属性 $ssrContext
Object.defineProperty(Vue.prototype, '$ssrContext', {
  get() {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// ! 新增属性 $FunctionalRenderContext
// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

Vue.version = '__VERSION__'

export default Vue
