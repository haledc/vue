/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize, hyphenate } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex
} from '../helpers'

export const onRE = /^@|^v-on:/ // ！匹配监听事件
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\.|^#/
  : /^v-|^@|^:|^#/ // ！匹配指令
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/ // ! 匹配 v-for 类型  -> xxx in|of yyy
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/ // ! 匹配 v-for 的子项 xxx -> (val, key, index)
const stripParensRE = /^\(|\)$/g // ! 匹配小括号 ()
const dynamicArgRE = /^\[.*\]$/ // ! 匹配中括号 [] -> 获取动态插槽名

const argRE = /:(.*)$/ // ! 匹配冒号后面的参数 -> e.g. v-on:click.stop="xxx"
export const bindRE = /^:|^\.|^v-bind:/ // ! 匹配绑定符 : or v-bind:
const propBindRE = /^\./ // ! 匹配点符 .
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g // ! 匹配修饰符

const slotRE = /^v-slot(:|$)|^#/ // ! 匹配 v-slot

const lineBreakRE = /[\r\n]/ // ! 匹配返回符
const whitespaceRE = /\s+/g // ! 匹配空白

const invalidAttributeRE = /[\s"'<>\/=]/ // ! 匹配无用的属性

const decodeHTMLCached = cached(he.decode) // ! HTML 实体解码函数

export const emptySlotScopeToken = `_empty_`

// configurable state
// ! 平台配置
export let warn: any
let delimiters
let transforms // ! 中置处理的函数集合
let preTransforms // ! 前置处理的函数集合
let postTransforms // ! 置处理的函数集合
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace
let maybeComponent

// ! 创建 AST 元素的方法 -> 更好的生成一个 AST 对象
export function createASTElement(
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1, // ! 类型，1 是标签元素
    tag, // ! 标签名
    attrsList: attrs, // ! 属性列表 -> 用于解析，另一个 attrs 用于生成代码
    attrsMap: makeAttrsMap(attrs), // ! 属性映射表
    rawAttrsMap: {},
    parent, // ! 父级的 AST 元素
    children: [] // ! 子级 AST 元素集合
  }
}

/**
 * Convert HTML string to AST.
 * ! 模板字符串解析函数，模板字符串 -> 生成最终的 AST 对象
 */
