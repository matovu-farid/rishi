'use strict'

Object.defineProperty(exports, '__esModule', {
  value: true
})
exports.default = void 0

var _eventEmitter = _interopRequireDefault(require('event-emitter'))

var _core = require('./utils/core')

var _hook = _interopRequireDefault(require('./utils/hook'))

var _epubcfi = _interopRequireDefault(require('./epubcfi'))

var _queue = _interopRequireDefault(require('./utils/queue'))

var _layout = _interopRequireDefault(require('./layout'))

var _themes = _interopRequireDefault(require('./themes'))

var _contents = _interopRequireDefault(require('./contents'))

var _annotations = _interopRequireDefault(require('./annotations'))

var _constants = require('./utils/constants')

var _iframe = _interopRequireDefault(require('./managers/views/iframe'))

var _index = _interopRequireDefault(require('./managers/default/index'))

var _index2 = _interopRequireDefault(require('./managers/continuous/index'))

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj }
}
/**
 * @typedef {import('./utils/hook').default} Hook
 * @typedef {import('./themes').default} Themes
 * @typedef {import('./annotations').default} Annotations
 * @typedef {import('./epubcfi').default} EpubCFI
 * @typedef {import('./utils/queue').default} Queue
 * @typedef {import('./utils/core').defer} Deferred
 * @typedef {import('./layout').default} Layout
 * @typedef {import('./contents').default} Contents
 * @typedef {import('./utils/constants').EVENTS} Constants
 * @typedef {import('./managers/views/iframe').default} IframeView
 * @typedef {import('./managers/default/index').default} DefaultViewManager
 * @typedef {import('./managers/continuous/index').default} ContinuousViewManager
 * @typedef {import('./section').default} Section

 */

// import Mapping from "./mapping";
// Default Views
// Default View Managers

/**
 * @typedef {import('../types/book').default} Book
 */

/**
 * @typedef {Object} RenditionSettings - Configuration options for Rendition
 * @property {number} [width] - Width of the rendition container
 * @property {number} [height] - Height of the rendition container
 * @property {string} [ignoreClass] - CSS class for the CFI parser to ignore
 * @property {string|Function|Object} [manager='default'] - View manager to use
 * @property {string|Function} [view='iframe'] - View type to use
 * @property {string} [layout] - Layout to force (reflowable, pre-paginated)
 * @property {string} [spread] - Force spread value (none, auto, both)
 * @property {number} [minSpreadWidth=800] - Minimum width for spreads
 * @property {string} [stylesheet] - URL of stylesheet to inject
 * @property {boolean} [resizeOnOrientationChange=true] - Enable orientation change events
 * @property {string} [script] - URL of script to inject
 * @property {boolean|Object} [snap=false] - Use snap scrolling
 * @property {string} [defaultDirection='ltr'] - Default text direction
 * @property {boolean} [allowScriptedContent=false] - Enable running scripts in content
 * @property {boolean} [allowPopups=false] - Enable opening popups in content
 * @property {string} [flow] - Flow type (auto, paginated, scrolled)
 * @property {string} [orientation] - Orientation setting
 */

/**
 * @typedef {Object} DisplayedLocation - A rendered location range
 * @property {Object} start - Start location information
 * @property {string} start.index - Section index
 * @property {string} start.href - Section href
 * @property {Object} start.displayed - Display information
 * @property {string} start.cfi - CFI string
 * @property {number} start.location - Location number
 * @property {number} start.percentage - Percentage through book
 * @property {number} start.displayed.page - Current page number
 * @property {number} start.displayed.total - Total pages in section
 * @property {Object} end - End location information
 * @property {string} end.index - Section index
 * @property {string} end.href - Section href
 * @property {Object} end.displayed - Display information
 * @property {string} end.cfi - CFI string
 * @property {number} end.location - Location number
 * @property {number} end.percentage - Percentage through book
 * @property {number} end.displayed.page - Current page number
 * @property {number} end.displayed.total - Total pages in section
 * @property {boolean} atStart - Whether at start of book
 * @property {boolean} atEnd - Whether at end of book
 */

/**
 * @typedef {Object} LayoutProperties - Layout properties for rendering
 * @property {string} layout - Layout type
 * @property {string} spread - Spread setting
 * @property {string} orientation - Orientation setting
 * @property {string} flow - Flow type
 * @property {string} viewport - Viewport setting
 * @property {number} minSpreadWidth - Minimum spread width
 * @property {string} direction - Text direction
 */

/**
 * @typedef {Object} ViewTextContent - Text content from current view
 * @property {string} text - The text content
 * @property {string} startCfi - Starting CFI
 * @property {string} endCfi - Ending CFI
 */

/**
 * @typedef {Object} ParagraphContent - Paragraph content with CFI
 * @property {string} text - The paragraph text
 * @property {string} cfi - CFI for the paragraph
 */

/**
 * @typedef {Object} SizeInfo - Size information for resizing
 * @property {number} width - Width value
 * @property {number} height - Height value
 */

/**
 * Displays an Epub as a series of Views for each Section.
 * Requires Manager and View class to handle specifics of rendering
 * the section content.
 * @class Rendition
 * @param {Book} book - The EPUB book instance
 * @param {RenditionSettings} [options] - Configuration options for the rendition
 */
