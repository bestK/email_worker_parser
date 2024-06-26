import PostalMime, { Attachment, Email } from 'postal-mime';
import { ReadableStream } from 'stream';

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
}

interface Ctx {}

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
        // 定义获取邮件信息接口 /email/{address} 返回 email 列表
        request.url;
        const url = new URL(request.url);
        const path = url.pathname;
        const address = path.split('/')[2];
        console.log('address:', address);
        if (path.startsWith('/email')) {
            const r = await env.DB.prepare('SELECT * FROM Email WHERE "to" = ?').bind(address).run();
            console.log(JSON.stringify(r));
            return new Response(JSON.stringify(r), {
                headers: {
                    'content-type': 'application/json',
                },
            });
        }

        return new Response('Hello World!');
    },

    async email(event: Event, env: Env, ctx: Ctx): Promise<void> {
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
        try {
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
        }

        env.forward_address.split(';').forEach(async address => await event.forward(address));
    },
};
