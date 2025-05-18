// api/apollo.ts
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';

// 创建 Apollo Client
const client = new ApolloClient({
  link: new HttpLink({
    uri: 'https://api.glyphscript.site/graphql',
  }),
  cache: new InMemoryCache(),
});

// 定义接口
export interface Agent {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  tools?: Record<string, any>;
  workflows?: Record<string, any>;
  provider?: string;
  modelId?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface StreamHandlers {
  onStart: () => void;
  onToken: (token: string) => void;
  onResetText: () => void; // 新增：重置文本内容
  onToolCall: (toolCall: any) => void;
  onToolResult: (toolResult: any) => void;
  onFinish: () => void;
  onError: (error: string) => void;
}

// 获取 Agents 列表
export const fetchAgents = async (): Promise<Agent[]> => {
  try {
    console.log('Fetching agents from Mastra API...');
    const response = await fetch('https://mastra.glyphscript.site/api/agents');
    
    if (!response.ok) {
      console.error(`API error: ${response.status} - ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    console.log('Agents fetched successfully:', data);
    
    // 将对象格式转换为数组格式
    const agentsArray: Agent[] = Object.entries(data).map(([id, agentData]: [string, any]) => ({
      id,
      name: agentData.name || id,
      description: agentData.instructions?.substring(0, 100) || '',
      instructions: agentData.instructions,
      tools: agentData.tools,
      workflows: agentData.workflows,
      provider: agentData.provider,
      modelId: agentData.modelId
    }));
    
    return agentsArray;
  } catch (error) {
    console.error('Error fetching agents:', error);
    return [];
  }
};

// 发送聊天请求 - 默认 DeepSeek 模型
export const sendChatRequest = async (
  messages: ChatMessage[],
  handlers: StreamHandlers
) => {
  try {
    const response = await fetch('https://api.glyphscript.site/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messages })
    });
    
    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`);
    }
    
    if (!response.body) {
      throw new Error('响应没有提供数据流');
    }
    
    // 设置初始状态
    handlers.onStart();
    
    // 处理流式响应 - OpenAI 格式
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        handlers.onFinish();
        break;
      }
      
      // 解码数据块
      const chunk = decoder.decode(value, { stream: true });
      
      // 将新数据添加到缓冲区
      buffer += chunk;
      
      // 处理缓冲区中的完整行
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留最后一个可能不完整的行
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        
        if (line.startsWith('data: ')) {
          const data = line.slice(5).trim();
          
          // 检查是否为流式响应结束标记
          if (data === '[DONE]') {
            continue;
          }
          
          try {
            const parsedData = JSON.parse(data);
            
            if (parsedData.error) {
              handlers.onError(parsedData.error);
              continue;
            }
            
            // 检查是否含有 delta 内容
            if (parsedData.choices && 
                parsedData.choices[0] && 
                parsedData.choices[0].delta && 
                parsedData.choices[0].delta.content) {
              handlers.onToken(parsedData.choices[0].delta.content);
            }
          } catch (e) {
            console.error('解析JSON数据出错:', e, data);
          }
        }
      }
    }
  } catch (error) {
    console.error('Chat request error:', error);
    handlers.onError(error instanceof Error ? error.message : String(error));
  }
};

// 发送 Mastra 聊天请求
export const sendMastraChatRequest = async (
  agentId: string,
  messages: ChatMessage[],
  handlers: StreamHandlers
) => {
  try {
    console.log('Sending request to Mastra agent:', agentId);
    
    const response = await fetch(`https://mastra.glyphscript.site/api/agents/${agentId}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messages })
    });
    
    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`);
    }
    
    if (!response.body) {
      throw new Error('响应没有提供数据流');
    }
    
    // 设置初始状态
    handlers.onStart();
    
    // 处理流式响应 - Mastra 特殊格式
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    
    let buffer = '';
    let firstTokenReceived = false; // 标记是否收到了第一个token
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        handlers.onFinish();
        break;
      }
      
      // 解码数据块
      const chunk = decoder.decode(value, { stream: true });
      
      // 将新数据添加到缓冲区
      buffer += chunk;
      
      // 查找完整的行
      while (buffer.includes('\n')) {
        const lineEndIndex = buffer.indexOf('\n');
        const line = buffer.substring(0, lineEndIndex);
        buffer = buffer.substring(lineEndIndex + 1);
        
        if (!line.trim()) continue;
        
        // 解析前缀和内容
        const match = line.match(/^([a-zA-Z0-9]):(.*)$/);
        if (!match) {
          console.warn('Unexpected line format:', line);
          continue;
        }
        
        const [, prefix, content] = match;
        
        try {
          switch (prefix) {
            case 'f': // 消息开始
              console.log('Message start:', content);
              firstTokenReceived = false; // 重置标记
              break;
              
            case '9': // 工具调用
              try {
                const toolCall = JSON.parse(content);
                console.log('Tool call:', toolCall);
                handlers.onToolCall(toolCall);
              } catch (e) {
                console.error('Failed to parse tool call:', content, e);
              }
              break;
              
            case 'a': // 工具结果
              try {
                const toolResult = JSON.parse(content);
                console.log('Tool result:', toolResult);
                handlers.onToolResult(toolResult);
              } catch (e) {
                console.error('Failed to parse tool result:', content, e);
              }
              break;
              
            case '0': // 文本令牌 - 关键部分
              try {
                let token;
                // 解析令牌
                try {
                  token = JSON.parse(content);
                } catch (e) {
                  token = content;
                }
                
                // 检查是否是第一个令牌，如果是，则清空当前消息
                if (!firstTokenReceived) {
                  firstTokenReceived = true;
                  // 对于第一个令牌，发送一个空字符串和replace=true的信号
                  handlers.onResetText();
                }
                
                // 只发送当前令牌
                handlers.onToken(token);
              } catch (e) {
                console.warn('Failed to parse token:', content, e);
              }
              break;
              
            case 'e': // 部分完成事件
            case 'd': // 最终完成
              console.log('Completion event:', content);
              break;
              
            default:
              console.log(`Unknown prefix ${prefix}:`, content);
          }
        } catch (e) {
          console.error('Parse error for line:', line, e);
        }
      }
    }
  } catch (error) {
    console.error('Mastra chat request error:', error);
    handlers.onError(error instanceof Error ? error.message : String(error));
  }
};

export default client;