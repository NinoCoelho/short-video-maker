import { logger } from "../../logger";

// Regex para identificar emojis
const emojiRegex = /[\p{Emoji}\u200d\uFE0F]/gu;
// Regex para identificar hashtags
const hashtagRegex = /#[\w\p{L}\p{M}\d_]+/gu;

// Dicionário de substituições para pronúncia
const substitutions: Record<string, string> = {
  "5g": "cinco gê",
  // Adicione outros termos problemáticos aqui
};

/**
 * Formata valores monetários para pronúncia correta
 * Ex: "R$ 100" -> "cem reais"
 */
function formatCurrency(text: string): string {
  // Regex para encontrar valores em reais (R$ seguido de número)
  const reaisRegex = /R\$\s*(\d+(?:[.,]\d{2})?)/g;
  
  return text.replace(reaisRegex, (match, value) => {
    // Remove pontos de milhar e converte vírgula para ponto
    const numValue = parseFloat(value.replace('.', '').replace(',', '.'));
    
    // Formata o número por extenso
    const formattedValue = numValue.toLocaleString('pt-BR', {
      style: 'decimal',
      maximumFractionDigits: 2
    });
    
    // Adiciona "reais" no final
    return `${formattedValue} reais`;
  });
}

export function cleanSceneText(text: string): string {
  try {
    let cleaned = text;

    // Formata valores monetários
    cleaned = formatCurrency(cleaned);

    // Substitui termos problemáticos
    for (const [key, value] of Object.entries(substitutions)) {
      const regex = new RegExp(key, "gi");
      cleaned = cleaned.replace(regex, value);
    }

    // Remove hashtags
    cleaned = cleaned.replace(hashtagRegex, "");

    // Remove emojis
    cleaned = cleaned.replace(emojiRegex, "");

    // Remove números entre colchetes (ex: [4])
    cleaned = cleaned.replace(/\[\d+\]/g, '');
    
    // Remove aspas simples ou duplas extras
    cleaned = cleaned.replace(/["']/g, '');
    
    // Remove espaços múltiplos
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // Remove espaços no início e fim
    cleaned = cleaned.trim();
    
    // Substitui reticências por vírgula
    cleaned = cleaned.replace(/\.{3,}/g, ',');
    
    // Remove caracteres especiais mantendo acentuação e pontuação
    cleaned = cleaned.replace(/[^\p{L}\p{N}\s.,!?:;-]/gu, '');
    
    // Garante que cada linha termina com pontuação
    const lines = cleaned.split('\n').map(line => {
      line = line.trim();
      if (line && !/[.,!?;]$/.test(line)) {
        return line + '.';
      }
      return line;
    });
    
    cleaned = lines.join('\n');
    
    logger.debug("Cleaned scene text", { original: text, cleaned });
    
    return cleaned;
  } catch (error) {
    logger.error("Error cleaning scene text", { error, text });
    return text; // Retorna o texto original em caso de erro
  }
}

/**
 * Divide o texto em frases usando pontuação de final de linha (.!?;)
 * Garante que cada frase termina com pontuação sem espaços extras
 */
export function splitTextByPunctuation(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s*/)  // Divide após ponto, exclamação, interrogação ou ponto e vírgula, sem espaço
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      // Garante que cada frase termina com pontuação
      if (!/[.,!?;]$/.test(s)) {
        return s + '.';
      }
      return s;
    });
}

/**
 * Divide uma frase longa em partes menores, respeitando o máximo de palavras por parte.
 */
function splitLongSentence(sentence: string, maxWords = 20): string[] {
  const words = sentence.split(/\s+/);
  if (words.length <= maxWords) return [sentence];
  const parts = [];
  for (let i = 0; i < words.length; i += maxWords) {
    parts.push(words.slice(i, i + maxWords).join(' '));
  }
  return parts;
}

/**
 * Divide o texto para TTS: primeiro por pontuação, depois quebra frases longas.
 */
export function splitTextForTTS(text: string, maxWords = 20): string[] {
  // Primeiro, divide por pontuação
  const sentences = splitTextByPunctuation(text);
  // Depois, divide frases longas
  const result: string[] = [];
  for (const sentence of sentences) {
    const parts = splitLongSentence(sentence, maxWords);
    result.push(...parts);
  }
  return result;
} 