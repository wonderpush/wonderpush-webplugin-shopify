(function () {

  const translations = {
    "fr": {
      "Order before it's too late!": "Commandez avant qu'il ne soit trop tard !",
    },
    "es": {
      "Order before it's too late!": "¡Ordene antes de que sea demasiado tarde!",
    },
    "it": {
      "Order before it's too late!": "Ordina prima che sia troppo tardi!",
    },
    "pt": {
      "Order before it's too late!": "Encomende antes que seja tarde demais!",
    },
    "de": {
      "Order before it's too late!": "Bestellen, bevor es zu spät ist!",
    },
  };
  /**
   * Translates the given text
   * @param text
   * @returns {*}
   */
  const _ = function (text) {
    const language = (navigator.language || '').split('-')[0];
    if (translations.hasOwnProperty(language) && translations[language][text]) return translations[language][text];
    return text;
  };

  class ShopfiyClient {

    get root() {
      return window.Shopify?.routes?.root || '/';
    }

    getCart() {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
            return;
          }
          reject(new Error('Invalid response'));
        };
        xhr.onerror = (error) => {
          reject(error);
        };
        xhr.open('GET',  this.root + 'cart.js');
        xhr.send();
      });
    }

  }

  class CartReminder {
    /**
     *
     * @param {Shopify.Options} options
     * @param frequency
     */
    constructor(options, frequency = 3000) {
      this.options = options;
      this.client = new ShopfiyClient();
      // We'll call update() every (frequency)ms
      this.frequency = frequency;
      // for unsubscribed users, we'll update() every
      // (frequency * unsubscribedFrequencyMultiple) ms
      // instead of (frequency)ms for subscribed users.
      this.unsubscribedFrequencyMultiple = 10;
      // State of things
      this.running = false;
      this.timeoutId = undefined;
    }

    start() {
      let runNumber = 0;
      const run = () => {
        runNumber += 1;
        const next = () => setTimeout(run, this.frequency);
        if (!this.running) return;
        if (!window.WonderPush.isSubscribedToNotifications) {
          next();
          return;
        }
        window.WonderPush.isSubscribedToNotifications()
          .then((isSubscribed) => {
            if (isSubscribed) this.update().then(next, next);
            else {
              if (runNumber % this.unsubscribedFrequencyMultiple === 1) {
                this.update().then(next, next);
              } else {
                next();
              }
            }
          });
      };
      this.running = true;
      if (this.timeoutId) return;
      run();
    }

    stop() {
      this.running = false;
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
    }

    update() {
      return this.client.getCart()
        .then((cart) => {
          window.WonderPush.push(() => {
            const properties = this.propertiesFromCart(cart);
            window.WonderPush.putProperties(properties);
          });
        });
    }

    propertiesFromCart(cart) {
      const products = cart && cart.items || [];
      if (!products.length) {
        return {
          string_cartReminderProductName: null,
          string_cartReminderMessage: null,
          string_cartReminderUrl: null,
          string_cartReminderPictureUrl: null,
        };
      }
      let product;
      switch(this.options.cartReminderStrategy || 'latest') {
        case 'most-expensive':
          products.forEach(function(p) {
            if (!product) product = p;
            else if (p.final_line_price >= product.final_line_price) product = p;
          });
          break;
        case 'least-expensive':
          products.forEach(function(p) {
            if (!product) product = p;
            else if (p.final_line_price <= product.final_line_price) product = p;
          });
          break;
        case 'latest':
        default:
          product = products[0]; // Yes, latest is the first item in shopify's list.
          break;
      }

      let url;
      switch(this.options.cartReminderDestination || 'cart') {
        case 'product':
          url = new URL(product.url, window.location);
          break;
        case 'cart':
          url = new URL('/cart', window.location);
          break;
        case 'homepage':
          url = new URL('/', window.location);
          break;
        case 'checkout':
          url = new URL('/checkout', window.location);
          break;
      }

      // utm params
      const utmParameters = [];
      ['source', 'medium', 'campaign'].forEach((x) => {
        const optionKey = 'cartReminderUTM' + x.substring(0, 1).toUpperCase() + x.substring(1);
        if (!this.options[optionKey]) return;
        utmParameters.push('utm_'+x+'='+encodeURIComponent(this.options[optionKey]));
      });
      switch (this.options.cartReminderUTMContent) {
        case 'product-name':
          if (product && product.product_title) utmParameters.push('utm_content='+encodeURIComponent(product.product_title));
          break;
      }
      if (utmParameters.length && url) {
        url.search = (url.search ? url.search + '&' : '?') + utmParameters.join('&');
      }
      // Finally, if there's a discount code, go redeem and redirect
      if (this.options.cartReminderDiscountCode) {
        const discountUrl = new URL('/discount/' + encodeURIComponent(this.options.cartReminderDiscountCode), window.location);
        const relativeHref = url.pathname;
        // Url in the form /discount/CODE?redirect=/foo/bar&rest=of&the=query
        // Redirects to /foo/bar?rest=of&the=query
        // In other words, don't include the query string in the encodeURIComponent, append instead
        discountUrl.search = '?redirect=' + encodeURIComponent(relativeHref) + (url.search && '&' + url.search.substring(1));
        url = discountUrl;
      }
      const defaultMessage = _('Order before it\'s too late!');
      return {
        string_cartReminderProductName: product.product_title || null,
        string_cartReminderMessage: this.options && this.options.cartReminderMessage || defaultMessage,
        string_cartReminderUrl: url.href,
        string_cartReminderPictureUrl: this.options.cartReminderDisableImage ? null : product.image || null,
      };
    }

  }

  /**
   * WonderPush Shopify plugin
   * @class Shopify
   * @param {external:WonderPushPluginSDK} WonderPushSDK - The WonderPush SDK instance provided automatically on intanciation.
   * @param {Shopify.Options} options - The plugin options.
   */
  /**
   * @typedef {Object} Shopify.Options
   * @property {Boolean} [disableCartReminder] - Set to true to disable cart reminder. Defaults to false.
   * @property {String} [cartReminderStrategy] - Sets the title of the cart reminder push notification to the latest, least or most expensive product in the cart. Valid values are 'latest', 'most-expensive' and 'least-expensive'. Defaults to 'latest'
   * @property {String} [cartReminderMessage] - Sets the message of the cart reminder push notification. Defaults to “Order before it's too late!”.
   * @property {String} [cartReminderDestination] - Determines where the user is taken upon cart reminder push notification click. Valid values are 'homepage', 'cart', 'checkout'. Defaults to 'cart'.
   * @property {String} [cartReminderDisableImage] - When true, the product image is not added to the notification. Defaults to false.
   * @property {String} [cartReminderDiscountCode] - A discount code to be applied on cart reminder notification click.
   * @property {String} [cartReminderUTMSource] - A discount code to be applied on cart reminder notification click.
   * @property {String} [cartReminderUTMMedium] - A discount code to be applied on cart reminder notification click.
   * @property {String} [cartReminderUTMCampaign] - A discount code to be applied on cart reminder notification click.
   * @property {String} [cartReminderUTMContent] - A discount code to be applied on cart reminder notification click.
   */
  /**
   * The WonderPush JavaScript SDK instance.
   * @external WonderPushPluginSDK
   * @see {@link https://wonderpush.github.io/wonderpush-javascript-sdk/latest/WonderPushPluginSDK.html|WonderPush JavaScript Plugin SDK reference}
   */
  WonderPush.registerPlugin("shopify", {
    window: function (WonderPushSDK, options) {
      window.WonderPush = window.WonderPush || [];
      if (!options.disableCartReminder) (new CartReminder(options)).start();
    }
  });
})();
