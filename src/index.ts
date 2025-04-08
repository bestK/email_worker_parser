import PostalMime, { Attachment, Email } from 'postal-mime';
import { CloudflareClient } from './cf_api';
import { env } from 'process';
import { parsers } from './parser/index.js';


interface Event {
    raw: ReadableStream;
    rawSize: number;
    forward: (email: string) => Promise<void>;
}

export interface Env {
    // If you set another name in wrangler.toml as the value for 'binding',
    // replace "DB" with the variable name you defined.
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
    let result = new Uint8Array(streamSize);
    let bytesRead = 0;
    const reader = stream.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        result.set(value, bytesRead);
        bytesRead += value.length;
    }
    return result;
}

export default {
    async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;
        const str = path.split('/');

        if (path === '/email/create') { // 使用精确匹配或 startsWith 如果需要子路径
            const client = new CloudflareClient({
                apiKey: env.CLOUDFLARE_API_KEY,
                email: env.CLOUDFLARE_EMAIL,
                accountId: env.ACCOUNT_ID,
                zoneId: env.ZONE_ID
            });

            const randomEmail = Math.random().toString(36).substring(2, 15)
                + Math.random().toString(36).substring(2, 15)
                + '@'
                + env.EMAIL_DOMAIN;

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
                    console.error("Cloudflare API error creating rule:", rule);
                    return new Response(JSON.stringify({
                        success: false,
                        error: 'Failed to create email rule via Cloudflare API',
                        details: rule?.errors ?? 'Unknown API error'
                    }), { status: 500, headers: { 'content-type': 'application/json' } });
                }
            } catch (error: any) {
                console.error("Error calling Cloudflare API:", error);
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Error communicating with Cloudflare API',
                    details: error.message
                }), { status: 500, headers: { 'content-type': 'application/json' } });
            }
        }

        // --- 检查 /email/{address} 路径 ---
        // (确保路径格式有效，例如 /email/user@domain.com)
        if (path.startsWith('/email/') && str.length === 3 && str[2]) {
            let address = str[2];
            if (!address.includes('?')) {
                address = address.split('?')[0];
            }


            try {
                const { results, success, meta } = await env.DB.prepare('SELECT "subject", "from", "to", "html", "text", "createdAt" FROM Email WHERE "to" = ?')
                    .bind(address)
                    .run();

                if (success) {
                    const parserName = url.searchParams.get('parser');
                    if (parserName) {
                        const parse = parsers[parserName];

                        results.forEach(async (item) => {
                            const code = parse(item.text);
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
                return new Response(JSON.stringify({ success: false, error: 'query error', details: e.message }), {
                    status: 500,
                    headers: { 'content-type': 'application/json' },
                });
            }
        }

        return new Response(JSON.stringify({ error: 'Invalid path format for /email/ endpoint. Use /email/create or /email/{address}' }), {
            status: 400, // Bad Request
            headers: { 'content-type': 'application/json' },
        });
    },

    async email(event: Event, env: Env, ctx: Ctx): Promise<void> {
        try {
            const rawEmail = await streamToArrayBuffer(event.raw, event.rawSize);
            const parser = new PostalMime();
            const parsedEmail: Email = await parser.parse(rawEmail);

            if (parsedEmail.attachments.length == 0) {
                console.log('No attachments');
            } else {
                parsedEmail.attachments.forEach((att: Attachment) => {
                    console.log('Attachment: ', att.filename);
                    console.log('Attachment disposition: ', att.disposition);
                    console.log('Attachment mime type: ', att.mimeType);
                });
            }
            const r = await env.DB.prepare(
                `INSERT INTO Email ("subject", "from", "to","html","text") VALUES (?, ?, ?, ?, ?)`,
            )
                .bind(
                    parsedEmail.subject ?? 'None',
                    parsedEmail.from?.address,
                    parsedEmail.to[0]?.address ?? 'None',
                    parsedEmail.html,
                    parsedEmail.text,
                )
                .run();
            console.log('Insert email:', r);
        } catch (error) {
            console.log('Insert email error:', error.message);
        } finally {
            env.forward_address.split(';').forEach(async address => await event.forward(address));
        }

    },
};
