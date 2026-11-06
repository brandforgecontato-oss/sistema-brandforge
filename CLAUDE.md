@AGENTS.md

# BrandForge Central — painel único

Painel local (Next.js + SQLite) que junta num lugar só as frentes da BrandForge: quadro de tarefas, monitor dos projetos/agentes Claude Code, tendências de IA/tech, pipeline automático de vídeo (Fase 2) e pedidos a agentes Claude Code pelo painel (Fase 3).

## Estado atual

- Fase 1 pronta e testada no navegador (2026-11-04): Painel, Tarefas, Projetos, Tendências.
- Fase 2 (vídeo) pronta e testada de ponta a ponta (2026-11-04): link/arquivo → yt-dlp → FFmpeg (áudio 16 kHz) → whisper.cpp na GPU → Claude propõe 1–4 cortes → usuário aprova/ajusta → FFmpeg renderiza 1080×1920 com legenda palavra a palavra e gancho. Teste: 87 s de vídeo = transcrição 18 s, planejamento 12 s, render de 58 s em 37 s.
- Fase 3 (agentes) pronta e testada no navegador (2026-11-05): pedido → fila → Claude Code roda na pasta do projeto → painel mostra passos, resposta, arquivos alterados e bloqueios; continuar a conversa e cancelar funcionando.
- 2026-11-06: Roteiros (tendência/tema → roteiro de Reels → teleprompter → vídeo ligado ao roteiro), modo de agente "Editar e testar", silêncio adaptativo ao ruído e legenda alinhada ao som. B-roll (Pexels) construído; falta a chave para o teste com mídia real.

## Como rodar

- `npm run dev:all` → painel em http://localhost:3100 + worker (busca tendências a cada `TRENDS_INTERVAL_MIN`).
- Primeira vez / mudou o schema: `npm run db:generate` e `npm run db:migrate` (o migrate também insere as fontes RSS padrão).

## Decisões

- **Dados fora do OneDrive**: banco e vídeos em `DATA_DIR` (padrão `C:\BrandForge-dados`), para o OneDrive não sincronizar arquivos grandes nem travar o SQLite em WAL.
- npm (não pnpm — pnpm não está no PATH desta máquina). `better-sqlite3` v13 por ter prebuild para Node 24 (sem Visual Studio Build Tools aqui).
- Porta 3100 para não colidir com os outros projetos Next (3000).
- **Monitor de agentes** (página Projetos) = leitura passiva dos logs do Claude Code em `~/.claude/projects/<caminho codificado>/*.jsonl` (só os últimos 512 KB da sessão mais recente).
- Projeto sem código na raiz tem o código detectado na primeira subpasta com `.git`/`package.json`/`CLAUDE.md`.
- `PROJECT_CODE_DIRS` (opcional, no `.env`) aponta um projeto para código que viva fora do BrandForge. Desde 2026-11-05 o site oficial fica na própria pasta `brandforge-site-oficial` (clone de `brandforge-siteoficial`, deploy na Vercel; os PDFs de identidade na raiz ficam fora do git via `.git/info/exclude`).
- Fila durável em `jobs` (`src/worker/queue.ts`): 3 tentativas com backoff; jobs presos em "rodando" voltam para a fila quando o worker reinicia. O worker tem três faixas: "geral" (tendências/vídeo), "agentes" (um pedido por vez) e "roteiros" (~25 s cada), para um job longo não travar o resto. O worker NÃO recarrega código sozinho: depois de mexer em pipeline/runner/worker, reiniciar só ele (matar o processo `tsx … src/worker/run.ts` e rodar `npm run worker`), conferindo antes que não há job rodando.

## Pipeline de vídeo

