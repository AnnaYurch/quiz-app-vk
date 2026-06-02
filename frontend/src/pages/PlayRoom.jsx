import { useParams } from 'react-router-dom'

function PlayRoom() {
  const { roomCode } = useParams()

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Participant Room</p>
          <h1 className="mt-4 text-3xl font-semibold">Комната {roomCode}</h1>
          <p className="mt-3 text-slate-300">
            Следующим шагом здесь появится экран ожидания, ответы и live leaderboard.
          </p>
        </section>
      </div>
    </main>
  )
}

export default PlayRoom