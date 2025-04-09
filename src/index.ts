import PostalMime, { Email } from 'postal-mime';
import { CloudflareClient } from './cf_api';
import { parsers } from './parser/index.js';
import { EmailMessage } from "cloudflare:email";

interface Event {
    raw: ReadableStream;
    rawSize: number;
    forward: (email: string) => Promise<void>;
}

export interface Env {
    DB: D1Database;
    forward_address: string;
    CLOUDFLARE_EMAIL: string;
    CLOUDFLARE_API_KEY: string;
    ZONE_ID: string;
    ACCOUNT_ID: string;
    EMAIL_DOMAIN: string;
}

interface Ctx { }

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

// 创建 Email 地址
register('GET', '/email/create', async (request, env, ctx, params) => {
    const client = new CloudflareClient({
        apiKey: env.CLOUDFLARE_API_KEY,
        email: env.CLOUDFLARE_EMAIL,
        accountId: env.ACCOUNT_ID,
        zoneId: env.ZONE_ID
    });

    const randomEmail = Math.random().toString(36).substring(2, 15)
        + Math.random().toString(36).substring(2, 15)
        + '@' + env.EMAIL_DOMAIN;

    try {
        const rule = await client.email.rules.create({
            zoneId: env.ZONE_ID,
            name: `Forward to ${randomEmail}`,
            enabled: true,
            priority: 10,
            matchers: [{ type: 'literal', field: 'to', value: randomEmail }],
            actions: [{ type: 'worker', value: ['email_worker_parser'] }]
        });

        if (rule && rule.success) {
            return new Response(JSON.stringify({
                success: true,
                data: {
                    fetch_endpoint: `/email/${randomEmail}`,
                    address: randomEmail
                }
            }), { headers: { 'content-type': 'application/json' } });
        } else {
            return new Response(JSON.stringify({
                success: false,
                error: 'Failed to create email rule via Cloudflare API',
                details: rule?.errors ?? 'Unknown API error'
            }), { status: 500, headers: { 'content-type': 'application/json' } });
        }
    } catch (error: any) {
        return new Response(JSON.stringify({
            success: false,
            error: 'Error communicating with Cloudflare API',
            details: error.message
        }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
});

// 查询某个 email 地址收到的内容
register('GET', '/email/:address', async (request, env, ctx, params) => {
    const address = params.address;
    const url = new URL(request.url);
    try {
        const { results, success, meta } = await env.DB
            .prepare('SELECT "subject", "from", "to", "html", "text", "createdAt" FROM Email WHERE "to" = ?')
            .bind(address)
            .run();

        if (success) {
            const parserName = url.searchParams.get('parser');
            if (parserName && parsers[parserName]) {
                const parse = parsers[parserName];
                for (const item of results) {
                    item['parsed_code'] = parse(item.text);
                }
            }

            return new Response(JSON.stringify({ success: true, data: results }), {
                headers: { 'content-type': 'application/json' },
            });
        } else {
            return new Response(JSON.stringify({ success: false, error: 'Failed to retrieve emails' }), {
                status: 500,
                headers: { 'content-type': 'application/json' },
            });
        }
    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: 'query error', details: e.message }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
        });
    }
});

export default {
    async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
        const url = new URL(request.url);
        const match = matchRoute(request.method, url.pathname);
        if (match) {
            return await match.handler(request, env, ctx, match.params);
        }

        return new Response(JSON.stringify({
            error: 'Invalid path. Use /email/create or /email/:address'
        }), { status: 404, headers: { 'content-type': 'application/json' } });
    },

    async email(message: EmailMessage, env: Env, ctx: Ctx): Promise<void> {
        try {
            const rawEmail = await streamToArrayBuffer(message.raw, message.rawSize);
            const parser = new PostalMime();
            const parsedEmail: Email = await parser.parse(rawEmail);

            await env.DB.prepare(
                `INSERT INTO Email ("subject", "from", "to", "html", "text") VALUES (?, ?, ?, ?, ?)`
            )
                .bind(
                    parsedEmail.subject ?? 'None',
                    parsedEmail.from?.address,
                    parsedEmail.to[0]?.address ?? 'None',
                    parsedEmail.html,
                    parsedEmail.text
                )
                .run();
        } catch (error) {
            console.error('Insert email error:', error.message);
        } finally {
            const list = env.forward_address.split(';');
            for (const address of list) {
                await message.forward(address);
            }
        }
    },
};
