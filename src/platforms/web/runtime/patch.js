/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules)

// ! 调用 core 中生成 patch 函数的方法，并传入 web 平台的选项配置和扩展模块
// ! 生成 web 平台的 patch 函数
export const patch: Function = createPatchFunction({ nodeOps, modules })