export function parse(
  template: string,
  options: CompilerOptions
): ASTElement | void {
  // ! 从平台传入的 options 中初始化下面属性和方法
  warn = options.warn || baseWarn

  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no
  const isReservedTag = options.isReservedTag || no
  maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)

  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters

  const stack = [] // ! 临时存储 currentParent
  const preserveWhitespace = options.preserveWhitespace !== false // ! 保留空格
  const whitespaceOption = options.whitespace
  let root // ! 返回值 ->  最终 AST 对象
  let currentParent // ! 当前的父级 -> 为了和子级建立父子关系
  let inVPre = false // ! 解析的标签是否在含有 v-pre 的标签内
  let inPre = false // ! 解析的标签是否在 pre 标签之内
  let warned = false // ! 警告开关

  // ! 只提醒一次函数
  function warnOnce(msg, range) {
    if (!warned) {
      warned = true
      warn(msg, range)
    }
  }

  // ! 关闭元素的方法
  function closeElement(element) {
    trimEndingWhitespace(element) // ! 去除当前元素最后一个空白子节点
    if (!inVPre && !element.processed) {
      element = processElement(element, options) // ! 处理元素
    }
    // tree management
    // ! stack 为空且元素不是 root 时 -> 有多个根元素
    if (!stack.length && element !== root) {
      // allow root elements with v-if, v-else-if and v-else
      if (root.if && (element.elseif || element.else)) {
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(element)
        }
        // ! 元素和表达式添加到 ifConditions 属性中 -> 而不是添加到 children 中
        addIfCondition(root, {
          exp: element.elseif,
          block: element
        })
      } else if (process.env.NODE_ENV !== 'production') {
        warnOnce(
          `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`,
          { start: element.start }
        )
      }
    }
    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        processIfConditions(element, currentParent)
      } else {
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[
            name
          ] = element // 元素添加到 scopedSlots 属性中 -> 而不是添加到 children 中
        }
        currentParent.children.push(element) // ! 元素添加到 children 中，建立父子关系
        element.parent = currentParent // ! 存储父级
      }
    }

    // final children cleanup
    // filter out scoped slots
    element.children = element.children.filter(c => !(c: any).slotScope)
    // remove trailing whitespace node again
    trimEndingWhitespace(element)

    // check pre state
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    // ! 后置处理
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }

  // ! 去除元素的最后一个空白子节点
  function trimEndingWhitespace(el) {
    // remove trailing whitespace node
    if (!inPre) {
      let lastNode
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === ' '
      ) {
        el.children.pop()
      }
    }
  }

  // ! 检查 AST 树的约束 -> 有且仅有一个根元素 -> 使用 warnOnce 只报一次编译错误
  function checkRootConstraints(el) {
    // ! 根元素不能是 slot 和 template 标签，因为它们可能渲染多个元素
    if (el.tag === 'slot' || el.tag === 'template') {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
          'contain multiple nodes.',
        { start: el.start }
      )
    }
    // ! 根元素上不能使用 v-for 因为 v-for 会渲染多个元素
    if (el.attrsMap.hasOwnProperty('v-for')) {
      warnOnce(
        'Cannot use v-for on stateful component root element because ' +
          'it renders multiple elements.',
        el.rawAttrsMap['v-for']
      )
    }
  }

  // ! 解析 HTML 模板 -> 词法分析
  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,
    // ! 处理开始标签的方法
    start(tag, attrs, unary, start, end) {
      // check namespace.
      // inherit parent ns if there is one
      // ! 获取命名空间
      const ns =
        (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

      // ! ① 创建 AST 元素
      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      if (ns) {
        element.ns = ns
      }

      if (process.env.NODE_ENV !== 'production') {
        if (options.outputSourceRange) {
          element.start = start
          element.end = end
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr
            return cumulated
          }, {})
        }
        attrs.forEach(attr => {
          if (invalidAttributeRE.test(attr.name)) {
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
                `spaces, quotes, <, >, / or =.`,
              {
                start: attr.start + attr.name.indexOf(`[`),
                end: attr.start + attr.name.length
              }
            )
          }
        })
      }

      // ! ② 处理 AST 元素
      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true
        process.env.NODE_ENV !== 'production' &&
          warn(
            'Templates should only be responsible for mapping the state to the ' +
              'UI. Avoid placing tags with side-effects in your templates, such as ' +
              `<${tag}>` +
              ', as they will not be parsed.',
            { start: element.start }
          )
      }

      // apply pre-transforms
      // ! 前置处理
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element // ! preTransforms
      }

      if (!inVPre) {
        processPre(element) // 处理 v-pre
        if (element.pre) {
          inVPre = true
        }
      }
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }

      // ！元素在 pre 标签里时
      if (inVPre) {
        processRawAttrs(element)
      } else if (!element.processed) {
        // structural directives
        // ! 处理指令集 v-for v-if v-once
        processFor(element)
        processIf(element)
        processOnce(element)
      }

      // ! ③ AST 树管理
      if (!root) {
        root = element
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(root)
        }
      }

      if (!unary) {
        currentParent = element // ! 设置非一元标签为下一个元素的 currentParent
        stack.push(element) // ! 压入栈
      } else {
        closeElement(element) // ! 闭合元素
      }
    },
    // ! 处理闭合标签的方法
    end(tag, start, end) {
      const element = stack[stack.length - 1] // ! 先缓存当前元素
      // pop stack
      stack.length -= 1 // ! 解析完闭合标签后，把当前的元素在 stack 中剔除掉
      currentParent = stack[stack.length - 1] // ! currentParent 的值会回退到上一个值
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        element.end = end
      }
      closeElement(element) // ! 关闭元素
    },

    // ! 处理文本节点的方法
    chars(text: string, start: number, end: number) {
      // ! 没有父级元素 -> 直接在 template 下写文本或者文本内容在根节点之外
      if (!currentParent) {
        if (process.env.NODE_ENV !== 'production') {
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start }
            )
          } else if ((text = text.trim())) {
            warnOnce(`text "${text}" outside root element will be ignored.`, {
              start
            })
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      // ! IE bug -> textarea 标签的 placeholder 属性有值时不处理
      if (
        isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      const children = currentParent.children
      // ! 在 pre 或 v-pre 标签里或者非空白文本时
      if (inPre || text.trim()) {
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text) // ! 不是文本标签时需要解码
      } else if (!children.length) {
        // remove the whitespace-only node right after an opening tag
        // ! 无子元素为空字符串
        text = ''
      } else if (whitespaceOption) {
        // ! 设置 condense 时去除换行符并合并空白部分
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? '' : ' '
        } else {
          text = ' '
        }
      } else {
        // ！ 设置 preserveWhitespace 后合并空白文本
        text = preserveWhitespace ? ' ' : ''
      }
      if (text) {
        // ! 不在 pre 或 v-pre 标签里且 condense 时合并空白部分
        if (!inPre && whitespaceOption === 'condense') {
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE, ' ')
        }
        let res
        let child: ?ASTNode // ! 提前定义子元素 child
        // ! 不在 pre 或 v-pre 标签里且非空白文本且能解析文本
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          child = {
            type: 2, // ! 含字面量表达式的文本节点
            expression: res.expression,
            tokens: res.tokens,
            text
          }
          // ! 非空白文本 或者 没有子元素 或者 最后一个子元素为非空白文本
        } else if (
          text !== ' ' ||
          !children.length ||
          children[children.length - 1].text !== ' '
        ) {
          child = {
            type: 3, // ! 纯文本节点
            text
          }
        }
        if (child) {
          if (
            process.env.NODE_ENV !== 'production' &&
            options.outputSourceRange
          ) {
            child.start = start
            child.end = end
          }
          children.push(child) // ！把子元素放入 children 属性中
        }
      }
    },
    // ! 处理注释节点的方法
    comment(text: string, start, end) {
      // adding anything as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      if (currentParent) {
        const child: ASTText = {
          type: 3, // 纯文本节点或者注释节点
          text,
          isComment: true // ! 注释节点标识
        }
        if (
          process.env.NODE_ENV !== 'production' &&
          options.outputSourceRange
        ) {
          child.start = start
          child.end = end
        }
        currentParent.children.push(child) // ! 添加到父级元素的 children 中
      }
    }
  })
  return root
}