class Rendition extends _eventEmitter.default {
  /**
   * Creates a new Rendition instance
   * @param {Book} book - The EPUB book instance
   * @param {RenditionSettings} [options] - Configuration options for the rendition
   */
  constructor(book, options) {
    super()

    /** @type {RenditionSettings} */
    this.settings = (0, _core.extend)(this.settings || {}, {
      width: null,
      height: null,
      ignoreClass: '',
      manager: 'default',
      view: 'iframe',
      flow: null,
      layout: null,
      spread: null,
      minSpreadWidth: 800,
      stylesheet: null,
      resizeOnOrientationChange: true,
      script: null,
      snap: false,
      defaultDirection: 'ltr',
      allowScriptedContent: false,
      allowPopups: false
    })
    ;(0, _core.extend)(this.settings, options)

    if (typeof this.settings.manager === 'object') {
      /** @type {Object} */
      this.manager = this.settings.manager
    }

    /** @type {Book} */
    this.book = book
    /**
     * Hook methods for different stages of rendering
     * @type {Object.<string, Hook>}
     */
    this.hooks = {}
    /** @type {Hook} */
    this.hooks.display = new _hook.default(this)
    /** @type {Hook} */
    this.hooks.serialize = new _hook.default(this)
    /** @type {Hook} */
    this.hooks.content = new _hook.default(this)
    /** @type {Hook} */
    this.hooks.unloaded = new _hook.default(this)
    /** @type {Hook} */
    this.hooks.layout = new _hook.default(this)
    /** @type {Hook} */
    this.hooks.render = new _hook.default(this)
    /** @type {Hook} */
    this.hooks.show = new _hook.default(this)
    this.hooks.content.register(this.handleLinks.bind(this))
    this.hooks.content.register(this.passEvents.bind(this))
    this.hooks.content.register(this.adjustImages.bind(this))
    this.book.spine.hooks.content.register(this.injectIdentifier.bind(this))

    if (this.settings.stylesheet) {
      this.book.spine.hooks.content.register(this.injectStylesheet.bind(this))
    }

    if (this.settings.script) {
      this.book.spine.hooks.content.register(this.injectScript.bind(this))
    }
    /** @type {Themes} */
    this.themes = new _themes.default(this)
    /** @type {Annotations} */
    this.annotations = new _annotations.default(this)
    /** @type {EpubCFI} */
    this.epubcfi = new _epubcfi.default()
    /** @type {Queue} */
    this.q = new _queue.default(this)
    /** @type {DisplayedLocation|undefined} */
    this.location = undefined // Hold queue until book is opened

    this.q.enqueue(this.book.opened)
    /** @type {Deferred} */
    this.starting = new _core.defer()
    /**
     * Promise that resolves after the rendition has started
     * @type {Promise}
     */
    this.started = this.starting.promise // Block the queue until rendering is started

    this.q.enqueue(this.start)
  }
  /**
   * Set the manager function
   * @param {Function|Object} manager - Manager function or object
   * @returns {void}
   */
  setManager(manager) {
    this.manager = manager
  }
  /**
   * Require the manager from passed string, or as a class function
   * @param {string|Object} manager - Manager string identifier or manager object
   * @returns {Function|Object} Manager function or class
   */
  requireManager(manager) {
    var viewManager // If manager is a string, try to load from imported managers

    if (typeof manager === 'string' && manager === 'default') {
      viewManager = _index.default
    } else if (typeof manager === 'string' && manager === 'continuous') {
      viewManager = _index2.default
    } else {
      // otherwise, assume we were passed a class function
      viewManager = manager
    }

    return viewManager
  }
  /**
   * Require the view from passed string, or as a class function
   * @param {string|Object} view - View string identifier or view object
   * @returns {Function|Object} View function or class
   */
  requireView(view) {
    var View // If view is a string, try to load from imported views,

    if (typeof view == 'string' && view === 'iframe') {
      View = _iframe.default
    } else {
      // otherwise, assume we were passed a class function
      View = view
    }

    return View
  }
  /**
   * Start the rendering
   * @returns {Promise<void>} Promise that resolves when rendering has started
   */
  start() {
    if (
      !this.settings.layout &&
      (this.book.package.metadata.layout === 'pre-paginated' ||
        this.book.displayOptions.fixedLayout === 'true')
    ) {
      this.settings.layout = 'pre-paginated'
    }

    switch (this.book.package.metadata.spread) {
      case 'none':
        this.settings.spread = 'none'
        break

      case 'both':
        this.settings.spread = true
        break
    }

    if (!this.manager) {
      this.ViewManager = this.requireManager(this.settings.manager)
      this.View = this.requireView(this.settings.view)
      this.manager = new this.ViewManager({
        view: this.View,
        queue: this.q,
        request: this.book.load.bind(this.book),
        settings: this.settings
      })
    }

    this.direction(this.book.package.metadata.direction || this.settings.defaultDirection) // Parse metadata to get layout props

    this.settings.globalLayoutProperties = this.determineLayoutProperties(
      this.book.package.metadata
    )
    this.flow(this.settings.globalLayoutProperties.flow)
    this.layout(this.settings.globalLayoutProperties) // Listen for displayed views

    this.manager.on(_constants.EVENTS.MANAGERS.ADDED, this.afterDisplayed.bind(this))
    this.manager.on(_constants.EVENTS.MANAGERS.REMOVED, this.afterRemoved.bind(this)) // Listen for resizing

    this.manager.on(_constants.EVENTS.MANAGERS.RESIZED, this.onResized.bind(this)) // Listen for rotation

    this.manager.on(
      _constants.EVENTS.MANAGERS.ORIENTATION_CHANGE,
      this.onOrientationChange.bind(this)
    ) // Listen for scroll changes

    this.manager.on(_constants.EVENTS.MANAGERS.SCROLLED, this.reportLocation.bind(this))
    /**
     * Emit that rendering has started
     * @event started
     * @memberof Rendition
     */

    this.emit(_constants.EVENTS.RENDITION.STARTED) // Start processing queue

    this.starting.resolve()
  }
  /**
   * Call to attach the container to an element in the dom
   * Container must be attached before rendering can begin
   * @param {HTMLElement} element - Element to attach to
   * @returns {Promise<void>} Promise that resolves when attached
   */
  attachTo(element) {
    return this.q.enqueue(
      function () {
        // Start rendering
        this.manager.render(element, {
          width: this.settings.width,
          height: this.settings.height
        })
        /**
         * Emit that rendering has attached to an element
         * @event attached
         * @memberof Rendition
         */

        this.emit(_constants.EVENTS.RENDITION.ATTACHED)
      }.bind(this)
    )
  }
  /**
   * Display a point in the book
   * The request will be added to the rendering Queue,
   * so it will wait until book is opened, rendering started
   * and all other rendering tasks have finished to be called.
   * @param {string} target - URL or EpubCFI string
   * @returns {Promise<Section>} Promise that resolves with the displayed section
   */
  display(target) {
    if (this.displaying) {
      this.displaying.resolve()
    }

    return this.q.enqueue(this._display, target)
  }
  /**
   * Tells the manager what to display immediately
   * @private
   * @param {string} target - URL or EpubCFI string
   * @returns {Promise<Section>} Promise that resolves with the displayed section
   */
  _display(target) {
    if (!this.book) {
      return
    }

    var isCfiString = this.epubcfi.isCfiString(target)
    var displaying = new _core.defer()
    var displayed = displaying.promise
    var section
    var moveTo
    this.displaying = displaying // Check if this is a book percentage

    if (this.book.locations.length() && (0, _core.isFloat)(target)) {
      target = this.book.locations.cfiFromPercentage(parseFloat(target))
    }

    section = this.book.spine.get(target)

    if (!section) {
      displaying.reject(new Error('No Section Found'))
      return displayed
    }

    this.manager.display(section, target).then(
      () => {
        displaying.resolve(section)
        this.displaying = undefined
        /**
         * Emit that a section has been displayed
         * @event displayed
         * @param {Section} section
         * @memberof Rendition
         */

        this.emit(_constants.EVENTS.RENDITION.DISPLAYED, section)
        this.reportLocation()
      },
      (err) => {
        /**
         * Emit that has been an error displaying
         * @event displayError
         * @param {Section} section
         * @memberof Rendition
         */
        this.emit(_constants.EVENTS.RENDITION.DISPLAY_ERROR, err)
      }
    )
    return displayed
  }
  /*
  render(view, show) {
  	// view.onLayout = this.layout.format.bind(this.layout);
  view.create();
  	// Fit to size of the container, apply padding
  this.manager.resizeView(view);
  	// Render Chain
  return view.section.render(this.book.request)
  	.then(function(contents){
  		return view.load(contents);
  	}.bind(this))
  	.then(function(doc){
  		return this.hooks.content.trigger(view, this);
  	}.bind(this))
  	.then(function(){
  		this.layout.format(view.contents);
  		return this.hooks.layout.trigger(view, this);
  	}.bind(this))
  	.then(function(){
  		return view.display();
  	}.bind(this))
  	.then(function(){
  		return this.hooks.render.trigger(view, this);
  	}.bind(this))
  	.then(function(){
  		if(show !== false) {
  			this.q.enqueue(function(view){
  				view.show();
  			}, view);
  		}
  		// this.map = new Map(view, this.layout);
  		this.hooks.show.trigger(view, this);
  		this.trigger("rendered", view.section);
  		}.bind(this))
  	.catch(function(e){
  		this.trigger("loaderror", e);
  	}.bind(this));
  }
  */

