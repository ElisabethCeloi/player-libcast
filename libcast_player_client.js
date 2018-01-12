/**
 * Libcast HTML5 Player JavaScript Client
 */

/**
 *
 * @param element
 * @param callback
 * @returns {Element}
 * @constructor
 */
function LibcastPlayer(element, callback) {
    /**
     *
     * @type {Element}
     */
    this.element = 'string' === typeof element ? document.getElementById(element) : element;

    /**
     *
     * @type {String}
     */
    this.url = lcvp.client.findUrl(this.element);

    /**
     *
     * @type {boolean}
     */
    this.isInitialized = false;

    /**
     *
     * @param event
     */
    this.emit = function (event) {
        // loaded event proves that the player e
        if ('loaded' === event.data.type) {
            this.init();
        }

        // Emit the event from the player
        var notification = document.createEvent('Event');
            notification.initEvent(event.data.type, true, true);
            notification.data = event.data;

        console.log('LibcastPlayer', 'emit', this.element, event);

        this.element.dispatchEvent(notification);

        // Set event values as player attributes when they are supported
        for (key in event.data.values) {
            lcvp.client.api.setAttribute(this, key, event.data.values[key]);
        }
    };

    /**
     *
     * @param command
     */
    this.exec = function (command) {
        // Enqueue commands until player is active
        if (!this.isInitialized) {
            lcvp.client.queue.add(command);
            return;
        }

        console.log('LibcastPlayer', 'exec', this.element, command);

        this.element.contentWindow.postMessage(command, '*');
    };

    /**
     * Initialize player
     * Must be called once the iFrame content has been loaded
     *
     */
    this.init = function () {
        this.isInitialized = true;

        lcvp.client.listener.init(this);
        lcvp.client.api.init(this);
    };

    // Add methods & attributes
    lcvp.client.api.setMethods(this);
    lcvp.client.api.setDefaultAttributes(this);

    // Register the player
    lcvp.client.registry.add(this);

    // Execute callback once object is constructed
    if ('function' === typeof callback) {
        callback(this.element);
        console.log('LibcastPlayer', 'callback', callback);
    }

    return this.element;
}

var lcvp = lcvp || {};

lcvp.client =
{
    /**
     *
     * @param element
     * @returns {String|null}
     */
    findUrl: function (element) {
        var url = null;
        if (element instanceof LibcastPlayer) {
            url = element.url;
        } else if (lcvp.client.listener.isValidEvent(element)) {
            url = element.data.url;
        } else if (lcvp.client.api.isValidCommand(element)) {
            url = element.url;
        } else if ('undefined' !== typeof element.src) {
            url = element.src;
        }

        if (null === url) {
            return null;
        }

        url = url.split('//');

        return url.pop();
    }
};

lcvp.client.api =
{
    /**
     * MediaElement (and some Libcast specific) object methods supported by the client
     *
     * @type {Array}
     */
    methods: ['play', 'pause', 'toggle', 'seek', 'mute', 'setVolume', 'chapter', 'subtitle'],

    /**
     * MediaElement object attributes supported by the client
     *
     * @type {Array}
     */
    attributes: ['volume', 'currentTime', 'duration'],

    /**
     * Add JavaScript methods to a given <iframe> element
     *
     * @param {LibcastPlayer} player
     */
    setMethods: function (player) {
        for (var i=0; i<this.methods.length; i++) {
            (function (object, method) {
                var element = object.element;

                // Do not overwrite methods
                if ('undefined' !== typeof element[method]) {
                    console.log('lcvp.client.api.setMethods', 'skip method');
                    return;
                }

                // Remove `set` from setters name
                var methodName = method;
                if (method.match(/^set[A-Z]/)) {
                    methodName = method.substr(3).toLowerCase();
                }

                element[method] = function (value) {
                    object.exec({
                        'url': lcvp.client.findUrl(player),
                        'type': methodName,
                        'value': 'undefined' !== typeof value ? value : null
                    });
                };

                console.log('lcvp.client.api.setMethods', element, method);

            })(player, this.methods[i])
        }
    },

    /**
     *
     * @param {LibcastPlayer} player
     */
    setDefaultAttributes: function (player) {
        for (var i=0; i<this.attributes.length; i++) {
            this.setAttribute(player, this.attributes[i], 0);
        }
    },

    /**
     *
     * @param {LibcastPlayer} player
     * @param key
     * @param value
     */
    setAttribute: function (player, key, value) {
        if (!this.isAttributeSupported(key)) {
            return;
        }

        var element = player.element;
            element[key] = value;

        console.log('lcvp.client.api.setAttribute', element, key, value);
    },

    /**
     *
     * @param key
     * @returns {boolean}
     */
    isAttributeSupported: function (key) {
        for (var i=0; i<this.attributes.length; i++) {
            if (key == this.attributes[i]) {
                return true;
            }
        }

        console.log('lcvp.client.api.isAttributeSupported', false);
        return false;
    },

    /**
     * Fetches all queued commands and execute them from the player
     *
     * @param {LibcastPlayer} player
     */
    init: function (player) {
        console.log('lcvp.client.api.init', player);

        lcvp.client.queue.consume(player, 'command', function (command) {
            lcvp.client.registry.get(lcvp.client.findUrl(command)).exec(command);
        });
    },

    /**
     *
     * @param command
     * @returns {boolean}
     */
    isValidCommand: function (command) {
        return !(null === command
            || 'undefined' === typeof command.url
            || 'undefined' === typeof command.type
            || 'undefined' === typeof command.value);
    }
};

