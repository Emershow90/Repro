const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// replace fetch calls with a wrapper or add 401 handling
const fetchHelper = `
  // Wrapper helper to handle 401 Unauthorized API responses
  const secureFetch = async (url: string, options: RequestInit = {}) => {
    const token = await auth.currentUser?.getIdToken(true); // force refresh on fetch
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': \`Bearer \${token}\`
      }
    });
    
    if (response.status === 401) {
      console.warn("401 Unauthorized - forcing sign out");
      addToast("Sessão expirada. Por favor, faça login novamente.", "var(--color-danger)");
      await auth.signOut();
      throw new Error("Unauthorized");
    }
    return response;
  };
`;
// I will just explain the strategy and provide the snippet in the chat, since I don't want to break their code with a regex replacement that might fail.