  /**
   * Report what section has been displayed
   * @private
   * @param {Object} view - The view that was displayed
   * @returns {void}
   */
  afterDisplayed(view) {
    view.on(_constants.EVENTS.VIEWS.MARK_CLICKED, (cfiRange, data) =>
      this.triggerMarkEvent(cfiRange, data, view.contents)
    )
    this.hooks.render.trigger(view, this).then(() => {
      if (view.contents) {
        this.hooks.content.trigger(view.contents, this).then(() => {
          /**
           * Emit that a section has been rendered
           * @event rendered
           * @param {Section} section
           * @param {View} view
           * @memberof Rendition
           */
          this.emit(_constants.EVENTS.RENDITION.RENDERED, view.section, view)
        })
      } else {
        this.emit(_constants.EVENTS.RENDITION.RENDERED, view.section, view)
      }
    })
  }
  /**
   * Report what has been removed
   * @private
   * @param {Object} view - The view that was removed
   * @returns {void}
   */
  afterRemoved(view) {
    this.hooks.unloaded.trigger(view, this).then(() => {
      /**
       * Emit that a section has been removed
       * @event removed
       * @param {Section} section
       * @param {View} view
       * @memberof Rendition
       */
      this.emit(_constants.EVENTS.RENDITION.REMOVED, view.section, view)
    })
  }
  /**
   * Report resize events and display the last seen location
   * @private
   * @param {SizeInfo} size - Size information
   * @param {string} [epubcfi] - Optional CFI string
   * @returns {void}
   */
  onResized(size, epubcfi) {
    /**
     * Emit that the rendition has been resized
     * @event resized
     * @param {number} width
     * @param {height} height
     * @param {string} epubcfi (optional)
     * @memberof Rendition
     */
    this.emit(
      _constants.EVENTS.RENDITION.RESIZED,
      {
        width: size.width,
        height: size.height
      },
      epubcfi
    )

    if (this.location && this.location.start) {
      this.display(epubcfi || this.location.start.cfi)
    }
  }
  /**
   * Report orientation events and display the last seen location
   * @private
   * @param {string} orientation - Orientation value
   * @returns {void}
   */
  onOrientationChange(orientation) {
    /**
     * Emit that the rendition has been rotated
     * @event orientationchange
     * @param {string} orientation
     * @memberof Rendition
     */
    this.emit(_constants.EVENTS.RENDITION.ORIENTATION_CHANGE, orientation)
  }
  /**
   * Move the Rendition to a specific offset
   * Usually you would be better off calling display()
   * @param {Object} offset - Offset object
   * @returns {void}
   */
  moveTo(offset) {
    this.manager.moveTo(offset)
  }
  /**
   * Trigger a resize of the views
   * @param {number} [width] - New width
   * @param {number} [height] - New height
   * @param {string} [epubcfi] - Optional CFI string
   * @returns {void}
   */
  resize(width, height, epubcfi) {
    if (width) {
      this.settings.width = width
    }

    if (height) {
      this.settings.height = height
    }

    this.manager.resize(width, height, epubcfi)
  }
  /**
   * Clear all rendered views
   * @returns {void}
   */
  clear() {
    this.manager.clear()
  }
  /**
   * Go to the next "page" in the rendition
   * @returns {Promise<void>} Promise that resolves when navigation is complete
   */
  next() {
    return this.q.enqueue(this.manager.next.bind(this.manager)).then(this.reportLocation.bind(this))
  }
  /**
   * Go to the previous "page" in the rendition
   * @returns {Promise<void>} Promise that resolves when navigation is complete
   */
  prev() {
    return this.q.enqueue(this.manager.prev.bind(this.manager)).then(this.reportLocation.bind(this))
  } //-- http://www.idpf.org/epub/301/spec/epub-publications.html#meta-properties-rendering

