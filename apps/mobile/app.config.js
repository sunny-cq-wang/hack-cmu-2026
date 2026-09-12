// app.json stays the source of truth; this file only substitutes the values that
// must agree with the runtime env, which static JSON cannot express.
//
// react-native-auth0's config plugin bakes `domain` into the AndroidManifest
// redirect activity (`android:host`). If that host disagrees with the domain the
// JS side authenticates against (EXPO_PUBLIC_AUTH0_DOMAIN, read in src/lib/config.ts),
// the browser comes back from Auth0 to an intent filter that matches nothing and
// login hangs. Keeping the two equal here is the only way they stay in sync.
module.exports = ({ config }) => {
  const domain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN?.trim();
  if (!domain) {
    return config;
  }
  const plugins = (config.plugins ?? []).map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'react-native-auth0'
      ? ['react-native-auth0', { ...plugin[1], domain }]
      : plugin,
  );
  return { ...config, plugins };
};
