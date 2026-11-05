@AGENTS.md

# BrandForge Central — painel único

Painel local (Next.js + SQLite) que junta num lugar só as frentes da BrandForge: quadro de tarefas, monitor dos projetos/agentes Claude Code, tendências de IA/tech e (Fase 2) pipeline automático de vídeo.

## Estado atual

- Fase 1 pronta e testada no navegador (2026-11-04): Painel, Tarefas, Projetos, Tendências.
- Fase 2 (vídeo) pronta e testada de ponta a ponta (2026-11-04): link/arquivo → yt-dlp → FFmpeg (áudio 16 kHz) → whisper.cpp na GPU → Claude propõe 1–4 cortes → usuário aprova/ajusta → FFmpeg renderiza 1080×1920 com legenda palavra a palavra e gancho. Teste: 87 s de vídeo = transcrição 18 s, planejamento 12 s, render de 58 s em 37 s.

## Como rodar

- `npm run dev:all` → painel em http://localhost:3100 + worker (busca tendências a cada `TRENDS_INTERVAL_MIN`).
- Primeira vez / mudou o schema: `npm run db:generate` e `npm run db:migrate` (o migrate também insere as fontes RSS padrão).

## Decisões

- **Dados fora do OneDrive**: banco e vídeos em `DATA_DIR` (padrão `C:\BrandForge-dados`), para o OneDrive não sincronizar arquivos grandes nem travar o SQLite em WAL.
- npm (não pnpm — pnpm não está no PATH desta máquina). `better-sqlite3` v13 por ter prebuild para Node 24 (sem Visual Studio Build Tools aqui).
- Porta 3100 para não colidir com os outros projetos Next (3000).
- **Monitor de agentes** = leitura passiva dos logs do Claude Code em `~/.claude/projects/<caminho codificado>/*.jsonl` (só os últimos 512 KB da sessão mais recente). Não controla nem dispara agentes — isso é a Fase 3.
- Projeto cuja raiz só tem PDFs (ex.: `brandforge-site-oficial`) tem o código detectado na primeira subpasta com `.git`/`package.json`/`CLAUDE.md`.
- Fila durável em `jobs` (`src/worker/queue.ts`): 3 tentativas com backoff; jobs presos em "rodando" voltam para a fila quando o worker reinicia. Pronta para os jobs de vídeo.

## Pipeline de vídeo

- Jobs: `video_download` → `video_transcribe` → `video_plan` → (aprovação na UI) → `clip_render`. Código em [src/features/videos/pipeline.ts](src/features/videos/pipeline.ts).
- Ferramentas resolvidas em [src/lib/tools.ts](src/lib/tools.ts): env → pacote do winget → PATH. Executa sempre sem shell (`spawn` com array de argumentos).
- whisper.cpp: build `b5454` CUDA 11.8 em `DATA_DIR\ferramentas\whisper\Release`. O zip **não traz** `cublas64_11.dll`/`cublasLt64_11.dll` — foram copiados do redist oficial da NVIDIA (libcublas 11.11.3.6). Sem eles cai para CPU em silêncio ("no GPU found").
- Transcrição normalizada em `trabalho/<id>/transcricao.json` (segmentos + palavras com tempo, montadas a partir dos tokens do `-ojf`).
- Claude: `claude.exe -p --json-schema … --tools "" --setting-sources "" --strict-mcp-config --no-session-persistence`, resposta em `structured_output`. Usa a assinatura logada; sem chave de API. `cwd` = pasta de trabalho do vídeo (fora do BrandForge, para não ler CLAUDE.md de projeto).
- Render: fundo desfocado + vídeo inteiro centralizado (serve para horizontal e vertical); legenda `.ass` gerada em [captions.ts](src/features/videos/captions.ts). O FFmpeg roda com `cwd` na pasta do corte porque o filtro `subtitles` não aceita `C:\` sem escapar.
- Replanejar apaga só os cortes ainda "proposto"; renderizados ficam.
- HyperFrames (animações) ainda não entrou — o render atual é só FFmpeg.

## Estrutura

- `src/db/` schema, cliente, migrações · `src/worker/` fila + loop
- `src/features/{tasks,trends,projects,videos}/` queries (server-only), actions (Server Actions), lógica
- `src/app/` páginas em PT-BR · `src/components/ui.tsx` peças visuais e formatação de datas

## Próximos passos

- Vídeo: animações com HyperFrames; opção de recorte central (rosto) em vez de fundo desfocado.
- Fase 3: disparar/acompanhar agentes pelo painel.
