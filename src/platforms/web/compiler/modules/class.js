/* @flow */

import { parseText } from 'compiler/parser/text-parser'
import { getAndRemoveAttr, getBindingAttr, baseWarn } from 'compiler/helpers'

// ! 编译中置处理 -> 处理 class 属性
function transformNode(el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  const staticClass = getAndRemoveAttr(el, 'class') // ! 获取静态 class 属性的值
  if (process.env.NODE_ENV !== 'production' && staticClass) {
    const res = parseText(staticClass, options.delimiters) // ！解析静态 class
    // ！解析成功，说明在静态 class 中使用了字面量表达式，报错
    if (res) {
      warn(
        `class="${staticClass}": ` +
          'Interpolation inside attributes has been removed. ' +
          'Use v-bind or the colon shorthand instead. For example, ' +
          'instead of <div class="{{ val }}">, use <div :class="val">.',
        el.rawAttrsMap['class']
      )
    }
  }
  if (staticClass) {
    el.staticClass = JSON.stringify(staticClass) // ! 设置 staticClass 
  }
  const classBinding = getBindingAttr(el, 'class', false /* getStatic */) // ! 获取绑定 class 属性的值 -> :class = xxx
  if (classBinding) {
    el.classBinding = classBinding // ! 设置 classBinding 
  }
}

function genData(el: ASTElement): string {
  let data = ''
  if (el.staticClass) {
    data += `staticClass:${el.staticClass},`
  }
  if (el.classBinding) {
    data += `class:${el.classBinding},`
  }
  return data
}

export default {
  staticKeys: ['staticClass'],
  transformNode,
  genData
}
