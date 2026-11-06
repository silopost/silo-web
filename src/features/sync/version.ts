/** Version of this silo-web and the page reload of the version banner; tests replace both. */
export const versionConfig = {
  appVersion: __APP_VERSION__,
  reload: () => window.location.reload(),
};
