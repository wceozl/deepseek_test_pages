import React, { useState } from 'react';
import { gql, useMutation } from '@apollo/client';

// GraphQL查询
const GENERATE_TEXT = gql`
  mutation GenerateText($prompt: String!) {
    generateText(prompt: $prompt) {
      text
    }
  }
`;

const GraphQLDemo: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [generateText, { loading }] = useMutation(GENERATE_TEXT);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await generateText({ variables: { prompt } });
      setResponse(result.data.generateText.text);
    } catch (error) {
      console.error('Error generating text:', error);
      setResponse('Error: Failed to generate text');
    }
  };

  return (
    <div className="card">
      <h2>GraphQL演示</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="请输入提示词"
          className="input"
        />
        <button type="submit" className="button" disabled={loading}>
          {loading ? '生成中...' : '生成文本'}
        </button>
      </form>
      {response && (
        <div className="response">
          <h3>响应:</h3>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
};

export default GraphQLDemo;