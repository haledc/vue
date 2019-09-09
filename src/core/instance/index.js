// ! Vue 出生地文件 主要是设置 Vue 原型属性和方法(实例属性和方法)
import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue(options) {
  if (process.env.NODE_ENV !== 'production' && !(this instanceof Vue)) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options) // ! 实例时，执行初始化方法，初始化所有的设置
}

// ! 新增方法和属性到 Vue 的原型对象中 （即 Vue 实例中可以使用到的方法）
initMixin(Vue) // ! 混入初始化方法 _init
stateMixin(Vue) // ! 混入 $data 和 $props 属性，$del $delete $$watch 状态相关方法
eventsMixin(Vue) // ! 混入 $on $once $off $emit 事件相关的方法
lifecycleMixin(Vue) // ! 混入 _update $forceUpdate $destroy 生命周期相关的方法
renderMixin(Vue) // ! 混入大量渲染相关的方法 包括 $nextTick _render 等等

export default Vue
