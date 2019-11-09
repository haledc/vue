/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

// ! 初始化资源 -> 注册组件、指令、筛选器
export function initAssetRegisters(Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   * ! ASSET_TYPES = ['component', 'directive', 'filter']
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

        // ! 注册组件 -> 通过 .Vue 文件中的 export default 对象生成一个子类
        if (type === 'component' && isPlainObject(definition)) {
          definition.name = definition.name || id
          definition = this.options._base.extend(definition) // ! 通过 Vue.extend 生成子类
        }

        // ! 注册指令
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        this.options[type + 's'][id] = definition // ! 存储到 options 中
        return definition
      }
    }
  })
}
