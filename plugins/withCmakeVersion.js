// Makes the Android app's native (C++) build use a newer CMake whose ninja supports
// Windows long paths. The default CMake 3.22.1 ships ninja 1.10, which fails on Windows with
// "ninja: error: mkdir(...): No such file or directory" once paths exceed 260 characters.
// (Windows long paths must also be enabled: LongPathsEnabled = 1.)
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withCmakeVersion(config, { version = '3.31.6' } = {}) {
  return withAppBuildGradle(config, (cfg) => {
    const marker = '// @generated withCmakeVersion';
    let src = cfg.modResults.contents;
    if (!src.includes(marker)) {
      src = src.replace(
        /\nandroid\s*\{/,
        `\nandroid {\n    ${marker}\n    externalNativeBuild {\n        cmake {\n            version "${version}"\n        }\n    }\n`
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
