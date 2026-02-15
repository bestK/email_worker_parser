import PostalMime, { Email } from 'postal-mime';
import { EmailMessage } from 'cloudflare:email';

export interface Env {
    DB: D1Database;
    forward_address: string;
    EMAIL_DOMAIN: string;
    UI_URL?: string;
}

interface Ctx { }

const CORS_HEADERS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        ...init,
        headers: {
            'content-type': 'application/json',
            ...CORS_HEADERS,
            ...(init?.headers ?? {}),
        },
    });
}

function parseLimit(raw: string | null, defaultValue = 10, min = 1, max = 50): number {
    if (!raw) return defaultValue;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return defaultValue;
    return Math.min(max, Math.max(min, n));
}

function firstString(value: unknown): string | undefined {
    if (typeof value === 'string' && value) return value;
    if (Array.isArray(value)) {
        for (const v of value) {
            if (typeof v === 'string' && v) return v;
        }
    }
    return undefined;
}

const DEFAULT_UI_URL = 'https://bestk.github.io/email_worker_parser/';

function getUiUrl(env: Env): string {
    return env.UI_URL || DEFAULT_UI_URL;
}

async function streamToArrayBuffer(stream: ReadableStream, streamSize: number): Promise<Uint8Array> {
    const result = new Uint8Array(streamSize);
    let bytesRead = 0;
    const reader = stream.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result.set(value, bytesRead);
        bytesRead += value.length;
    }
    return result;
}

// --- 简易路由系统 ---
type Handler = (request: Request, env: Env, ctx: Ctx, params: Record<string, string>) => Promise<Response>;
const routes: { method: string; path: string; handler: Handler }[] = [];

function register(method: string, path: string, handler: Handler) {
    routes.push({ method, path, handler });
}

function matchRoute(method: string, url: string): { handler: Handler, params: Record<string, string> } | null {
    for (const route of routes) {
        if (route.method !== method) continue;

        const routeParts = route.path.split('/').filter(Boolean);
        const urlParts = url.split('/').filter(Boolean);

        if (routeParts.length !== urlParts.length) continue;

        const params: Record<string, string> = {};
        let matched = true;

        for (let i = 0; i < routeParts.length; i++) {
            if (routeParts[i].startsWith(':')) {
                params[routeParts[i].substring(1)] = decodeURIComponent(urlParts[i]);
            } else if (routeParts[i] !== urlParts[i]) {
                matched = false;
                break;
            }
        }

        if (matched) return { handler: route.handler, params };
    }
    return null;
}

// --- 路由处理逻辑 ---

// 创建 Email 地址（不再按地址动态创建 Cloudflare Email Routing 规则）
// 前置要求：Cloudflare 邮件路由中需有一条兜底规则把邮件交给本 Worker（例如 *@EMAIL_DOMAIN -> email_worker_parser）
register('GET', '/email/create', async (request, env, ctx, params) => {
    const randomEmail = Math.random().toString(36).substring(2, 15)
        + Math.random().toString(36).substring(2, 15)
        + '@' + env.EMAIL_DOMAIN;

    return jsonResponse({
        success: true,
        data: {
            fetch_endpoint: `/email/${randomEmail}`,
            address: randomEmail,
            mode: 'catch_all_worker_rule',
        },
    });
});

// email/:address 路由处理
register('GET', '/email/:address', async (request, env, ctx, params) => {
    const { address } = params; // 获取 :address 部分
    const url = new URL(request.url);

    // 获取查询参数 'limit'
    const limit = url.searchParams.get('limit');

    const maxResults = parseLimit(limit);

    try {
        const { results, success, meta } = await env.DB
            .prepare('SELECT "subject", "from", "to", "html", "text", "createdAt" FROM Email WHERE lower("to") = lower(?) ORDER BY createdAt DESC LIMIT ?')
            .bind(address, maxResults)
            .run();

        if (success) {
            return jsonResponse({ success: true, data: results });
        } else {
            console.error("D1 query failed:", meta);
            return jsonResponse({ success: false, error: 'Failed to retrieve emails' }, { status: 500 });
        }
    } catch (e: any) {
        console.error("Error fetching from D1:", e);
        return jsonResponse({ success: false, error: 'Query error', details: e.message }, { status: 500 });
    }
});

