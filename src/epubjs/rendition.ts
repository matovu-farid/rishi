/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import EventEmitter from "events";
import { extend, defer, isFloat } from "./utils/core";
import Hook from "./utils/hook";
import EpubCFI from "./epubcfi";
import Queue from "./utils/queue";
import Layout from "./layout";
// import Mapping from "./mapping";
import Themes from "./themes";
import Contents from "./contents";
import Annotations from "./annotations";
import { EVENTS, DOM_EVENTS } from "./utils/constants";

// Default Views
import IframeView from "./managers/views/iframe";

// Default View Managers
import DefaultViewManager from "./managers/default/index";
import ContinuousViewManager from "./managers/continuous/index";

import Book from "./book";
import Section from "./section";

export type ParagraphWithCFI = {
  text: string;
  cfiRange: string;
};

export interface DisplayedLocation {
  index: number;
  href: string;
  cfi: string;
  location: number;
  percentage: number;
  displayed: {
    page: number;
    total: number;
  };
}

export interface Location {
  start: DisplayedLocation;
  end: DisplayedLocation;
  atStart: boolean;
  atEnd: boolean;
}

export interface View {
  on(
    MARK_CLICKED: any,
    arg1: (cfiRange: string, data: unknown) => void
  ): unknown;
  index: number;
  section: Section;
  contents: Contents;
}

// type Section = {
//   index: number
//   pages: number[]
//   totalPages: number
//   mapping: EpubCFIPair
// }

type EpubCFIPair = {
  start: string;
  end: string;
};

export interface RenditionOptions {
  globalLayoutProperties: {
    layout: any;
    spread: any;
    orientation: any;
    flow: any;
    viewport: any;
    minSpreadWidth: any;
    direction: any;
  };
  orientation: any;
  direction: any;
  width?: number | string;
  height?: number | string;
  ignoreClass?: string;
  manager?: string | Function | object;
  view?: string | Function | object;
  flow?: string;
  layout?: string;
  spread?: string | boolean;
  minSpreadWidth?: number;
  stylesheet?: string;
  resizeOnOrientationChange?: boolean;
  script?: string;
  infinite?: boolean;
  overflow?: string;
  snap?: boolean | object;
  defaultDirection?: string;
  allowScriptedContent?: boolean;
  allowPopups?: boolean;
}

export class Rendition extends EventEmitter {
  settings: RenditionOptions;
  book: Book;
  hooks: {
    display: Hook;
    serialize: Hook;
    content: Hook;
    unloaded: Hook;
    layout: Hook;
    render: Hook;
    show: Hook;
  };
  themes: Themes;
  annotations: Annotations;
  epubcfi: EpubCFI;
  q: Queue;
  location: Location;
  started: Promise<void>;
  private manager: DefaultViewManager | ContinuousViewManager;
  displaying: any;
  starting: any;
  ViewManager: any;
  View: any;
  _layout: any;
  constructor(book: Book, options: RenditionOptions) {
    super();
    this.settings = extend(this.settings || {}, {
      width: null,
      height: null,
      ignoreClass: "",
      manager: "default",
      view: "iframe",
      flow: null,
      layout: null,
      spread: null,
      minSpreadWidth: 800,
      stylesheet: null,
      resizeOnOrientationChange: true,
      script: null,
      snap: false,
      defaultDirection: "ltr",
      allowScriptedContent: false,
      allowPopups: false,
    });

    extend(this.settings, options);

    if (typeof this.settings.manager === "object") {
      this.manager = this.settings.manager;
    }

    this.book = book;

    /**
     * Adds Hook methods to the Rendition prototype
     * @member {object} hooks
     * @property {Hook} hooks.content
     * @memberof Rendition
     */
    this.hooks = {
      display: new Hook(this),
      serialize: new Hook(this),
      content: new Hook(this),
      unloaded: new Hook(this),
      layout: new Hook(this),
      render: new Hook(this),
      show: new Hook(this),
    };
    // this.hooks.display = new Hook(this)
    // this.hooks.serialize = new Hook(this)
    // this.hooks.content = new Hook(this)
    // this.hooks.unloaded = new Hook(this)
    // this.hooks.layout = new Hook(this)
    // this.hooks.render = new Hook(this)
    // this.hooks.show = new Hook(this)

    this.hooks.content.register(this.handleLinks.bind(this));
    this.hooks.content.register(this.passEvents.bind(this));
    this.hooks.content.register(this.adjustImages.bind(this));

    this.book.spine.hooks.content.register(this.injectIdentifier.bind(this));

    if (this.settings.stylesheet) {
      this.book.spine.hooks.content.register(this.injectStylesheet.bind(this));
    }

    if (this.settings.script) {
      this.book.spine.hooks.content.register(this.injectScript.bind(this));
    }

    /**
     * @member {Themes} themes
     * @memberof Rendition
     */
    this.themes = new Themes(this);

    /**
     * @member {Annotations} annotations
     * @memberof Rendition
     */
    this.annotations = new Annotations(this);

    this.epubcfi = new EpubCFI();

    this.q = new Queue(this);

    /**
     * A Rendered Location Range
     * @typedef location
     * @type {Object}
     * @property {object} start
     * @property {string} start.index
     * @property {string} start.href
     * @property {object} start.displayed
     * @property {EpubCFI} start.cfi
     * @property {number} start.location
     * @property {number} start.percentage
     * @property {number} start.displayed.page
     * @property {number} start.displayed.total
     * @property {object} end
     * @property {string} end.index
     * @property {string} end.href
     * @property {object} end.displayed
     * @property {EpubCFI} end.cfi
     * @property {number} end.location
     * @property {number} end.percentage
     * @property {number} end.displayed.page
     * @property {number} end.displayed.total
     * @property {boolean} atStart
     * @property {boolean} atEnd
     * @memberof Rendition
     */
    this.location = undefined;

    // Hold queue until book is opened
    this.q.enqueue(this.book.opened);

    this.starting = new defer();
    /**
     * @member {promise} started returns after the rendition has started
     * @memberof Rendition
     */
    this.started = this.starting.promise;

    // Block the queue until rendering is started
    this.q.enqueue(this.start);
  }

  /**
   * Set the manager function
   * @param {function} manager
   */
  setManager(manager: any) {
    this.manager = manager;
  }

  /**
   * Require the manager from passed string, or as a class function
   * @param  {"default" | "continuous" | object} manager [description]
   * @return {method}
   */
  requireManager(manager: string) {
    let viewManager: any;

    // If manager is a string, try to load from imported managers
    if (typeof manager === "string" && manager === "default") {
      viewManager = DefaultViewManager;
    } else if (typeof manager === "string" && manager === "continuous") {
      viewManager = ContinuousViewManager;
    } else {
      // otherwise, assume we were passed a class function
      viewManager = manager;
    }

    return viewManager;
  }

  /**
   * Require the view from passed string, or as a class function
   * @param  {string|object} view
   * @return {view}
   */
  requireView(view: string) {
    var View: any;

    // If view is a string, try to load from imported views,
    if (typeof view == "string" && view === "iframe") {
      View = IframeView;
    } else {
      // otherwise, assume we were passed a class function
      View = view;
    }

    return View;
  }