- Dois tipos (`videos.kind`). **curto** (padrão): a gravação do usuário é editada inteira — pausas e regravações saem, com legenda e gancho. **longo**: o Claude propõe 1–4 cortes. O usuário quer que o curto siga um MODELO de edição que ele ainda vai descrever (com referências); a base atual é o ponto de partida.
- Curto ([short-edit.ts](src/features/videos/short-edit.ts)): pausas vêm dos silêncios reais do áudio (≥ 450 ms, folga de 120 ms), porque o whisper adianta as palavras (no começo do vídeo, até ~1,5 s). Silêncio = volume médio (RMS) por janela de 50 ms abaixo de um limite adaptado à gravação (`silencesFromLevels`: 10º percentil + margem, sempre 6 dB abaixo do 70º), medido em `trabalho/<id>/volume.txt`. NÃO usar `silencedetect` como principal: ele compara amostra por amostra e, com chiado de microfone (gravação real a −33 dB de fundo), não acha silêncio nenhum — só fica de reserva. A legenda é alinhada aos silêncios no render (`alignWordsToSilences`: cada trecho de fala é encaixado entre o fim de um silêncio e o começo do próximo). DTW do whisper (`-dtw large.v3.turbo`) foi testado e não preenche `t_dtw` com o modelo q5_0. O Claude marca só as regravações (`planShortEdit`), e as bordas são encaixadas no silêncio mais próximo. Cortes ficam em `clips.removals`; cada um pode ser desmarcado na página. O render emenda os trechos com trim/atrim + concat e fade de 15 ms no áudio; as palavras da legenda são reposicionadas no tempo final.

