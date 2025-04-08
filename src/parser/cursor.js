/**
 * 解析包含换行符的验证码文本
 * @param {string} text - 需要解析的文本
 * @returns {string|null} - 返回解析到的验证码，如果没有找到则返回null
 */
export default function parse(text) {
    // 清理文本：去除多余的空白字符和换行符
    const cleanText = text.replace(/\s+/g, ' ').trim();
     
    const pattern = /one-time code is:?\s*(\d+)/i;
    
    const match = cleanText.match(pattern);
    if (match && match[1]) {
        return match[1];
    }

    // 如果上面的匹配失败，尝试直接匹配数字
    const numberMatch = cleanText.match(/\d{6}/);
    return numberMatch ? numberMatch[0] : null;
}



