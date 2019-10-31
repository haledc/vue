/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
// ! 标签的属性
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/

const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/

// ! 不包含冒号(:)的 XML 名称
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`

// ! 合法的 XML 标签
const qnameCapture = `((?:${ncname}\\:)?${ncname})`

// ! 开始标签的开放部分 <tagName，第一个捕获组是 tagName
const startTagOpen = new RegExp(`^<${qnameCapture}`)

// ! 开始标签的结束部分 > or />
const startTagClose = /^\s*(\/?)>/

// ! 闭合标签 </tagName>，第一个捕获组是 tagName
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)

// ! DOCTYPE 类型
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being passed as HTML comment when inlined in page
// ! 注释节点
const comment = /^<!\--/

// ! 条件注释节点
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
// ! 是否是纯文本标签
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

// ! 特殊字符转换映射表
const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}

// ! 特殊字符
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
// ! 是否是 pre textarea 标签
const isIgnoreNewlineTag = makeMap('pre,textarea', true)

// ! 是否应该忽略标签内容的第一个换行符，pre textarea 标签会忽略
const shouldIgnoreFirstNewline = (tag, html) =>
  tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

// ! 解码特殊字符，比如 &lt;h2&gt; => <h2>
function decodeAttr(value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

// ! 解析 HTML 模板的函数 => 词法分析
export function parseHTML(html, options) {
  const stack = [] // ! 存储非一元标签的栈，判断是否缺少闭合标签
  const expectHTML = options.expectHTML // ! 期望的标签
  const isUnaryTag = options.isUnaryTag || no // ! 是否是一元标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no // ! 是否是可以省略闭合标签的非一元标签
  let index = 0 // ! 表示当前字符流的读入位置
  let last, lastTag // ! last 存储未 parse 的 html，lastTag 始终存储位于 stack 栈顶的元素

  // ! 当 html 不为空时
  while (html) {
    last = html // ! 每次解析前都把 html 赋值给 last
    // Make sure we're not in a plaintext content element like script/style
    // ! parse 的内容不是在纯文本标签里时 (即不是 script, style, textarea 标签里)
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')
      // ! 当 textEnd === 0 时，即第一个符号是左尖括号 <
      if (textEnd === 0) {
        // Comment:
        // ! 如果是注释节点只做前进，匹配为 <!-- -->
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          // ! 判断是否存在注释闭合符号 -->，来确定是否是注释节点
          if (commentEnd >= 0) {
            if (options.shouldKeepComment) {
              options.comment(
                html.substring(4, commentEnd), // ! 截取注释内容
                index,
                index + commentEnd + 3
              )
            }
            advance(commentEnd + 3) // ! 前进到注释节点结束位置后，即剔除注释 parse 完毕的部分
            continue // ! 跳过这次循环
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // ! 如果是条件注释节点，只做前进，匹配为 <![ ]>
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          // ! 判断是否存在条件注释的结束符号 ]>，来确定是否是条件注释节点
          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2) // ! 前进到条件注释节点结束位置后，即剔除注释 parse 完毕的部分
            continue
          }
        }

        // Doctype:
        // ! 如果是文档类型节点，只做前进，匹配为 <!DOCTYPE >
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length) // ! 前进自身长度的距离
          continue
        }

        // End tag:
        // ! 如果是闭合标签，匹配为 </xxx>
        const endTagMatch = html.match(endTag) // ! 获取闭合标签匹配的值
        if (endTagMatch) {
          const curIndex = index // ! 闭合标签的起始位置的索引
          advance(endTagMatch[0].length) // ! 前进到闭合标签末尾位置

          // ! 解析闭合标签，并传入第一个捕获组的值（也就是闭合标签的标签名），闭合标签的起始和结束位置的索引
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        // ! 如果是开始标签，匹配为 <xxx>
        const startTagMatch = parseStartTag() // ! 解析开始标签，获取匹配的值
        if (startTagMatch) {
          handleStartTag(startTagMatch) // ! 处理开始标签匹配的值
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next

      // ! textEnd >= 0，可能是以 < 开头，也可能不是，排除上面的情况（即不是标签时）
      if (textEnd >= 0) {
        rest = html.slice(textEnd) // ! 获取剩下的 html
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1) // ! 下一个 < 的索引 (在 rest 中)
          if (next < 0) break // ! 如果找不到下一个 next ，终止循环
          textEnd += next // ! 更新值，即下一个 < 的索引 (在 html 中的索引)
          rest = html.slice(textEnd) // ! 继续获取剩下的 html
        }
        text = html.substring(0, textEnd) // ! 截取文本内容
      }

      // ! textEnd < 0，即没有 < 符号
      if (textEnd < 0) {
        text = html // ! 直接做文本处理
      }

      if (text) {
        advance(text.length) // ! 前进到文本之后
      }

      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
      // ! parse 的内容是在纯文本标签里 (script,style,textarea)
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

    // ! 将整个字符串作为文本处理
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

  // ! 前进的函数，更新 index 和 html
  function advance(n) {
    index += n
    html = html.substring(n)
  }

  // ! 解析开始标签的函数 <xxx>，如 <div> <br/>  -> 生成匹配结果 match
  function parseStartTag() {
    const start = html.match(startTagOpen) // ! 匹配正则确认是开始标签
    if (start) {
      // ! 存储匹配结果
      const match = {
        tagName: start[1], // ! 获取标签名
        attrs: [], // ! 初始化属性集合
        start: index // ! 索引
      }
      advance(start[0].length) // ! 前进到开始标签之后

      let end, attr
      // ! 当还没有匹配到开始标签的结束部分 > or />，并且匹配到了开始标签中的属性时
      while (
        !(end = html.match(startTagClose)) &&
        (attr = html.match(dynamicArgAttribute) || html.match(attribute))
      ) {
        attr.start = index
        advance(attr[0].length) // ! 前进到当前的属性之后
        attr.end = index
        match.attrs.push(attr) // ! 把获取到的标签属性添加进来，attr 是一个数组
      }

      // ! 匹配到开始标签的结束部分 > or />
      if (end) {
        match.unarySlash = end[1] // ! 获取结束部分的第一个捕获组，为 / (一元标签) or undefined (非一元标签)
        advance(end[0].length) // ! 前进到开始标签的结束部分之后
        match.end = index // ! 记录结束部分的索引
        return match // ! 返回匹配到的值
      }
    }
  }

  // ! 处理开始标签的函数 -> 处理匹配结果 match -> 把一些数据传给 options.start 处理
  function handleStartTag(match) {
    const tagName = match.tagName // ! 标签名
    const unarySlash = match.unarySlash // ! 获取到的 / 的值

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    // ! 判断是否是一元标签，组件也当成是一元标签，如 <my-component />
    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs = new Array(l)

    // ! 遍历标签属性
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i] // ! 获取匹配到属性结果
      // ! 提取属性的值，可能是第三、四、五个捕获组的值，如果都没有值为空字符串
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines =
        tagName === 'a' && args[1] === 'href'
          ? options.shouldDecodeNewlinesForHref
          : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1], // ! 提取属性的 key，第一个捕获组的值
        value: decodeAttr(value, shouldDecodeNewlines) // ! 解码后属性的值
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    // ! 如果不是一元标签
    if (!unary) {
      // ! 标签属性压入栈，用来判断非一元标签是否缺少闭合部分
      stack.push({
        tag: tagName,
        lowerCasedTag: tagName.toLowerCase(),
        attrs: attrs,
        start: match.start, // ! 标签的开始索引
        end: match.end // ! 标签的结束索引
      })
      lastTag = tagName // ! lastTag 赋值为压入栈的标签的标签名，即栈顶元素的标签名
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  // ! 解析闭合标签的函数 </xxx>，如 </div> </span> -> 把一些数据传给 options.start 和 options.end 处理
  function parseEndTag(tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      // ! 从后面遍历，找出闭合标签对应的开始标签的索引赋值为 pos
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    // ! 当 pos > 0 时，该条件永远成立
    if (pos >= 0) {
      // Close all the open elements, up the stack
      // ! 从后往前遍历，索引 i > pos 说明缺少闭合标签
      for (let i = stack.length - 1; i >= pos; i--) {
        // ! 在开发环境中报错
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
      // ! 当 pos < 0 时，即找不到对应的开始标签，用户只写了闭合标签
      // ! 解析 </br> 标签 (特性标签)
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
      // ! 解析 </p> 标签 (特性标签)
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
