/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

// ! 基础默认配置
export const baseOptions: CompilerOptions = {
  expectHTML: true, // ! 布尔值 是否导出 HTML
  modules, // ! 对象组成的数组 模板相关的配置
  directives, // ! 函数组成的对象 指令相关的配置
  isPreTag, // ! 函数 是否是 pre 标签
  isUnaryTag, // ! 函数 是否是一元标签，如 br hr link meta 等标签 
  mustUseProp, // ! 函数 检测一个属性在标签中是否要使用 props 进行绑定
  canBeLeftOpenTag, // ! 函数 检测是否是可以自己补全并闭合的标签（不是一元标签），如 p li td 等非严格的双标签
  isReservedTag, // ! 函数 检测是否是 HTML 的保留标签
  getTagNamespace, // ! 获取标签的命名空间
  staticKeys: genStaticKeys(modules) // ! 字符串 根据 modules 生成一个静态键字符串
}