  /**
   * Determine the Layout properties from metadata and settings
   * @private
   * @param {Object} metadata - Book metadata
   * @returns {LayoutProperties} Layout properties object
   */
  determineLayoutProperties(metadata) {
    var properties
    var layout = this.settings.layout || metadata.layout || 'reflowable'
    var spread = this.settings.spread || metadata.spread || 'auto'
    var orientation = this.settings.orientation || metadata.orientation || 'auto'
    var flow = this.settings.flow || metadata.flow || 'auto'
    var viewport = metadata.viewport || ''
    var minSpreadWidth = this.settings.minSpreadWidth || metadata.minSpreadWidth || 800
    var direction = this.settings.direction || metadata.direction || 'ltr'

    if (
      (this.settings.width === 0 || this.settings.width > 0) &&
      (this.settings.height === 0 || this.settings.height > 0)
    ) {
      // viewport = "width="+this.settings.width+", height="+this.settings.height+"";
    }

    properties = {
      layout: layout,
      spread: spread,
      orientation: orientation,
      flow: flow,
      viewport: viewport,
      minSpreadWidth: minSpreadWidth,
      direction: direction
    }
    return properties
  }
  /**
   * Adjust the flow of the rendition to paginated or scrolled
   * (scrolled-continuous vs scrolled-doc are handled by different view managers)
   * @param {string} flow - Flow type (auto, paginated, scrolled, scrolled-doc, scrolled-continuous)
   * @returns {void}
   */
  flow(flow) {
    var _flow = flow

    if (flow === 'scrolled' || flow === 'scrolled-doc' || flow === 'scrolled-continuous') {
      _flow = 'scrolled'
    }

    if (flow === 'auto' || flow === 'paginated') {
      _flow = 'paginated'
    }

    this.settings.flow = flow

    if (this._layout) {
      this._layout.flow(_flow)
    }

    if (this.manager && this._layout) {
      this.manager.applyLayout(this._layout)
    }

    if (this.manager) {
      this.manager.updateFlow(_flow)
    }

    if (this.manager && this.manager.isRendered() && this.location) {
      this.manager.clear()
      this.display(this.location.start.cfi)
    }
  }
  /**
   * Adjust the layout of the rendition to reflowable or pre-paginated
   * @param {LayoutProperties} settings - Layout settings
   * @returns {Layout|undefined} Layout instance or undefined
   */
  layout(settings) {
    if (settings) {
      this._layout = new _layout.default(settings)

      this._layout.spread(settings.spread, this.settings.minSpreadWidth) // this.mapping = new Mapping(this._layout.props);

      this._layout.on(_constants.EVENTS.LAYOUT.UPDATED, (props, changed) => {
        this.emit(_constants.EVENTS.RENDITION.LAYOUT, props, changed)
      })
    }

    if (this.manager && this._layout) {
      this.manager.applyLayout(this._layout)
    }

    return this._layout
  }
  /**
   * Adjust if the rendition uses spreads
   * @param {string} spread - Spread setting (none, auto, landscape, portrait, both)
   * @param {number} [min] - Minimum width to use spreads at
   * @returns {void}
   */
  spread(spread, min) {
    this.settings.spread = spread

    if (min) {
      this.settings.minSpreadWidth = min
    }

    if (this._layout) {
      this._layout.spread(spread, min)
    }

    if (this.manager && this.manager.isRendered()) {
      this.manager.updateLayout()
    }
  }
  /**
   * Adjust the direction of the rendition
   * @param {string} dir - Text direction (ltr, rtl)
   * @returns {void}
   */
  direction(dir) {
    this.settings.direction = dir || 'ltr'

    if (this.manager) {
      this.manager.direction(this.settings.direction)
    }

    if (this.manager && this.manager.isRendered() && this.location) {
      this.manager.clear()
      this.display(this.location.start.cfi)
    }
  }
  /**
   * Report the current location
   * @fires relocated
   * @fires locationChanged
   * @returns {Promise<void>} Promise that resolves when location is reported
   */
  reportLocation() {
    return this.q.enqueue(
      function reportedLocation() {
        requestAnimationFrame(
          function reportedLocationAfterRAF() {
            var location = this.manager.currentLocation()

            if (location && location.then && typeof location.then === 'function') {
              location.then(
                function (result) {
                  let located = this.located(result)

                  if (!located || !located.start || !located.end) {
                    return
                  }

                  this.location = located
                  this.emit(_constants.EVENTS.RENDITION.LOCATION_CHANGED, {
                    index: this.location.start.index,
                    href: this.location.start.href,
                    start: this.location.start.cfi,
                    end: this.location.end.cfi,
                    percentage: this.location.start.percentage
                  })
                  this.emit(_constants.EVENTS.RENDITION.RELOCATED, this.location)
                }.bind(this)
              )
            } else if (location) {
              let located = this.located(location)

              if (!located || !located.start || !located.end) {
                return
              }

              this.location = located
              /**
               * @event locationChanged
               * @deprecated
               * @type {object}
               * @property {number} index
               * @property {string} href
               * @property {EpubCFI} start
               * @property {EpubCFI} end
               * @property {number} percentage
               * @memberof Rendition
               */

              this.emit(_constants.EVENTS.RENDITION.LOCATION_CHANGED, {
                index: this.location.start.index,
                href: this.location.start.href,
                start: this.location.start.cfi,
                end: this.location.end.cfi,
                percentage: this.location.start.percentage
              })
              /**
               * @event relocated
               * @type {displayedLocation}
               * @memberof Rendition
               */

              this.emit(_constants.EVENTS.RENDITION.RELOCATED, this.location)
            }
          }.bind(this)
        )
      }.bind(this)
    )
  }
  /**
   * Get the Current Location object
   * @returns {DisplayedLocation|Promise<DisplayedLocation>} Location object or promise
   */
  currentLocation() {
    var location = this.manager.currentLocation()

    if (location && location.then && typeof location.then === 'function') {
      location.then(
        function (result) {
          let located = this.located(result)
          return located
        }.bind(this)
      )
    } else if (location) {
      let located = this.located(location)
      return located
    }
  }
  /**
   * Creates a Rendition#locationRange from location
   * passed by the Manager
   * @param {Array} location - Location array from manager
   * @returns {DisplayedLocation} Displayed location object
   * @private
   */
  located(location) {
    if (!location.length) {
      return {}
    }

    let start = location[0]
    let end = location[location.length - 1]
    let located = {
      start: {
        index: start.index,
        href: start.href,
        cfi: start.mapping.start,
        displayed: {
          page: start.pages[0] || 1,
          total: start.totalPages
        }
      },
      end: {
        index: end.index,
        href: end.href,
        cfi: end.mapping.end,
        displayed: {
          page: end.pages[end.pages.length - 1] || 1,
          total: end.totalPages
        }
      }
    }
    let locationStart = this.book.locations.locationFromCfi(start.mapping.start)
    let locationEnd = this.book.locations.locationFromCfi(end.mapping.end)

    if (locationStart != null) {
      located.start.location = locationStart
      located.start.percentage = this.book.locations.percentageFromLocation(locationStart)
    }

    if (locationEnd != null) {
      located.end.location = locationEnd
      located.end.percentage = this.book.locations.percentageFromLocation(locationEnd)
    }

    let pageStart = this.book.pageList.pageFromCfi(start.mapping.start)
    let pageEnd = this.book.pageList.pageFromCfi(end.mapping.end)

    if (pageStart != -1) {
      located.start.page = pageStart
    }

    if (pageEnd != -1) {
      located.end.page = pageEnd
    }

    if (
      end.index === this.book.spine.last().index &&
      located.end.displayed.page >= located.end.displayed.total
    ) {
      located.atEnd = true
    }

    if (start.index === this.book.spine.first().index && located.start.displayed.page === 1) {
      located.atStart = true
    }

    return located
  }
  /**
   * Remove and Clean Up the Rendition
   * @returns {void}
   */
  destroy() {
    // Clear the queue
    // this.q.clear();
    // this.q = undefined;
    this.manager && this.manager.destroy()
    this.book = undefined // this.views = null;
    // this.hooks.display.clear();
    // this.hooks.serialize.clear();
    // this.hooks.content.clear();
    // this.hooks.layout.clear();
    // this.hooks.render.clear();
    // this.hooks.show.clear();
    // this.hooks = {};
    // this.themes.destroy();
    // this.themes = undefined;
    // this.epubcfi = undefined;
    // this.starting = undefined;
    // this.started = undefined;
  }
  /**
   * Pass the events from a view's Contents
   * @private
   * @param {Contents} contents - View contents
   * @returns {void}
   */
  passEvents(contents) {
    _constants.DOM_EVENTS.forEach((e) => {
      contents.on(e, (ev) => this.triggerViewEvent(ev, contents))
    })

    contents.on(_constants.EVENTS.CONTENTS.SELECTED, (e) => this.triggerSelectedEvent(e, contents))
  }
  /**
   * Emit events passed by a view
   * @private
   * @param  {event} e
   */

