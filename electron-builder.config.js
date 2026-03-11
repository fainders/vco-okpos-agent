const type = process.env.BUILD_TYPE || 'dev';
const { version } = require('./package.json');

const config = {
  dev: {
    "appId": "ai.fainders.vcookposagentdev",
    "productName": "VCO OKPOS Agent Dev",
    "directories": {
      "output": `FAI VCO OKPOS Agent Dev v${version}`
    },
  },
  prd: {
    "appId": "ai.fainders.vcookposagent",
    "productName": "VCO OKPOS Agent",
    "directories": {
      "output": `FAI VCO OKPOS Agent v${version}`
    },
    "publish": {
      "provider": "github",
      "owner": "fainders",
      "repo": "vco-okpos-agent",
      "releaseType": "release"
    },
  },
  qa: {
    "appId": "ai.fainders.vcookposagentqa",
    "productName": "VCO OKPOS Agent QA",
    "directories": {
      "output": `FAI VCO OKPOS Agent QA v${version}`
    },
  },
  local: {
    "appId": "ai.fainders.vcookposagentlocal",
    "productName": "VCO OKPOS Agent Local",
    "directories": {
      "output": `FAI VCO OKPOS Agent Local v${version}`
    },
  },
};

const baseConfig = {
    "files": [
      "dist/**",
      "package.json"
    ],
     "asar": true,
    "asarUnpack": [
      "node_modules/koffi/build/koffi",
      "dist/src/dll/*.dll",
      "dist/src/dllProcess",
      "dist/src/overlay"
    ],
    "extraResources": [
      {
        "from": "src/assets",
        "to": "assets"
      },
      {
        "from": "src/package",
        "to": "package"
      }
    ],
    "nsis": {
      "oneClick": true,
      "perMachine": false,
      "createDesktopShortcut": false,
      "createStartMenuShortcut": true,
      "shortcutName": "VCO OKPOS Agent",
      "runAfterFinish": true
    },
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": [
            "ia32"
          ]
        }
      ],
      "icon": "src/assets/app-icon.png"
    },
  };

  module.exports = {
    ...baseConfig,
    ...config[type],
  }