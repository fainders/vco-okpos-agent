const type = process.env.BUILD_TYPE || 'dev';
const config = {
  dev: {
    "appId": "ai.fainders.vcookposagentdev",
    "productName": "VCO OKPOS Agent Dev",
    "directories": {
      "output": "FAI VCO OKPOS Agent Dev"
    },
  },
  prd: {
    "appId": "ai.fainders.vcookposagent",
    "productName": "VCO OKPOS Agent",
    "directories": {
      "output": "FAI VCO OKPOS Agent"
    },
  },
  qa: {
    "appId": "ai.fainders.vcookposagentqa",
    "productName": "VCO OKPOS Agent QA",
    "directories": {
      "output": "FAI VCO OKPOS Agent QA"
    },
  },
  local: {
    "appId": "ai.fainders.vcookposagentlocal",
    "productName": "VCO OKPOS Agent Local",
    "directories": {
      "output": "FAI VCO OKPOS Agent Local"
    },
  },
};

const baseConfig = {
      "files": [
      "dist/**/*",
      "package.json"
    ],
     "asar": true,
    "asarUnpack": [
      "node_modules/koffi/build/koffi",
      "dist/src/dll/*.dll",
      "dist/src/dllProcess"
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
    "win": {
      "target": [
        {
          "target": "portable",
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