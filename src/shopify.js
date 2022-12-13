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

  class ProductHelper {

    cleanup(s) {
      return (s||"").replace(/^https?:\/\/schema.org\//, '');
    }

    cleanupDateString(dateString) {
      if (!dateString) return undefined;
      try {
        const d = new Date(dateString);
        if (isNaN(d)) return undefined;
        return d.toISOString();
      } catch (e) {}
    }

    sanitize(s) {
      if (!s) return s;
      const stripped = s.replace(/(<([^>]+)>)/gi, "");
      return stripped.length > 120 ? stripped.substring(0, 119) + '…' : stripped;
    }

    ensureProtocol(url) {
      if (url && url.startsWith('//')) return 'https:' + url;
      return url;
    }

    async getCurrentProductJson() {
      return this.getCurrentJsonLdProductJson() // Prefer JSON-LD as it has currency info and is faster (doesn't require AJAX)
        || (await this.getCurrentShopifyProductJson());
    }

    async getCurrentShopifyProductJson() {
      const productUrlRegex = /^https:\/\/.+\/products\/[^\/]+$/;
      if (!window.location.href.match(productUrlRegex)) return null;
      const url = window.location.href + '.js';
      const response = await fetch(url);
      if (!response.ok) return null;
      const product = await response.json();
      const images = [product.featured_image, ...(product.images || [])]
        .filter(x => !!x)
        .map(x => this.ensureProtocol(x));
      const variant = (product.variants || [])[0];
      return ({
        string_type: 'Product',
        string_image: images[0],
        string_name: this.sanitize(product.title),
        string_description: this.sanitize(product.description),
        string_sku: variant?.sku,
        string_gtin13: variant.barcode,
        object_offers: {
          string_type: 'Offer',
          float_price: (variant?.price || product.price || 0) / 100, // Price is in cents
          string_priceCurrency: undefined, // Not provided
          date_priceValidUntil: undefined, // Not provided
          string_url: new URL(product.url, window.location.href).href,
          string_itemCondition: undefined, // Not provided
          string_availability: product.available ? 'InStock' : 'OutOfStock',
        },
        object_brand: {
          string_name: product.vendor,
          string_type: 'Brand',
        },
      });
    }

    getCurrentJsonLdProductJson() {
      const product = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .flatMap(function(node) {
          try {
            let textContent = node.textContent || '';
            // Replace line breaks with spaces to make parsing more robust
            textContent = textContent.replace(/\n+/g, ' ');
            return JSON.parse(textContent);
          } catch (e) {
            console.warn('[WonderPush] unable to parse ld+json data, e-commerce features might not work as expected', e);
          }
          return null;
        })
        .filter(x => !!x)
        .find((jsonLd) => (jsonLd['@type'] === 'Product' || jsonLd['@type'] === 'http://schema.org/Product'));
      if (!product) return null;
      const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      let price = parseFloat(offer?.price);
      if (isNaN(price)) price = null;
      return ({
        string_type: product['@type'],
        string_image: (
          (product.image && Array.isArray(product.image)) ? (product.image.length && product.image[0]) : (typeof product.image === 'string' ? product.image : undefined)
        ) || undefined,
        string_name: this.sanitize(product.name),
        string_description: this.sanitize(product.description),
        string_sku: product.sku,
        string_gtin13: product.gtin13,
        object_offers: offer ? {
          string_type: offer['@type'],
          float_price: price,
          string_priceCurrency: offer.priceCurrency,
          date_priceValidUntil: this.cleanupDateString(offer.priceValidUntil),
          string_url: offer.url,
          string_itemCondition: this.cleanup(offer.itemCondition),
          string_availability: this.cleanup(offer.availability),
        } : undefined,
        object_brand: product.brand ? {
          string_name: product.brand.name || undefined,
          string_type: product.brand['@type'] || undefined,
        } : undefined,
      });
    }

  }

  class EventHelper {

    constructor() {
      this.lastExitEventDate = null;
      this.lastExitEventUrl = null;
      this.lastEventTracked = null;
    }

    trackEvent(type, data) {
      // Discard duplicate events
      if (this.lastEventTracked &&
        this.lastEventTracked.type === type
        && this.lastEventTracked.data
        && this.lastEventTracked.data.object_product
        && this.lastEventTracked.data.object_product.string_sku
        && data && data.object_product
        && data.object_product.string_sku === this.lastEventTracked.data.object_product.string_sku) {
        return;
      }
      this.lastEventTracked = { type: type, data: data };
      window.WonderPush.push(['trackEvent', type, data]);
    }

    trackExitEvent(product) {
      if (!product) return;

      // Fire at-most every 5 minutes for a given url
      if (this.lastExitEventUrl === window.location.href
        && this.lastExitEventDate
        && (+new Date() - this.lastExitEventDate.getTime()) < 5 * 60000) {
        return;
      }
      this.lastExitEventDate = new Date();
      this.lastExitEventUrl = window.location.href;
      this.trackEvent('Exit', {
        object_product: product,
        string_url: window.location.href,
      });
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

      const eventHelper = new EventHelper();
      const productHelper = new ProductHelper();

      document.addEventListener('mouseout', function(e) {
        if (!e.toElement && !e.relatedTarget) {
          productHelper.getCurrentProductJson()
            .then((product) => {
              eventHelper.trackExitEvent(product);
            });
        }
      });
    }
  });
})();
