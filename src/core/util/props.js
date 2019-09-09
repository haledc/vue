/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
}

// ! props 校验
export function validateProp(
  key: string,
  propOptions: Object, // ! 类型的形式
  propsData: Object, // ! 值的形式
  vm?: Component
): any {
  const prop = propOptions[key] // ! 获取值的类型
  const absent = !hasOwn(propsData, key) // ! 外界没有传值过来
  let value = propsData[key] // ! 获取值
  // boolean casting
  const booleanIndex = getTypeIndex(Boolean, prop.type)

  // ! 检查 boolean 类型的值
  if (booleanIndex > -1) {
    // ! 外界没有传值，且没有默认值
    if (absent && !hasOwn(prop, 'default')) {
      value = false

      // ! 外界传入空字符串 或者 名字由驼峰转连字符后与值为相同字符串 (someProp="some-prop)
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      const stringIndex = getTypeIndex(String, prop.type)
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }

  // check default value
  // ! 检查默认值
  if (value === undefined) {
    value = getPropDefaultValue(vm, prop, key) // ! 获取默认值(非响应式)
    // since the default value is a fresh copy,
    // make sure to observe it.
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    observe(value) // ! 设置为响应式
    toggleObserving(prevShouldObserve)
  }

  // ! 只有在非生产环境进行才校验
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && '@binding' in value)
  ) {
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue(
  vm: ?Component,
  prop: PropOptions,
  key: string
): any {
  // no default, return undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  // ! 对象和数组的默认值必须使用函数返回值
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' +
        key +
        '": ' +
        'Props with type Object/Array must use a factory function ' +
        'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  if (
    vm &&
    vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 * ! 类型验证的方法
 */
function assertProp(
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // ! required 必需传数据
  if (prop.required && absent) {
    warn('Missing required prop: "' + name + '"', vm)
    return
  }

  // ! 非必需传数据 而 值为 null
  if (value == null && !prop.required) {
    return
  }

  // !
  let type = prop.type
  let valid = !type || type === true // ! 没有设置类型，不需要校验，直接判定为 true
  const expectedTypes = []
  if (type) {
    if (!Array.isArray(type)) {
      type = [type]
    }
    // ! 遍历数组的所有类型，并验证每一种类型, 当出现一种类型验证失败后，循环结束
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i])
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  if (!valid) {
    warn(getInvalidTypeMessage(name, value, expectedTypes), vm)
    return
  }

  // ! 自定义验证
  const validator = prop.validator // ! 获取自定义的验证器

  // ! 自定义验证其的返回值为 false 则验证失败
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

// ! 可通过 typeof 来验证的数据类型正则
const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

// ! 类型验证
function assertType(
  value: any,
  type: Function
): {
  valid: boolean,
  expectedType: string
} {
  let valid
  const expectedType = getType(type)

  // ! 可通过 typeof 来验证的数据类型
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    // ! 包装类型的验证 const str = new String('123')
    if (!valid && t === 'object') {
      valid = value instanceof type
    }

    // ! 对象验证
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)

    // ! 数组验证
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)

    // ! 其他验证 => 自定义类型 (原型验证)
  } else {
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
function getType(fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

// ! 判断类型是否相同
function isSameType(a, b) {
  return getType(a) === getType(b)
}

function getTypeIndex(type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage(name, value, expectedTypes) {
  let message =
    `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

function styleValue(value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

function isExplicable(value) {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => value.toLowerCase() === elem)
}

function isBoolean(...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
