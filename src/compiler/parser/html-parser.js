/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
// ! 匹配的正则表达式
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// ! 不包含冒号(:)的 XML 名称
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`

// ! 合法的 XML 标签
const qnameCapture = `((?:${ncname}\\:)?${ncname})`

// ! 开始标签的开发部分 <tagName
const startTagOpen = new RegExp(`^<${qnameCapture}`)

// ! 开始标签的开发部分 > or />
const startTagClose = /^\s*(\/?)>/

// ! 闭合标签 </tagName>
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)

// ! DOCTYPE 类型
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being pased as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
// ! 是否是纯文本标签
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)

// ! 是否应该忽略标签内容的第一个换行符
const shouldIgnoreFirstNewline = (tag, html) =>
  tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

// ! 解码属性
function decodeAttr(value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

// ! 解析 HTML 模板的方法 => 词法分析
export function parseHTML(html, options) {
  const stack = [] // ! 存储标签的栈，判断是否缺少闭合标签
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0 // ! 表示当前字符流的读入位置
  let last, lastTag // ! last 存储未 parse 的 html；lastTag 存储位于 stack 栈顶的元素

  // ! html 不为空时解析
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // ! 确保即将 parse 的内容不是在纯文本标签里 (script,style,textarea)
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')
      // ! textEnd === 0 即第一个符号是左尖括号 <
      if (textEnd === 0) {
        // Comment:
        // ! 可能是注释节点，只做前进 <!-- -->
        if (comment.test(html)) {
          // ! 判断是否存在注释结束符号 --> 来确定是否是注释节点
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment) {
              options.comment(
                html.substring(4, commentEnd), // ! 截取注释内容
                index,
                index + commentEnd + 3
              )
            }
            advance(commentEnd + 3) // ! 前进到结束位置，剔除注释 parse 完毕的部分
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // ! 可能是条件注释节点， 只做前进 <![ ]>
        if (conditionalComment.test(html)) {
          // ! 判断是否存在条件注释结束符号 ]> 来确定是否是条件注释节点
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        // ! 可能是文档类型节点，只做前进 <!DOCTYPE >
        // ! 匹配到文档类型正则
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length) // ! 前进自身长度的距离
          continue
        }

        // End tag:
        // ! 可能是闭合标签 </xxx>
        // ! 匹配闭合标签正则
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length) // ! 前进到闭合标签末尾位置
          parseEndTag(endTagMatch[1], curIndex, index) // ! 解析来说标签的结束部分
          continue
        }

        // Start tag:
        // ! 可能是开始标签 <xxx>
        const startTagMatch = parseStartTag() // ! 解析开始标签
        if (startTagMatch) {
          handleStartTag(startTagMatch) // ! 处理开始标签
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next

      // ! textEnd >= 0
      if (textEnd >= 0) {
        rest = html.slice(textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          // ! < 是纯文本字符
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)
      }

      // ! textEnd < 0 字符串作文本处理
      if (textEnd < 0) {
        text = html
      }

      if (text) {
        advance(text.length)
      }

      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
      // ! 确保即将 parse 的内容是在纯文本标签里 (script,style,textarea)
    } else {
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag =
        reCache[stackedTag] ||
        (reCache[stackedTag] = new RegExp(
          '([\\s\\S]*?)(</' + stackedTag + '[^>]*>)',
          'i'
        ))
      const rest = html.replace(reStackedTag, function(all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (
        process.env.NODE_ENV !== 'production' &&
        !stack.length &&
        options.warn
      ) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, {
          start: index + html.length
        })
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // ! 前进的方法
  function advance(n) {
    index += n
    html = html.substring(n)
  }

  // ! 解析开始标签的方法
  function parseStartTag() {
    const start = html.match(startTagOpen) // ! 匹配正则确认是开始标签
    if (start) {
      const match = {
        tagName: start[1], // ! 获取标签名
        attrs: [], // ! 初始化属性集合
        start: index // ! 索引
      }
      advance(start[0].length) // ! 继续解析

      let end, attr
      // ! 当没有匹配到开始标签的结束部分，并且匹配到了开始标签中的属性时
      while (
        !(end = html.match(startTagClose)) &&
        (attr = html.match(dynamicArgAttribute) || html.match(attribute))
      ) {
        attr.start = index
        advance(attr[0].length) // ! 继续解析
        attr.end = index
        match.attrs.push(attr) // ! 把获取到的标签属性添加进来
      }

      // ! 匹配到开始标签的结束部分
      if (end) {
        match.unarySlash = end[1] // ! 值为 / (一元标签) or undefined (非一元标签)
        advance(end[0].length)
        match.end = index
        return match // ! 返回匹配到的值
      }
    }
  }

  // ! 处理开始标签的方法 => 处理解析的值
  function handleStartTag(match) {
    const tagName = match.tagName // ! 标签名
    const unarySlash = match.unarySlash

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash // ! 判断是否是一元标签，如 <img>、<br/>

    const l = match.attrs.length
    const attrs = new Array(l)

    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || '' // ! 获取属性值
      const shouldDecodeNewlines =
        tagName === 'a' && args[1] === 'href'
          ? options.shouldDecodeNewlinesForHref
          : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1], // ! key 值
        value: decodeAttr(value, shouldDecodeNewlines) // ! 解码属性
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    // ! 不是一元标签
    if (!unary) {
      // ! 压入栈
      stack.push({
        tag: tagName,
        lowerCasedTag: tagName.toLowerCase(),
        attrs: attrs,
        start: match.start,
        end: match.end
      })
      lastTag = tagName // ! 赋值为标签名
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  // ! 解析开始标签的结束部分的方法
  function parseEndTag(tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      // ! 从后往前遍历，索引 i > pos 说明缺少闭合标签
      for (let i = stack.length - 1; i >= pos; i--) {
        if (
          process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(`tag <${stack[i].tag}> has no matching end tag.`, {
            start: stack[i].start,
            end: stack[i].end
          })
        }
        if (options.end) {
          options.end(stack[i].tag, start, end) // ! 闭合标签
        }
      }

      // Remove the open elements from the stack
      // ! 更新
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
      // ! pos < 0
      // ! 解析 br 标签 (特性标签)
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
      // ! 解析 p 标签 (特性标签)
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
