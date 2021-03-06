/*!
 * Cookies.js - 0.4.0
 *
 * Copyright (c) 2014, Scott Hamper
 * Licensed under the MIT license,
 * http://www.opensource.org/licenses/MIT
 */

var Cookies = function (key, value, options) {
    return arguments.length === 1 ?
        Cookies.get(key) : Cookies.set(key, value, options);
};

var ssl = window.location.protocol.toLowerCase() === 'https:';

// Allows for setter injection in unit tests
Cookies._document = document;
Cookies._navigator = navigator;

Cookies.defaults = {
    path: '/',
    same_site: ssl ? 'None' : 'Lax'
};

Cookies.get = function (key) {
    if (Cookies._cachedDocumentCookie !== Cookies._document.cookie) {
        Cookies._renewCache();
    }

    return Cookies._cache[key];
};

Cookies.set = function (key, value, options) {
    options = Cookies._getExtendedOptions(options);
    options.expires = Cookies._getExpiresDate(value === undefined ? -1 : options.expires);

    Cookies._document.cookie = Cookies._generateCookieString(key, value, options);

    return Cookies;
};

Cookies.expire = function (key, options) {
    return Cookies.set(key, undefined, options);
};

Cookies._getExtendedOptions = function (options) {
    var same_site = options?.same_site || Cookies.defaults.same_site;
    var same_siteNone = same_site.toLowerCase() === 'none';
    var defaultSecure = (same_siteNone && ssl) || undefined;
    return {
        path: options?.path || Cookies.defaults.path,
        domain: options?.domain || Cookies.defaults.domain,
        expires: options?.expires || Cookies.defaults.expires,
        secure: options?.secure !== undefined ? options.secure : defaultSecure,
        same_site: same_site
    };
};

Cookies._isValidDate = function (date) {
    return Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date.getTime());
};

Cookies._getExpiresDate = function (expires, now) {
    now = now || new Date();
    switch (typeof expires) {
        case 'number': expires = new Date(now.getTime() + expires * 1000); break;
        case 'string': expires = new Date(expires); break;
    }

    if (expires && !Cookies._isValidDate(expires)) {
        throw new Error('`expires` parameter cannot be converted to a valid Date instance');
    }

    return expires;
};

Cookies._generateCookieString = function (key, value, options) {
    key = key.replace(/[^#$&+\^`|]/g, encodeURIComponent);
    key = key.replace(/\(/g, '%28').replace(/\)/g, '%29');
    value = (value + '').replace(/[^!#$&-+\--:<-\[\]-~]/g, encodeURIComponent);
    options = options || {};

    var cookieString = key + '=' + value;
    cookieString += options.path ? ';path=' + options.path : '';
    cookieString += options.domain ? ';domain=' + options.domain : '';
    cookieString += options.expires ? ';expires=' + options.expires.toUTCString() : '';
    cookieString += options.secure ? ';Secure' : '';
    cookieString += options.same_site ? ';SameSite=' + options.same_site : '';

    return cookieString;
};

Cookies._getCookieObjectFromString = function (documentCookie) {
    var cookieObject = {};
    var cookiesArray = documentCookie ? documentCookie.split('; ') : [];

    for (var i = 0; i < cookiesArray.length; i++) {
        var cookieKvp = Cookies._getKeyValuePairFromCookieString(cookiesArray[i]);

        if (cookieObject[cookieKvp.key] === undefined) {
            cookieObject[cookieKvp.key] = cookieKvp.value;
        }
    }

    return cookieObject;
};

// fix "URIError: malformed" error
Cookies.decodeURIComponentX = function (str) {
    var out = '', arr, i = 0, l, x;
    arr = str.split(/(%(?:D0|D1)%.{2})/);
    for ( l = arr.length; i < l; i++ ) {
        try {
            x = decodeURIComponent( arr[i] );
        } catch (e) {
            x = arr[i];
        }
        out += x;
    }
    return out
}

Cookies._getKeyValuePairFromCookieString = function (cookieString) {
    // "=" is a valid character in a cookie value according to RFC6265, so cannot `split('=')`
    var separatorIndex = cookieString.indexOf('=');

    // IE omits the "=" when the cookie value is an empty string
    separatorIndex = separatorIndex < 0 ? cookieString.length : separatorIndex;

    return {
        key: Cookies.decodeURIComponentX(cookieString.substr(0, separatorIndex)),
        value: Cookies.decodeURIComponentX(cookieString.substr(separatorIndex + 1))
    };
};

Cookies._renewCache = function () {
    Cookies._cache = Cookies._getCookieObjectFromString(Cookies._document.cookie);
    Cookies._cachedDocumentCookie = Cookies._document.cookie;
};

Cookies._areEnabled = function () {
    var testKey = 'cookies.js';
    var areEnabled = Cookies.set(testKey, 1).get(testKey) === '1';
    Cookies.expire(testKey);
    return areEnabled;
};

Cookies.enabled = Cookies._areEnabled();

export default Cookies
