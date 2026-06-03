import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useNavigate, useParams } from 'react-router-dom'

// Хук для обратного отсчёта на основе серверной метки времени.
// Использует requestAnimationFrame для плавного обновления без дрейфа.
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

function ParticipantView() {
  const { roomCode: rawRoomCode } = useParams()
  const navigate = useNavigate()
  const socketRef = useRef(null)
  const roomCodeFromUrl = useMemo(() => (rawRoomCode || '').trim().toUpperCase(), [rawRoomCode])

  const [step, setStep] = useState('join')
  const [participantName, setParticipantName] = useState('')
  const [roomCode, setRoomCode] = useState(roomCodeFromUrl)
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [questionIndex, setQuestionIndex] = useState(null)
  const [totalQuestions, setTotalQuestions] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [answersLocked, setAnswersLocked] = useState(false)
  // После time_up храним правильные ответы для подсветки
  const [correctOptionIds, setCorrectOptionIds] = useState([])
  const [lastAnswerResult, setLastAnswerResult] = useState(null) // { isCorrect, pointsAwarded }
  const [leaderboard, setLeaderboard] = useState([])
  const [error, setError] = useState('')
  const [timerEndsAt, setTimerEndsAt] = useState(null)

  const secondsLeft = useTimer(timerEndsAt)

  const resetQuestionState = useCallback(() => {
    setSelectedIds([])
    setAnswersLocked(false)
    setCorrectOptionIds([])
    setLastAnswerResult(null)
    setTimerEndsAt(null)
  }, [])

  useEffect(() => {
    // Участник подключается без токена — это нормально, он может быть гостем
    const socket = io('http://localhost:3000', {
      // Передаём токен если есть — тогда сервер привяжет сессию к аккаунту
      auth: { token: localStorage.getItem('token') || '' },
    })
    socketRef.current = socket

    socket.on('quiz_started', (payload) => {
      setCurrentQuestion(payload?.question || null)
      setQuestionIndex(typeof payload?.questionIndex === 'number' ? payload.questionIndex : null)
      setTotalQuestions(typeof payload?.totalQuestions === 'number' ? payload.totalQuestions : null)
      resetQuestionState()
      setStep('playing')
    })

    socket.on('new_question', (payload) => {
      setCurrentQuestion(payload?.question || null)
      setQuestionIndex(typeof payload?.questionIndex === 'number' ? payload.questionIndex : null)
      setTotalQuestions(typeof payload?.totalQuestions === 'number' ? payload.totalQuestions : null)
      resetQuestionState()
      setStep('playing')
    })

    socket.on('timer_start', (payload) => {
      setTimerEndsAt(payload?.endsAt || null)
    })

    // Сервер прислал правильные ответы после истечения времени
    socket.on('quiz_time_up', (payload) => {
      setTimerEndsAt(null)
      setAnswersLocked(true)
      const correct = (payload?.question?.options || [])
        .filter((o) => o.isCorrect)
        .map((o) => o.id)
      setCorrectOptionIds(correct)
      // Обновляем вопрос с isCorrect для отображения
      if (payload?.question) setCurrentQuestion(payload.question)
    })

    socket.on('leaderboard', (data) => {
      setLeaderboard(Array.isArray(data) ? data : [])
    })

    socket.on('quiz_finished', (payload) => {
      setLeaderboard(Array.isArray(payload?.leaderboard) ? payload.leaderboard : [])
      setStep('results')
      setCurrentQuestion(null)
      setAnswersLocked(true)
      setTimerEndsAt(null)
    })

    return () => {
      socket.disconnect()
    }
  }, [resetQuestionState])

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
        return
      }
      setStep('waiting')
    })
  }

  const handleSelect = (optionId) => {
    if (!currentQuestion || answersLocked) return

    if (currentQuestion.answerType === 'MULTIPLE') {
      setSelectedIds((current) =>
        current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]
      )
      return
    }
    setSelectedIds([optionId])
  }

  const handleSubmitAnswer = () => {
    if (!currentQuestion || selectedIds.length === 0 || answersLocked) return

    setAnswersLocked(true)

    socketRef.current?.emit(
      'submit_answer',
      { questionId: currentQuestion.id, selectedOptionIds: selectedIds },
      (response) => {
        if (response?.message) {
          setError(response.message)
          setAnswersLocked(false)
          return
        }
        setLastAnswerResult({
          isCorrect: response?.isCorrect,
          pointsAwarded: response?.pointsAwarded ?? 0,
        })
      }
    )
  }

  // Цвет кнопки варианта ответа
  const getOptionClass = (option) => {
    const isSelected = selectedIds.includes(option.id)
    const isCorrect = correctOptionIds.includes(option.id)

    // После time_up показываем правильные ответы
    if (answersLocked && correctOptionIds.length > 0) {
      if (isCorrect) {
        return 'border-emerald-400 bg-emerald-500/25 text-white ring-2 ring-emerald-400/40'
      }
      if (isSelected && !isCorrect) {
        return 'border-rose-400 bg-rose-500/20 text-white opacity-80'
      }
      return 'border-white/10 bg-white/5 text-slate-400 opacity-60'
    }

    // Во время ответа — выделяем выбранное
    if (isSelected) {
      return 'border-sky-400 bg-sky-500/20 text-white'
    }

    return 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
  }

  // Цвет таймера
  const timerColor =
    secondsLeft === null
      ? 'text-slate-400'
      : secondsLeft <= 5
      ? 'text-rose-400'
      : secondsLeft <= 10
      ? 'text-amber-400'
      : 'text-emerald-400'

  // Ширина прогресс-бара (нужна начальная длительность)
  const timerBarWidth = secondsLeft === null || !timerEndsAt ? '0%' : '100%'

  if (step === 'join') {
    return (
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
                  onChange={(e) => setParticipantName(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                  placeholder="Например, Анна"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Код комнаты</label>
                <input
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                  placeholder="ABC123"
                  maxLength={6}
                />
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button type="submit" className="rounded-2xl bg-white px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-100">
                  Присоединиться
                </button>
                <button type="button" onClick={() => navigate('/')} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-medium text-white transition hover:bg-white/10">
                  Назад
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    )
  }

  if (step === 'waiting') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-linear-to-b from-slate-950 to-slate-900 px-4 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-sky-400" />
          <p className="text-lg font-medium">Вы в комнате <span className="text-sky-300 tracking-widest">{roomCode}</span></p>
          <p className="mt-2 text-slate-400 text-sm">Ждём, пока организатор запустит квиз…</p>
        </div>
      </main>
    )
  }

  if (step === 'results') {
    return (
      <main className="min-h-screen bg-linear-to-b from-slate-950 to-slate-900 px-4 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30">
            <h1 className="text-3xl font-semibold">Квиз завершён!</h1>
            <p className="mt-2 text-slate-300">Финальная таблица лидеров</p>

            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="bg-white/5 text-slate-200">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Участник</th>
                    <th className="px-4 py-3">Баллы</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-slate-950/60">
                  {leaderboard.length > 0 ? (
                    leaderboard.map((row, index) => (
                      <tr key={row.id} className={row.participantName === participantName ? 'bg-sky-500/10' : ''}>
                        <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                        <td className="px-4 py-3 font-medium text-white">{row.participantName}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-300">{row.score}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-slate-400" colSpan={3}>Результаты пока недоступны.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    )
  }

  // step === 'playing'
  return (
    <main className="min-h-screen bg-linear-to-b from-slate-950 to-slate-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30">
          {/* Шапка с таймером */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-slate-300">Комната</h2>
              <p className="text-2xl font-semibold tracking-widest text-sky-300">{roomCode}</p>
            </div>

            {/* Таймер */}
            <div className="flex flex-col items-center">
              <span className={`text-5xl font-bold tabular-nums leading-none ${timerColor}`}>
                {secondsLeft !== null ? secondsLeft : '—'}
              </span>
              <span className="mt-1 text-xs text-slate-400 uppercase tracking-widest">сек</span>
            </div>

            <div className="text-right text-sm text-slate-400">
              {questionIndex !== null && totalQuestions !== null && (
                <div className="text-base font-medium text-white">
                  {questionIndex + 1} / {totalQuestions}
                </div>
              )}
              <div>{participantName}</div>
            </div>
          </div>

          {/* Прогресс-бар таймера */}
          {timerEndsAt && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-sky-400 transition-all"
                style={{
                  width: secondsLeft !== null ? `${(secondsLeft / Math.ceil((timerEndsAt - Date.now() + secondsLeft * 1000) / 1000)) * 100}%` : '0%',
                  transition: 'width 1s linear',
                }}
              />
            </div>
          )}

          {/* Вопрос и варианты */}
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            {currentQuestion ? (
              <div>
                {currentQuestion.type === 'IMAGE' ? (
                  <img
                    src={currentQuestion.content}
                    alt="Вопрос"
                    className="mx-auto mb-4 max-h-72 rounded-2xl object-contain"
                  />
                ) : (
                  <p className="text-xl leading-relaxed">{currentQuestion.content}</p>
                )}

                {currentQuestion.answerType === 'MULTIPLE' && (
                  <p className="mt-2 text-xs text-slate-400">Можно выбрать несколько вариантов</p>
                )}

                <div className="mt-5 grid gap-3">
                  {currentQuestion.options?.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelect(option.id)}
                      disabled={answersLocked}
                      className={`w-full rounded-2xl border px-4 py-3 text-left font-medium transition ${getOptionClass(option)} disabled:cursor-not-allowed`}
                    >
                      {option.text}
                    </button>
                  ))}
                </div>

                {/* Результат ответа */}
                {lastAnswerResult !== null && (
                  <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium ${lastAnswerResult.isCorrect ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30' : 'bg-rose-500/15 text-rose-300 border border-rose-400/30'}`}>
                    {lastAnswerResult.isCorrect
                      ? `✓ Верно! +${lastAnswerResult.pointsAwarded} баллов`
                      : '✗ Неверно — ждём следующего вопроса'}
                  </div>
                )}

                {/* Сообщение после time_up без ответа */}
                {answersLocked && lastAnswerResult === null && correctOptionIds.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                    ⏱ Время вышло — ждём следующего вопроса
                  </div>
                )}

                {/* Кнопка ответа */}
                {!answersLocked && (
                  <button
                    type="button"
                    onClick={handleSubmitAnswer}
                    disabled={selectedIds.length === 0}
                    className="mt-5 rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Ответить
                  </button>
                )}
              </div>
            ) : (
              <p className="text-slate-300">Ожидаем вопрос…</p>
            )}
          </div>

          {/* Мини-лидерборд */}
          {leaderboard.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs uppercase tracking-widest text-slate-400">Лидерборд</p>
              <div className="space-y-1">
                {leaderboard.slice(0, 5).map((row, i) => (
                  <div
                    key={row.id}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${row.participantName === participantName ? 'bg-sky-500/15 text-sky-200' : 'bg-white/5 text-slate-300'}`}
                  >
                    <span>{i + 1}. {row.participantName}</span>
                    <span className="font-semibold">{row.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default ParticipantView
