// Metro configuration.
//
// The Firebase JS SDK registers its Auth component as an import side-effect.
// Modern Metro enables package "exports" resolution by default, which resolves
// Firebase to an ESM build where that registration is dropped — causing the
// runtime crash: "Component auth has not been registered yet".
//
// Disabling unstable_enablePackageExports and adding the .cjs source extension
// forces Metro to load Firebase's CommonJS entry points, which register Auth
// correctly. This is the standard fix for Firebase Auth on Expo/React Native.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
