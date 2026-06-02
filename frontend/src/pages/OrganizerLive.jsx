import { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useNavigate, useParams } from 'react-router-dom'

function OrganizerLive() {
  const { roomCode: rawRoomCode } = useParams()
  const navigate = useNavigate()
  const socketRef = useRef(null)
  const roomCode = useMemo(() => (rawRoomCode || '').trim().toUpperCase(), [rawRoomCode])

  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [questionIndex, setQuestionIndex] = useState(null)
  const [totalQuestions, setTotalQuestions] = useState(null)
  const [quizId, setQuizId] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [participants, setParticipants] = useState([])
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    if (!roomCode) {
      return undefined
    }

    const token = localStorage.getItem('token')
    const socket = io('http://localhost:3000', {
      auth: {
        token,
      },
    })
    socketRef.current = socket

    const onQuizStarted = (payload) => {
      setCurrentQuestion(payload.question || null)
      setQuestionIndex(typeof payload.questionIndex === 'number' ? payload.questionIndex : null)
      setTotalQuestions(typeof payload.totalQuestions === 'number' ? payload.totalQuestions : null)
    }

    const onNewQuestion = (payload) => {
      setCurrentQuestion(payload.question || null)
      setQuestionIndex(typeof payload.questionIndex === 'number' ? payload.questionIndex : null)
      setTotalQuestions(typeof payload.totalQuestions === 'number' ? payload.totalQuestions : null)
    }

    const onLeaderboard = (data) => {
      setLeaderboard(Array.isArray(data) ? data : [])
    }

    const onParticipantJoined = (participant) => {
      setParticipants((current) => {
        if (!participant?.socketId) return current

        const exists = current.some((item) => item.socketId === participant.socketId)
        if (exists) return current

        return [...current, participant].sort((first, second) =>
          first.participantName.localeCompare(second.participantName)
        )
      })
    }

    const onParticipantsUpdate = (data) => {
      setParticipants(Array.isArray(data) ? data : [])
    }

    const onQuizFinished = (payload) => {
      setLeaderboard(Array.isArray(payload?.leaderboard) ? payload.leaderboard : [])
      setCurrentQuestion(null)
      setQuestionIndex(null)
      setTotalQuestions(null)
      setStatusMessage('Квиз завершён')
    }

    socket.on('quiz_started', onQuizStarted)
    socket.on('new_question', onNewQuestion)
    socket.on('leaderboard', onLeaderboard)
    socket.on('participant_joined', onParticipantJoined)
    socket.on('participants_update', onParticipantsUpdate)
    socket.on('quiz_finished', onQuizFinished)

    socket.emit('join_room', { roomCode, isOrganizer: true }, (response) => {
      if (response?.message) {
        setStatusMessage(response.message)
        return
      }

      if (response?.quizId) {
        setQuizId(response.quizId)
      }

      setStatusMessage('Организатор подключен к комнате')
    })

    return () => {
      socket.off('quiz_started', onQuizStarted)
      socket.off('new_question', onNewQuestion)
      socket.off('leaderboard', onLeaderboard)
      socket.off('participant_joined', onParticipantJoined)
      socket.off('participants_update', onParticipantsUpdate)
      socket.off('quiz_finished', onQuizFinished)
      socket.disconnect()
    }
  }, [roomCode])

  const handleStart = () => {
    socketRef.current?.emit('start_quiz', { roomCode, quizId })
    setStatusMessage('Команда запуска отправлена')
  }

  const handleNext = () => {
    socketRef.current?.emit('next_question', { roomCode, quizId })
    setStatusMessage('Команда переключения вопроса отправлена')
  }

  const handleEnd = () => {
    socketRef.current?.emit('end_quiz', { roomCode, quizId })
    navigate('/organizer')
  }

  return (
    <main className="min-h-screen bg-linear-to-b from-slate-950 to-slate-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-sky-300/90">Organizer Live</p>
              <h1 className="mt-2 text-3xl font-semibold">Комната {roomCode}</h1>
              <p className="mt-2 text-sm text-slate-300">Управляйте квизом и смотрите участников, вопросы и лидерборд в реальном времени.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={handleStart} className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300">
                Начать квиз
              </button>
              <button onClick={handleNext} className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-sky-300">
                Следующий вопрос
              </button>
              <button onClick={handleEnd} className="rounded-2xl bg-rose-500 px-5 py-3 font-semibold text-white transition hover:bg-rose-400">
                Завершить квиз
              </button>
            </div>
          </div>

          {statusMessage ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200">
              {statusMessage}
            </div>
          ) : null}
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold">Текущий вопрос</h2>
            {currentQuestion ? (
              <div className="mt-5">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-2xl font-semibold leading-tight">{currentQuestion.content}</h3>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                    {currentQuestion.type}
                  </span>
                </div>

                <div className="mt-5 grid gap-3">
                  {currentQuestion.options?.map((option, index) => (
                    <div key={option.id ?? index} className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                      {option.text}
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-sm text-slate-300">
                  Вопрос {typeof questionIndex === 'number' ? questionIndex + 1 : '—'} из {totalQuestions ?? '—'}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-slate-300">Пока вопросов нет или квиз еще не начат.</p>
            )}
          </article>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-xl font-semibold">Участники</h2>
              <div className="mt-4 space-y-3">
                {participants.length > 0 ? (
                  participants.map((participant) => (
                    <div key={participant.socketId} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                      <span className="font-medium">{participant.participantName}</span>
                      <span className="text-xs text-slate-400">{participant.userId ? `User ${participant.userId}` : 'Гость'}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Пока никто не подключился.</p>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-xl font-semibold">Лидерборд</h2>
              <ol className="mt-4 space-y-2">
                {leaderboard.length > 0 ? (
                  leaderboard.map((row, index) => (
                    <li key={row.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                      <div>
                        <div className="font-medium">{index + 1}. {row.participantName}</div>
                        <div className="text-sm text-slate-400">{row.status}</div>
                      </div>
                      <div className="text-xl font-semibold">{row.score}</div>
                    </li>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Лидерборд появится после старта квиза.</p>
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
