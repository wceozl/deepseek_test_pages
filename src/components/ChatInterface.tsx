import React, { useState, useRef, useEffect } from 'react';
import './ChatInterface.css';

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

const ChatInterface: React.FC = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'system', content: 'You are a helpful assistant.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // 自动滚动到最新消息
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 自动调整输入框高度
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    }, [input]);

    // 处理用户输入提交
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!input.trim() || isLoading) return;

        const userMessage: ChatMessage = { role: 'user', content: input.trim() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setError(null);

        try {
            // 准备发送给 API 的消息，过滤掉系统消息
            const apiMessages = messages
                .filter(msg => msg.role !== 'system' || messages.indexOf(msg) === 0)
                .concat(userMessage);

            console.log('发送消息到API:', apiMessages);

            // 使用流式 API
            const response = await fetch('https://api.glyphscript.site/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ messages: apiMessages })
            });

            if (!response.ok) {
                throw new Error(`API 错误: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('响应没有提供数据流');
            }

            // 处理流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');

            // 添加一个空的助手消息
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            let accumulatedContent = '';
            let buffer = '';
            let receivedAnyData = false;

            console.log('开始读取流');

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    console.log('流读取完成');

                    // 如果没有收到任何数据，显示错误
                    if (!receivedAnyData) {
                        console.error('流结束但没有收到任何数据');
                        setError('未收到来自 API 的数据，请检查服务器日志');
                    }

                    break;
                }

                // 解码数据块
                const chunk = decoder.decode(value, { stream: true });
                console.log('收到数据块, 长度:', chunk.length);
                console.log('数据块内容:', chunk);

                receivedAnyData = true;

                // 如果数据块以 'data: ' 开头，说明这是标准的 SSE 格式
                if (chunk.startsWith('data: ')) {
                    // 继续使用原来的 SSE 解析逻辑
                    buffer += chunk;

                    // 处理缓冲区中的完整行
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    // ...其他处理代码...
                } else {
                    // 如果不是标准 SSE 格式，直接尝试解析整个块
                    try {
                        // 首先尝试作为单个 JSON 解析
                        const parsedData = JSON.parse(chunk);

                        if (parsedData.test) {
                            console.log('收到测试事件');
                            continue;
                        }

                        if (parsedData.error) {
                            setError(`API 错误: ${parsedData.error}`);
                            continue;
                        }

                        if (parsedData.choices && parsedData.choices[0]) {
                            if (parsedData.choices[0].delta && parsedData.choices[0].delta.content) {
                                accumulatedContent += parsedData.choices[0].delta.content;
                                updateAssistantMessage(accumulatedContent);
                            } else if (parsedData.choices[0].message && parsedData.choices[0].message.content) {
                                // 非流式响应格式
                                accumulatedContent = parsedData.choices[0].message.content;
                                updateAssistantMessage(accumulatedContent);
                            }
                        }
                    } catch (e) {
                        console.log('数据块不是有效 JSON，尝试分行解析');

                        // 如果整个块不是有效的 JSON，尝试按行解析
                        const lines = chunk.split('\n');
                        for (const line of lines) {
                            if (!line.trim()) continue;

                            try {
                                if (line.startsWith('data: ')) {
                                    const data = line.slice(5).trim();
                                    if (data === '[DONE]') continue;

                                    const parsedData = JSON.parse(data);
                                    // 处理解析后的数据...
                                } else {
                                    const parsedData = JSON.parse(line);
                                    // 处理解析后的数据...
                                }
                            } catch (lineError) {
                                console.error('解析行数据失败:', line);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('聊天错误:', err);
            setError(err instanceof Error ? err.message : '发送消息时出错');

            // 如果已经添加了助手消息，但发生了错误，删除空消息
            setMessages(prev => {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.content) {
                    return prev.slice(0, -1);
                }
                return prev;
            });
        } finally {
            setIsLoading(false);
        }
    };

    // 辅助函数，更新助手消息
    function updateAssistantMessage(content: string) {
        setMessages(prev => {
            const newMessages = [...prev];
          if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
            newMessages[newMessages.length - 1].content = content;
          }
          return newMessages;
        });
      }
    // 处理输入变化
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
    };

    // 处理回车键提交
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    // 清空聊天记录
    const handleClearChat = () => {
        setMessages([{ role: 'system', content: 'You are a helpful assistant.' }]);
        setError(null);
    };

    return (
        <div className="chat-container">
            <div className="chat-header">
                <h2>DeepSeek 聊天</h2>
                <button className="clear-button" onClick={handleClearChat}>
                    清空对话
                </button>
            </div>

            <div className="chat-messages">
                {messages.map((msg, index) => (
                    msg.role !== 'system' && (
                        <div key={index} className={`message ${msg.role}`}>
                            <div className="message-avatar">
                                {msg.role === 'user' ? '👤' : '🤖'}
                            </div>
                            <div className="message-content">
                                {msg.content || (msg.role === 'assistant' && isLoading && index === messages.length - 1 ? (
                                    <span className="typing-indicator">正在思考...</span>
                                ) : '')}
                            </div>
                        </div>
                    )
                ))}
                {error && (
                    <div className="error-message">
                        <p>{error}</p>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-form" onSubmit={handleSubmit}>
                <textarea
                    ref={inputRef}
                    className="chat-input"
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息..."
                    disabled={isLoading}
                    rows={1}
                />
                <button
                    type="submit"
                    className="send-button"
                    disabled={isLoading || !input.trim()}
                >
                    {isLoading ? '发送中...' : '发送'}
                </button>
            </form>
        </div>
    );
};

export default ChatInterface;