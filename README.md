# 🎬 Short Video Maker v2.0

> **Criador profissional de vídeos curtos com IA** - Uma plataforma completa para criar vídeos para TikTok, Instagram Reels e YouTube Shorts

![Short Video Maker](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## ✨ Novidades da Versão 2.0

### 🎨 **Interface Completamente Renovada**
- **Design moderno** com tema escuro e gradientes
- **Dashboard intuitivo** com estatísticas em tempo real
- **Sidebar navegação** com acesso rápido a todas as funcionalidades
- **Componentes modernos** com Material-UI e animações fluidas

### 🤖 **IA para Geração de Scripts**
- **Gerador automático** de roteiros com prompts personalizáveis
- **Biblioteca de prompts** pré-definidos para diferentes nichos
- **Sistema de salvamento** de prompts personalizados
- **Integração perfeita** com o Video Studio

### 🔧 **Funcionalidades Avançadas**
- **Busca e substituição** inteligente de vídeos de fundo
- **Regeneração de áudio** para cenas específicas
- **Sistema de cache** otimizado para vídeos
- **Processamento em background** com filas inteligentes

### 📚 **Documentação Completa**
- **API Reference** integrada na interface
- **Servidor MCP** expandido com 7+ tools
- **Guias de uso** detalhados
- **Exemplos práticos** de implementação

## 🚀 Funcionalidades Principais

### 📺 **Video Studio**
- **Criação guiada** em 3 etapas: Roteiro → Configurações → Revisão
- **Editor visual** de cenas com preview em tempo real
- **Configurações avançadas** de voz, música e legendas
- **Sistema de templates** para reutilização

### 🎙️ **TTS Studio Avançado**
- **Múltiplas vozes** disponíveis (masculinas e femininas)
- **Suporte a idiomas** (Português e Inglês)
- **Áudio de referência** para clonagem de voz
- **Biblioteca de áudios** gerados com reprodução integrada

### 📊 **Dashboard Inteligente**
- **Estatísticas em tempo real** de todos os vídeos
- **Progresso de renderização** com indicadores visuais
- **Ações rápidas** para criação e gerenciamento
- **Vídeos recentes** com acesso direto

### 🎬 **Biblioteca de Vídeos**
- **Visualização em grid** com filtros avançados
- **Busca inteligente** por conteúdo e status
- **Ações em massa** para gerenciamento
- **Preview integrado** dos vídeos

## 🛠️ Instalação e Configuração

### Pré-requisitos
- **Node.js** 18+ 
- **FFmpeg** instalado no sistema
- **Python** 3.8+ (para TTS local)

### Instalação Rápida

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/short-video-maker.git
cd short-video-maker

# Instale as dependências
npm install

# Configure as dependências Python para TTS
pip install -r requirements.txt

# Inicie o servidor de desenvolvimento
npm run dev
```

### Configuração Avançada

```bash
# Build completo para produção
npm run build

# Iniciar em produção
npm start

# Executar apenas o servidor
npm run dev:server

# Executar apenas a interface
npm run dev:ui
```

## 🎯 Como Usar

### 1. **Criação com IA**
1. Acesse **IA Scripts** no menu lateral
2. Digite um tópico (ex: "marketing digital")
3. Escolha um prompt pré-definido ou crie um personalizado
4. Clique em **"Gerar Script"**
5. Use o script gerado no Video Studio

### 2. **Video Studio**
1. Vá para **Video Studio**
2. **Etapa 1**: Adicione cenas com texto e palavras-chave
3. **Etapa 2**: Configure voz, orientação e música
4. **Etapa 3**: Revise e clique em **"Criar Vídeo"**

### 3. **Gerenciamento**
- **Dashboard**: Monitore todos os vídeos
- **Biblioteca**: Organize e busque vídeos
- **TTS Studio**: Gere áudios personalizados
- **Configurações**: Personalize padrões

## 🔌 API Reference

### Principais Endpoints

#### **Criação de Vídeos**
```http
POST /api/render
Content-Type: application/json

{
  "scenes": [
    {
      "text": "Texto da cena",
      "searchTerms": ["palavra1", "palavra2"]
    }
  ],
  "config": {
    "voice": "Paulo",
    "orientation": "portrait",
    "language": "pt"
  }
}
```

#### **Status do Vídeo**
```http
GET /api/status/:videoId
```

#### **Geração de TTS**
```http
POST /api/generate-tts
Content-Type: application/json

{
  "text": "Texto para converter",
  "voice": "Paulo",
  "language": "pt"
}
```

#### **Busca de Vídeos**
```http
POST /api/search-background-videos
Content-Type: application/json

{
  "query": "natureza",
  "count": 5,
  "orientation": "portrait"
}
```

### Novos Endpoints v2.0

- `POST /api/replace-scene-video` - Substituir vídeo de uma cena
- `POST /api/regenerate-scene-audio` - Regenerar áudio de cena
- `GET /api/voices` - Listar vozes disponíveis
- `GET /api/music-tags` - Listar tags de música
- `GET /api/dashboard/stats` - Estatísticas do dashboard

## 🤖 Model Context Protocol (MCP)

### Servidor MCP Expandido

O servidor MCP v2.0 inclui 7 tools principais:

- **`create-short-video`** - Criar vídeos
- **`get-video-status`** - Verificar status
- **`list-videos`** - Listar todos os vídeos
- **`delete-video`** - Deletar vídeos
- **`search-videos`** - Buscar vídeos de fundo
- **`generate-tts`** - Gerar áudio TTS
- **`get-system-info`** - Informações do sistema

### Conexão MCP
```
Endpoint SSE: http://localhost:3233/mcp/sse
Health Check: http://localhost:3233/mcp/health
```

## 🎨 Personalização

### Temas e Estilos
- **Modo escuro** por padrão com opção de claro
- **Cores personalizáveis** via tema do Material-UI
- **Gradientes modernos** em toda a interface
- **Animações fluidas** com transitions CSS

### Configurações
- **Vozes padrão** configuráveis
- **Orientação preferida** (retrato/paisagem)
- **Qualidade de vídeo** ajustável
- **Salvamento automático** opcional

## 📈 Monitoramento e Analytics

### Dashboard Analytics
- **Total de vídeos** criados
- **Status em tempo real** (processando, concluídos, falharam)
- **Vídeos de hoje** 
- **Progresso de renderização** com indicadores visuais

### Sistema de Cache
- **Cache inteligente** de vídeos de fundo
- **Limpeza automática** de arquivos antigos
- **Estatísticas de uso** do cache
- **Otimização de performance**

## 🔧 Desenvolvimento

### Estrutura do Projeto
```
src/
├── ui/                    # Interface React
│   ├── components/        # Componentes reutilizáveis
│   ├── pages/            # Páginas principais
│   └── styles/           # Estilos globais
├── server/               # Backend Express
│   ├── routers/          # Rotas da API
│   └── routes/           # Endpoints específicos
├── short-creator/        # Core do processamento
│   ├── libraries/        # Integrações (FFmpeg, TTS, etc)
│   └── utils/           # Utilitários
└── types/               # Definições TypeScript
```

### Scripts Disponíveis
- `npm run dev` - Desenvolvimento completo
- `npm run build` - Build de produção
- `npm test` - Executar testes
- `npm run ui:dev` - Apenas interface
- `npm run dev:server` - Apenas backend

## 🚦 Configurações de Produção

### Docker
```dockerfile
# Use a imagem oficial
docker pull gyoridavid/short-video-maker:latest

# Execute o container
docker run -p 3000:3000 gyoridavid/short-video-maker:latest
```

### Variáveis de Ambiente
```env
PORT=3000
REMOTION_HOST=0.0.0.0
NODE_ENV=production
```

## 🤝 Contribuindo

1. **Fork** o projeto
2. **Crie** uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. **Commit** suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. **Push** para a branch (`git push origin feature/nova-funcionalidade`)
5. **Abra** um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🙏 Agradecimentos

- **Remotion** - Framework de vídeo programático
- **Material-UI** - Componentes React modernos
- **FFmpeg** - Processamento de vídeo
- **Model Context Protocol** - Integração com IA

---

**Desenvolvido com ❤️ para criadores de conteúdo**

[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/seu-usuario/short-video-maker)
[![Discord](https://img.shields.io/badge/Discord-7289DA?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/seu-servidor) 