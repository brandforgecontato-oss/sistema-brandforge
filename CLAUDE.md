@AGENTS.md

# BrandForge Central — painel único

Painel local (Next.js + SQLite) que junta num lugar só as frentes da BrandForge: quadro de tarefas, monitor dos projetos/agentes Claude Code, tendências de IA/tech, pipeline automático de vídeo (Fase 2) e pedidos a agentes Claude Code pelo painel (Fase 3).

## Estado atual

- Fase 1 pronta e testada no navegador (2026-11-04): Painel, Tarefas, Projetos, Tendências.
- Fase 2 (vídeo) pronta e testada de ponta a ponta (2026-11-04): link/arquivo → yt-dlp → FFmpeg (áudio 16 kHz) → whisper.cpp na GPU → Claude propõe 1–4 cortes → usuário aprova/ajusta → FFmpeg renderiza 1080×1920 com legenda palavra a palavra e gancho. Teste: 87 s de vídeo = transcrição 18 s, planejamento 12 s, render de 58 s em 37 s.
- Fase 3 (agentes) pronta e testada no navegador (2026-11-05): pedido → fila → Claude Code roda na pasta do projeto → painel mostra passos, resposta, arquivos alterados e bloqueios; continuar a conversa e cancelar funcionando.

## Como rodar

- `npm run dev:all` → painel em http://localhost:3100 + worker (busca tendências a cada `TRENDS_INTERVAL_MIN`).
- Primeira vez / mudou o schema: `npm run db:generate` e `npm run db:migrate` (o migrate também insere as fontes RSS padrão).

## Decisões

- **Dados fora do OneDrive**: banco e vídeos em `DATA_DIR` (padrão `C:\BrandForge-dados`), para o OneDrive não sincronizar arquivos grandes nem travar o SQLite em WAL.
- npm (não pnpm — pnpm não está no PATH desta máquina). `better-sqlite3` v13 por ter prebuild para Node 24 (sem Visual Studio Build Tools aqui).
- Porta 3100 para não colidir com os outros projetos Next (3000).
- **Monitor de agentes** (página Projetos) = leitura passiva dos logs do Claude Code em `~/.claude/projects/<caminho codificado>/*.jsonl` (só os últimos 512 KB da sessão mais recente).
- Projeto cuja raiz só tem PDFs (ex.: `brandforge-site-oficial`) tem o código detectado na primeira subpasta com `.git`/`package.json`/`CLAUDE.md`.
- `PROJECT_CODE_DIRS` no `.env` aponta um projeto para o código que vive fora do BrandForge. O site real fica em `C:\Users\amanc\GitHub\brandforge-site` (repo `brandforge-siteoficial`, deploy na Vercel); a pasta `brandforge-site-oficial/template_sites-main` no OneDrive é o template antigo de 30/10.
- Fila durável em `jobs` (`src/worker/queue.ts`): 3 tentativas com backoff; jobs presos em "rodando" voltam para a fila quando o worker reinicia. O worker tem duas faixas: "geral" (tendências/vídeo) e "agentes" (um pedido por vez), para um agente longo não travar o resto.

## Pipeline de vídeo

- Jobs: `video_download` → `video_transcribe` → `video_plan` → (aprovação na UI) → `clip_render`. Código em [src/features/videos/pipeline.ts](src/features/videos/pipeline.ts).
- Ferramentas resolvidas em [src/lib/tools.ts](src/lib/tools.ts): env → pacote do winget → PATH. Executa sempre sem shell (`spawn` com array de argumentos).
- whisper.cpp: build `b5454` CUDA 11.8 em `DATA_DIR\ferramentas\whisper\Release`. O zip **não traz** `cublas64_11.dll`/`cublasLt64_11.dll` — foram copiados do redist oficial da NVIDIA (libcublas 11.11.3.6). Sem eles cai para CPU em silêncio ("no GPU found").
- Transcrição normalizada em `trabalho/<id>/transcricao.json` (segmentos + palavras com tempo, montadas a partir dos tokens do `-ojf`).
- Claude: `claude.exe -p --json-schema … --tools "" --setting-sources "" --strict-mcp-config --no-session-persistence`, resposta em `structured_output`. Usa a assinatura logada; sem chave de API. `cwd` = pasta de trabalho do vídeo (fora do BrandForge, para não ler CLAUDE.md de projeto).
- Render (`buildFrameFilter`): por corte, "desfocado" = vídeo inteiro centralizado sobre fundo desfocado, ou "preencher" = amplia e recorta para 9:16 com `cropX` (0 esquerda … 100 direita) escolhido na página; legenda `.ass` gerada em [captions.ts](src/features/videos/captions.ts). O FFmpeg roda com `cwd` na pasta do corte porque o filtro `subtitles` não aceita `C:\` sem escapar.
- Replanejar apaga só os cortes ainda "proposto"; renderizados ficam.
- HyperFrames (animações) ainda não entrou — o render atual é só FFmpeg.

## Agentes (Fase 3)

- Página `/agentes`: escolhe projeto, modo e modelo. Código em [src/features/agents/](src/features/agents/), job `agent_run`.
- Roda `claude.exe -p --output-format stream-json --verbose --permission-mode <plan|acceptEdits> --model … --strict-mcp-config` com `cwd` = pasta de código do projeto e o pedido no stdin. Usa a assinatura logada.
- Modos: **Só planejar** = `plan` (só lê). **Editar arquivos** = `acceptEdits`: cria/edita arquivos, mas comandos de terminal são negados (sem ninguém para aprovar) e aparecem em "Bloqueado". Sem modo "tudo liberado" de propósito.
- Registro completo em `DATA_DIRagentes<id>.jsonl`; a página lê esse arquivo. A sessão é persistida, então "continuar a conversa" usa `--resume <session_id>` e a conversa também aparece no Claude Code daquele projeto.
- Pedido de agente **não é repetido** automaticamente: falha = 1 tentativa; se o worker reinicia no meio, o pedido vira erro. Cancelar = `taskkill /T /F` na árvore do processo.
- `src/features/projects/dirs.ts` não é server-only (o worker usa); `projectCodeDir(nome)` só aceita pastas que existem em `PROJECTS_ROOT`.

## Estrutura

- `src/db/` schema, cliente, migrações · `src/worker/` fila + loop
- `src/features/{tasks,trends,projects,videos,agents}/` queries (server-only), actions (Server Actions), lógica
- `src/app/` páginas em PT-BR · `src/components/ui.tsx` peças visuais e formatação de datas

## Próximos passos

- Vídeo: animações com HyperFrames; detectar o rosto para posicionar o recorte sozinho (hoje a posição é manual).
- Agentes: avisar no celular quando um pedido terminar; modo com comandos liberados por lista (ex.: `npm run build`, `git status`).
