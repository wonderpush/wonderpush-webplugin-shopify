(function () {

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
   */
  /**
   * The WonderPush JavaScript SDK instance.
   * @external WonderPushPluginSDK
   * @see {@link https://wonderpush.github.io/wonderpush-javascript-sdk/latest/WonderPushPluginSDK.html|WonderPush JavaScript Plugin SDK reference}
   */
  WonderPush.registerPlugin("shopify", {
    window: function (WonderPushSDK, options) {
      window.WonderPush = window.WonderPush || [];
      var translations = {
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
      var _ = function (text) {
        var language = (navigator.language || '').split('-')[0];
        if (translations.hasOwnProperty(language) && translations[language][text]) return translations[language][text];
        return text;
      };
      var defaultMessage = _('Order before it\'s too late!');

      var cartClient = new function() {
        this.get = function() {
          return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.onload = function() {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
                return;
              }
              reject(new Error('Invalid response'));
            };
            xhr.onerror = function(error) {
              reject(error);
            };
            xhr.open('GET', '/cart.js');
            xhr.send();
          });
        };
      }();

      var cartReminder = new function(frequency) {

        // We'll call update() every (frequency)ms
        if (!frequency) frequency = 3000;

        // for unsubscribed users, we'll update() every
        // (frequency * unsubscribedFrequencyMultiple) ms
        // instead of (frequency)ms for subscribed users.
        var unsubscribedFrequencyMultiple = 10;

        var timeoutId;
        var running = false;

        this.start = function() {
          var runNumber = 0;
          var run = function() {
            runNumber += 1;
            var next = function() { setTimeout(run, frequency); };
            if (!running) return;
            if (!window.WonderPush.isSubscribedToNotifications) {
              next();
              return;
            }
            window.WonderPush.isSubscribedToNotifications()
              .then(function(isSubscribed) {
                if (isSubscribed) this.update().then(next, next);
                else {
                  if (runNumber % unsubscribedFrequencyMultiple === 1) {
                    this.update().then(next, next);
                  } else {
                    next();
                  }
                }
              }.bind(this));
          }.bind(this);

          running = true;
          if (timeoutId) return;
          run();
        }.bind(this);

        this.stop = function() {
          running = false;
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }.bind(this);

        var propertiesFromCart = function(cart) {
          var products = cart && cart.items || [];
          if (!products.length) {
            return {
              string_cartReminderProductName: null,
              string_cartReminderMessage: null,
              string_cartReminderUrl: null,
              string_cartReminderPictureUrl: null,
            };
          }
          var product;
          switch(options.cartReminderStrategy || 'latest') {
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

          var url;
          switch(options.cartReminderDestination || 'cart') {
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
          var utmParameters = [];
          ['source', 'medium', 'campaign'].forEach(function(x) {
            var optionKey = 'cartReminderUTM' + x.substr(0, 1).toUpperCase() + x.substr(1);
            if (!options[optionKey]) return;
            utmParameters.push('utm_'+x+'='+encodeURIComponent(options[optionKey]));
          });
          switch (options.cartReminderUTMContent) {
            case 'product-name':
              if (product && product.product_title) utmParameters.push('utm_content='+encodeURIComponent(product.product_title));
              break;
          }
          if (utmParameters.length && url) {
            url.search = (url.search ? url.search + '&' : '?') + utmParameters.join('&');
          }
          // Finally, if there's a discount code, go redeem and redirect
          if (options.cartReminderDiscountCode) {
            var discountUrl = new URL('/discount/' + encodeURIComponent(options.cartReminderDiscountCode), window.location);
            var relativeHref = url.pathname;
            // Url in the form /discount/CODE?redirect=/foo/bar&rest=of&the=query
            // Redirects to /foo/bar?rest=of&the=query
            // In other words, don't include the query string in the encodeURIComponent, append instead
            discountUrl.search = '?redirect=' + encodeURIComponent(relativeHref) + (url.search && '&' + url.search.substr(1));
            url = discountUrl;
          }
          return {
            string_cartReminderProductName: product.product_title || null,
            string_cartReminderMessage: options && options.cartReminderMessage || defaultMessage,
            string_cartReminderUrl: url.href,
            string_cartReminderPictureUrl: options.cartReminderDisableImage ? null : product.image || null,
          };
        };
        this.update = function() {
          return cartClient.get()
            .then(function(cart) {
              window.WonderPush.push(function() {
                var properties = propertiesFromCart(cart);
                window.WonderPush.putProperties(properties);
              });
            });
        }.bind(this);
      }();

      if (!options.disableCartReminder) cartReminder.start();
    }
  });
})();
