import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'

function ParticipantHistory() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/auth/history', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        })

        setSessions(response.data?.sessions || [])
      } catch (requestError) {
        setError(requestError?.response?.data?.message || 'Не удалось загрузить историю')
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [])

  return (
    <main className="min-h-screen bg-linear-to-b from-slate-950 to-slate-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-sky-300/90">Participant History</p>
              <h1 className="mt-2 text-3xl font-semibold">Пройденные квизы</h1>
            </div>
            <Link to="/" className="w-fit rounded-2xl bg-white px-4 py-2 font-semibold text-slate-950">
              На главную
            </Link>
          </div>

          {loading ? <p className="mt-6 text-slate-300">Загрузка...</p> : null}
          {error ? <p className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200">{error}</p> : null}

          {!loading && !error ? (
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="bg-white/5 text-slate-200">
                  <tr>
                    <th className="px-4 py-3">Квиз</th>
                    <th className="px-4 py-3">Категория</th>
                    <th className="px-4 py-3">Код комнаты</th>
                    <th className="px-4 py-3">Участник</th>
                    <th className="px-4 py-3">Баллы</th>
                    <th className="px-4 py-3">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-slate-950/60">
                  {sessions.length > 0 ? (
                    sessions.map((session) => (
                      <tr key={session.id}>
                        <td className="px-4 py-3 font-medium text-white">{session.quiz?.title}</td>
                        <td className="px-4 py-3 text-slate-300">{session.quiz?.category}</td>
                        <td className="px-4 py-3 font-mono text-sky-300">{session.quiz?.roomCode}</td>
                        <td className="px-4 py-3 text-slate-300">{session.participantName}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-300">{session.score}</td>
                        <td className="px-4 py-3 text-slate-300">{session.status}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-slate-400" colSpan={6}>
                        Пока нет пройденных квизов.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}

export default ParticipantHistory