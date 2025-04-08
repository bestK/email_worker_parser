import { URLSearchParams } from 'url'; // 确保导入 URLSearchParams 如果环境需要

// --- 类型定义 (可选但推荐) ---
interface CloudflareClientOptions {
    apiKey: string;
    // 可以添加其他全局配置，如 accountId, email 等，如果需要
    accountId?: string;
    zoneId?: string;
    email?: string;
}

interface EmailRuleMatcher {
    type: 'literal' | 'all'; // 根据 API 文档添加更多类型
    field: 'to'; // 根据 API 文档添加更多字段
    value: string;
}

interface EmailRuleAction {
    type: 'forward' | 'worker' | 'drop'; // 根据 API 文档添加更多类型
    value: string[];
}

interface EmailRule {
    tag?: string; // ID of the rule
    name: string;
    priority?: number;
    enabled?: boolean;
    matchers: EmailRuleMatcher[];
    actions: EmailRuleAction[];
}

interface CreateEmailRuleParams {
    zoneId: string;
    name: string;
    enabled?: boolean;
    priority?: number;
    matchers: EmailRuleMatcher[];
    actions: EmailRuleAction[];
}

// --- API 客户端 ---

class CloudflareClient {
    private apiKey: string;
    private clientEmail?: string; // 添加成员变量来存储 email 字符串
    private baseUrl = 'https://api.cloudflare.com/client/v4';
    // private accountId?: string; // 如果需要全局 accountId

    constructor(options: CloudflareClientOptions) {
        if (!options.apiKey) {
            throw new Error("Cloudflare API Key (apiKey) is required in options.");
        }
        // 检查是否同时需要 email (如果使用 Global API Key)
        if (!options.email) {
            // 如果你确定使用的是 Global API Key (X-Auth-Key)，则 email 是必需的
            // 如果你使用的是 API Token，则不需要 email，且应更改下面的认证头
            console.warn("Warning: Cloudflare email was not provided in options. This might be required if using a Global API Key.");
        }
        this.apiKey = options.apiKey;
        this.clientEmail = options.email; // 存储 email 字符串
        // this.accountId = options.accountId;

        // 初始化资源命名空间
        this.email = new EmailAPI(this);
        // 可以添加更多资源, e.g., this.zones = new ZonesAPI(this);
    }

    // --- 资源访问器 ---
    public readonly email: EmailAPI;
    // public readonly zones: ZonesAPI;

