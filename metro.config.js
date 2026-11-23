const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// The Node backend lives in ./backend — keep it out of the app bundle.
const backendDir = path.resolve(__dirname, 'backend').replace(/[/\\]/g, '[/\\\\]');
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`${backendDir}[/\\\\].*`),
];
config.watchFolders = (config.watchFolders ?? []).filter((f) => !f.startsWith(path.resolve(__dirname, 'backend')));

// Web support for expo-sqlite: wasm assets
config.resolver.assetExts.push('wasm');

// COEP and COOP headers to support SharedArrayBuffer (web only)
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;
