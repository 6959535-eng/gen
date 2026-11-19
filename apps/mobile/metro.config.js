const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');
// Веб-перегляд (лише розробка): expo-sqlite у браузері працює через wasm
config.resolver.assetExts.push('wasm');

module.exports = config;
