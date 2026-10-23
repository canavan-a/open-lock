module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Must stay last: compiles 'worklet' functions for the UI thread.
  plugins: ['react-native-reanimated/plugin'],
};
