"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
var pino_1 = __importDefault(require("pino"));
// Create the global logger
exports.logger = (0, pino_1.default)({
    level: 'info',
    base: undefined,
    timestamp: function () { return ",\"time\":\"".concat(new Date().toISOString(), "\""); },
    formatters: {
        level: function (label) {
            return { level: label };
        },
    }
});
exports.default = exports.logger;