  triggerViewEvent(e, contents) {
    this.emit(e.type, e, contents)
  }
  /**
   * Emit a selection event's CFI Range passed from a a view
   * @private
   * @param  {string} cfirange
   */

  triggerSelectedEvent(cfirange, contents) {
    /**
     * Emit that a text selection has occurred
     * @event selected
     * @param {string} cfirange
     * @param {Contents} contents
     * @memberof Rendition
     */
    this.emit(_constants.EVENTS.RENDITION.SELECTED, cfirange, contents)
  }
  /**
   * Emit a markClicked event with the cfiRange and data from a mark
   * @private
   * @param  {EpubCFI} cfirange
   */

  triggerMarkEvent(cfiRange, data, contents) {
    /**
     * Emit that a mark was clicked
     * @event markClicked
     * @param {EpubCFI} cfirange
     * @param {object} data
     * @param {Contents} contents
     * @memberof Rendition
     */
    this.emit(_constants.EVENTS.RENDITION.MARK_CLICKED, cfiRange, data, contents)
  }
  /**
   * Get a Range from a Visible CFI
   * @param  {string} cfi EpubCfi String
   * @param  {string} ignoreClass
   * @return {range}
   */

  getRange(cfi, ignoreClass) {
    var _cfi = new _epubcfi.default(cfi)

    var found = this.manager.visible().filter(function (view) {
      if (_cfi.spinePos === view.index) return true
    }) // Should only every return 1 item

    if (found.length) {
      return found[0].contents.range(_cfi, ignoreClass)
    }
  }
  /**
   * Hook to adjust images to fit in columns
   * @param  {Contents} contents
   * @private
   */