    /**
     * 内部方法，用于执行实际的 API 请求
     * @param method HTTP 方法 (GET, POST, PUT, DELETE, etc.)
     * @param endpoint API 路径 (e.g., /zones/{zone_id}/...)
     * @param queryParams 可选的查询参数
     * @param body 可选的请求体
     * @returns Promise<any> 解析后的 JSON 响应
     */
    public async _request(
        method: string,
        endpoint: string,
        queryParams?: URLSearchParams,
        body?: any
    ): Promise<any> {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        if (queryParams) {
            url.search = queryParams.toString();
        }

        console.log(`Fetching URL: ${method.toUpperCase()} ${url.toString()}`); // 添加日志

        // --- 修改请求头 --- 
        const headers: HeadersInit = {
            // 'Authorization': `Bearer ${this.apiKey}`, // 使用此行替代下面两行，如果你用的是 API Token
            'X-Auth-Key': this.apiKey,       // Global API Key
            'X-Auth-Email': this.clientEmail || '', // 使用存储的 email 字符串。如果未提供，则为空字符串 (可能导致 API 错误)
            'Content-Type': 'application/json'
        };

        // 如果 email 是严格必需的，可以在这里添加检查
        // if (!this.clientEmail) { 
        //     throw new Error("Cloudflare email is required for this API request but was not provided.");
        // }

        const options: RequestInit = {
            method: method.toUpperCase(),
            headers: headers,
        };

        if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url.toString(), options);

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`Cloudflare API Error: ${response.status} ${response.statusText}`, errorBody);
                throw new Error(`Cloudflare API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            if (response.status === 204) { // No Content
                return null;
            }

            const text = await response.text();
            return text ? JSON.parse(text) : null; // Handle empty responses that are not 204

        } catch (error) {
            console.error(`Error fetching from Cloudflare API (${method} ${endpoint}):`, error);
            throw error;
        }
    }
}

// --- Email 相关 API ---
class EmailAPI {
    constructor(private client: CloudflareClient) {
        // 初始化 Email 下的子资源
        this.rules = new EmailRulesAPI(client);
        // 可以添加其他 email 相关资源, e.g., this.settings = ...
    }
    public readonly rules: EmailRulesAPI;
    // public readonly settings: EmailSettingsAPI;
}

// --- Email Routing Rules API ---
class EmailRulesAPI {
    constructor(private client: CloudflareClient) { }

    /**
     * 创建邮件路由规则
     * @param params 创建规则所需的参数，包括 zoneId
     * @returns Promise<any> Cloudflare API 响应
     */
    async create(params: CreateEmailRuleParams): Promise<{ success: boolean; result: EmailRule; errors: any[]; messages: any[] } | null> {
        const { zoneId, ...ruleData } = params; // 从参数中分离 zoneId 和规则数据
        if (!zoneId) {
            throw new Error("zoneId is required to create an email rule.");
        }
        const endpoint = `/zones/${zoneId}/email/routing/rules`;

        // 确保请求体符合 API 预期格式
        const body: Partial<EmailRule> = {
            name: ruleData.name,
            enabled: ruleData.enabled ?? true, // 默认为 true
            priority: ruleData.priority ?? 0, // 默认为 0
            matchers: ruleData.matchers,
            actions: ruleData.actions
        };

        console.log(`Attempting to create email rule '${ruleData.name}' in zone ${zoneId}`);
        try {
            const result = await this.client._request('POST', endpoint, undefined, body);
            console.log('Email rule created successfully:', result);
            return result;
        } catch (error) {
            console.error(`Failed to create email rule '${ruleData.name}':`, error);
            throw error; // 重新抛出，让上层处理
        }
    }

    // --- 这里可以添加 list, get, update, delete 等其他规则操作 ---
    // async list(zoneId: string): Promise<any> { ... }
    // async get(zoneId: string, ruleId: string): Promise<any> { ... }
    // async update(zoneId: string, ruleId: string, params: UpdateEmailRuleParams): Promise<any> { ... }
    // async delete(zoneId: string, ruleId: string): Promise<any> { ... }
}

// --- 导出客户端类，但不导出内部实现细节 ---
export { CloudflareClient };

// --- 不再需要旧的 create_email_rule 函数 ---
// export async function create_email_rule(...) { ... }


/*
// --- 示例如何调用 (需要配置环境变量) ---
async function main() {
    const apiKey = process.env.CLOUDFLARE_API_KEY;
    const zoneId = process.env.ZONE_ID;
    const yourDomain = process.env.YOUR_DOMAIN; // e.g., example.com

    if (!apiKey || !zoneId || !yourDomain) {
        console.error('Error: 请设置 CLOUDFLARE_API_KEY, ZONE_ID, 和 YOUR_DOMAIN 环境变量。');
        return;
    }

    // 1. 创建 Cloudflare 客户端实例
    const client = new CloudflareClient({ apiKey: apiKey });

    // 2. 定义规则参数
    const ruleName = 'Forward Test Email';
    const matchToEmail = `test@${yourDomain}`; // 匹配发送到 test@your-domain.com 的邮件
    const forwardTo = 'your-personal-email@gmail.com'; // 修改为你的目标邮箱

    const ruleParams: CreateEmailRuleParams = {
        zoneId: zoneId,
        name: ruleName,
        enabled: true,
        priority: 10, // 可以设置优先级
        matchers: [
            { type: "literal", field: "to", value: matchToEmail }
        ],
        actions: [
            { type: "forward", value: [forwardTo] }
        ]
    };

    try {
        // 3. 调用客户端方法创建规则
        console.log(`Creating rule: ${ruleName}`);
        const ruleResult = await client.email.rules.create(ruleParams);

        if (ruleResult && ruleResult.success) {
            console.log('Successfully created rule:', ruleResult.result.name, 'with ID:', ruleResult.result.tag);
        } else {
             // 处理 API 返回的错误或无结果的情况
            console.log('Rule creation request processed, but Cloudflare API indicated potential issues or no result data.');
             if (ruleResult) {
                console.error('Errors:', ruleResult.errors);
                console.warn('Messages:', ruleResult.messages);
             }
        }
    } catch (err) {
        console.error('Rule creation failed in main:', err);
    }
}

// main(); // 取消注释以运行示例
*/


