import { spawnSync } from "child_process";
import { Config } from "./src/config";
import { LocalTTS } from "./src/short-creator/libraries/LocalTTS";

// Exibe a versão do Python que o Node vai usar
try {
  const pythonVersionResult = spawnSync("python", ["--version"], { encoding: "utf-8" });
  if (pythonVersionResult.error) {
    throw pythonVersionResult.error;
  }
  // Python sometimes outputs version to stderr instead of stdout
  const pythonVersion = pythonVersionResult.stdout || pythonVersionResult.stderr;
  console.log("Versão do Python usada pelo Node:", pythonVersion.trim());
} catch (err) {
  console.error("Não foi possível detectar a versão do Python:", err);
}

async function main() {
  const config = new Config();
  const localTTS = await LocalTTS.init(config);

  const text = "Olá, este é um teste do sistema de geração de áudio.";
  const outputPath = "./test_output.wav";
  const emotion = "neutral";
  const language = "pt";
  const referenceAudioPath = config.referenceAudioPath;

  try {
    await localTTS.generateSpeech(
      text,
      outputPath,
      emotion,
      language,
      referenceAudioPath
    );
    console.log("✅ Áudio gerado com sucesso:", outputPath);
  } catch (error) {
    console.error("❌ Erro ao gerar áudio:", error);
  }
}

main(); 