  adjustImages(contents) {
    if (this._layout.name === 'pre-paginated') {
      return new Promise(function (resolve) {
        resolve()
      })
    }

    let computed = contents.window.getComputedStyle(contents.content, null)
    let height =
      (contents.content.offsetHeight -
        (parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom))) *
      0.95
    let horizontalPadding = parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight)
    contents.addStylesheetRules({
      img: {
        'max-width':
          (this._layout.columnWidth
            ? this._layout.columnWidth - horizontalPadding + 'px'
            : '100%') + '!important',
        'max-height': height + 'px' + '!important',
        'object-fit': 'contain',
        'page-break-inside': 'avoid',
        'break-inside': 'avoid',
        'box-sizing': 'border-box'
      },
      svg: {
        'max-width':
          (this._layout.columnWidth
            ? this._layout.columnWidth - horizontalPadding + 'px'
            : '100%') + '!important',
        'max-height': height + 'px' + '!important',
        'page-break-inside': 'avoid',
        'break-inside': 'avoid'
      }
    })
    return new Promise(function (resolve, reject) {
      // Wait to apply
      setTimeout(function () {
        resolve()
      }, 1)
    })
  }
  /**
   * Get the Contents object of each rendered view
   * @returns {Contents[]}
   */

  getContents() {
    return this.manager ? this.manager.getContents() : []
  }
  /**
   * Get the views member from the manager
   * @returns {Views}
   */

  views() {
    let views = this.manager ? this.manager.views : undefined
    return views || []
  }
  /**
   * Get the text content of the currently viewed page (not the entire section/chapter)
   * @returns {{text: string, startCfi: string, endCfi: string}|null} Object containing the text content and CFI boundaries of the current visible page, or null if no view is visible
   */

  getCurrentViewText() {
    if (!this.manager) {
      return null
    } // Get the current location which includes the visible range

    const location = this.manager.currentLocation()

    if (!location || !location.length || !location[0]) {
      return null
    } // Get the first visible section's mapping which contains the CFI range

    const visibleSection = location[0]

    if (!visibleSection.mapping || !visibleSection.mapping.start || !visibleSection.mapping.end) {
      return null
    } // Find the view for this section

    const view = this.manager.views.find({
      index: visibleSection.index
    })

    if (!view || !view.contents || !view.contents.document) {
      return null
    }

    try {
      // Create CFI ranges for the visible page
      const startCfi = new _epubcfi.default(visibleSection.mapping.start)
      const endCfi = new _epubcfi.default(visibleSection.mapping.end) // Convert CFIs to DOM ranges

      const startRange = startCfi.toRange(view.contents.document)
      const endRange = endCfi.toRange(view.contents.document)

      if (!startRange || !endRange) {
        return null
      } // Create a range that encompasses the visible content

      const range = view.contents.document.createRange()
      range.setStart(startRange.startContainer, startRange.startOffset)
      range.setEnd(endRange.endContainer, endRange.endOffset) // Extract text from the range

      const text = range.toString()
      return {
        text: text,
        startCfi: visibleSection.mapping.start,
        endCfi: visibleSection.mapping.end
      }
    } catch (e) {
      console.error('Error extracting visible text:', e)
      return null
    }
  }
  /**
   * Get the paragraphs from the currently viewed page (not the entire section/chapter)
   * @returns {Array<{text: string, cfi: string}>|null} Array of paragraph objects containing text content and CFI, or null if no view is visible
   */

  getCurrentViewParagraphs() {
    console.log('🔍 getCurrentViewParagraphs() called')

    if (!this.manager) {
      console.log('❌ No manager - returning null')
      return null
    }

    console.log('✅ Manager exists') // Get the current location which includes the visible range

    const location = this.manager.currentLocation()
    console.log('📊 Location:', location)

    if (!location || !location.length || !location[0]) {
      console.log('❌ No location data - returning null')
      return null
    }

    console.log('✅ Location data exists')
    const visibleSection = location[0]
    console.log('📊 Visible section:', visibleSection)

    if (!visibleSection.mapping || !visibleSection.mapping.start || !visibleSection.mapping.end) {
      console.log('❌ No mapping data - returning null')
      return null
    }

    console.log('✅ Mapping data exists') // Find the view for this section

    const view = this.manager.views.find({
      index: visibleSection.index
    })
    console.log('📊 View:', view)

    if (!view || !view.contents || !view.contents.document) {
      console.log('❌ No view or contents - returning null')
      return null
    }

    console.log('✅ View and contents exist')

    try {
      console.log('🔍 Creating CFI ranges...') // Create CFI ranges for the visible page

      const startCfi = new _epubcfi.default(visibleSection.mapping.start)
      const endCfi = new _epubcfi.default(visibleSection.mapping.end)
      console.log('✅ CFI objects created') // Convert CFIs to DOM ranges

      const startRange = startCfi.toRange(view.contents.document)
      const endRange = endCfi.toRange(view.contents.document)
      console.log('📊 Start range:', startRange)
      console.log('📊 End range:', endRange)

      if (!startRange || !endRange) {
        console.log('❌ Could not create DOM ranges from CFIs')
        return null
      }

      console.log('✅ DOM ranges created') // Create a range that encompasses the visible content

      const range = view.contents.document.createRange()
      range.setStart(startRange.startContainer, startRange.startOffset)
      range.setEnd(endRange.endContainer, endRange.endOffset)
      console.log('✅ Combined range created') // Use a simpler approach: find block elements that intersect with the range

      console.log('🔍 Extracting paragraphs...')

      const paragraphs = this._getParagraphsFromRange(range, view.contents)

      console.log(`📊 Extracted ${paragraphs ? paragraphs.length : 0} paragraphs`)
      return paragraphs
    } catch (e) {
      console.error('❌ Error extracting paragraphs:', e)
      return null
    }
  }
  /**
   * Get block-level elements that intersect with the given range
   * @param {Range} range - The DOM range to check against
   * @param {Document} document - The document containing the range
   * @returns {Array<Element>} Array of block elements that intersect with the range
   * @private
   */

  _getBlockElementsInRange(range, document) {
    const blockSelectors =
      'p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, article, section, aside, header, footer, main, nav, figure, figcaption, dd, dt' // Get common ancestor of the range

    const container = range.commonAncestorContainer
    const rootElement =
      container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement // Ensure we have a valid element to query

    if (!rootElement || rootElement.nodeType !== Node.ELEMENT_NODE) {
      return []
    } // Cast to Element since we've verified it's an element node

    const element =
      /** @type {Element} */
      rootElement // Get all block elements in the container

    const allBlocks = Array.from(element.querySelectorAll(blockSelectors)) // Filter to only those that intersect with the visible range

    const visibleBlocks = allBlocks.filter((element) => {
      return range.intersectsNode(element)
    })
    return visibleBlocks
  }
  /**
   * Get paragraphs from a range by extracting text and splitting it logically
   * @param {Range} range - The range that defines the visible area
   * @param {Contents} contents - The contents object for CFI generation
   * @returns {Array<{text: string, cfi: string}>} Array of paragraph objects
   * @private
   */

  _getParagraphsFromRange(range, contents) {
    console.log('📞 _getParagraphsFromRange() called')
    const paragraphs = []

    try {
      // Get the full text from the range (same as getCurrentViewText)
      const fullText = range.toString()
      console.log(`📝 Range text: "${fullText}"`)

      if (!fullText.trim()) {
        console.log('❌ Range has no text')
        return []
      } // Get the document from the range

      const document = range.commonAncestorContainer.ownerDocument

      if (!document) {
        return []
      } // Find all text nodes within the range

      console.log('🔍 Finding text nodes in range...')

      const textNodes = this._getTextNodesInRange(range)

      console.log(`📊 Found ${textNodes.length} text nodes`)

      if (textNodes.length === 0) {
        console.log('❌ No text nodes found')
        return []
      } // Group text nodes by their containing block elements

      console.log('🔍 Grouping text nodes by block elements...')
      const blockElementToTextNodes = new Map()

      for (const textNode of textNodes) {
        const blockElement = this._findContainingBlockElement(textNode)

        if (blockElement) {
          if (!blockElementToTextNodes.has(blockElement)) {
            blockElementToTextNodes.set(blockElement, [])
          }

          blockElementToTextNodes.get(blockElement).push(textNode)
        }
      }

      console.log(`📊 Grouped into ${blockElementToTextNodes.size} block elements`) // Create paragraphs from grouped text nodes

      console.log('🔍 Creating paragraphs from block elements...')

      for (const [blockElement, textNodes] of blockElementToTextNodes) {
        try {
          // Extract text from these specific text nodes
          let elementText = ''

          for (const textNode of textNodes) {
            const nodeText = textNode.textContent || '' // If this is the start node, trim from the beginning

            if (textNode === range.startContainer) {
              elementText += nodeText.substring(range.startOffset)
            } // If this is the end node, trim from the end
            else if (textNode === range.endContainer) {
              elementText += nodeText.substring(0, range.endOffset)
            } // Otherwise, include the full text
            else {
              elementText += nodeText
            }
          } // Clean up the text

          elementText = elementText.trim() // Skip empty paragraphs

          if (!elementText) {
            console.log('⏭️ Skipping empty paragraph')
            continue
          } // Generate CFI for this element

          const cfi = contents.cfiFromNode(blockElement)
          paragraphs.push({
            text: elementText,
            cfi: cfi.toString()
          })
          console.log(`✅ Added paragraph: "${elementText.substring(0, 50)}..."`)
        } catch (e) {
          console.error('❌ Error processing block element:', e)
          continue
        }
      }

      console.log(`📊 Returning ${paragraphs.length} paragraphs`)
      return paragraphs
    } catch (e) {
      console.error('Error getting paragraphs from range:', e)
      return []
    }
  }
  /**
   * Get all text nodes within a range
   * @param {Range} range - The range to search
   * @returns {Array<Text>} Array of text nodes
   * @private
   */

  _getTextNodesInRange(range) {
    const textNodes = []

    try {
      const walker = range.commonAncestorContainer.ownerDocument.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function (node) {
            try {
              return range.intersectsNode(node)
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT
            } catch (e) {
              return NodeFilter.FILTER_REJECT
            }
          }
        }
      )
      let node

      while ((node = walker.nextNode())) {
        textNodes.push(node)
      }
    } catch (e) {
      console.error('Error getting text nodes in range:', e)
    }

    return textNodes
  }
  /**
   * Find the containing block element for a text node
   * @param {Text} textNode - The text node
   * @returns {Element|null} The containing block element or null
   * @private
   */

  _findContainingBlockElement(textNode) {
    const blockSelectors =
      'p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, article, section, aside, header, footer, main, nav, figure, figcaption, dd, dt'
    let element = textNode.parentElement

    while (element) {
      try {
        if (element.matches && element.matches(blockSelectors)) {
          return element
        }
      } catch (e) {
        // Fallback for older browsers
        const selectors = blockSelectors.split(', ')

        for (const selector of selectors) {
          try {
            if (element.matches && element.matches(selector)) {
              return element
            }
          } catch (e2) {
            continue
          }
        }
      }

      element = element.parentElement
    }

    return null
  }
  /**
   * Hook to handle link clicks in rendered content
   * @param  {Contents} contents
   * @private
   */

  handleLinks(contents) {
    if (contents) {
      contents.on(_constants.EVENTS.CONTENTS.LINK_CLICKED, (href) => {
        let relative = this.book.path.relative(href)
        this.display(relative)
      })
    }
  }
  /**
   * Hook to handle injecting stylesheet before
   * a Section is serialized
   * @param  {document} doc
   * @param  {Section} section
   * @private
   */

  injectStylesheet(doc, section) {
    let style = doc.createElement('link')
    style.setAttribute('type', 'text/css')
    style.setAttribute('rel', 'stylesheet')
    style.setAttribute('href', this.settings.stylesheet)
    doc.getElementsByTagName('head')[0].appendChild(style)
  }
  /**
   * Hook to handle injecting scripts before
   * a Section is serialized
   * @param  {document} doc
   * @param  {Section} section
   * @private
   */

  injectScript(doc, section) {
    let script = doc.createElement('script')
    script.setAttribute('type', 'text/javascript')
    script.setAttribute('src', this.settings.script)
    script.textContent = ' ' // Needed to prevent self closing tag

    doc.getElementsByTagName('head')[0].appendChild(script)
  }
  /**
   * Hook to handle the document identifier before
   * a Section is serialized
   * @param  {document} doc
   * @param  {Section} section
   * @private
   */

  injectIdentifier(doc, section) {
    let ident = this.book.packaging.metadata.identifier
    let meta = doc.createElement('meta')
    meta.setAttribute('name', 'dc.relation.ispartof')

    if (ident) {
      meta.setAttribute('content', ident)
    }

    doc.getElementsByTagName('head')[0].appendChild(meta)
  }
} //-- Enable binding events to Renderer

;(0, _eventEmitter.default)(Rendition.prototype)
var _default = Rendition
exports.default = _default