// ! 处理 v-pre -> 设置 pre 属性
function processPre(el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

// ! 处理原生属性
function processRawAttrs(el) {
  const list = el.attrsList
  const len = list.length
  if (len) {
    const attrs: Array<ASTAttr> = (el.attrs = new Array(len))
    for (let i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        value: JSON.stringify(list[i].value) // ! 属性值转换为字符串类型
      }
      if (list[i].start != null) {
        attrs[i].start = list[i].start
        attrs[i].end = list[i].end
      }
    }
    // ! 处理没有属性的 v-pre 子标签
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    el.plain = true
  }
}

// ! 处理元素
export function processElement(element: ASTElement, options: CompilerOptions) {
  processKey(element)

  // determine whether this is a plain element after
  // removing structural attributes
  element.plain =
    !element.key && !element.scopedSlots && !element.attrsList.length

  processRef(element)
  processSlotContent(element)
  processSlotOutlet(element)
  processComponent(element)
  // ! 中置处理
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }
  processAttrs(element) // ! 处理 attrsList 中剩余的属性
  return element
}

// ! 处理 key 属性的方法 -> 设置 key 属性
function processKey(el) {
  const exp = getBindingAttr(el, 'key')
  if (exp) {
    if (process.env.NODE_ENV !== 'production') {
      // ! template 标签不能设置 key 属性
      if (el.tag === 'template') {
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          getRawBindingAttr(el, 'key')
        )
      }
      // ! 使用 v-for 指令时必须使用 key，另外在 transition-group 里面不能把索引赋值给 key
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1
        const parent = el.parent
        if (
          iterator &&
          iterator === exp &&
          parent &&
          parent.tag === 'transition-group'
        ) {
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
              `this is the same as not using keys.`,
            getRawBindingAttr(el, 'key'),
            true /* tip */
          )
        }
      }
    }
    el.key = exp
  }
}

// ! 处理 ref 属性
function processRef(el) {
  const ref = getBindingAttr(el, 'ref')
  if (ref) {
    el.ref = ref
    el.refInFor = checkInFor(el) // ! 是否在 v-for 循环中
  }
}

