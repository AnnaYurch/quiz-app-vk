import { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

function OrganizerDashboard() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const token = localStorage.getItem('token')
  const navigate = useNavigate()

  // Поля формы
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Общее')
  const [timePerQuestion, setTimePerQuestion] = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdRoomCode, setCreatedRoomCode] = useState(null)

  // Выход из сессии
  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await axios.post(
        'http://localhost:3000/api/quizzes',
        {
          title,
          category,
          timePerQuestion: Number(timePerQuestion),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const roomCode = response.data?.quiz?.roomCode
      setCreatedRoomCode(roomCode)
    } catch (err) {
      setError(err?.response?.data?.message || 'Ошибка при создании квиза')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between rounded-2xl bg-white/5 p-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-sky-300">Organizer Cabinet</p>
            <h1 className="mt-2 text-2xl font-semibold">Добро пожаловать, {user.name || 'Организатор'}</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={handleLogout} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
              Выйти
            </button>
          </div>
        </header>

        <section className="mb-6 rounded-2xl bg-white/5 p-6">
          <h2 className="mb-4 text-lg font-medium">Создать новый квиз</h2>
          <form onSubmit={handleCreate} className="grid gap-4">
            <div>
              <label className="block text-sm text-slate-300">Название</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full rounded-md border bg-white/3 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-slate-300">Категория</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-md border bg-white/3 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-slate-300">Время на вопрос (сек)</label>
              <input type="number" value={timePerQuestion} onChange={(e) => setTimePerQuestion(e.target.value)} min={5} className="mt-1 w-40 rounded-md border bg-white/3 px-3 py-2 text-white" />
            </div>

            {error && <div className="text-rose-400">{error}</div>}

            <div className="flex items-center gap-3">
              <button type="submit" disabled={loading} className="rounded-md bg-sky-400 px-4 py-2 font-semibold text-slate-900">
                {loading ? 'Создаём...' : 'Создать квиз'}
              </button>
            </div>
          </form>

          {createdRoomCode && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/6 p-6 text-center">
              <div className="text-sm text-slate-300">Квиз создан. Код комнаты:</div>
              <div className="mt-3 text-4xl font-bold tracking-widest">{createdRoomCode}</div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button onClick={() => navigate(`/organizer/build/${createdRoomCode}`)} className="rounded-md bg-emerald-400 px-4 py-2 font-semibold text-slate-900">
                  Добавить вопросы
                </button>
                <button onClick={() => navigate(`/organizer/live/${createdRoomCode}`)} className="rounded-md border border-white/15 px-4 py-2 font-semibold text-white">
                  Перейти к проведению
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default OrganizerDashboard