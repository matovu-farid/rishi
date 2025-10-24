'use strict'

Object.defineProperty(exports, '__esModule', {
  value: true
})

exports.default = void 0

/**
 * @typedef {Function} HookFunction
 * @param {...any} args - Arguments passed to the hook function
 * @returns {Promise<any>|any} - Can return a promise or any value
 */

/**
 * Hooks allow for injecting functions that must all complete in order before finishing
 * They will execute in parallel but all must finish before continuing
 * Functions may return a promise if they are async.
 * @class Hook
 * @template {any} T - The context type
 * @param {T} [context] - scope of this
 * @example this.content = new EPUBJS.Hook(this);
 */
class Hook {
  /**
   * @param {T} [context] - The context to bind hook functions to
   */
  constructor(context) {
    /** @type {T} */
    this.context = context || /** @type {T} */ (/** @type {unknown} */ (this))
    /** @type {HookFunction[]} */
    this.hooks = []
  }
  /**
   * Adds a function to be run before a hook completes
   * @param {...(HookFunction|HookFunction[])} functions - Function(s) to register, can be individual functions or arrays of functions
   * @example this.content.register(function(){...});
   * @example this.content.register(fn1, fn2, [fn3, fn4]);
   */
  register() {
    for (var i = 0; i < arguments.length; ++i) {
      if (typeof arguments[i] === 'function') {
        this.hooks.push(arguments[i])
      } else {
        // unpack array
        for (var j = 0; j < arguments[i].length; ++j) {
          this.hooks.push(arguments[i][j])
        }
      }
    }
  }
  /**
   * Removes a function from the hooks array
   * @param {HookFunction} func - The function to remove from the hooks
   * @returns {void}
   * @example this.content.deregister(function(){...});
   */
  deregister(func) {
    let hook

    for (let i = 0; i < this.hooks.length; i++) {
      hook = this.hooks[i]

      if (hook === func) {
        this.hooks.splice(i, 1)
        break
      }
    }
  }
  /**
   * Triggers a hook to run all functions
   * @param {...any} args - Arguments to pass to each hook function
   * @returns {Promise<any[]>} - Promise that resolves when all hooks complete
   * @example this.content.trigger(args).then(function(){...});
   */
  trigger() {
    var args = arguments
    var context = this.context
    var promises = []
    this.hooks.forEach(function (task) {
      try {
        var executing = task.apply(context, args)
      } catch (err) {
        console.log(err)
      }

      if (executing && typeof executing['then'] === 'function') {
        // Task is a function that returns a promise
        promises.push(executing)
      } // Otherwise Task resolves immediately, continue
    })
    return Promise.all(promises)
  }

  /**
   * Returns a list of all registered hook functions
   * @returns {HookFunction[]} - Array of all registered hook functions
   */
  list() {
    return this.hooks
  }

  /**
   * Clears all registered hook functions
   * @returns {HookFunction[]} - Empty array (the new hooks array)
   */
  clear() {
    return (this.hooks = [])
  }
}

var _default = Hook
exports.default = _default