// ! 处理 v-for 指令
export function processFor(el: ASTElement) {
  let exp
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    const res = parseFor(exp)
    if (res) {
      extend(el, res)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid v-for expression: ${exp}`, el.rawAttrsMap['v-for'])
    }
  }
}

// ! v-for 表达式解析后的数据类型 -> v-for="(val, key, index) in obj"
type ForParseResult = {
  for: string, // ! 遍历的数据 obj
  alias: string, // ! 遍历的第一个子项 val
  iterator1?: string, // ! 遍历的第二个子项 key
  iterator2?: string // ！遍历的第三个子项 index
}

// ！ 解析 v-for 表达式 ->（item, key, index）in obj
export function parseFor(exp: string): ?ForParseResult {
  const inMatch = exp.match(forAliasRE)
  if (!inMatch) return
  const res = {}
  res.for = inMatch[2].trim() // ！遍历的数据 -> 第二个捕获组的值
  const alias = inMatch[1].trim().replace(stripParensRE, '') // ！遍历的子项（第一个，有括号去括号）-> 第一个捕获组
  const iteratorMatch = alias.match(forIteratorRE) // ！ 匹配子项
  if (iteratorMatch) {
    res.alias = alias.replace(forIteratorRE, '').trim() // 第一个子项 -> 去掉后面的一个或者两个子项
    res.iterator1 = iteratorMatch[1].trim() // ！第二个子项 or undefined
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim() // ! 第三个子项 or undefined
    }
  } else {
    res.alias = alias
  }
  return res
}

// ! 处理 v-if 指令
function processIf(el) {
  const exp = getAndRemoveAttr(el, 'v-if') // ! 获取 v-if 的值
  if (exp) {
    el.if = exp
    // ! 加入到 ifConditions 属性中
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    // ! 获取 v-else 属性 ，v-else 一般不用赋值，它的值为空字符串 -> 空字符串不等于 null
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if') // ! 获取 v-else-if 的值
    if (elseif) {
      el.elseif = elseif // ! 加入到 elseif 属性中
    }
  }
}

// ! 处理 if 条件
function processIfConditions(el, parent) {
  const prev = findPrevElement(parent.children) // ! 获取前一个元素
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? 'else-if="' + el.elseif + '"' : 'else'} ` +
        `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
    )
  }
}

// ! 查找前一个元素的方法 -> 找到父级最后面的元素节点
function findPrevElement(children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
            `will be ignored.`,
          children[i]
        )
      }
      children.pop() // ! 剔除非元素节点
    }
  }
}

// ! 增加 if 条件的方法
export function addIfCondition(el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}

// ! 处理 v-once 指令的方法
function processOnce(el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
// ! 处理 slot 内容
function processSlotContent(el) {
  let slotScope
  if (el.tag === 'template') {
    slotScope = getAndRemoveAttr(el, 'scope') // ! 获取 scope 属性
    /* istanbul ignore if */
    // ！注意：scope 属性在 v2.5 的是否就被弃用了，改为 slot-scope
    if (process.env.NODE_ENV !== 'production' && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
          `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
          `can also be used on plain elements in addition to <template> to ` +
          `denote scoped slots.`,
        el.rawAttrsMap['scope'],
        true
      )
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
    /* istanbul ignore if */
    // ! slot-scope 属性不能和 v-for 一起使用，因为 v-for 的优先级高，会绑定父组件的作用域的状态
    // ! 而不是子组件通过作用域插槽传递的状态
    if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
          `(v-for takes higher priority). Use a wrapper <template> for the ` +
          `scoped slot to make it clearer.`,
        el.rawAttrsMap['slot-scope'],
        true
      )
    }
    el.slotScope = slotScope
  }

  // slot="xxx"
  const slotTarget = getBindingAttr(el, 'slot') // ! 获取 slot 属性
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget // ! 没设置 slot 名称为 default
    // ! 绑定的插槽名（动态插槽名）
    el.slotTargetDynamic = !!(
      el.attrsMap[':slot'] || el.attrsMap['v-bind:slot']
    )
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot')) // ! 添加 slot 属性
    }
  }

  // 2.6 v-slot syntax
  if (process.env.NEW_SLOT_SYNTAX) {
    // ! v-slot 标签是 template 时
    if (el.tag === 'template') {
      // v-slot on <template>
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE) // ! 获取 v-slot 属性值
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          // ! 不能混合以前的语法一起使用
          if (el.slotTarget || el.slotScope) {
            warn(`Unexpected mixed usage of different slot syntaxes.`, el)
          }
          // ! 父组件不能组件元素
          if (el.parent && !maybeComponent(el.parent)) {
            warn(
              `<template v-slot> can only appear at the root level inside ` +
                `the receiving component`,
              el
            )
          }
        }
        const { name, dynamic } = getSlotName(slotBinding) // ! 获取 slot 的名称
        el.slotTarget = name
        el.slotTargetDynamic = dynamic
        el.slotScope = slotBinding.value || emptySlotScopeToken // force it into a scoped slot for perf
      }
      // 在其他标签或者组件时
    } else {
      // v-slot on component, denotes default slot
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (!maybeComponent(el)) {
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            )
          }
          if (el.slotScope || el.slotTarget) {
            warn(`Unexpected mixed usage of different slot syntaxes.`, el)
          }
          if (el.scopedSlots) {
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
                `<template> syntax when there are other named slots.`,
              slotBinding
            )
          }
        }
        // add the component's children to its default slot
        const slots = el.scopedSlots || (el.scopedSlots = {})
        const { name, dynamic } = getSlotName(slotBinding)

        // ! 相当于 el.scopedSlots.name
        const slotContainer = (slots[name] = createASTElement(
          'template',
          [],
          el
        ))
        slotContainer.slotTarget = name
        slotContainer.slotTargetDynamic = dynamic
        // ! 不是 slot 的添加到 children 中
        slotContainer.children = el.children.filter((c: any) => {
          if (!c.slotScope) {
            c.parent = slotContainer
            return true
          }
        })
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken
        // remove children as they are returned from scopedSlots now
        el.children = []
        // mark el non-plain so data gets generated
        el.plain = false
      }
    }
  }
}

