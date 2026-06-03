import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useNavigate, useParams } from 'react-router-dom'

function useTimer(endsAt) {
  const [secondsLeft, setSecondsLeft] = useState(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (!endsAt) {
      setSecondsLeft(null)
      return
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [endsAt])

  return secondsLeft
}

function OrganizerLive() {
  const { roomCode: rawRoomCode } = useParams()
  const navigate = useNavigate()
  const socketRef = useRef(null)
  const roomCode = useMemo(() => (rawRoomCode || '').trim().toUpperCase(), [rawRoomCode])

  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [correctOptionIds, setCorrectOptionIds] = useState([])
  const [questionIndex, setQuestionIndex] = useState(null)
  const [totalQuestions, setTotalQuestions] = useState(null)
  const [quizId, setQuizId] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [participants, setParticipants] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [quizStarted, setQuizStarted] = useState(false)
  const [quizFinished, setQuizFinished] = useState(false)
  const [timeUp, setTimeUp] = useState(false)
  const [timerEndsAt, setTimerEndsAt] = useState(null)

  const secondsLeft = useTimer(timerEndsAt)

  const timerColor =
    secondsLeft === null
      ? 'text-slate-400'
      : secondsLeft <= 5
      ? 'text-rose-400'
      : secondsLeft <= 10
      ? 'text-amber-400'
      : 'text-emerald-400'

  useEffect(() => {
    if (!roomCode) return

    const token = localStorage.getItem('token')
    const socket = io('http://localhost:3000', { auth: { token } })
    socketRef.current = socket

    socket.on('quiz_started', (payload) => {
      setCurrentQuestion(payload.question || null)
      setQuestionIndex(typeof payload.questionIndex === 'number' ? payload.questionIndex : null)
      setTotalQuestions(typeof payload.totalQuestions === 'number' ? payload.totalQuestions : null)
      setCorrectOptionIds([])
      setTimeUp(false)
      setQuizStarted(true)
      setTimerEndsAt(null)
    })

    socket.on('new_question', (payload) => {
      setCurrentQuestion(payload.question || null)
      setQuestionIndex(typeof payload.questionIndex === 'number' ? payload.questionIndex : null)
      setTotalQuestions(typeof payload.totalQuestions === 'number' ? payload.totalQuestions : null)
      setCorrectOptionIds([])
      setTimeUp(false)
      setTimerEndsAt(null)
    })

    socket.on('timer_start', (payload) => {
      setTimerEndsAt(payload?.endsAt || null)
      setTimeUp(false)
    })

    socket.on('quiz_time_up', (payload) => {
      setTimerEndsAt(null)
      setTimeUp(true)
      const correct = (payload?.question?.options || [])
        .filter((o) => o.isCorrect)
        .map((o) => o.id)
      setCorrectOptionIds(correct)
      if (payload?.question) setCurrentQuestion(payload.question)
    })

    socket.on('leaderboard', (data) => {
      setLeaderboard(Array.isArray(data) ? data : [])
    })

    socket.on('participants_update', (data) => {
      setParticipants(Array.isArray(data) ? data : [])
    })

    socket.on('participant_joined', (participant) => {
      setParticipants((current) => {
        if (!participant?.socketId) return current
        const exists = current.some((p) => p.socketId === participant.socketId)
        if (exists) return current
        return [...current, participant].sort((a, b) => a.participantName.localeCompare(b.participantName))
      })
    })

    socket.on('quiz_finished', (payload) => {
      setLeaderboard(Array.isArray(payload?.leaderboard) ? payload.leaderboard : [])
      setCurrentQuestion(null)
      setQuestionIndex(null)
      setTotalQuestions(null)
      setQuizFinished(true)
      setTimerEndsAt(null)
      setStatusMessage('Квиз завершён')
    })

    socket.emit('join_room', { roomCode, isOrganizer: true }, (response) => {
      if (response?.message) {
        setStatusMessage(response.message)
        return
      }
      if (response?.quizId) setQuizId(response.quizId)
      setStatusMessage('Организатор подключён к комнате')
    })

    return () => { socket.disconnect() }
  }, [roomCode])

  const handleStart = () => {
    socketRef.current?.emit('start_quiz', { roomCode, quizId }, (response) => {
      if (response?.message && response.message !== 'ok') {
        setStatusMessage(response.message)
      }
    })
  }

  const handleNext = () => {
    socketRef.current?.emit('next_question', { roomCode, quizId }, (response) => {
      if (response?.message && response.message !== 'ok') {
        setStatusMessage(response.message)
      }
    })
  }

  const handleEnd = () => {
    socketRef.current?.emit('end_quiz', { roomCode, quizId }, () => {
      navigate('/organizer')
    })
  }

  const getOptionClass = (option) => {
    if (!timeUp) return 'border-white/10 bg-slate-950/60'
    if (correctOptionIds.includes(option.id)) return 'border-emerald-400 bg-emerald-500/20 text-emerald-100 ring-2 ring-emerald-400/30'
    return 'border-white/10 bg-slate-950/40 text-slate-500'
  }

  return (
    <main className="min-h-screen bg-linear-to-b from-slate-950 to-slate-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-sky-300/90">Organizer Live</p>
              <h1 className="mt-2 text-3xl font-semibold">Комната {roomCode}</h1>
              <p className="mt-1 text-sm text-slate-300">Участники: {participants.length}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              {!quizStarted && !quizFinished && (
                <button onClick={handleStart} className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300">
                  Начать квиз
                </button>
              )}
              {quizStarted && !quizFinished && (
                <>
                  <button
                    onClick={handleNext}
                    disabled={!timeUp}
                    className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={!timeUp ? 'Кнопка активна после истечения времени' : ''}
                  >
                    Следующий вопрос
                  </button>
                  <button onClick={handleEnd} className="rounded-2xl bg-rose-500 px-5 py-3 font-semibold text-white transition hover:bg-rose-400">
                    Завершить квиз
                  </button>
                </>
              )}
              {quizFinished && (
                <button onClick={() => navigate('/organizer')} className="rounded-2xl bg-white px-5 py-3 font-semibold text-slate-950 transition hover:bg-slate-100">
                  В кабинет
                </button>
              )}
            </div>
          </div>

          {statusMessage && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200">
              {statusMessage}
            </div>
          )}
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Текущий вопрос */}
          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Текущий вопрос</h2>

              {/* Таймер */}
              {quizStarted && !quizFinished && (
                <div className="flex flex-col items-center">
                  <span className={`text-4xl font-bold tabular-nums leading-none ${timerColor}`}>
                    {secondsLeft !== null ? secondsLeft : timeUp ? '0' : '—'}
                  </span>
                  <span className="mt-0.5 text-xs text-slate-400 uppercase tracking-widest">сек</span>
                </div>
              )}
            </div>

            {/* Прогресс-бар */}
            {timerEndsAt && (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-sky-400"
                  style={{
                    width: secondsLeft !== null ? `${(secondsLeft / Math.ceil((timerEndsAt - Date.now() + secondsLeft * 1000) / 1000)) * 100}%` : '0%',
                    transition: 'width 1s linear',
                  }}
                />
              </div>
            )}

            {currentQuestion ? (
              <div className="mt-5">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-xl font-semibold leading-tight">{currentQuestion.content}</h3>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                      {currentQuestion.type}
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                      {currentQuestion.answerType}
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  {currentQuestion.options?.map((option, index) => (
                    <div
                      key={option.id ?? index}
                      className={`rounded-2xl border px-4 py-3 transition ${getOptionClass(option)}`}
                    >
                      {option.text}
                      {timeUp && correctOptionIds.includes(option.id) && (
                        <span className="ml-2 text-xs font-semibold text-emerald-400">✓ верно</span>
                      )}
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-sm text-slate-300">
                  Вопрос {typeof questionIndex === 'number' ? questionIndex + 1 : '—'} из {totalQuestions ?? '—'}
                </p>

                {timeUp && (
                  <div className="mt-4 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-300">
                    ⏱ Время вышло — нажмите «Следующий вопрос» чтобы продолжить
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-slate-300">
                {quizFinished ? 'Квиз завершён.' : 'Нажмите «Начать квиз», чтобы запустить.'}
              </p>
            )}
          </article>

          <aside className="space-y-6">
            {/* Участники */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-xl font-semibold">Участники ({participants.length})</h2>
              <div className="mt-4 space-y-2 max-h-52 overflow-y-auto">
                {participants.length > 0 ? (
                  participants.map((p) => (
                    <div key={p.socketId} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2.5">
                      <span className="font-medium text-sm">{p.participantName}</span>
                      <span className="text-xs text-slate-400">{p.userId ? `#${p.userId}` : 'Гость'}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Пока никто не подключился.</p>
                )}
              </div>
            </section>

            {/* Лидерборд */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-xl font-semibold">Лидерборд</h2>
              <ol className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                {leaderboard.length > 0 ? (
                  leaderboard.map((row, index) => (
                    <li key={row.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2.5">
                      <div>
                        <div className="font-medium text-sm">{index + 1}. {row.participantName}</div>
                      </div>
                      <div className="text-lg font-semibold text-emerald-300">{row.score}</div>
                    </li>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Появится после старта.</p>
                )}
              </ol>
            </section>
          </aside>
        </section>
      </div>
    </main>
  )
}

export default OrganizerLive
