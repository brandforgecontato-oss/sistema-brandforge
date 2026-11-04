@AGENTS.md

# BrandForge Central — painel único

Painel local (Next.js + SQLite) que junta num lugar só as frentes da BrandForge: quadro de tarefas, monitor dos projetos/agentes Claude Code, tendências de IA/tech e (Fase 2) pipeline automático de vídeo.

## Estado atual

- Fase 1 pronta e testada no navegador (2026-11-04): Painel, Tarefas, Projetos, Tendências e Vídeos (só pastas + checagem de ferramentas).

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

## Estrutura

- `src/db/` schema, cliente, migrações · `src/worker/` fila + loop
- `src/features/{tasks,trends,projects,videos}/` queries (server-only), actions (Server Actions), lógica
- `src/app/` páginas em PT-BR · `src/components/ui.tsx` peças visuais e formatação de datas

## Próximos passos

- Fase 2: instalar FFmpeg / yt-dlp / whisper.cpp; jobs `download → transcrever → Claude escolhe cortes → HyperFrames → FFmpeg`.
- Fase 3: disparar/acompanhar agentes pelo painel.
