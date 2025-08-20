"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREFERENCES_CACHE_DURATION = exports.DEFAULT_USER_PREFERENCES = exports.CACHE_DURATION = void 0;
// Auth
__exportStar(require("./auth"), exports);
// Components
__exportStar(require("./components"), exports);
// Data
__exportStar(require("./data"), exports);
// Stores (исключаем дублирующиеся типы)
__exportStar(require("./stores/csrf"), exports);
__exportStar(require("./stores/notification"), exports);
__exportStar(require("./stores/step"), exports);
__exportStar(require("./stores/timer"), exports);
__exportStar(require("./stores/training"), exports);
var userStore_1 = require("./stores/userStore");
Object.defineProperty(exports, "CACHE_DURATION", { enumerable: true, get: function () { return userStore_1.CACHE_DURATION; } });
Object.defineProperty(exports, "DEFAULT_USER_PREFERENCES", { enumerable: true, get: function () { return userStore_1.DEFAULT_USER_PREFERENCES; } });
Object.defineProperty(exports, "PREFERENCES_CACHE_DURATION", { enumerable: true, get: function () { return userStore_1.PREFERENCES_CACHE_DURATION; } });
// Utils
__exportStar(require("./utils"), exports);
// Pages
__exportStar(require("./pages"), exports);
// Error Handling
__exportStar(require("./error-handling"), exports);
// Offline
__exportStar(require("./offline"), exports);
// Error Reporting
__exportStar(require("./error-reporting"), exports);
// SWR
__exportStar(require("./swr"), exports);
// Собственные типы (заменяют зависимости от фреймворков)
__exportStar(require("./types"), exports);
