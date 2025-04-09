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

// email/:address 路由处理
register('GET', '/email/:address', async (request, env, ctx, params) => {
    const { address } = params; // 获取 :address 部分
    const url = new URL(request.url);

    // 获取查询参数 'limit' 和 'parser'
    const limit = url.searchParams.get('limit');
    const parserName = url.searchParams.get('parser');

    // 默认情况下限制结果数量
    const maxResults = limit ? parseInt(limit, 10) : 10; // 默认10条记录
    const parser = parserName ? parsers[parserName] : null;

    try {
        const { results, success, meta } = await env.DB
            .prepare('SELECT "subject", "from", "to", "html", "text", "createdAt" FROM Email WHERE "to" = ? ORDER BY createdAt DESC LIMIT ?')
            .bind(address, maxResults) // 绑定 address 和 limit
            .run();

        if (success) {
            // 如果存在解析器，解析邮件内容
            if (parser) {
                results.forEach((item) => {
                    const code = parser(item.text);
                    item['parsed_code'] = code;
                });
            }

            return new Response(JSON.stringify({ success: true, data: results }), {
                headers: { 'content-type': 'application/json' },
            });
        } else {
            console.error("D1 query failed:", meta);
            return new Response(JSON.stringify({ success: false, error: 'Failed to retrieve emails' }), {
                status: 500,
                headers: { 'content-type': 'application/json' },
            });
        }
    } catch (e: any) {
        console.error("Error fetching from D1:", e);
        return new Response(JSON.stringify({ success: false, error: 'Query error', details: e.message }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
        });
    }
});

// help
register('GET', '/help', async (request, env, ctx, params) => {
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
                <li><strong>parser</strong>: <em>Optional. Specifies the parser to be used for email content.</em></li>
            </ul>
            
            <h2>Example Usage:</h2>
            <pre>
GET /email/create
POST /email/:address?limit=5&parser=exampleParser
            </pre>
            <p>For more information, feel free to contact support.</p>
        </body>
        </html>
    `;

    return new Response(html, {
        headers: { 'Content-Type': 'text/html' },
    });
});

// index
register('GET', '/', async (request, env, ctx, params) => {
    const url = new URL(request.url);
    const helpUrl = new URL('/help', url.origin).toString();
    return Response.redirect(helpUrl);
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