  /**
   * Start the rendering
   * @return {Promise} rendering has started
   */
  start() {
    if (
      !this.settings.layout &&
      (this.book.package.metadata.layout === "pre-paginated" ||
        this.book.displayOptions.fixedLayout === "true")
    ) {
      this.settings.layout = "pre-paginated";
    }
    switch (this.book.package.metadata.spread) {
      case "none":
        this.settings.spread = "none";
        break;
      case "both":
        this.settings.spread = true;
        break;
    }

    if (!this.manager) {
      this.ViewManager = this.requireManager(this.settings.manager);
      this.View = this.requireView(this.settings.view);

      this.manager = new this.ViewManager({
        view: this.View,
        queue: this.q,
        request: this.book.load.bind(this.book),
        settings: this.settings,
      });
    }

    this.direction(
      this.book.package.metadata.direction || this.settings.defaultDirection
    );

    // Parse metadata to get layout props
    this.settings.globalLayoutProperties = this.determineLayoutProperties(
      this.book.package.metadata
    );

    this.flow(this.settings.globalLayoutProperties.flow);

    this.layout(this.settings.globalLayoutProperties);

    // Listen for displayed views
    this.manager.on(EVENTS.MANAGERS.ADDED, this.afterDisplayed.bind(this));
    this.manager.on(EVENTS.MANAGERS.REMOVED, this.afterRemoved.bind(this));

    // Listen for resizing
    this.manager.on(EVENTS.MANAGERS.RESIZED, this.onResized.bind(this));

    // Listen for rotation
    this.manager.on(
      EVENTS.MANAGERS.ORIENTATION_CHANGE,
      this.onOrientationChange.bind(this)
    );

    // Listen for scroll changes
    this.manager.on(EVENTS.MANAGERS.SCROLLED, this.reportLocation.bind(this));

    /**
     * Emit that rendering has started
     * @event started
     * @memberof Rendition
     */
    this.emit(EVENTS.RENDITION.STARTED);

    // Start processing queue
    this.starting.resolve();
  }

  /**
   * Call to attach the container to an element in the dom
   * Container must be attached before rendering can begin
   * @param  {element} element to attach to
   * @return {Promise}
   */
  attachTo(element: any) {
    return this.q.enqueue(() => {
      // Start rendering
      this.manager.render(element, {
        width: this.settings.width,
        height: this.settings.height,
      });

      /**
       * Emit that rendering has attached to an element
       * @event attached
       * @memberof Rendition
       */
      this.emit(EVENTS.RENDITION.ATTACHED);
    });
  }

  /**
   * Display a point in the book
   * The request will be added to the rendering Queue,
   * so it will wait until book is opened, rendering started
   * and all other rendering tasks have finished to be called.
   * @param  {string} target Url or EpubCFI
   * @return {Promise}
   */
  display(target: string): Promise<any> {
    if (this.displaying) {
      this.displaying.resolve();
    }
    return this.q.enqueue(this._display, target);
  }

