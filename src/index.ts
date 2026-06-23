import { Eta } from "eta";
import { bufferRedirectVisit, getRedirectBySlug, sync } from "./db";
import type { NewRedirectVisit, RedirectUrl } from "./types";

const eta = new Eta({
	views: new URL("./pages", import.meta.url).pathname,
	cache: true,
});

const port = Number(Bun.env.PORT ?? 3000);
const syncIntervalMs = Number(Bun.env.SYNC_INTERVAL_MS ?? 30_000);

await sync();
setInterval(() => {
	void sync().catch((error) => console.error("redirect sync failed", error));
}, syncIntervalMs);

Bun.serve({
	port,
	async fetch(request, server) {
		const requestUrl = new URL(request.url);

		if (requestUrl.pathname === "/healthz") {
			return Response.json({ ok: true });
		}

		const slug = getSlug(requestUrl);
		if (!slug) {
			return renderNotFound("/");
		}

		const redirect = getRedirectBySlug(slug);
		if (!redirect) {
			return renderNotFound(slug);
		}

		bufferRedirectVisit(
			await createVisit(request, requestUrl, redirect, server),
		);

		const skip = requestUrl.searchParams.has("skip") &&
			(requestUrl.searchParams.get("skip") ?? "true") !== "false";

		if (redirect.delay_s === 0 || skip) {
			return Response.redirect(redirect.url, 302);
		}

		return renderRedirect(redirect);
	},
});

console.log(`redirect server listening on :${port}`);

function getSlug(requestUrl: URL): string {
	return decodeURIComponent(requestUrl.pathname.replace(/^\/+|\/+$/g, ""));
}

function renderRedirect(redirect: RedirectUrl): Response {
	return htmlResponse(eta.render("redirect", { redirect }));
}

function renderNotFound(slug: string): Response {
	return htmlResponse(eta.render("notFound", { slug }), 404);
}

function htmlResponse(body: string, status = 200): Response {
	return new Response(body, {
		status,
		headers: {
			"content-type": "text/html; charset=utf-8",
		},
	});
}

async function createVisit(
	request: Request,
	requestUrl: URL,
	redirect: RedirectUrl,
	server: Bun.Server<unknown>,
): Promise<NewRedirectVisit> {
	const headers = request.headers;
	const userAgent = headers.get("user-agent");
	const ip = getClientIp(request, server);
	const parsedUserAgent = parseUserAgent(userAgent);

	return {
		redirect_id: redirect.id,
		slug: redirect.slug,
		visited_at: new Date(),
		ip_hash: ip ? await sha256Hex(ip) : null,
		user_agent: userAgent,
		country: headers.get("cf-ipcountry") ?? headers.get("x-vercel-ip-country"),
		city: headers.get("cf-ipcity") ?? headers.get("x-vercel-ip-city"),
		region: headers.get("cf-region") ?? headers.get("cf-region-code") ?? headers.get("x-vercel-ip-country-region"),
		utm_source: requestUrl.searchParams.get("utm_source"),
		utm_medium: requestUrl.searchParams.get("utm_medium"),
		utm_campaign: requestUrl.searchParams.get("utm_campaign"),
		device_type: parsedUserAgent.deviceType,
		browser: parsedUserAgent.browser,
		os: parsedUserAgent.os,
	};
}

function getClientIp(
	request: Request,
	server: Bun.Server<unknown>,
): string | null {
	// cf-connecting-ip is the most reliable when behind a Cloudflare tunnel
	const cfIp = request.headers.get("cf-connecting-ip")?.trim();
	if (cfIp) return cfIp;

	const forwardedFor = request.headers
		.get("x-forwarded-for")
		?.split(",")[0]
		?.trim();
	if (forwardedFor) return forwardedFor;

	const realIp = request.headers.get("x-real-ip")?.trim();
	if (realIp) return realIp;

	return server.requestIP(request)?.address ?? null;
}

async function sha256Hex(value: string): Promise<string> {
	const data = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function parseUserAgent(userAgent: string | null): {
	deviceType: string | null;
	browser: string | null;
	os: string | null;
} {
	if (!userAgent) {
		return { deviceType: null, browser: null, os: null };
	}

	return {
		deviceType: /Mobile|Android|iPhone|iPad/i.test(userAgent)
			? "mobile"
			: "desktop",
		browser: parseBrowser(userAgent),
		os: parseOs(userAgent),
	};
}

function parseBrowser(userAgent: string): string | null {
	if (/Edg\//.test(userAgent)) return "edge";
	if (/Chrome\//.test(userAgent)) return "chrome";
	if (/Firefox\//.test(userAgent)) return "firefox";
	if (/Safari\//.test(userAgent)) return "safari";
	return null;
}

function parseOs(userAgent: string): string | null {
	if (/Windows/i.test(userAgent)) return "windows";
	if (/Android/i.test(userAgent)) return "android";
	if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
	if (/Mac OS X/i.test(userAgent)) return "macos";
	if (/Linux/i.test(userAgent)) return "linux";
	return null;
}
