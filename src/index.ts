import PostalMime, { Email } from 'postal-mime';
import { parsers } from './parser/index.js';
import { EmailMessage } from 'cloudflare:email';

export interface Env {
    DB: D1Database;
    forward_address: string;
    EMAIL_DOMAIN: string;
}

interface Ctx { }

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        ...init,
        headers: {
            'content-type': 'application/json',
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

    // 获取查询参数 'limit' 和 'parser'
    const limit = url.searchParams.get('limit');
    const parserName = url.searchParams.get('parser');

    const maxResults = parseLimit(limit);
    const parser = parserName ? parsers[parserName] : null;

    try {
        const { results, success, meta } = await env.DB
            .prepare('SELECT "subject", "from", "to", "html", "text", "createdAt" FROM Email WHERE lower("to") = lower(?) ORDER BY createdAt DESC LIMIT ?')
            .bind(address, maxResults)
            .run();

        if (success) {
            // 如果存在解析器，解析邮件内容
            if (parser) {
                results.forEach((item) => {
                    const code = parser(item.text ?? '');
                    item['parsed_code'] = code;
                });
            }

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
GET /email/:address?limit=5&parser=exampleParser
            </pre>
            <p>For more information, feel free to contact support.</p>
            <!-- 返回 ui 页面 -->
            <a href="/ui">UI</a>
        </body>
        </html>
    `;

    return new Response(html, {
        headers: { 'Content-Type': 'text/html' },
    });
});

// ui
register('GET', '/ui', async (request, env, ctx, params) => {
    const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title> Interface</title>
            <style>
                body {
                    font-family: 'Courier New', Courier, monospace;
                    background-color: #000;
                    color: #00ff00;
                    padding: 20px;
                    margin: 0;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    justify-content: flex-start;
                    align-items: center;
                    overflow: hidden;
                }
                h1 {
                    color: #00ff00;
                    font-size: 3em;
                    text-shadow: 0 0 10px #00ff00;
                    margin-bottom: 30px;
                }
                button {
                    background-color: #00ff00;
                    color: #000;
                    border: none;
                    padding: 12px 24px;
                    font-size: 18px;
                    cursor: pointer;
                    border-radius: 5px;
                    margin-top: 20px;
                    box-shadow: 0 0 10px #00ff00;
                }
                button:hover {
                    background-color: #00cc00;
                    box-shadow: 0 0 20px #00ff00;
                }
                input {
                    background-color: #333;
                    color: #00ff00;
                    border: 1px solid #00ff00;
                    padding: 12px;
                    font-size: 18px;
                    margin-top: 20px;
                    border-radius: 5px;
                    width: 300px;
                    box-shadow: 0 0 5px #00ff00;
                }
                .email-container {
                    margin-top: 30px;
                    width: 100%;
                    max-width: 800px;
                    max-height: 400px;
                    overflow-y: auto;
                    border-top: 1px solid #00ff00;
                    padding-top: 20px;
                }
                .email {
                    background-color: #111;
                    border: 1px solid #00ff00;
                    padding: 15px;
                    margin-bottom: 10px;
                    border-radius: 5px;
                    box-shadow: 0 0 10px #00ff00;
                }
                .email h3 {
                    margin: 0;
                    color: #00ff00;
                    font-size: 1.5em;
                }
                .email p {
                    margin: 5px 0;
                }
                .email span {
                    font-size: 12px;
                    color: #00ff00;
                }
                .blink {
                    animation: blink 1s infinite;
                }
                @keyframes blink {
                    0% { opacity: 1; }
                    50% { opacity: 0; }
                    100% { opacity: 1; }
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                }
                .help-link {
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    color: #00ff00;
                    font-size: 16px;
                    text-decoration: none;
                    padding: 5px 10px;
                    border: 1px solid #00ff00;
                    border-radius: 5px;
                    box-shadow: 0 0 5px #00ff00;
                }
                .help-link:hover {
                    background-color: #00cc00;
                    box-shadow: 0 0 10px #00ff00;
                }
                .github-link {
                    position: absolute;
                    top: 20px;
                    right: 100px;
                    color: #00ff00;
                    font-size: 16px;
                    text-decoration: none;
                    padding: 5px 10px;
                    border: 1px solid #00ff00;
                    border-radius: 5px;
                    box-shadow: 0 0 5px #00ff00;
                }

                #parser {
                    background-color: #333;
                    color: #00ff00;
                    border: 1px solid #00ff00;
                    padding: 12px;
                    font-size: 18px;
                }
                    
            </style>
        </head>
        <body>
            <div class="header">
                <select id="parser">
                    <option value="cursor">Cursor</option>
                </select>
                <a href="https://github.com/bestk/email_worker_parser" target="_blank" class="github-link">Github</a>
                <a href="/help" class="help-link">Help</a>
                
            </div>
            <h1> Email Interface</h1>
            <button id="create-email-btn">Create New Email</button>
            <input id="email-address" type="text" placeholder="Enter a historical email address" />
            <button id="poll-email-btn">Start Polling</button>
    
            <div class="email-container" id="email-container"></div>

            <script>
                const createEmailBtn = document.getElementById('create-email-btn');
                const pollEmailBtn = document.getElementById('poll-email-btn');
                const emailContainer = document.getElementById('email-container');
                const emailAddressInput = document.getElementById('email-address');
                let polling = false;
                let currentEmail = null;

                // Function to create a new email address
                createEmailBtn.addEventListener('click', async () => {
                    const response = await fetch('/email/create');
                    const data = await response.json();
                    currentEmail = data.data.address; // Save the new email address
                    alert('New email created: ' + currentEmail);
                    emailAddressInput.value = currentEmail; // Autofill the email input
                });

                // Function to fetch emails for the current email address
                async function fetchEmails(address) {
                    const limit = 5;  // You can adjust this or make it dynamic
                    const parser = document.getElementById('parser').value;
                    const response = await fetch(\`/email/\${address}?limit=\${limit}&parser=\${parser}\`);
                    const data = await response.json();
                    return data.success ? data.data : [];
                }

                // Polling function
                async function pollEmails() {
                    if (!currentEmail && !emailAddressInput.value) {
                        alert('Please create an email first or enter a historical email address.');
                        return;
                    }
                    const address = currentEmail || emailAddressInput.value;
                    const emails = await fetchEmails(address);

                    emails.forEach((email) => {
                        if (!document.querySelector(\`[data-id="\${email.createdAt}"]\`)) {
                            const emailDiv = document.createElement('div');
                            emailDiv.className = 'email';
                            emailDiv.setAttribute('data-id', email.createdAt);
                            
                            emailDiv.innerHTML = \`
                                <h3 class="blink">Subject: \${email.subject}</h3>
                                <p><strong>From:</strong> \${email.from}</p>
                                <p><strong>To:</strong> \${email.to}</p>
                                <p><strong>Html:</strong> \${email.html}</p> 
                                <p><strong>Text:</strong> \${email.text}</p>
                                <p><strong>Parsed Code:</strong> \${email.parsed_code}</p>
                                <span>\${email.createdAt}</span>
                            \`;
                            emailContainer.appendChild(emailDiv);
                        }
                    });
                }

                // Start polling on clicking the button
                pollEmailBtn.addEventListener('click', () => {
                    if (polling) {
                        polling = false;
                        pollEmailBtn.textContent = 'Start Polling';
                    } else {
                        polling = true;
                        pollEmailBtn.textContent = 'Stop Polling';
                        pollEmails();
                        setInterval(async () => { 
                            if (polling) await pollEmails();
                        }, 5000);  // Poll every 5 seconds
                    }
                });

              
            </script>
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
    const UI_URL = new URL('/ui', url.origin).toString();
    return Response.redirect(UI_URL);
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
