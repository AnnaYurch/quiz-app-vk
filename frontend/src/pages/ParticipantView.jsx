import { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useNavigate, useParams } from 'react-router-dom'

function ParticipantView() {
  const { roomCode: rawRoomCode } = useParams()
  const navigate = useNavigate()
  const socketRef = useRef(null)
  const roomCodeFromUrl = useMemo(() => (rawRoomCode || '').trim().toUpperCase(), [rawRoomCode])

  const [step, setStep] = useState('join')
  const [participantName, setParticipantName] = useState('')
  const [roomCode, setRoomCode] = useState(roomCodeFromUrl)
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [buttonsDisabled, setButtonsDisabled] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const socket = io('http://localhost:3000')
    socketRef.current = socket

    const onQuizStarted = (payload) => {
      setCurrentQuestion(payload?.question || null)
      setSelectedIds([])
      setButtonsDisabled(false)
      setStep('playing')
    }

    const onNewQuestion = (payload) => {
      setCurrentQuestion(payload?.question || null)
      setSelectedIds([])
      setButtonsDisabled(false)
      setStep('playing')
    }

    const onLeaderboard = (data) => {
      setLeaderboard(Array.isArray(data) ? data : [])
    }

    const onQuizFinished = (payload) => {
      setLeaderboard(Array.isArray(payload?.leaderboard) ? payload.leaderboard : [])
      setStep('results')
      setCurrentQuestion(null)
      setButtonsDisabled(true)
    }

    socket.on('quiz_started', onQuizStarted)
    socket.on('new_question', onNewQuestion)
    socket.on('leaderboard', onLeaderboard)
    socket.on('quiz_finished', onQuizFinished)

    return () => {
      socket.off('quiz_started', onQuizStarted)
      socket.off('new_question', onNewQuestion)
      socket.off('leaderboard', onLeaderboard)
      socket.off('quiz_finished', onQuizFinished)
      socket.disconnect()
    }
  }, [])

  const handleJoin = (event) => {
    event.preventDefault()
    setError('')

    const normalizedRoomCode = roomCode.trim().toUpperCase()
    const trimmedName = participantName.trim()

    if (!normalizedRoomCode || !trimmedName) {
      setError('Введите имя и код комнаты')
      return
    }

    socketRef.current?.emit('join_room', { roomCode: normalizedRoomCode, participantName: trimmedName }, (response) => {
      if (response?.message) {
        setError(response.message)
        setStep('join')
        return
      }

      setStep('playing')
    })
  }

  const handleSelect = (optionId) => {
    if (!currentQuestion || buttonsDisabled) return

    if (currentQuestion.answerType === 'MULTIPLE') {
      setSelectedIds((current) =>
        current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]
      )
      return
    }

    setSelectedIds([optionId])
  }

  const handleSubmitAnswer = () => {
    if (!currentQuestion || selectedIds.length === 0 || buttonsDisabled) return

    setButtonsDisabled(true)

    socketRef.current?.emit(
      'submit_answer',
      { questionId: currentQuestion.id, selectedOptionIds: selectedIds },
      (response) => {
        if (response?.message) {
          setError(response.message)
          setButtonsDisabled(false)
        }
      }
    )
  }

  const renderJoinStep = () => (
    <main className="min-h-screen bg-linear-to-b from-slate-950 to-slate-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30">
          <h1 className="text-2xl font-semibold">Присоединиться к квизу</h1>
          <p className="mt-2 text-sm text-slate-300">Введите имя и код комнаты, чтобы начать участие.</p>

          <form className="mt-6 space-y-4" onSubmit={handleJoin}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Ваше имя</label>
              <input
                value={participantName}
                onChange={(event) => setParticipantName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                placeholder="Например, Анна"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Код комнаты</label>
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                placeholder="ABC123"
                maxLength={6}
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-white px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-100"
              >
                Присоединиться
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-medium text-white transition hover:bg-white/10"
              >
                Назад
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  )

  const renderPlayingStep = () => (
    <main className="min-h-screen bg-linear-to-b from-slate-950 to-slate-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-slate-300">Вы в комнате</h2>
              <p className="text-2xl font-semibold tracking-widest text-sky-300">{roomCode}</p>
            </div>
            <div className="text-right text-sm text-slate-400">
              <div>Участник: {participantName}</div>
              <div>Статус: игра идет</div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <h3 className="text-xl font-semibold">Текущий вопрос</h3>
            {currentQuestion ? (
              <div className="mt-4">
                {currentQuestion.type === 'IMAGE' ? (
                  <img
                    src={currentQuestion.content}
                    alt="Вопрос"
                    className="mx-auto max-h-72 rounded-2xl object-contain"
                  />
                ) : (
                  <p className="text-xl leading-relaxed">{currentQuestion.content}</p>
                )}

                <div className="mt-5 grid gap-3">
                  {currentQuestion.options?.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelect(option.id)}
                      disabled={buttonsDisabled}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        selectedIds.includes(option.id)
                          ? 'border-sky-400 bg-sky-500/20 text-white'
                          : 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
                      } disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      {option.text}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSubmitAnswer}
                  disabled={buttonsDisabled || selectedIds.length === 0}
                  className="mt-5 rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Ответить
                </button>
              </div>
            ) : (
              <p className="mt-4 text-slate-300">Ожидаем начало квиза...</p>
            )}
          </div>
        </section>
      </div>
    </main>
  )

  const renderResultsStep = () => (
    <main className="min-h-screen bg-linear-to-b from-slate-950 to-slate-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30">
          <h1 className="text-3xl font-semibold">Результаты квиза</h1>
          <p className="mt-2 text-slate-300">Финальная таблица лидеров</p>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/5 text-slate-200">
                <tr>
                  <th className="px-4 py-3">Участник</th>
                  <th className="px-4 py-3">Баллы</th>
                  <th className="px-4 py-3">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-slate-950/60">
                {leaderboard.length > 0 ? (
                  leaderboard.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-medium text-white">{row.participantName}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-300">{row.score}</td>
                      <td className="px-4 py-3 text-slate-300">{row.status}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-slate-400" colSpan={3}>
                      Результаты пока недоступны.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )

  if (step === 'playing') {
    return renderPlayingStep()
  }

  if (step === 'results') {
    return renderResultsStep()
  }

  return renderJoinStep()
}

export default ParticipantView
