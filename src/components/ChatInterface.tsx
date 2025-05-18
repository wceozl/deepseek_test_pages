import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import {
  fetchAgents,
  sendChatRequest,
  sendMastraChatRequest,
  Agent,
  ChatMessage,
  StreamHandlers
} from '../api/apollo';
import 'highlight.js/styles/github.css';
import './ChatInterface.css';

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'system', content: 'You are a helpful assistant.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('default'); // 默认模型
  const [agents, setAgents] = useState<Agent[]>([]); // 存储获取的agents
  const [agentsLoading, setAgentsLoading] = useState(false); // 加载状态

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 加载 agents 列表
  const loadAgents = async () => {
    setAgentsLoading(true);
    try {
      console.log('Loading agents...');
      const agentsData = await fetchAgents();
      console.log('Processed agents data:', agentsData);
      setAgents(agentsData);
    } catch (err) {
      console.error('Error loading agents:', err);
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  };

  // 在组件挂载时加载agents
  useEffect(() => {
    loadAgents();
  }, []);

  // 组合 agents 列表（包括默认模型）
  const models = React.useMemo(() => {
    const defaultModel = { id: 'default', name: 'DeepSeek 默认模型' };
    return [defaultModel, ...agents];
  }, [agents]);

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

  // 处理模型变更
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);

    // 更新system消息，如果切换到Mastra agent，使用agent的instructions
    if (newModel !== 'default') {
      const selectedAgent = agents.find(a => a.id === newModel);
      if (selectedAgent?.instructions) {
        setMessages([{
          role: 'system',
          content: selectedAgent.instructions
        }]);
      }
    } else {
      // 切换回默认模型
      setMessages([{
        role: 'system',
        content: 'You are a helpful assistant.'
      }]);
    }

    setError(null);
  };

  // 重试加载agents
  const handleRetryLoadAgents = () => {
    loadAgents();
  };

  // 辅助函数：更新助手消息
  const updateAssistantMessage = (content: string, append: boolean = true) => {
    setMessages(prev => {
      // 创建新的消息数组副本
      const newMessages = [...prev];
      const lastIndex = newMessages.length - 1;
      const lastMessage = newMessages[lastIndex];

      // 只有当最后一条消息是 assistant 角色时才更新
      if (lastMessage && lastMessage.role === 'assistant') {
        // 创建消息的新副本，避免直接修改
        newMessages[lastIndex] = {
          ...lastMessage,
          content: append ? lastMessage.content + content : content
        };
      } else {
        console.log('未找到助手消息进行更新, 消息数组:', newMessages);
      }

      return newMessages;
    });
  };

  // 处理用户输入提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: input.trim() };
    setInput('');
    setIsLoading(true);
    setError(null);

    // 更新消息数组，添加用户消息
    setMessages(prev => [...prev, userMessage]);

    try {
      // 准备发送给 API 的消息
      const apiMessages = messages
        .filter(msg => msg.role !== 'system' || messages.indexOf(msg) === 0)
        .concat(userMessage);

      console.log('Sending messages:', apiMessages);

      // 定义流处理器
      const handlers: StreamHandlers = {
        onStart: () => {
          // 添加一个空的助手消息
          setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        },
        onToken: (token) => {
          // 只追加当前令牌
          updateAssistantMessage(token, true);
        },
        onResetText: () => {
          // 清空当前消息文本，用于新消息开始
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];

            if (lastMessage && lastMessage.role === 'assistant') {
              lastMessage.content = '';
            }

            return newMessages;
          });
        },
        onToolCall: (toolCall) => {
          console.log('Tool call:', toolCall);
          // 可以在界面上显示工具调用
        },
        onToolResult: (toolResult) => {
          console.log('Tool result:', toolResult);
          // 可以在界面上显示工具结果
        },
        onFinish: () => {
          setIsLoading(false);
        },
        onError: (errorMessage) => {
          console.error('Stream error:', errorMessage);
          setError(errorMessage);
          setIsLoading(false);

          // 删除空的助手消息（如果存在）
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.content) {
              return prev.slice(0, -1);
            }
            return prev;
          });
        }
      };

      // 根据选择的模型发送请求
      if (selectedModel === 'default') {
        await sendChatRequest(apiMessages, handlers);
      } else {
        await sendMastraChatRequest(selectedModel, apiMessages, handlers);
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

      setIsLoading(false);
    }
  };

  // 其他处理函数
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleClearChat = () => {
    // 清空聊天，但保留当前模型的system消息
    if (selectedModel !== 'default') {
      const selectedAgent = agents.find(a => a.id === selectedModel);
      if (selectedAgent?.instructions) {
        setMessages([{
          role: 'system',
          content: selectedAgent.instructions
        }]);
      } else {
        setMessages([{ role: 'system', content: 'You are a helpful assistant.' }]);
      }
    } else {
      setMessages([{ role: 'system', content: 'You are a helpful assistant.' }]);
    }
    setError(null);
  };

  // 渲染模型选择项
  const renderModelOption = (model: Agent) => {
    // 截断描述为简短的工具提示
    const tooltip = model.description && model.description.length > 50
      ? `${model.description.substring(0, 50)}...`
      : model.description;

    return (
      <option key={model.id} value={model.id} title={tooltip}>
        {model.name}
      </option>
    );
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>DeepSeek 聊天</h2>

        <div className="model-selector">
          {agentsLoading ? (
            <span className="loading-agents">Agents加载中...</span>
          ) : (
            <>
              <select
                value={selectedModel}
                onChange={handleModelChange}
                disabled={isLoading}
                className="model-select"
              >
                {models.map(renderModelOption)}
              </select>
              {agents.length === 0 && (
                <button
                  onClick={handleRetryLoadAgents}
                  className="retry-button"
                  title="重试加载模型"
                >
                  ⟳
                </button>
              )}
            </>
          )}
        </div>

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
                {msg.content ? (
                  msg.role === 'assistant' ? (
                    <div className="markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, rehypeHighlight]}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )
                ) : (
                  msg.role === 'assistant' && isLoading && index === messages.length - 1 ? (
                    <span className="typing-indicator">正在思考...</span>
                  ) : ''
                )}
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