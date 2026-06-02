import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Home() {
  const navigate = useNavigate()
  const [roomCode, setRoomCode] = useState('')

  const handleJoin = (event) => {
    event.preventDefault()

    const normalizedCode = roomCode.trim().toUpperCase()

    if (!normalizedCode) {
      return
    }

    navigate(`/play/${normalizedCode}`)
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.2),transparent_35%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-4xl border border-white/10 bg-white/10 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <p className="text-sm uppercase tracking-[0.35em] text-sky-300/90">VK Quiz MVP</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              Интерактивные квизы в реальном времени
            </h1>
            <p className="mt-4 max-w-xl text-slate-300">
              Зайди как участник по коду комнаты или авторизуйся как организатор, чтобы создавать и
              запускать квизы с leaderboard в реальном времени.
            </p>

            <button
              type="button"
              onClick={() => navigate('/login?role=organizer')}
              className="mt-6 rounded-2xl bg-white px-5 py-3 font-semibold text-slate-950 transition hover:bg-sky-100"
            >
              Войти как организатор
            </button>
          </section>

          <section className="rounded-4xl border border-white/10 bg-slate-950/45 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <h2 className="text-2xl font-semibold">Войти в комнату</h2>
            <p className="mt-2 text-sm text-slate-300">Введите 6-значный код, который дал организатор.</p>

            <form className="mt-6 space-y-4" onSubmit={handleJoin}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Код комнаты</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25"
                  placeholder="ABC123"
                  maxLength={6}
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-white px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-100"
              >
                Присоединиться
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              Для организатора нужен вход через страницу авторизации.
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

export default Home