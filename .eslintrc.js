require("@rushstack/eslint-patch/modern-module-resolution");

module.exports = {
  root: true,
  extends: ["@react-native-community", "prettier"],
  rules: {
    "prettier/prettier": [
      "error",
      {
        singleQuote: false,
        tabWidth: 2,
        trailingComma: "es5",
        useTabs: false,
      },
    ],
  },
};