  /**
   * Tells the manager what to display immediately
   * @private
   * @param  {string} target Url or EpubCFI
   * @return {Promise}
   */
  _display(target: string) {
    if (!this.book) {
      return;
    }
    // const isCfiString = this.epubcfi.isCfiString(target)
    const displaying = new defer();
    const displayed = displaying.promise;
    let section: any;
    // let moveTo: any

    this.displaying = displaying;

    // Check if this is a book percentage
    if (this.book.locations.length() && isFloat(target)) {
      target = this.book.locations.cfiFromPercentage(parseFloat(target));
    }

    section = this.book.spine.get(target);

    if (!section) {
      displaying.reject(new Error("No Section Found"));
      return displayed;
    }

    this.manager.display(section, target).then(
      () => {
        displaying.resolve(section);
        this.displaying = undefined;

        /**
         * Emit that a section has been displayed
         * @event displayed
         * @param {Section} section
         * @memberof Rendition
         */
        this.emit(EVENTS.RENDITION.DISPLAYED, section);
        this.reportLocation();
      },
      (err: any) => {
        /**
         * Emit that has been an error displaying
         * @event displayError
         * @param {Section} section
         * @memberof Rendition
         */
        this.emit(EVENTS.RENDITION.DISPLAY_ERROR, err);
      }
    );

    return displayed;
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
   * @param  {*} view
   */
  afterDisplayed(view: View) {
    view.on(EVENTS.VIEWS.MARK_CLICKED, (cfiRange: string, data: unknown) =>
      this.triggerMarkEvent(cfiRange, data, view.contents)
    );

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
          this.emit(EVENTS.RENDITION.RENDERED, view.section, view);
        });
      } else {
        this.emit(EVENTS.RENDITION.RENDERED, view.section, view);
      }
    });
  }

  /**
   * Report what has been removed
   * @private
   * @param  {*} view
   */
  afterRemoved(view: View) {
    this.hooks.unloaded.trigger(view, this).then(() => {
      /**
       * Emit that a section has been removed
       * @event removed
       * @param {Section} section
       * @param {View} view
       * @memberof Rendition
       */
      this.emit(EVENTS.RENDITION.REMOVED, view.section, view);
    });
  }

  /**
   * Report resize events and display the last seen location
   * @private
   */
  onResized(size: { width: any; height: any }, epubcfi: any) {
    /**
     * Emit that the rendition has been resized
     * @event resized
     * @param {number} width
     * @param {height} height
     * @param {string} epubcfi (optional)
     * @memberof Rendition
     */
    this.emit(
      EVENTS.RENDITION.RESIZED,
      {
        width: size.width,
        height: size.height,
      },
      epubcfi
    );

    if (this.location && this.location.start) {
      this.display(epubcfi || this.location.start.cfi);
    }
  }

  /**
   * Report orientation events and display the last seen location
   * @private
   */
  onOrientationChange(orientation: any) {
    /**
     * Emit that the rendition has been rotated
     * @event orientationchange
     * @param {string} orientation
     * @memberof Rendition
     */
    this.emit(EVENTS.RENDITION.ORIENTATION_CHANGE, orientation);
  }

  /**
   * Move the Rendition to a specific offset
   * Usually you would be better off calling display()
   * @param {object} offset
   */
  moveTo(offset: any) {
    this.manager.moveTo(offset);
  }

  /**
   * Trigger a resize of the views
   * @param {number} [width]
   * @param {number} [height]
   * @param {string} [epubcfi] (optional)
   */
  resize(width: number, height: number, epubcfi: string) {
    if (width) {
      this.settings.width = width;
    }
    if (height) {
      this.settings.height = height;
    }
    this.manager.resize(width, height, epubcfi);
  }

  /**
   * Clear all rendered views
   */
  clear() {
    this.manager.clear();
  }

  /**
   * Go to the next "page" in the rendition
   * @return {Promise}
   */
  next() {
    return this.q
      .enqueue(this.manager.next.bind(this.manager))
      .then(this.reportLocation.bind(this));
  }

  /**
   * Go to the previous "page" in the rendition
   * @return {Promise}
   */
  prev() {
    return this.q
      .enqueue(this.manager.prev.bind(this.manager))
      .then(this.reportLocation.bind(this));
  }

  //-- http://www.idpf.org/epub/301/spec/epub-publications.html#meta-properties-rendering
  /**
   * Determine the Layout properties from metadata and settings
   * @private
   * @param  {object} metadata
   * @return {object} properties
   */
  determineLayoutProperties(metadata: unknown) {
    var properties: {
      layout: any;
      spread: any;
      orientation: any;
      flow: any;
      viewport: any;
      minSpreadWidth: any;
      direction: any;
    };
    var layout = this.settings.layout || metadata.layout || "reflowable";
    var spread = this.settings.spread || metadata.spread || "auto";
    var orientation =
      this.settings.orientation || metadata.orientation || "auto";
    var flow = this.settings.flow || metadata.flow || "auto";
    var viewport = metadata.viewport || "";
    var minSpreadWidth =
      this.settings.minSpreadWidth || metadata.minSpreadWidth || 800;
    var direction = this.settings.direction || metadata.direction || "ltr";

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
      direction: direction,
    };

    return properties;
  }

  /**
   * Adjust the flow of the rendition to paginated or scrolled
   * (scrolled-continuous vs scrolled-doc are handled by different view managers)
   * @param  {string} flow
   */
  flow(flow: string) {
    var _flow = flow;
    if (
      flow === "scrolled" ||
      flow === "scrolled-doc" ||
      flow === "scrolled-continuous"
    ) {
      _flow = "scrolled";
    }

    if (flow === "auto" || flow === "paginated") {
      _flow = "paginated";
    }

    this.settings.flow = flow;

    if (this._layout) {
      this._layout.flow(_flow);
    }

    if (this.manager && this._layout) {
      this.manager.applyLayout(this._layout);
    }

    if (this.manager) {
      this.manager.updateFlow(_flow);
    }

    if (this.manager && this.manager.isRendered() && this.location) {
      this.manager.clear();
      this.display(this.location.start.cfi);
    }
  }

  /**
   * Adjust the layout of the rendition to reflowable or pre-paginated
   * @param  {object} settings
   */
  layout(settings: { spread: any }) {
    if (settings) {
      this._layout = new Layout(settings);
      this._layout.spread(settings.spread, this.settings.minSpreadWidth);

      // this.mapping = new Mapping(this._layout.props);

      this._layout.on(EVENTS.LAYOUT.UPDATED, (props: any, changed: any) => {
        this.emit(EVENTS.RENDITION.LAYOUT, props, changed);
      });
    }

    if (this.manager && this._layout) {
      this.manager.applyLayout(this._layout);
    }

    return this._layout;
  }

  /**
   * Adjust if the rendition uses spreads
   * @param  {string} spread none | auto (TODO: implement landscape, portrait, both)
   * @param  {int} [min] min width to use spreads at
   */
  spread(spread: string, min: number) {
    this.settings.spread = spread;

    if (min) {
      this.settings.minSpreadWidth = min;
    }

    if (this._layout) {
      this._layout.spread(spread, min);
    }

    if (this.manager && this.manager.isRendered()) {
      this.manager.updateLayout();
    }
  }

  /**
   * Adjust the direction of the rendition
   * @param  {string} dir
   */
  direction(dir: string) {
    this.settings.direction = dir || "ltr";

    if (this.manager) {
      this.manager.direction(this.settings.direction);
    }

    if (this.manager && this.manager.isRendered() && this.location) {
      this.manager.clear();
      this.display(this.location.start.cfi);
    }
  }

  /**
   * Report the current location
   * @fires relocated
   * @fires locationChanged
   */
  reportLocation() {
    return this.q.enqueue(
      function reportedLocation(this: any) {
        requestAnimationFrame(
          function reportedLocationAfterRAF(this: any) {
            var location = this.manager.currentLocation();
            if (
              location &&
              location.then &&
              typeof location.then === "function"
            ) {
              location.then(
                function (result) {
                  let located = this.located(result);

                  if (!located || !located.start || !located.end) {
                    return;
                  }

                  this.location = located;

                  this.emit(EVENTS.RENDITION.LOCATION_CHANGED, {
                    index: this.location.start.index,
                    href: this.location.start.href,
                    start: this.location.start.cfi,
                    end: this.location.end.cfi,
                    percentage: this.location.start.percentage,
                  });

                  this.emit(EVENTS.RENDITION.RELOCATED, this.location);
                }.bind(this)
              );
            } else if (location) {
              let located = this.located(location);

              if (!located || !located.start || !located.end) {
                return;
              }

              this.location = located;

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
              this.emit(EVENTS.RENDITION.LOCATION_CHANGED, {
                index: this.location.start.index,
                href: this.location.start.href,
                start: this.location.start.cfi,
                end: this.location.end.cfi,
                percentage: this.location.start.percentage,
              });

              /**
               * @event relocated
               * @type {displayedLocation}
               * @memberof Rendition
               */
              this.emit(EVENTS.RENDITION.RELOCATED, this.location);
            }
          }.bind(this)
        );
      }.bind(this)
    );
  }

  /**
   * Get the Current Location object
   * @return {displayedLocation | promise} location (may be a promise)
   */
  currentLocation() {
    var location = this.manager.currentLocation();
    if (location && location.then && typeof location.then === "function") {
      location.then(
        function (result) {
          let located = this.located(result);
          return located;
        }.bind(this)
      );
    } else if (location) {
      let located = this.located(location);
      return located;
    }
  }

  /**
   * Creates a Rendition#locationRange from location
   * passed by the Manager
   * @returns {displayedLocation}
   * @private
   */
  located(location: string | any[]) {
    if (!location.length) {
      return {};
    }
    let start = location[0];
    let end = location[location.length - 1];

    let located = {
      start: {
        index: start.index,
        href: start.href,
        cfi: start.mapping.start,
        displayed: {
          page: start.pages[0] || 1,
          total: start.totalPages,
        },
      },
      end: {
        index: end.index,
        href: end.href,
        cfi: end.mapping.end,
        displayed: {
          page: end.pages[end.pages.length - 1] || 1,
          total: end.totalPages,
        },
      },
    };

    let locationStart = this.book.locations.locationFromCfi(
      start.mapping.start
    );
    let locationEnd = this.book.locations.locationFromCfi(end.mapping.end);

    if (locationStart != null) {
      located.start.location = locationStart;
      located.start.percentage =
        this.book.locations.percentageFromLocation(locationStart);
    }
    if (locationEnd != null) {
      located.end.location = locationEnd;
      located.end.percentage =
        this.book.locations.percentageFromLocation(locationEnd);
    }

    let pageStart = this.book.pageList.pageFromCfi(start.mapping.start);
    let pageEnd = this.book.pageList.pageFromCfi(end.mapping.end);

    if (pageStart != -1) {
      located.start.page = pageStart;
    }
    if (pageEnd != -1) {
      located.end.page = pageEnd;
    }

    if (
      end.index === this.book.spine.last().index &&
      located.end.displayed.page >= located.end.displayed.total
    ) {
      located.atEnd = true;
    }

    if (
      start.index === this.book.spine.first().index &&
      located.start.displayed.page === 1
    ) {
      located.atStart = true;
    }

    return located;
  }

  /**
   * Remove and Clean Up the Rendition
   */
  destroy() {
    // Clear the queue
    // this.q.clear();
    // this.q = undefined;

    this.manager && this.manager.destroy();

    this.book = undefined;

    // this.views = null;

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
   * @param  {Contents} view contents
   */
  passEvents(contents: Contents) {
    DOM_EVENTS.forEach((e: any) => {
      contents.on(e, (ev: Event) => this.triggerViewEvent(ev, contents));
    });

    contents.on(EVENTS.CONTENTS.SELECTED, (e: string) =>
      this.triggerSelectedEvent(e, contents)
    );
  }

  /**
   * Emit events passed by a view
   * @private
   * @param  {event} e
   */
  triggerViewEvent(e: Event, contents: Contents) {
    this.emit(e.type, e, contents);
  }

  /**
   * Emit a selection event's CFI Range passed from a a view
   * @private
   * @param  {string} cfirange
   */
  triggerSelectedEvent(cfirange: string, contents: Contents) {
    /**
     * Emit that a text selection has occurred
     * @event selected
     * @param {string} cfirange
     * @param {Contents} contents
     * @memberof Rendition
     */
    this.emit(EVENTS.RENDITION.SELECTED, cfirange, contents);
  }

  /**
   * Emit a markClicked event with the cfiRange and data from a mark
   * @private
   * @param  {EpubCFI} cfirange
   */
  triggerMarkEvent(cfiRange: string, data: unknown, contents: Contents) {
    /**
     * Emit that a mark was clicked
     * @event markClicked
     * @param {EpubCFI} cfirange
     * @param {object} data
     * @param {Contents} contents
     * @memberof Rendition
     */
    this.emit(EVENTS.RENDITION.MARK_CLICKED, cfiRange, data, contents);
  }

  /**
   * Get a Range from a Visible CFI
   * @param  {string} cfi EpubCfi String
   * @param  {string} ignoreClass
   * @return {range}
   */
  getRange(cfi: string, ignoreClass: string) {
    var _cfi = new EpubCFI(cfi);
    var found = this.manager.visible().filter(function (view: { index: any }) {
      if (_cfi.spinePos === view.index) return true;
    });

    // Should only every return 1 item
    if (found.length) {
      return found[0].contents.range(_cfi, ignoreClass);
    }
  }

  /**
   * Highlight a CFI range with default styles
   * @param {string} cfiRange - CFI range string to highlight
   * @param {object} data - Data to assign to the annotation
   * @param {function} cb - Callback function when annotation is clicked
   * @param {string} className - CSS class name for the highlight
   * @param {object} styles - Custom CSS styles to apply
   * @returns {Promise<any>} Promise that resolves to the created annotation
   */
  highlightRange(
    cfiRange: string,
    data = {},
    cb?: () => void,
    className = "epubjs-hl",
    styles = {}
  ) {
    if (!this.manager) {
      return Promise.reject(new Error("Rendition manager not available"));
    }

    try {
      // Parse the CFI range to validate it
      const rangeCfi = new EpubCFI(cfiRange);

      // Check if this is a range CFI (should have start and end)
      if (!rangeCfi.range) {
        return Promise.reject(
          new Error("CFI string is not a range: " + cfiRange)
        );
      }

      // Find the view that contains this CFI range
      const found = this.manager
        .visible()
        .filter((view: { index: any }) => rangeCfi.spinePos === view.index);

      if (!found.length) {
        return Promise.reject(
          new Error("No view found for CFI range: " + cfiRange)
        );
      }

      const view = found[0];
      if (!view.contents) {
        return Promise.reject(new Error("View contents not available"));
      }

      // Verify the CFI range can be converted to a DOM range
      const domRange = rangeCfi.toRange(
        view.contents.document,
        this.settings.ignoreClass
      );

      if (!domRange) {
        return Promise.reject(
          new Error("Could not convert CFI range to DOM range")
        );
      }

      // Apply default yellow highlight styles if no custom styles provided
      const defaultStyles = {
        fill: "yellow",
        "fill-opacity": "0.3",
        "mix-blend-mode": "multiply",
      };
      const mergedStyles = Object.assign(defaultStyles, styles);

      // Use the existing highlight method with the CFI range
      // Pass the parsed EpubCFI instance as expected by the API
      const annotation = this.annotations.highlight(
        rangeCfi,
        data,
        cb || (() => {}),
        className,
        mergedStyles
      );

      // Return a resolved promise since highlight is synchronous
      return Promise.resolve(annotation);
    } catch (error) {
      return Promise.reject(
        new Error("Error highlighting range: " + error.message)
      );
    }
  }

  /**
   * Remove a highlight from a CFI range
   * @param {string} cfiRange - CFI range string to remove highlight from
   * @returns {Promise<boolean>} Promise that resolves to true if highlight was removed, false if not found
   */
  removeHighlight(cfiRange: string) {
    if (!this.manager) {
      return Promise.reject(new Error("Rendition manager not available"));
    }

    try {
      // Parse the CFI range to validate it
      const rangeCfi = new EpubCFI(cfiRange);

      // Check if this is a range CFI (should have start and end)
      if (!rangeCfi.range) {
        return Promise.reject(
          new Error("CFI string is not a range: " + cfiRange)
        );
      }

      // Find the view that contains this CFI range
      const found = this.manager.visible().filter(function (view: {
        index: any;
      }) {
        return rangeCfi.spinePos === view.index;
      });

      if (!found.length) {
        // If no view is found, the highlight might still exist in the store
        // but not be visible, so we can still try to remove it
        console.warn(
          "No visible view found for CFI range, attempting to remove from store: " +
            cfiRange
        );
      }

      // Check if the annotation exists before removal
      const hash = encodeURI(cfiRange + "highlight");
      const annotationExists = hash in this.annotations._annotations;

      // Remove the highlight annotation
      // Pass the parsed EpubCFI instance as expected by the API
      this.annotations.remove(rangeCfi, "highlight");

      // Return a resolved promise with the result
      return Promise.resolve(annotationExists);
    } catch (error) {
      return Promise.reject(
        new Error("Error removing highlight: " + error.message)
      );
    }
  }

  /**
   * Hook to adjust images to fit in columns
   * @param  {Contents} contents
   * @private
   */
  adjustImages(contents: Contents) {
    if (this._layout.name === "pre-paginated") {
      return new Promise(function (resolve) {
        resolve();
      });
    }

    let computed = contents.window.getComputedStyle(contents.content, null);
    let height =
      (contents.content.offsetHeight -
        (parseFloat(computed.paddingTop) +
          parseFloat(computed.paddingBottom))) *
      0.95;
    let horizontalPadding =
      parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight);

    contents.addStylesheetRules({
      img: {
        "max-width":
          (this._layout.columnWidth
            ? this._layout.columnWidth - horizontalPadding + "px"
            : "100%") + "!important",
        "max-height": height + "px" + "!important",
        "object-fit": "contain",
        "page-break-inside": "avoid",
        "break-inside": "avoid",
        "box-sizing": "border-box",
      },
      svg: {
        "max-width":
          (this._layout.columnWidth
            ? this._layout.columnWidth - horizontalPadding + "px"
            : "100%") + "!important",
        "max-height": height + "px" + "!important",
        "page-break-inside": "avoid",
        "break-inside": "avoid",
      },
    });

    return new Promise(function (resolve, reject) {
      // Wait to apply
      setTimeout(function () {
        resolve();
      }, 1);
    });
  }

  /**
   * Get the Contents object of each rendered view
   * @returns {Contents[]}
   */
  getContents() {
    return this.manager ? this.manager.getContents() : [];
  }

  /**
   * Get the views member from the manager
   * @returns {Views}
   */
  views() {
    let views = this.manager ? this.manager.views : undefined;
    return views || [];
  }

  /**
   * Get the text content of the currently viewed page (not the entire section/chapter)
   * @returns {{text: string, startCfi: string, endCfi: string}|null} Object containing the text content and CFI boundaries of the current visible page, or null if no view is visible
   */
  getCurrentViewText() {
    if (!this.manager) {
      return null;
    }

    // Get the current location which includes the visible range
    const location = this.manager.currentLocation();

    if (!location || !location.length || !location[0]) {
      return null;
    }

    // Get the first visible section's mapping which contains the CFI range
    const visibleSection = location[0];

    if (
      !visibleSection.mapping ||
      !visibleSection.mapping.start ||
      !visibleSection.mapping.end
    ) {
      return null;
    }

    // Find the view for this section
    const view = this.manager.views.find({ index: visibleSection.index });

    if (!view || !view.contents || !view.contents.document) {
      return null;
    }

    try {
      // Create CFI ranges for the visible page
      const startCfi = new EpubCFI(visibleSection.mapping.start);
      const endCfi = new EpubCFI(visibleSection.mapping.end);

      // Convert CFIs to DOM ranges
      const startRange = startCfi.toRange(view.contents.document);
      const endRange = endCfi.toRange(view.contents.document);

      if (!startRange || !endRange) {
        return null;
      }

      // Create a range that encompasses the visible content
      const range = view.contents.document.createRange();
      range.setStart(startRange.startContainer, startRange.startOffset);
      range.setEnd(endRange.endContainer, endRange.endOffset);

      // Extract text from the range
      const text = range.toString();

      return {
        text: text,
        startCfi: visibleSection.mapping.start,
        endCfi: visibleSection.mapping.end,
      };
    } catch (e) {
      console.error("Error extracting visible text:", e);
      return null;
    }
  }

  /**
   * Get the paragraphs from the currently viewed page (not the entire section/chapter)
   * @returns {Array<{text: string, cfiRange: string}>|null} Array of paragraph objects containing text content and CFI range, or null if no view is visible
   */
  getCurrentViewParagraphs(): ParagraphWithCFI[] | null {
    if (!this.manager) {
      return null;
    }

    // Get the current location which includes the visible range
    const location = this.manager.currentLocation();

    if (!location || !location.length || !location[0]) {
      return null;
    }

    const visibleSection = location[0];

    if (
      !visibleSection.mapping ||
      !visibleSection.mapping.start ||
      !visibleSection.mapping.end
    ) {
      return null;
    }

    // Find the view for this section
    const view = this.manager.views.find({ index: visibleSection.index });

    if (!view || !view.contents || !view.contents.document) {
      return null;
    }

    try {
      // Create CFI ranges for the visible page
      const startCfi = new EpubCFI(visibleSection.mapping.start);
      const endCfi = new EpubCFI(visibleSection.mapping.end);

      // Convert CFIs to DOM ranges
      const startRange = startCfi.toRange(view.contents.document);
      const endRange = endCfi.toRange(view.contents.document);

      if (!startRange || !endRange) {
        return null;
      }

      // Create a range that encompasses the visible content
      const range = view.contents.document.createRange();
      range.setStart(startRange.startContainer, startRange.startOffset);
      range.setEnd(endRange.endContainer, endRange.endOffset);

      // Extract paragraphs from the range
      const paragraphs = this._getParagraphsFromRange(range, view.contents);
      return paragraphs;
    } catch (e) {
      console.error("Error extracting paragraphs:", e);
      return null;
    }
  }
  //   interface Paragraph {
  // 	text: string
  // 	startCfi: string
  // 	endCfi: string
  // 	cfiRange: string
  //   }
  /**
   * Paragraph interface
   * @typedef {Object} Paragraph
   * @property {string} text - The text content of the paragraph
   * @property {string} startCfi - The start CFI of the paragraph
   * @property {string} endCfi - The end CFI of the paragraph
   * @property {string} cfiRange - The CFI range of the paragraph
   */

  /**
   * Get the paragraphs from the next view/page (not the currently visible one)
   * @returns {Promise<Array<{text: string, cfiRange: string}>|null>} Promise that resolves to array of paragraph objects containing text content and CFI range, or null if no next view exists
   */
  /**
   * Get the paragraphs from the next view/page
   * @param {Object} options - The options object
   * @param {number} options.minLength - The minimum length of the paragraphs
   * @returns {Promise<Array<{text: string, cfiRange: string}>|null>} Promise that resolves to array of paragraph objects containing text content and CFI range, or null if no next view exists
   */
  async getNextViewParagraphs(options = { minLength: 50 }) {
    const { minLength = 50 } = options;
    if (!this.manager) {
      return [];
    }

    const location = this.manager.currentLocation();

    if (
      !location ||
      !Array.isArray(location) ||
      !location.length ||
      !location[0]
    ) {
      return [];
    }

    const currentSection = location[0];
    if (
      !currentSection.mapping ||
      !currentSection.mapping.start ||
      !currentSection.mapping.end
    ) {
      return [];
    }

    const currentView = this.manager.views.find({
      index: currentSection.index,
    });

    if (!currentView || !currentView.section || !currentView.contents) {
      return [];
    }

    const hasNextPageInSection = this._hasNextPageInCurrentSection(
      currentView,
      currentSection
    );
    /**
     * Paragraphs array
     * @type {Paragraph[]}
     */
    let paragraphs: any[];
    if (hasNextPageInSection) {
      paragraphs = await this._getNextPageParagraphsInSectionAsync(
        currentView,
        currentSection
      );
    } else {
      const nextSectionParagraphs =
        await this._getFirstPageParagraphsInNextSection(currentView);
      paragraphs = nextSectionParagraphs;
    }

    if (minLength > 0) {
      paragraphs = paragraphs.filter(
        (p: { text: string | any[] }) => p.text.length >= minLength
      );
    }

    return paragraphs;
  }

  /**
   *
   * Get paragraphs from the next page within the current section
   * @param {View} currentView - The current view
   * @param {Section} currentSection - The current section location data
   * @returns {Promise<Paragraph[]>} Promise that resolves to array of paragraph objects containing text content and CFI range, or null if no next page exists
   */
  async _getNextPageParagraphsInSectionAsync(
    currentView: { contents: Contents; section: { cfiBase: any } },
    currentSection: { pages: string | any[] }
  ) {
    try {
      const layout = this.manager.layout;
      const currentPage = currentSection.pages[currentSection.pages.length - 1];

      const nextPageStart = currentPage * layout.pageWidth;
      const nextPageEnd = nextPageStart + layout.pageWidth;

      const nextPageMapping = this.manager.mapping.page(
        currentView.contents,
        currentView.section.cfiBase,
        nextPageStart,
        nextPageEnd
      );

      if (!nextPageMapping || !nextPageMapping.start || !nextPageMapping.end) {
        return [];
      }

      const startCfi = new EpubCFI(nextPageMapping.start);
      const endCfi = new EpubCFI(nextPageMapping.end);

      let startRange = startCfi.toRange(currentView.contents.document);
      let endRange = endCfi.toRange(currentView.contents.document);

      if (!startRange || !endRange) {
        return [];
      }

      try {
        const comparison = startRange.compareBoundaryPoints(
          Range.START_TO_START,
          endRange
        );
        if (comparison > 0) {
          const temp = startRange;
          startRange = endRange;
          endRange = temp;
        }
      } catch (e) {
        console.error("Error comparing range boundaries:", e);
      }

      const range = currentView.contents.document.createRange();
      range.setStart(startRange.startContainer, startRange.startOffset);
      range.setEnd(endRange.endContainer, endRange.endOffset);

      const paragraphs = this._getParagraphsFromRange(
        range,
        currentView.contents
      );

      return paragraphs;
    } catch (e) {
      console.error("Error extracting next page paragraphs:", e);
      return [];
    }
  }

  /**
   * Check if there's a next page within the current section
   * @param {View} currentView - The current view
   * @param {Object} currentSection - The current section location data
   * @returns {boolean} True if there's a next page in the current section
   * @private
   */
  _hasNextPageInCurrentSection(currentView: View, currentSection: Section) {
    // Use page numbers from location data
    if (!currentSection.pages || !currentSection.totalPages) {
      return false;
    }

    // Check if current page is less than total pages
    const currentPage = currentSection.pages[currentSection.pages.length - 1];
    const hasNext = currentPage < currentSection.totalPages;

    return hasNext;
  }

  /**
   * Get paragraphs from the first page of the next section
   * @param {View} currentView - The current view
   * @returns {Promise<Paragraph[]>} Promise that resolves to array of paragraph objects
   * @private
   */
  async _getFirstPageParagraphsInNextSection(currentView: View) {
    const nextSection = currentView.section.next();

    if (!nextSection) {
      return []; // No next section available
    }

    // Try to find if the next section is already loaded as a view
    let nextView = this.manager.views.find({ index: nextSection.index });

    if (!nextView) {
      // The next section is not loaded as a view yet
      // Load the section content directly without creating a view
      try {
        // Load the section content directly using the book's load method with timeout
        const loadPromise = nextSection.load(this.book.load.bind(this.book));
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Section load timeout")), 10000)
        );

        const loadedContent = await Promise.race([loadPromise, timeoutPromise]);

        if (!loadedContent || !loadedContent.document) {
          return [];
        }

        const document = loadedContent.document;
        const body = document.body;

        if (!body) {
          return [];
        }

        // Create a Contents object from the loaded section
        const contents = new Contents(
          document,
          body,
          nextSection.cfiBase,
          nextSection.index
        );

        // Get the first page mapping instead of the entire section
        const firstPageMapping = this._getFirstPageMapping(
          contents,
          nextSection
        );

        if (
          !firstPageMapping ||
          !firstPageMapping.start ||
          !firstPageMapping.end
        ) {
          return [];
        }

        // Convert CFIs to DOM ranges
        const startCfi = new EpubCFI(firstPageMapping.start);
        const endCfi = new EpubCFI(firstPageMapping.end);

        const startRange = startCfi.toRange(document);
        const endRange = endCfi.toRange(document);

        if (!startRange || !endRange) {
          return [];
        }

        // Create a range that encompasses the first page content
        const range = document.createRange();
        range.setStart(startRange.startContainer, startRange.startOffset);
        range.setEnd(endRange.endContainer, endRange.endOffset);

        // Extract paragraphs from the range
        const paragraphs = this._getParagraphsFromRange(range, contents);

        return paragraphs;
      } catch (e) {
        console.error("Error loading next section content:", e);
        return [];
      }
    }

    // If the view is already loaded, use it
    if (!nextView.contents || !nextView.contents.document) {
      return [];
    }

    try {
      // Get the first page mapping instead of the entire section
      const firstPageMapping = this._getFirstPageMapping(
        nextView.contents,
        nextView.section
      );

      if (
        !firstPageMapping ||
        !firstPageMapping.start ||
        !firstPageMapping.end
      ) {
        return [];
      }

      // Convert CFIs to DOM ranges
      const startCfi = new EpubCFI(firstPageMapping.start);
      const endCfi = new EpubCFI(firstPageMapping.end);

      const startRange = startCfi.toRange(nextView.contents.document);
      const endRange = endCfi.toRange(nextView.contents.document);

      if (!startRange || !endRange) {
        return [];
      }

      // Create a range that encompasses the first page content
      const range = nextView.contents.document.createRange();
      range.setStart(startRange.startContainer, startRange.startOffset);
      range.setEnd(endRange.endContainer, endRange.endOffset);

      // Extract paragraphs from the range
      const paragraphs = this._getParagraphsFromRange(range, nextView.contents);

      return paragraphs;
    } catch (e) {
      console.error("Error extracting paragraphs from next view:", e);
      return [];
    }
  }

  /**
   * Get the CFI mapping for the first page of a section
   * @param {Contents} contents - The contents object
   * @param {Section} section - The section object
   * @returns {Object|null} The CFI mapping for the first page
   * @private
   */
  _getFirstPageMapping(contents: Contents, section: Section) {
    const layout = this.manager.layout;

    // For the first page, start at 0 and use page width/height
    let start = 0;
    let end: any;

    if (this.manager.settings.axis === "horizontal") {
      end = layout.pageWidth;
    } else {
      end = layout.height;
    }

    return this.manager.mapping.page(contents, section.cfiBase, start, end);
  }

  /**
   * Get the paragraphs from the previous view/page (not the currently visible one)
   * @param {Object} options - The options object
   * @param {number} options.minLength - The minimum length of the paragraphs
   * @returns {Promise<Array<{text: string, cfiRange: string}>|null>} Promise that resolves to array of paragraph objects containing text content and CFI range, or null if no previous view exists
   */
  async getPreviousViewParagraphs(options = { minLength: 50 }) {
    const { minLength = 50 } = options;
    if (!this.manager) {
      return [];
    }

    const location = this.manager.currentLocation();

    if (
      !location ||
      !Array.isArray(location) ||
      !location.length ||
      !location[0]
    ) {
      return [];
    }

    const currentSection = location[0];
    if (
      !currentSection.mapping ||
      !currentSection.mapping.start ||
      !currentSection.mapping.end
    ) {
      return [];
    }

    const currentView = this.manager.views.find({
      index: currentSection.index,
    });

    if (!currentView || !currentView.section || !currentView.contents) {
      return [];
    }

    const hasPreviousPageInSection = this._hasPreviousPageInCurrentSection(
      currentView,
      currentSection
    );
    /**
     * Paragraphs array
     * @type {Paragraph[]}
     */
    let paragraphs: any[];
    if (hasPreviousPageInSection) {
      paragraphs = await this._getPreviousPageParagraphsInSectionAsync(
        currentView,
        currentSection
      );
    } else {
      const previousSectionParagraphs =
        await this._getLastPageParagraphsInPreviousSection(currentView);
      paragraphs = previousSectionParagraphs;
    }

    if (minLength > 0) {
      paragraphs = paragraphs.filter(
        (p: { text: string | any[] }) => p.text.length >= minLength
      );
    }

    return paragraphs;
  }

  /**
   * Get paragraphs from the previous page within the current section
   * @param {View} currentView - The current view
   * @param {Section} currentSection - The current section location data
   * @returns {Promise<Paragraph[]>} Promise that resolves to array of paragraph objects containing text content and CFI range, or null if no previous page exists
   */
  async _getPreviousPageParagraphsInSectionAsync(
    currentView: View,
    currentSection: Section
  ) {
    try {
      const layout = this.manager.layout;
      const currentPage = currentSection.pages[0]; // First page in the current view

      const previousPageEnd = (currentPage - 1) * layout.pageWidth;
      const previousPageStart = Math.max(0, previousPageEnd - layout.pageWidth);

      const previousPageMapping = this.manager.mapping.page(
        currentView.contents,
        currentView.section.cfiBase,
        previousPageStart,
        previousPageEnd
      );

      if (
        !previousPageMapping ||
        !previousPageMapping.start ||
        !previousPageMapping.end
      ) {
        return [];
      }

      const startCfi = new EpubCFI(previousPageMapping.start);
      const endCfi = new EpubCFI(previousPageMapping.end);

      let startRange = startCfi.toRange(currentView.contents.document);
      let endRange = endCfi.toRange(currentView.contents.document);

      if (!startRange || !endRange) {
        return [];
      }

      try {
        const comparison = startRange.compareBoundaryPoints(
          Range.START_TO_START,
          endRange
        );
        if (comparison > 0) {
          const temp = startRange;
          startRange = endRange;
          endRange = temp;
        }
      } catch (e) {
        console.error("Error comparing range boundaries:", e);
      }

      const range = currentView.contents.document.createRange();
      range.setStart(startRange.startContainer, startRange.startOffset);
      range.setEnd(endRange.endContainer, endRange.endOffset);

      const paragraphs = this._getParagraphsFromRange(
        range,
        currentView.contents
      );

      return paragraphs;
    } catch (e) {
      console.error("Error extracting previous page paragraphs:", e);
      return [];
    }
  }

  /**
   * Check if there's a previous page within the current section
   * @param {View} currentView - The current view
   * @param {Object} currentSection - The current section location data
   * @returns {boolean} True if there's a previous page in the current section
   * @private
   */
  _hasPreviousPageInCurrentSection(currentView: View, currentSection: Section) {
    // Use page numbers from location data
    if (!currentSection.pages || !currentSection.totalPages) {
      return false;
    }

    // Check if current page is greater than 1
    const currentPage = currentSection.pages[0]; // First page in the current view
    const hasPrevious = currentPage > 1;

    return hasPrevious;
  }

  /**
   * Get paragraphs from the last page of the previous section
   * @param {View} currentView - The current view
   * @returns {Promise<Paragraph[]>} Promise that resolves to array of paragraph objects
   * @private
   */
  async _getLastPageParagraphsInPreviousSection(currentView: View) {
    const previousSection = currentView.section.prev();

    if (!previousSection) {
      return []; // No previous section available
    }

    // Try to find if the previous section is already loaded as a view
    let previousView = this.manager.views.find({
      index: previousSection.index,
    });

    if (!previousView) {
      // The previous section is not loaded as a view yet
      // Load the section content directly without creating a view
      try {
        // Load the section content directly using the book's load method with timeout
        const loadPromise = previousSection.load(
          this.book.load.bind(this.book)
        );
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Section load timeout")), 10000)
        );

        const loadedContent = await Promise.race([loadPromise, timeoutPromise]);

        if (!loadedContent || !loadedContent.document) {
          return [];
        }

        const document = loadedContent.document;
        const body = document.body;

        if (!body) {
          return [];
        }

        // Create a Contents object from the loaded section
        const contents = new Contents(
          document,
          body,
          previousSection.cfiBase,
          previousSection.index
        );

        // Get the last page mapping instead of the entire section
        const lastPageMapping = this._getLastPageMapping(
          contents,
          previousSection
        );

        if (
          !lastPageMapping ||
          !lastPageMapping.start ||
          !lastPageMapping.end
        ) {
          return [];
        }

        // Convert CFIs to DOM ranges
        const startCfi = new EpubCFI(lastPageMapping.start);
        const endCfi = new EpubCFI(lastPageMapping.end);

        const startRange = startCfi.toRange(document);
        const endRange = endCfi.toRange(document);

        if (!startRange || !endRange) {
          return [];
        }

        // Create a range that encompasses the last page content
        const range = document.createRange();
        range.setStart(startRange.startContainer, startRange.startOffset);
        range.setEnd(endRange.endContainer, endRange.endOffset);

        // Extract paragraphs from the range
        const paragraphs = this._getParagraphsFromRange(range, contents);

        return paragraphs;
      } catch (e) {
        console.error("Error loading previous section content:", e);
        return [];
      }
    }

    // If the view is already loaded, use it
    if (!previousView.contents || !previousView.contents.document) {
      return [];
    }

    try {
      // Get the last page mapping instead of the entire section
      const lastPageMapping = this._getLastPageMapping(
        previousView.contents,
        previousView.section
      );

      if (!lastPageMapping || !lastPageMapping.start || !lastPageMapping.end) {
        return [];
      }

      // Convert CFIs to DOM ranges
      const startCfi = new EpubCFI(lastPageMapping.start);
      const endCfi = new EpubCFI(lastPageMapping.end);

      const startRange = startCfi.toRange(previousView.contents.document);
      const endRange = endCfi.toRange(previousView.contents.document);

      if (!startRange || !endRange) {
        return [];
      }

      // Create a range that encompasses the last page content
      const range = previousView.contents.document.createRange();
      range.setStart(startRange.startContainer, startRange.startOffset);
      range.setEnd(endRange.endContainer, endRange.endOffset);

      // Extract paragraphs from the range
      const paragraphs = this._getParagraphsFromRange(
        range,
        previousView.contents
      );

      return paragraphs;
    } catch (e) {
      console.error("Error extracting paragraphs from previous view:", e);
      return [];
    }
  }

  /**
   * Get the CFI mapping for the last page of a section
   * @param {Contents} contents - The contents object
   * @param {Section} section - The section object
   * @returns {Object|null} The CFI mapping for the last page
   * @private
   */
  _getLastPageMapping(contents: Contents, section: Section) {
    const layout = this.manager.layout;

    // For the last page, calculate based on total content height
    let start: number, end: number;

    if (this.manager.settings.axis === "horizontal") {
      // For horizontal layout, get the last page width
      const totalWidth = contents.content.scrollWidth;
      start = Math.max(0, totalWidth - layout.pageWidth);
      end = totalWidth;
    } else {
      // For vertical layout, get the last page height
      const totalHeight = contents.content.scrollHeight;
      start = Math.max(0, totalHeight - layout.height);
      end = totalHeight;
    }

    return this.manager.mapping.page(contents, section.cfiBase, start, end);
  }

  /**
   * Get paragraphs from a range by extracting text and splitting it logically
   * @param {Range} range - The range that defines the visible area
   * @param {Contents} contents - The contents object for CFI generation
   * @returns {Array<{text: string, cfiRange: string}>} Array of paragraph objects
   * @private
   */
  _getParagraphsFromRange(
    range: Range,
    contents: Contents
  ): ParagraphWithCFI[] {
    const paragraphs: ParagraphWithCFI[] = [];

    try {
      // Get the full text from the range (same as getCurrentViewText)
      const fullText = range.toString();

      if (!fullText.trim()) {
        return [];
      }

      // Get the document from the range
      const document = range.commonAncestorContainer.ownerDocument;
      if (!document) {
        return [];
      }

      // Find all text nodes within the range
      const textNodes = this._getTextNodesInRange(range);

      if (textNodes.length === 0) {
        return [];
      }

      // Group text nodes by their containing block elements
      const blockElementToTextNodes = new Map();

      for (const textNode of textNodes) {
        const blockElement = this._findContainingBlockElement(textNode);
        if (blockElement) {
          if (!blockElementToTextNodes.has(blockElement)) {
            blockElementToTextNodes.set(blockElement, []);
          }
          blockElementToTextNodes.get(blockElement).push(textNode);
        }
      }

      // Create paragraphs from grouped text nodes
      for (const [blockElement, textNodes] of blockElementToTextNodes) {
        try {
          // Extract text from these specific text nodes
          let elementText = "";
          let firstTextNode = null;
          let lastTextNode = null;
          let firstTextOffset = 0;
          let lastTextOffset = 0;

          for (const textNode of textNodes) {
            const nodeText = textNode.textContent || "";

            // Track first and last text nodes for range creation
            if (!firstTextNode) {
              firstTextNode = textNode;
            }
            lastTextNode = textNode;

            // Check if this is the same node as both start and end container
            if (
              textNode === range.startContainer &&
              textNode === range.endContainer
            ) {
              elementText += nodeText.substring(
                range.startOffset,
                range.endOffset
              );
              firstTextOffset = range.startOffset;
              lastTextOffset = range.endOffset;
            }
            // If this is the start node, trim from the beginning
            else if (textNode === range.startContainer) {
              elementText += nodeText.substring(range.startOffset);
              firstTextOffset = range.startOffset;
              // If this is also the last node, set lastTextOffset
              if (textNode === lastTextNode) {
                lastTextOffset = nodeText.length;
              }
            }
            // If this is the end node, trim from the end
            else if (textNode === range.endContainer) {
              elementText += nodeText.substring(0, range.endOffset);
              lastTextOffset = range.endOffset;
              // If this is also the first node, set firstTextOffset
              if (textNode === firstTextNode) {
                firstTextOffset = 0;
              }
            }
            // Otherwise, include the full text (middle node)
            else {
              elementText += nodeText;
              // If this is the first node, set firstTextOffset
              if (textNode === firstTextNode) {
                firstTextOffset = 0;
              }
              // If this is the last node, set lastTextOffset
              if (textNode === lastTextNode) {
                lastTextOffset = nodeText.length;
              }
            }
          }

          // Don't normalize whitespace here - preserve original spacing
          // The normalization should happen at the test level for comparison
          elementText = elementText.trim();

          // Skip empty paragraphs
          if (!elementText || !firstTextNode || !lastTextNode) {
            continue;
          }

          // Create a DOM Range for the paragraph's actual text content
          const paragraphRange = document.createRange();

          // Validate offsets before setting range boundaries
          const maxStartOffset = firstTextNode.textContent
            ? firstTextNode.textContent.length
            : 0;
          const maxEndOffset = lastTextNode.textContent
            ? lastTextNode.textContent.length
            : 0;

          // Ensure offsets are within valid bounds
          const validFirstOffset = Math.min(
            Math.max(firstTextOffset, 0),
            maxStartOffset
          );
          const validLastOffset = Math.min(
            Math.max(lastTextOffset, 0),
            maxEndOffset
          );

          // Set start to the beginning of the first text node (accounting for trimming)
          paragraphRange.setStart(firstTextNode, validFirstOffset);

          // Set end to the end of the last text node (accounting for trimming)
          paragraphRange.setEnd(lastTextNode, validLastOffset);

          // Generate CFI for the block element itself to ensure uniqueness
          // This creates a single-point CFI that uniquely identifies this paragraph element
          const elementCfi = new EpubCFI(
            blockElement,
            contents.cfiBase,
            this.settings.ignoreClass
          );

          let startCfi: string, endCfi: string, cfiRange: string;

          // For paragraphs, we treat each as a single element with the same start and end CFI
          // This matches the test expectation that startCfi === endCfi for single paragraphs
          const mainCfi = elementCfi.toString();
          startCfi = mainCfi;
          endCfi = mainCfi;

          // For highlighting, we can use the range CFI that spans the text content
          const rangeCfiObj = new EpubCFI(
            paragraphRange,
            contents.cfiBase,
            this.settings.ignoreClass
          );
          cfiRange = rangeCfiObj.toString();

          // Verify CFI can be parsed
          try {
            const testCfi = new EpubCFI(mainCfi);
            if (!testCfi.path || !testCfi.base) {
              continue;
            }

            // Also verify the range CFI
            const testRangeCfi = new EpubCFI(cfiRange);
            if (!testRangeCfi.path || !testRangeCfi.base) {
              cfiRange = mainCfi; // Fallback to element CFI
            }
          } catch (e) {
            continue;
          }

          paragraphs.push({
            text: elementText,
            startCfi: startCfi,
            endCfi: endCfi,
            cfiRange: cfiRange, // Add full range CFI for highlighting
          });
        } catch (e) {
          console.error("❌ Error processing block element:", e);
          continue;
        }
      }

      // Fallback: if no paragraphs found but we have text, create one paragraph from entire range
      if (paragraphs.length === 0 && fullText.trim()) {
        try {
          const cfi = new EpubCFI(
            range,
            contents.cfiBase,
            this.settings.ignoreClass
          );
          const cfiString = cfi.toString();
          paragraphs.push({
            text: fullText.trim(),
            cfiRange: cfiString,
            startCfi: cfiString,
            endCfi: cfiString,
          });
        } catch (e) {
          console.error("Error creating fallback paragraph:", e);
        }
      }

      return paragraphs;
    } catch (e) {
      console.error("Error getting paragraphs from range:", e);
      return [];
    }
  }

  /**
   * Get all text nodes within a range
   * @param {Range} range - The range to search
   * @returns {Array<Text>} Array of text nodes
   * @private
   */
  _getTextNodesInRange(range: Range) {
    const textNodes = [];

    try {
      // Validate range first
      if (!range || !range.commonAncestorContainer) {
        console.error("_getTextNodesInRange: Invalid range provided");
        return textNodes;
      }

      const walker =
        range.commonAncestorContainer.ownerDocument.createTreeWalker(
          range.commonAncestorContainer,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function (node) {
              try {
                // Skip empty or whitespace-only text nodes
                if (!node.textContent || !node.textContent.trim()) {
                  return NodeFilter.FILTER_REJECT;
                }
                return range.intersectsNode(node)
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_REJECT;
              } catch (e) {
                return NodeFilter.FILTER_REJECT;
              }
            },
          }
        );

      let node: Node | null;
      while ((node = walker.nextNode())) {
        textNodes.push(node);
      }
    } catch (e) {
      console.error("Error getting text nodes in range:", e);
    }

    return textNodes;
  }

  /**
   * Find the containing block element for a text node
   * @param {Text} textNode - The text node
   * @returns {Element|null} The containing block element or null
   * @private
   */
  _findContainingBlockElement(textNode: Text) {
    const blockSelectors =
      "p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, article, section, aside, header, footer, main, nav, figure, figcaption, dd, dt";

    let element = textNode.parentElement;

    while (element) {
      try {
        if (element.matches && element.matches(blockSelectors)) {
          return element;
        }
      } catch (e) {
        // Fallback for older browsers
        const selectors = blockSelectors.split(", ");
        for (const selector of selectors) {
          try {
            if (element.matches && element.matches(selector)) {
              return element;
            }
          } catch (e2) {
            continue;
          }
        }
      }
      element = element.parentElement;
    }

    return null;
  }

  /**
   * Hook to handle link clicks in rendered content
   * @param  {Contents} contents
   * @private
   */
  handleLinks(contents: Contents) {
    if (contents) {
      contents.on(EVENTS.CONTENTS.LINK_CLICKED, (href: any) => {
        let relative = this.book.path.relative(href);
        this.display(relative);
      });
    }
  }

  /**
   * Hook to handle injecting stylesheet before
   * a Section is serialized
   * @param  {document} doc
   * @param  {Section} section
   * @private
   */
  injectStylesheet(doc: Document, section: Section) {
    let style = doc.createElement("link");
    style.setAttribute("type", "text/css");
    style.setAttribute("rel", "stylesheet");
    style.setAttribute("href", this.settings.stylesheet);
    doc.getElementsByTagName("head")[0].appendChild(style);
  }

  /**
   * Hook to handle injecting scripts before
   * a Section is serialized
   * @param  {document} doc
   * @param  {Section} section
   * @private
   */
  injectScript(
    doc: {
      createElement: (arg0: string) => any;
      getElementsByTagName: (
        arg0: string
      ) => { appendChild: (arg0: any) => void }[];
    },
    section: any
  ) {
    let script = doc.createElement("script");
    script.setAttribute("type", "text/javascript");
    script.setAttribute("src", this.settings.script);
    script.textContent = " "; // Needed to prevent self closing tag
    doc.getElementsByTagName("head")[0].appendChild(script);
  }

  /**
   * Hook to handle the document identifier before
   * a Section is serialized
   * @param  {document} doc
   * @param  {Section} section
   * @private
   */
  injectIdentifier(
    doc: {
      createElement: (arg0: string) => any;
      getElementsByTagName: (
        arg0: string
      ) => { appendChild: (arg0: any) => void }[];
    },
    section: any
  ) {
    let ident = this.book.packaging.metadata.identifier;
    let meta = doc.createElement("meta");
    meta.setAttribute("name", "dc.relation.ispartof");
    if (ident) {
      meta.setAttribute("content", ident);
    }
    doc.getElementsByTagName("head")[0].appendChild(meta);
  }
}

//-- Enable binding events to Renderer
//EventEmitter(Rendition.prototype)

export default Rendition;

// export type { Rendition }