// ! 获取 slot 的名称和是否是动态插槽名 -> 生成 { name: string, dynamic: boolean }
function getSlotName(binding) {
  let name = binding.name.replace(slotRE, '') // ! 提取绑定的 slotName
  if (!name) {
    // ! 没有使用 # 缩写时设为默认值
    if (binding.name[0] !== '#') {
      name = 'default'
    } else if (process.env.NODE_ENV !== 'production') {
      warn(`v-slot shorthand syntax requires a slot name.`, binding)
    }
  }
  // ! 匹配是否是动态插槽名 -> v-slot:[dynamicSlotName]
  return dynamicArgRE.test(name)
    ? // dynamic [name]
      { name: name.slice(1, -1), dynamic: true } // ! 去前面和后面的中括号
    : // static name
      { name: `"${name}"`, dynamic: false }
}

// handle <slot/> outlets
function processSlotOutlet(el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name')
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
          `and can possibly expand into multiple elements. ` +
          `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, 'key')
      )
    }
  }
}

// ! 处理组件 -> 设置 is 和 inline-template 属性
function processComponent(el) {
  let binding
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

// ! 处理剩余属性的方法 -> 处理前面获取并删除掉后剩下的属性
function processAttrs(el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name // ! 属性名
    value = list[i].value // ! 属性值
    // ! 处理指令属性
    if (dirRE.test(name)) {
      // mark element as dynamic
      el.hasBindings = true
      // modifiers
      modifiers = parseModifiers(name.replace(dirRE, '')) // ! 获取修饰符
      // support .foo shorthand syntax for the .prop modifier
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        ;(modifiers || (modifiers = {})).prop = true
        name = `.` + name.slice(1).replace(modifierRE, '') // ! 拼接点和去修饰符
      } else if (modifiers) {
        name = name.replace(modifierRE, '') // ! 去修饰符
      }
      if (bindRE.test(name)) {
        // v-bind
        name = name.replace(bindRE, '') // ! 去 v-bind or : or .
        value = parseFilters(value)
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1) // ! 去中括号
        }
        // ! 没有绑定值时报错
        if (
          process.env.NODE_ENV !== 'production' &&
          value.trim().length === 0
        ) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          )
        }
        if (modifiers) {
          // ! .prop
          if (modifiers.prop && !isDynamic) {
            name = camelize(name) // ! 转驼峰形式
            if (name === 'innerHtml') name = 'innerHTML' // ! innerHTML 不转驼峰
          }
          // ! .camel
          if (modifiers.camel && !isDynamic) {
            name = camelize(name)
          }
          // ! .sync
          if (modifiers.sync) {
            syncGen = genAssignmentCode(value, `$event`)
            if (!isDynamic) {
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              )
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                )
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              )
            }
          }
        }
        if (
          (modifiers && modifiers.prop) ||
          // ! 没有 is 属性 和 是否使用元素对象原生的 prop 进行绑定
          (!el.component && platformMustUseProp(el.tag, el.attrsMap.type, name))
        ) {
          addProp(el, name, value, list[i], isDynamic)
        } else {
          addAttr(el, name, value, list[i], isDynamic)
        }
      } else if (onRE.test(name)) {
        // v-on
        name = name.replace(onRE, '') // 去 v-on or @
        isDynamic = dynamicArgRE.test(name) // 是否是动态属性
        if (isDynamic) {
          name = name.slice(1, -1) // ! 去中括号
        }
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic) // ! 设置事件的处理函数
      } else {
        // normal directives
        // ! 其他指令 e.g. v-text v-html v-show v-cloak v-model
        name = name.replace(dirRE, '') // ! 去前缀
        // parse arg
        const argMatch = name.match(argRE) // ! 获取自定义指令参数 e.g. v-custom:arg
        let arg = argMatch && argMatch[1]
        isDynamic = false
        if (arg) {
          name = name.slice(0, -(arg.length + 1)) // ! 去参数，获取指令名称
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1)
            isDynamic = true
          }
        }
        addDirective(
          el,
          name,
          rawName,
          value,
          arg,
          isDynamic,
          modifiers,
          list[i]
        )
        // ! 开发环境中检查 v-model 的值
        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute
      // ! 处理非指令属性
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value, delimiters)
        if (res) {
          warn(
            `${name}="${value}": ` +
              'Interpolation inside attributes has been removed. ' +
              'Use v-bind or the colon shorthand instead. For example, ' +
              'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          )
        }
      }
      addAttr(el, name, JSON.stringify(value), list[i]) // ！ 添加到 attrs
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      if (
        !el.component &&
        name === 'muted' &&
        platformMustUseProp(el.tag, el.attrsMap.type, name)
      ) {
        addProp(el, name, 'true', list[i]) // ! 添加到 props
      }
    }
  }
}

// ! 检查属性是否在 v-for 循环内 -> 元素本身有 v-for 或者父元素有 v-for
function checkInFor(el: ASTElement): boolean {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

// ! 解析修饰符 :: v-on:click.stop.prevent -> { stop: true, prevent: true }
function parseModifiers(name: string): Object | void {
  const match = name.match(modifierRE)
  if (match) {
    const ret = {}
    match.forEach(m => {
      ret[m.slice(1)] = true // ! 去前面的点号提取修饰符，并设置值为 true
    })
    return ret
  }
}

// ! 生成 attrs 映射表的方法 :: [ {name:xxx, value:yyy} ...] -> { xxx: yyy, ...}
function makeAttrsMap(attrs: Array<Object>): Object {
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] &&
      !isIE &&
      !isEdge
    ) {
      warn('duplicate attribute: ' + attrs[i].name, attrs[i])
    }
    map[attrs[i].name] = attrs[i].value
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag(el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}

// ! 是不是模板禁止标签 -> style 标签和没有设置 type 或者设置了 type 值为  text/javascript 的 script 标签
function isForbiddenTag(el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' &&
      (!el.attrsMap.type || el.attrsMap.type === 'text/javascript'))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
// ! 处理 IE 浏览器 SVG 标签中的 attrs
function guardIESVGBug(attrs) {
  const res = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

// ! 检查 v-model 的值在 v-for 下的类型
function checkForAliasModel(el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
          `You are binding v-model directly to a v-for iteration alias. ` +
          `This will not be able to modify the v-for source array because ` +
          `writing to the alias is like modifying a function local variable. ` +
          `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap['v-model']
      )
    }
    _el = _el.parent
  }
}
