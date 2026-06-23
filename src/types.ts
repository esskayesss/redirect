export interface RedirectUrl {
	id: number;
	slug: string;
	label: string;
	url: string;
	delay_s: number;
	is_active: boolean;
	created_at: Date;
	updated_at: Date;
	last_visited_at: Date | null;
	total_visits: number;
}

export interface RedirectVisit {
	id: number;
	redirect_id: number | null;
	slug: string;
	visited_at: Date;
	ip_hash: string | null;
	user_agent: string | null;
	country: string | null;
	city: string | null;
	region: string | null;
	utm_source: string | null;
	utm_medium: string | null;
	utm_campaign: string | null;
	device_type: string | null;
	browser: string | null;
	os: string | null;
}

export type NewRedirectVisit = Omit<RedirectVisit, "id">;

export type Redirects = RedirectUrl;
export type RedirectVisits = RedirectVisit;
