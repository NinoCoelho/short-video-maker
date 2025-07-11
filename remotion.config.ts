// See all configuration options: https://remotion.dev/docs/config
// Each option also is available as a CLI flag: https://remotion.dev/docs/cli

// Note: When using the Node.JS APIs, the config file doesn't apply. Instead, pass options directly to the APIs

import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setPublicDir("static");
Config.setEntryPoint("src/components/root/index.ts");

// Enable parallel processing
Config.setConcurrency(8);

Config.setPort(3122);
Config.setBind("0.0.0.0");
