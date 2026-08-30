"use strict";
(function () {
  if (!Array.prototype.includes) {
    Array.prototype.includes = function (value, fromIndex) {
      return this.indexOf(value, fromIndex || 0) !== -1;
    };
  }
  if (!Array.prototype.flat) {
    Array.prototype.flat = function (depth) {
      var input = this;
      var maxDepth = depth === undefined ? 1 : Number(depth) || 0;
      var output = [];
      function flatten(array, level) {
        for (var i = 0; i < array.length; i += 1) {
          if (!(i in array)) continue;
          var value = array[i];
          if (Array.isArray(value) && level > 0) flatten(value, level - 1);
          else output.push(value);
        }
      }
      flatten(input, maxDepth);
      return output;
    };
  }
  if (!Array.prototype.flatMap) {
    Array.prototype.flatMap = function (callback, thisArg) {
      return Array.prototype.map.call(this, callback, thisArg).flat(1);
    };
  }
  if (!String.prototype.includes) {
    String.prototype.includes = function (value, start) {
      return this.indexOf(value, start || 0) !== -1;
    };
  }
  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (value, start) {
      start = start || 0;
      return this.substr(start, value.length) === value;
    };
  }
  if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (value) {
      return this.slice(-value.length) === value;
    };
  }
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (searchValue, replaceValue) {
      var source = String(this);
      if (searchValue instanceof RegExp) {
        if (!searchValue.global) throw new TypeError("replaceAll requires a global RegExp");
        return source.replace(searchValue, replaceValue);
      }
      var search = String(searchValue);
      if (search === "") {
        var parts = source.split("");
        var replacement = typeof replaceValue === "function" ? replaceValue("") : String(replaceValue);
        return replacement + parts.join(replacement) + replacement;
      }
      if (typeof replaceValue === "function") {
        var result = "";
        var index = 0;
        var found;
        while ((found = source.indexOf(search, index)) !== -1) {
          result += source.slice(index, found) + replaceValue(search, found, source);
          index = found + search.length;
        }
        return result + source.slice(index);
      }
      return source.split(search).join(String(replaceValue));
    };
  }
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (targetLength, padString) {
      var source = String(this);
      var length = targetLength >> 0;
      var pad = padString === undefined ? " " : String(padString);
      if (source.length >= length || pad === "") return source;
      var needed = length - source.length;
      while (pad.length < needed) pad += pad;
      return pad.slice(0, needed) + source;
    };
  }
  if (!String.prototype.padEnd) {
    String.prototype.padEnd = function (targetLength, padString) {
      var source = String(this);
      var length = targetLength >> 0;
      var pad = padString === undefined ? " " : String(padString);
      if (source.length >= length || pad === "") return source;
      var needed = length - source.length;
      while (pad.length < needed) pad += pad;
      return source + pad.slice(0, needed);
    };
  }
  if (!Object.entries) {
    Object.entries = function (object) {
      return Object.keys(object).map(function (key) { return [key, object[key]]; });
    };
  }
  if (!Object.values) {
    Object.values = function (object) {
      return Object.keys(object).map(function (key) { return object[key]; });
    };
  }
  if (!Object.fromEntries) {
    Object.fromEntries = function (entries) {
      var output = {};
      Array.prototype.forEach.call(entries || [], function (entry) {
        output[entry[0]] = entry[1];
      });
      return output;
    };
  }
  if (!Object.getOwnPropertyDescriptors) {
    Object.getOwnPropertyDescriptors = function (object) {
      var output = {};
      Object.getOwnPropertyNames(object).forEach(function (key) {
        output[key] = Object.getOwnPropertyDescriptor(object, key);
      });
      if (Object.getOwnPropertySymbols) {
        Object.getOwnPropertySymbols(object).forEach(function (key) {
          output[key] = Object.getOwnPropertyDescriptor(object, key);
        });
      }
      return output;
    };
  }
  if (!Number.isFinite) {
    Number.isFinite = function (value) {
      return typeof value === "number" && isFinite(value);
    };
  }
  if (!Number.isNaN) {
    Number.isNaN = function (value) { return value !== value; };
  }
  if (window.Promise && !Promise.prototype.finally) {
    Promise.prototype.finally = function (callback) {
      var P = this.constructor || Promise;
      return this.then(
        function (value) { return P.resolve(callback()).then(function () { return value; }); },
        function (reason) { return P.resolve(callback()).then(function () { throw reason; }); }
      );
    };
  }
  if (window.Promise && !Promise.allSettled) {
    Promise.allSettled = function (items) {
      return Promise.all(Array.prototype.map.call(items || [], function (item) {
        return Promise.resolve(item).then(
          function (value) { return { status: "fulfilled", value: value }; },
          function (reason) { return { status: "rejected", reason: reason }; }
        );
      }));
    };
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = function () {};
    window.ResizeObserver.prototype.observe = function () {};
    window.ResizeObserver.prototype.unobserve = function () {};
    window.ResizeObserver.prototype.disconnect = function () {};
  }
  if (!window.AbortController) {
    window.AbortController = function () { this.signal = undefined; };
    window.AbortController.prototype.abort = function () {};
  }
  if (!window.structuredClone) {
    window.structuredClone = function (value) {
      return JSON.parse(JSON.stringify(value));
    };
  }
  if (window.Element && !Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
  }
  if (window.Element && !Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var element = this;
      while (element && element.nodeType === 1) {
        if (element.matches && element.matches(selector)) return element;
        element = element.parentElement || element.parentNode;
      }
      return null;
    };
  }
  if (!window.Headers) {
    window.Headers = function (initial) {
      this.map = {};
      var self = this;
      if (initial) {
        if (typeof initial.forEach === "function") {
          initial.forEach(function (value, key) { self.set(key, value); });
        } else {
          Object.keys(initial).forEach(function (key) { self.set(key, initial[key]); });
        }
      }
    };
    window.Headers.prototype.set = function (key, value) {
      this.map[String(key).toLowerCase()] = String(value);
    };
    window.Headers.prototype.get = function (key) {
      return this.map[String(key).toLowerCase()] || null;
    };
    window.Headers.prototype.forEach = function (callback) {
      var self = this;
      Object.keys(this.map).forEach(function (key) { callback(self.map[key], key); });
    };
  }
  if (!window.fetch) {
    window.fetch = function (input, init) {
      init = init || {};
      return new Promise(function (resolve, reject) {
        var url = typeof input === "string" ? input : input.url;
        var method = String(init.method || "GET").toUpperCase();
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.withCredentials = init.credentials !== "omit";
        var headers = new Headers(init.headers || {});
        headers.forEach(function (value, key) {
          try { xhr.setRequestHeader(key, value); } catch (error) {}
        });
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          var response = {
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            statusText: xhr.statusText,
            url: url,
            text: function () { return Promise.resolve(xhr.responseText || ""); },
            json: function () {
              try {
                return Promise.resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {});
              } catch (error) {
                return Promise.reject(error);
              }
            }
          };
          resolve(response);
        };
        xhr.onerror = function () { reject(new TypeError("Network request failed")); };
        xhr.send(init.body !== undefined ? init.body : null);
      });
    };
  }
})();
