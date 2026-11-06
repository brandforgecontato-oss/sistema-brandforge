import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const TASK_STATUSES = ["a_fazer", "fazendo", "feito"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["baixa", "media", "alta"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Quadro de tarefas único para todas as frentes. `project` é o nome da pasta do projeto ou "geral". */
export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    notes: text("notes"),
    project: text("project").notNull().default("geral"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("a_fazer"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("media"),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("tasks_status_idx").on(t.status)],
);

export const trendSources = sqliteTable("trend_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastFetchedAt: integer("last_fetched_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  createdAt: createdAt(),
});

export const TREND_STATUSES = ["novo", "salvo", "ideia", "descartado"] as const;
export type TrendStatus = (typeof TREND_STATUSES)[number];

export const trendItems = sqliteTable(
  "trend_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => trendSources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    link: text("link").notNull(),
    summary: text("summary"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    status: text("status", { enum: TREND_STATUSES }).notNull().default("novo"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("trend_items_link_uq").on(t.link), index("trend_items_status_idx").on(t.status)],
);

export const SCRIPT_STATUSES = ["gerando", "rascunho", "gravado", "erro"] as const;
export type ScriptStatus = (typeof SCRIPT_STATUSES)[number];

/** Um bloco do roteiro: o que falar e o texto que aparece na tela nesse momento. */
export type ScriptBeat = { fala: string; tela: string };

/** Roteiro de vídeo curto para gravar, gerado pelo Claude a partir de uma tendência ou de um tema livre. */
export const scripts = sqliteTable(
  "scripts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topic: text("topic").notNull(),
    trendId: integer("trend_id").references(() => trendItems.id, { onDelete: "set null" }),
    guidance: text("guidance"),
    status: text("status", { enum: SCRIPT_STATUSES }).notNull().default("gerando"),
    title: text("title"),
    /** Texto de tela dos primeiros segundos. */
    hookText: text("hook_text"),
    beats: text("beats", { mode: "json" }).$type<ScriptBeat[]>(),
    cta: text("cta"),
    caption: text("caption"),
    hashtags: text("hashtags"),
    estimatedSec: integer("estimated_sec"),
    videoId: integer("video_id"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("scripts_status_idx").on(t.status)],
);

export const VIDEO_STATUSES = [
  "na_fila",
  "baixando",
  "transcrevendo",
  "planejando",
  "revisar",
  "erro",
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/** "curto" = gravação sua, editada inteira; "longo" = o Claude escolhe trechos para virar cortes. */
export const VIDEO_KINDS = ["curto", "longo"] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];

/** Trecho que a edição automática tira do vídeo; `keep: true` = você decidiu manter. */
export type Removal = { startMs: number; endMs: number; kind: "pausa" | "repeticao"; reason?: string; keep?: boolean };

/**
 * Imagem/vídeo de apoio (B-roll) mostrado enquanto a pessoa fala.
 * Tempos na gravação ORIGINAL (são remapeados para o vídeo editado no render).
 * `file` fica na pasta de trabalho do vídeo (broll/); vazio = ainda não baixado.
 */
export type BrollItem = {
  startMs: number;
  endMs: number;
  /** Termos de busca em inglês (o banco de imagens acha mais assim). */
  query: string;
  /** O que a fala diz nesse momento, em português (só para mostrar na revisão). */
  topic: string;
  keep?: boolean;
  file?: string | null;
  media?: "video" | "foto";
  /** Página do resultado no banco de imagens; "trocar" pega o próximo. */
  pick?: number;
  credit?: string;
  sourceUrl?: string;
  error?: string;
};

/** Um vídeo bruto (baixado por URL ou colocado na pasta de entrada). */
export const videos = sqliteTable("videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  /** Nome do arquivo dentro de VIDEO_DIRS.entrada. */
  fileName: text("file_name"),
  durationMs: integer("duration_ms"),
  kind: text("kind", { enum: VIDEO_KINDS }).notNull().default("curto"),
  language: text("language").notNull().default("pt"),
  /** Orientação extra para o Claude ao escolher cortes (ex.: "foque nas dicas práticas"). */
  guidance: text("guidance"),
  /** Roteiro que a pessoa seguiu ao gravar (ajuda o Claude a achar regravações e B-roll). */
  scriptId: integer("script_id"),
  status: text("status", { enum: VIDEO_STATUSES }).notNull().default("na_fila"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

/** "desfocado" = vídeo inteiro sobre fundo desfocado; "preencher" = recorta para ocupar a tela toda (9:16). */
export const CLIP_FRAMINGS = ["desfocado", "preencher"] as const;
export type ClipFraming = (typeof CLIP_FRAMINGS)[number];

/** Como o B-roll aparece: cobrindo a tela toda, ou na metade de cima com a pessoa embaixo. */
export const BROLL_LAYOUTS = ["tela_cheia", "metade"] as const;
export type BrollLayout = (typeof BROLL_LAYOUTS)[number];

export const CLIP_STATUSES = ["proposto", "na_fila", "renderizando", "pronto", "erro", "descartado"] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];

/** Corte proposto pelo Claude; só é renderizado depois que você aprova. */
export const clips = sqliteTable(
  "clips",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    hook: text("hook").notNull(),
    reason: text("reason"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    framing: text("framing", { enum: CLIP_FRAMINGS }).notNull().default("desfocado"),
    /** Posição horizontal do recorte no modo "preencher": 0 = esquerda, 50 = centro, 100 = direita. */
    cropX: integer("crop_x").notNull().default(50),
    /** Só em vídeos curtos: pausas e trechos regravados que saem na edição. */
    removals: text("removals", { mode: "json" }).$type<Removal[]>(),
    broll: text("broll", { mode: "json" }).$type<BrollItem[]>(),
    brollLayout: text("broll_layout", { enum: BROLL_LAYOUTS }).notNull().default("tela_cheia"),
    status: text("status", { enum: CLIP_STATUSES }).notNull().default("proposto"),
    outputFile: text("output_file"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("clips_video_idx").on(t.videoId)],
);

export const AGENT_MODES = ["planejar", "editar", "testar"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const AGENT_RUN_STATUSES = ["na_fila", "rodando", "concluido", "erro", "cancelado"] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

/** Um pedido feito pelo painel a um agente Claude Code dentro de um projeto (Fase 3). */
export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Nome da pasta do projeto dentro de PROJECTS_ROOT. */
    project: text("project").notNull(),
    prompt: text("prompt").notNull(),
    mode: text("mode", { enum: AGENT_MODES }).notNull().default("planejar"),
    model: text("model").notNull().default("sonnet"),
    status: text("status", { enum: AGENT_RUN_STATUSES }).notNull().default("na_fila"),
    /** Pedido anterior que esta execução continua (mesma conversa do Claude). */
    parentId: integer("parent_id"),
    /** Sessão do Claude a retomar (herdada do pedido anterior). */
    resumeSessionId: text("resume_session_id"),
    sessionId: text("session_id"),
    result: text("result"),
    costUsd: real("cost_usd"),
    durationMs: integer("duration_ms"),
    turns: integer("turns"),
    /** Ações que o agente quis fazer e foram bloqueadas (ex.: comandos no terminal). */
    denials: text("denials", { mode: "json" }).$type<{ tool: string; input: string }[]>(),
    error: text("error"),
    cancelRequested: integer("cancel_requested", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("agent_runs_status_idx").on(t.status)],
);

export const JOB_TYPES = ["fetch_trends", "video_download", "video_transcribe", "video_plan", "clip_render", "broll_fetch", "script_generate", "agent_run"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["pendente", "rodando", "concluido", "falhou"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Fila durável usada pelo worker (tendências agora; pipeline de vídeo na Fase 2). */
export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: JOB_TYPES }).notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("pendente"),
    attempts: integer("attempts").notNull().default(0),
    runAt: integer("run_at", { mode: "timestamp_ms" }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    result: text("result"),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_status_run_idx").on(t.status, t.runAt)],
);
