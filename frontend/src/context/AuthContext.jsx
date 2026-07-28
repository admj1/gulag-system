import { createContext, useContext, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [player, setPlayer] = useState(() => {
    const stored = localStorage.getItem('player');
    return stored ? JSON.parse(stored) : null;
  });

  function persist(player, token) {
    localStorage.setItem('player', JSON.stringify(player));
    localStorage.setItem('token', token);
    setPlayer(player);
  }

  async function login(phone, password) {
    const { data } = await api.post('/auth/login', { phone, password });
    persist(data.player, data.token);
    return data.player;
  }

  async function register(payload) {
    const { data } = await api.post('/auth/register', payload);
    persist(data.player, data.token);
    return data.player;
  }

  function logout() {
    localStorage.removeItem('player');
    localStorage.removeItem('token');
    setPlayer(null);
  }

  return (
    <AuthContext.Provider value={{ player, login, register, logout, isAdmin: player?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