- Roteiro ligado (`videos.script_id`, escolhido no envio): o texto planejado vai no prompt da análise como referência para achar regravações; o `hookText` do roteiro vira o gancho se ainda combinar.
- Entrada: envio pelo navegador (arrastar/escolher em `/videos`) → `POST /api/videos/enviar?nome=&kind=` grava o corpo cru direto em `entrada` (`.parcial` até terminar) e já enfileira; rota em vez de Server Action por causa do limite de 1 MB da action. Também: link (yt-dlp) ou arquivo copiado à mão para a pasta.
- Jobs: `video_download` → `video_transcribe` → `video_plan` (curto: análise da edição; longo: cortes) → (aprovação na UI) → `clip_render`. Código em [src/features/videos/pipeline.ts](src/features/videos/pipeline.ts).
- Ferramentas resolvidas em [src/lib/tools.ts](src/lib/tools.ts): env → pacote do winget → PATH. Executa sempre sem shell (`spawn` com array de argumentos).
- whisper.cpp: build `b5454` CUDA 11.8 em `DATA_DIR\ferramentas\whisper\Release`. O zip **não traz** `cublas64_11.dll`/`cublasLt64_11.dll` — foram copiados do redist oficial da NVIDIA (libcublas 11.11.3.6). Sem eles cai para CPU em silêncio ("no GPU found").
- Transcrição normalizada em `trabalho/<id>/transcricao.json` (segmentos + palavras com tempo, montadas a partir dos tokens do `-ojf`).
- Claude: `claude.exe -p --json-schema … --tools "" --setting-sources "" --strict-mcp-config --no-session-persistence`, resposta em `structured_output`. Usa a assinatura logada; sem chave de API. `cwd` = pasta de trabalho do vídeo (fora do BrandForge, para não ler CLAUDE.md de projeto).
- Render (`buildFrameFilter`): por corte, "desfocado" = vídeo inteiro centralizado sobre fundo desfocado, ou "preencher" = amplia e recorta para 9:16 com `cropX` (0 esquerda … 100 direita) escolhido na página; legenda `.ass` gerada em [captions.ts](src/features/videos/captions.ts). O FFmpeg roda com `cwd` na pasta do corte porque o filtro `subtitles` não aceita `C:\` sem escapar.
- Replanejar apaga só os cortes ainda "proposto"; renderizados ficam.
- **B-roll** (só vídeo curto): na mesma análise o Claude marca 2–4 s de fala com algo visual (busca em inglês + tema). Nada nos primeiros 3,5 s (gancho). Job `broll_fetch` ([broll.ts](src/features/videos/broll.ts)) busca no Pexels (`PEXELS_API_KEY`; vídeo primeiro, foto como reserva com zoom lento) e baixa em `trabalho/<id>/broll/`. Itens em `clips.broll` com tempo da gravação original, remapeados para o vídeo editado no render (`brollWindows`). Visual por corte (`broll_layout`): **tela_cheia** ou **metade** (mídia em cima, faixa y=300..1260 do quadro da pessoa embaixo, fio dourado, legenda sobe para a divisão via estilo `LegendaMeio`). Na página: desmarcar, editar a busca ou "Trocar" (próximo resultado).
- FFmpeg 9: `-filter_complex_script` não existe mais; use `-/filter_complex arquivo`.
- HyperFrames (animações) ainda não entrou — o render atual é só FFmpeg.

## Roteiros

- Página `/roteiros`, código em [src/features/scripts/](src/features/scripts/), job `script_generate` (faixa própria). "Gerar roteiro" em cada tendência (a tendência vira "ideia") ou tema livre.
- Claude via [src/lib/claude.ts](src/lib/claude.ts) (`askClaudeJson`, mesmo jeito do vídeo, `cwd` em `DATA_DIRclaude`). Roteiro = blocos {fala, tela}, gancho na tela, legenda do post, hashtags. Público: donos de pequenos negócios; proibido inventar número/fato que não esteja na notícia.
- Teleprompter em `/roteiros/<id>/teleprompter` (espaço, ↑↓, +/−, espelhar). A rolagem guarda a posição em float: somar direto em `scrollTop` arredonda e não sai do lugar em velocidade baixa.
- Status: gerando → rascunho ("pronto para gravar") → gravado (quando um vídeo é enviado ligado a ele).

## Agentes (Fase 3)

- Página `/agentes`: escolhe projeto, modo e modelo. Código em [src/features/agents/](src/features/agents/), job `agent_run`.
- Roda `claude.exe -p --output-format stream-json --verbose --permission-mode <plan|acceptEdits> --model … --strict-mcp-config` com `cwd` = pasta de código do projeto e o pedido no stdin. Usa a assinatura logada.
- Modos: **Só planejar** = `plan` (só lê). **Editar arquivos** = `acceptEdits`: cria/edita arquivos, mas comandos de terminal são negados (sem ninguém para aprovar) e aparecem em "Bloqueado". **Editar e testar** = `acceptEdits` + `--allowedTools` com `SAFE_COMMANDS` (build, lint, test, `npx tsc`, git status/diff/log/show) — testado: `git add` continua bloqueado. Sem modo "tudo liberado" de propósito.
- Registro completo em `DATA_DIRagentes<id>.jsonl`; a página lê esse arquivo. A sessão é persistida, então "continuar a conversa" usa `--resume <session_id>` e a conversa também aparece no Claude Code daquele projeto.
- Pedido de agente **não é repetido** automaticamente: falha = 1 tentativa; se o worker reinicia no meio, o pedido vira erro. Cancelar = `taskkill /T /F` na árvore do processo.
- `src/features/projects/dirs.ts` não é server-only (o worker usa); `projectCodeDir(nome)` só aceita pastas que existem em `PROJECTS_ROOT`.

## Estrutura

- `src/db/` schema, cliente, migrações · `src/worker/` fila + loop
- `src/features/{tasks,trends,projects,videos,agents}/` queries (server-only), actions (Server Actions), lógica
- `src/app/` páginas em PT-BR · `src/components/ui.tsx` peças visuais e formatação de datas

## Próximos passos

- Vídeo: aplicar o modelo de edição que o usuário vai descrever; testar o B-roll com a chave do Pexels; animações com HyperFrames; detectar o rosto para posicionar o recorte sozinho (hoje a posição é manual).
- Agentes/roteiros: avisar no celular quando terminar (depende de o usuário escolher o canal).
