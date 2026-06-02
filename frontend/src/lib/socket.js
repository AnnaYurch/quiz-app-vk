import { io } from 'socket.io-client'

// Читаем токен из localStorage при инициализации сокета.
// Это простой singleton: приложение использует один экземпляр socket.
// Для MVP этого достаточно; при смене токена (релогин) можно расширить логику.
const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  auth: {
    token,
  },
})

export default socket
