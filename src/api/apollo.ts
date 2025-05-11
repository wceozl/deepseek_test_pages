import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';

const client = new ApolloClient({
  link: new HttpLink({
    uri: 'https://api.glyphscript.site/graphql', // 这是将来的API端点
  }),
  cache: new InMemoryCache(),
});

export default client;