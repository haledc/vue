/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

// ! 初始化注册 新增方法 Vue.component Vue.directive
export function initAssetRegisters(Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   * ! 遍历类型
   */
  ASSET_TYPES.forEach(type => {
    Vue[type] = function(
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }

        // ! 注册组件
        if (type === 'component' && isPlainObject(definition)) {
          definition.name = definition.name || id
          definition = this.options._base.extend(definition) // ! 通过 extend 继承 Vue 的构造函数
        }

        // ! 注册指令
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        this.options[type + 's'][id] = definition // ! 挂载到全局
        return definition
      }
    }
  })
}
