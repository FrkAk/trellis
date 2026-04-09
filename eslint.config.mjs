import { createRequire } from "module";

const require = createRequire(import.meta.url);

const baseConfig = require("eslint-config-next/core-web-vitals");
const tsConfig = require("eslint-config-next/typescript");

const eslintConfig = [...baseConfig, ...tsConfig];

export default eslintConfig;