// help
register('GET', '/help', async (request, env, ctx, params) => {
    const uiUrl = getUiUrl(env);
    // 返回帮助信息 html
    const html = `
<!DOCTYPE html>
        <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Help Page</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f9;
                    color: #333;
                    padding: 20px;
                }
                h1 {
                    color: #007BFF;
                }
                p {
                    font-size: 1.1rem;
                    margin-bottom: 10px;
                }
                ul {
                    list-style-type: none;
                    padding-left: 0;
                }
                li {
                    margin: 10px 0;
                }
                pre {
                    background-color: #f1f1f1;
                    padding: 10px;
                    border-radius: 5px;
                    font-size: 0.9rem;
                    overflow-x: auto;
                }
            </style>
</head>
        <body>
            <h1>API Help & Documentation</h1>
            <p>Welcome to the API documentation! Below are the available endpoints and their usage:</p>
            <ul>
                <li><strong>/email/create</strong> - <em>Create a random email address and get the endpoint to forward emails</em></li>
                <li><strong>/email/:address</strong> - <em>Get the email content received by a specific address</em></li>
            </ul>
            
            <h2>Parameters for /email/:address:</h2>
            <ul>
                <li><strong>limit</strong>: <em>Optional. Limits the number of emails returned. Default is 10.</em></li>
            </ul>
            
            <h2>Example Usage:</h2>
            <pre>
GET /email/create
GET /email/:address?limit=5
            </pre>
            <p>For more information, feel free to contact support.</p>
            <!-- 返回 ui 页面 -->
            <a href="${uiUrl}">UI</a>
        </body>
        </html>
    `;

    return new Response(html, {
        headers: { 'Content-Type': 'text/html', ...CORS_HEADERS },
    });
});

// ui
register('GET', '/ui', async (request, env, ctx, params) => {
    const uiUrl = getUiUrl(env);
    return Response.redirect(uiUrl);
});



// index
register('GET', '/', async (request, env, ctx, params) => {
    const uiUrl = getUiUrl(env);
    return Response.redirect(uiUrl);
});


export default {
    async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const match = matchRoute(request.method, url.pathname);
        if (match) {
            return await match.handler(request, env, ctx, match.params);
        }

        return new Response(JSON.stringify({
            error: 'Invalid path. Use /email/create or /email/:address'
        }), { status: 404, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
    },

    async email(message: EmailMessage, env: Env, ctx: Ctx): Promise<void> {
        try {
            const rawEmail = await streamToArrayBuffer(message.raw, message.rawSize);
            const parser = new PostalMime();
            const parsedEmail: Email = await parser.parse(rawEmail);

            const msgTo = firstString((message as any).to);
            const msgFrom = firstString((message as any).from);
            const envelopeTo = msgTo || parsedEmail.to?.[0]?.address || 'None';
            const envelopeFrom = msgFrom || parsedEmail.from?.address || 'None';

            // D1 does not accept `undefined` bind values
            const html = parsedEmail.html ?? null;
            const text = parsedEmail.text ?? null;

            await env.DB.prepare(
                `INSERT INTO Email ("subject", "from", "to", "html", "text") VALUES (?, ?, ?, ?, ?)`
            )
                .bind(
                    parsedEmail.subject ?? 'None',
                    envelopeFrom,
                    envelopeTo,
                    html,
                    text
                )
                .run();
        } catch (error) {
            console.error('Insert email error:', (error as any)?.message ?? error);
        } finally {
            const list = (env.forward_address || '')
                .split(';')
                .map((address) => address.trim())
                .filter(Boolean);

            for (const address of list) {
                try {
                    await message.forward(address);
                } catch (error: any) {
                    console.error('Forward email error:', address, error?.message ?? error);
                }
            }
        }
    },
};
