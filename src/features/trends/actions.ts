"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { TREND_STATUSES, type TrendStatus, trendItems, trendSources } from "@/db/schema";
import { fetchAllTrends } from "./fetch";

export async function fetchTrendsNow(): Promise<void> {
  await fetchAllTrends();
  revalidatePath("/tendencias");
  revalidatePath("/");
}

export async function setTrendStatus(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status")) as TrendStatus;
  if (!Number.isInteger(id) || !TREND_STATUSES.includes(status)) return;
  db.update(trendItems).set({ status }).where(eq(trendItems.id, id)).run();
  revalidatePath("/tendencias");
  revalidatePath("/");
}

export async function addTrendSource(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  if (!name || !/^https?:\/\//.test(url)) return;
  db.insert(trendSources).values({ name, url }).onConflictDoNothing().run();
  revalidatePath("/tendencias");
}

export async function toggleTrendSource(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const enabled = formData.get("enabled") === "true";
  if (!Number.isInteger(id)) return;
  db.update(trendSources).set({ enabled }).where(eq(trendSources.id, id)).run();
  revalidatePath("/tendencias");
}
