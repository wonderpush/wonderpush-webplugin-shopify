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
   * @property {String} [cartReminderDestination] - Determines where the user is taken upon cart reminder push notification click. Valid values are 'homepage', 'cart', 'checked'. Defaults to 'cart'.
   * @property {String} [cartReminderDisableImage] - When true, the product image is not added to the notification. Defaults to false.
   */
  /**
   * The WonderPush JavaScript SDK instance.
   * @external WonderPushPluginSDK
   * @see {@link https://wonderpush.github.io/wonderpush-javascript-sdk/latest/WonderPushPluginSDK.html|WonderPush JavaScript Plugin SDK reference}
   */
  WonderPush.registerPlugin("shopify", {
    window: function OptinBell(WonderPushSDK, options) {
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

      console.log('[wonderpush-shopify] ready', options);
    }
  });
})();
