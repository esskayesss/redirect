import { SQL } from "bun";
import type { NewRedirectVisit, RedirectUrl } from "./types";

const databaseUrl = Bun.env.DATABASE_URI ?? Bun.env.DATABASE_URL;
export const db = databaseUrl ? new SQL(databaseUrl) : new SQL();

const migrationPath = new URL("../migrations/01-init.sql", import.meta.url)
	.pathname;
const redirectsBySlug = new Map<string, RedirectUrl>();
const visitBuffer: NewRedirectVisit[] = [];
let syncPromise: Promise<void> | null = null;

export function getRedirectBySlug(slug: string): RedirectUrl | undefined {
	return redirectsBySlug.get(slug);
}

export function getRedirectCacheSnapshot(): RedirectUrl[] {
	return Array.from(redirectsBySlug.values());
}

export function bufferRedirectVisit(visit: NewRedirectVisit): void {
	visitBuffer.push(visit);
}

export function getVisitBufferSize(): number {
	return visitBuffer.length;
}

export function sync(): Promise<void> {
	if (syncPromise) return syncPromise;

	syncPromise = syncUnsafe().finally(() => {
		syncPromise = null;
	});

	return syncPromise;
}

async function syncUnsafe(): Promise<void> {
	await db.unsafe(await Bun.file(migrationPath).text()).simple();

	const visitsToFlush = visitBuffer.splice(0, visitBuffer.length);
	try {
		if (visitsToFlush.length > 0) {
			await flushVisits(visitsToFlush);
		}

		const redirects = await db<RedirectUrl[]>`
      SELECT
        id,
        slug,
        label,
        url,
        delay_s,
        is_active,
        created_at,
        updated_at,
        last_visited_at,
        total_visits
      FROM redirect_urls
      WHERE is_active = TRUE
    `;

		redirectsBySlug.clear();
		for (const redirect of redirects) {
			redirectsBySlug.set(redirect.slug, redirect);
		}
	} catch (error) {
		visitBuffer.unshift(...visitsToFlush);
		throw error;
	}
}

async function flushVisits(visits: NewRedirectVisit[]): Promise<void> {
	try {
		await db.begin(async (tx) => {
			await tx`
        INSERT INTO redirect_visits ${tx(
					visits,
					"redirect_id",
					"slug",
					"visited_at",
					"ip_hash",
					"user_agent",
					"country",
					"city",
					"region",
					"utm_source",
					"utm_medium",
					"utm_campaign",
					"device_type",
					"browser",
					"os",
				)}
      `;

			const visitCountsByRedirectId = new Map<
				number,
				{ count: number; lastVisitedAt: Date }
			>();
			for (const visit of visits) {
				if (visit.redirect_id === null) continue;

				const existing = visitCountsByRedirectId.get(visit.redirect_id);
				if (!existing) {
					visitCountsByRedirectId.set(visit.redirect_id, {
						count: 1,
						lastVisitedAt: visit.visited_at,
					});
					continue;
				}

				existing.count += 1;
				if (visit.visited_at > existing.lastVisitedAt) {
					existing.lastVisitedAt = visit.visited_at;
				}
			}

			for (const [
				redirectId,
				{ count, lastVisitedAt },
			] of visitCountsByRedirectId) {
				await tx`
          UPDATE redirect_urls
          SET
            total_visits = total_visits + ${count},
            last_visited_at = ${lastVisitedAt},
            updated_at = NOW()
          WHERE id = ${redirectId}
        `;
			}
		});
	} catch (error) {
		throw new Error("failed to flush redirect visits", { cause: error });
	}
}
