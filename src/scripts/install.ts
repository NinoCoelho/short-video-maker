import { Config } from "../config";
import { logger } from "../logger";
import { FFmpeg } from "../short-creator/libraries/FFmpeg";
import { Remotion } from "../short-creator/libraries/Remotion";
import { LocalTTS } from "../short-creator/libraries/LocalTTS";

async function main() {
  const config = new Config();

  logger.info("Installing FFmpeg...");
  await FFMpeg.init();

  logger.info("Installing Remotion...");
  await Remotion.init(config);

  logger.info("Installing LocalTTS...");
  await LocalTTS.init(config);

  logger.info("Installation completed successfully!");
}

main();