lcvp.client.listener =
{
    start: function () {
        console.log('lcvp.client.listener', 'start');
        window.addEventListener('message', this.listen);
    },

    stop: function () {
        console.log('lcvp.client.listener', 'stop');
        window.removeEventListener('message', this.listen);
    },

    /**
     *
     * @param event
     */
    listen: function (event) {
        if (!lcvp.client.listener.isValidEvent(event)) {
            console.log('lcvp.client.listener', 'unsupported event', event);
            return;
        }

        console.log('lcvp.client.listener', 'new event', event);

        var url = lcvp.client.findUrl(event);

        if (lcvp.client.registry.has(url)) {
            // There is a registered player: use it!
            lcvp.client.registry.get(url).emit(event);
        } else {
            // Enqueue messages that have no notifier (yet?)
            lcvp.client.queue.add(event);
        }
    },

    /**
     * Emit every event that has been emitted before the registration
     *
     * @param {LibcastPlayer} player
     */
    init: function (player) {
        console.log('lcvp.client.listener.init', player);

        lcvp.client.queue.consume(player, 'event', function (event) {
            lcvp.client.registry.get(lcvp.client.findUrl(event)).emit(event);
        });
    },

    /**
     *
     * @param event
     * @returns {boolean}
     */
    isValidEvent: function (event) {
        return !(null === event
            || 'undefined' === typeof event.data
            || 'undefined' === typeof event.data.url
            || 'undefined' === typeof event.data.type);
    }
};

// Start listening to events as soon as possible
lcvp.client.listener.start();

lcvp.client.queue =
{
    queue: {},

    /**
     *
     * @param element
     */
    add: function (element) {
        var type = this.findType(element);
        if ('undefined' === typeof this.queue[type]) {
            this.queue[type] = [];
        }

        var url = lcvp.client.findUrl(element);
        if ('undefined' === typeof this.queue[type][url]) {
            this.queue[type][url] = [];
        }

        console.log('lcvp.client.queue', 'add', type, url, element);

        this.queue[type][url].push(element);
    },

    /**
     *
     * @param {LibcastPlayer} player
     * @param type
     * @returns {*}
     */
    list: function (player, type) {
        if ('undefined' === typeof this.queue[type]) {
            return [];
        }

        var url = lcvp.client.findUrl(player);
        if ('undefined' === typeof this.queue[type][url]) {
            return [];
        }

        console.log('lcvp.client.queue', 'list', type, url, this.queue[type][url]);

        return this.queue[type][url];
    },

    /**
     *
     * @param {LibcastPlayer} player
     * @param type
     * @returns {Number}
     */
    count: function (player, type) {
        return this.list(player, type).length;
    },

    /**
     *
     * @param {LibcastPlayer} player
     * @param type
     * @returns {boolean}
     */
    isEmpty: function (player, type) {
        return this.count(player, type) <= 0;
    },

    /**
     *
     * @param {LibcastPlayer} player
     * @param type
     * @returns {*}
     */
    fetch: function (player, type) {
        return this.queue[type][lcvp.client.findUrl(player)].shift();
    },

    /**
     *
     * @param {LibcastPlayer} player
     * @param type
     * @param {Function} callback
     */
    consume: function (player, type, callback) {
        while (!this.isEmpty(player, type)) {
            var element = this.fetch(player, type);

            console.log('lcvp.client.queue.consume', player, type, element);

            callback(element);
        }
    },

    /**
     *
     * @param element
     * @returns {String|null}
     */
    findType: function (element) {
        if (lcvp.client.listener.isValidEvent(element)) {
            return 'event';
        } else if (lcvp.client.api.isValidCommand(element)) {
            return 'command';
        } else {
            return 'unknown';
        }
    }
};

lcvp.client.registry =
{
    players: [],

    /**
     *
     * @param {LibcastPlayer} player
     */
    add: function (player) {
        console.log('lcvp.client.registry.add', player);
        this.players.push(player);
    },

    /**
     *
     * @param url
     * @returns {boolean}
     */
    has: function (url) {
        console.log('lcvp.client.registry.has', url, this.players);
        for (var i=0; i<this.players.length; i++) {
            console.log('lcvp.client.registry.has', i, lcvp.client.findUrl(this.players[i]));
            if (url == lcvp.client.findUrl(this.players[i])) {
                console.log('lcvp.client.registry.has', 'found', this.players[i]);
                return true;
            }
        }

        return false;
    },

    /**
     *
     * @param url
     * @returns {LibcastPlayer}
     */
    get: function (url) {
        for (var i=0; i<this.players.length; i++) {
            if (url == lcvp.client.findUrl(this.players[i])) {
                console.log('lcvp.client.registry.get', url, this.players[i]);
                return this.players[i];
            }
        }

        return null;
    }
};
