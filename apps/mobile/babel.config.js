module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 ships its worklet transform via react-native-worklets.
    plugins: ['react-native-worklets/plugin'],
  };
};
