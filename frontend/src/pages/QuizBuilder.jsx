import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useNavigate, useParams } from 'react-router-dom'

const createEmptyOption = () => ({ text: '', isCorrect: false })

function QuizBuilder() {
  const { roomCode: rawRoomCode } = useParams()
  const roomCode = useMemo(() => (rawRoomCode || '').trim().toUpperCase(), [rawRoomCode])
  const navigate = useNavigate()

  const [quiz, setQuiz] = useState(null)
  const [loadingQuiz, setLoadingQuiz] = useState(true)
  const [loadingQuestion, setLoadingQuestion] = useState(false)
  const [error, setError] = useState('')

  // Основные поля формы вопроса.
  const [questionText, setQuestionText] = useState('')
  const [contentType, setContentType] = useState('TEXT')
  const [imageUrl, setImageUrl] = useState('')
  const [answerType, setAnswerType] = useState('SINGLE')
  const [options, setOptions] = useState([
    createEmptyOption(),
    createEmptyOption(),
    createEmptyOption(),
    createEmptyOption(),
  ])

  useEffect(() => {
    const loadQuiz = async () => {
      if (!roomCode) {
        setError('Код комнаты отсутствует')
        setLoadingQuiz(false)
        return
      }

      try {
        setError('')
        const response = await axios.get(`http://localhost:3000/api/quizzes/${roomCode}`)
        setQuiz(response.data?.quiz || null)
      } catch (requestError) {
        setError(requestError?.response?.data?.message || 'Не удалось загрузить квиз')
      } finally {
        setLoadingQuiz(false)
      }
    }

    loadQuiz()
  }, [roomCode])

  const handleOptionTextChange = (index, value) => {
    setOptions((currentOptions) =>
      currentOptions.map((option, optionIndex) => (optionIndex === index ? { ...option, text: value } : option))
    )
  }

  const handleToggleCorrect = (index) => {
    setOptions((currentOptions) => {
      if (answerType === 'SINGLE') {
        return currentOptions.map((option, optionIndex) => ({
          ...option,
          isCorrect: optionIndex === index,
        }))
      }

      return currentOptions.map((option, optionIndex) =>
        optionIndex === index ? { ...option, isCorrect: !option.isCorrect } : option
      )
    })
  }

  const resetQuestionForm = () => {
    setQuestionText('')
    setContentType('TEXT')
    setImageUrl('')
    setAnswerType('SINGLE')
    setOptions([
      createEmptyOption(),
      createEmptyOption(),
      createEmptyOption(),
      createEmptyOption(),
    ])
  }

  const handleSubmitQuestion = async (event) => {
    event.preventDefault()

    if (!quiz?.id) {
      setError('Квиз еще не загружен')
      return
    }

    const trimmedQuestionText = questionText.trim()
    const trimmedImageUrl = imageUrl.trim()
    const hasAllOptions = options.every((option) => option.text.trim().length > 0)
    const correctCount = options.filter((option) => option.isCorrect).length

    if (!trimmedQuestionText) {
      setError('Введите текст вопроса')
      return
    }

    if (contentType === 'IMAGE' && !trimmedImageUrl) {
      setError('Введите URL изображения')
      return
    }

    if (!hasAllOptions) {
      setError('Заполните все 4 варианта ответа')
      return
    }

    if (answerType === 'SINGLE' && correctCount !== 1) {
      setError('Для одного правильного ответа нужно отметить ровно один вариант')
      return
    }

    if (answerType === 'MULTIPLE' && correctCount === 0) {
      setError('Для нескольких правильных ответов отметьте хотя бы один вариант')
      return
    }

    setLoadingQuestion(true)
    setError('')

    try {
      const response = await axios.post(
        `http://localhost:3000/api/quizzes/${quiz.id}/questions`,
        {
          quizId: quiz.id,
          type: contentType,
          answerType,
          content: contentType === 'IMAGE' ? trimmedImageUrl : trimmedQuestionText,
          order: quiz.questions?.length ? quiz.questions.length + 1 : undefined,
          options: options.map((option) => ({
            text: option.text.trim(),
            isCorrect: option.isCorrect,
          })),
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      )

      const createdQuestion = response.data?.question
      setQuiz((currentQuiz) =>
        currentQuiz
          ? {
              ...currentQuiz,
              questions: [...(currentQuiz.questions || []), createdQuestion],
            }
          : currentQuiz
      )
      resetQuestionForm()
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Не удалось добавить вопрос')
    } finally {
      setLoadingQuestion(false)
    }
  }

  const handleFinishAndStart = () => {
    navigate(`/organizer/live/${roomCode}`)
  }

  if (loadingQuiz) {
    return (
      <main className="min-h-screen bg-linear-to-b from-slate-950 to-slate-900 px-4 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">
            Загрузка квиза...
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-linear-to-b from-slate-950 to-slate-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-sky-300/90">Quiz Builder</p>
              <h1 className="mt-2 text-3xl font-semibold">{quiz?.title || 'Квиз'}</h1>
              <p className="mt-2 text-sm text-slate-300">
                Код комнаты: <span className="font-semibold text-white">{roomCode}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={handleFinishAndStart}
              className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              Завершить создание и запустить
            </button>
          </div>
        </header>

        {error && (
          <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200">
            {error}
          </div>
        )}

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30">
            <h2 className="text-xl font-semibold">Добавить вопрос</h2>

            <form className="mt-6 space-y-5" onSubmit={handleSubmitQuestion}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Текст вопроса</label>
                <textarea
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25"
                  placeholder="Введите текст вопроса"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">Тип контента</label>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                    <button
                      type="button"
                      onClick={() => setContentType('TEXT')}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        contentType === 'TEXT' ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      Текст
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentType('IMAGE')}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        contentType === 'IMAGE' ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      Изображение URL
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">Тип ответа</label>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAnswerType('SINGLE')
                        setOptions((currentOptions) =>
                          currentOptions.map((option) => ({
                            ...option,
                            isCorrect: false,
                          }))
                        )
                      }}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        answerType === 'SINGLE' ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      Один правильный
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswerType('MULTIPLE')}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        answerType === 'MULTIPLE' ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      Несколько правильных
                    </button>
                  </div>
                </div>
              </div>

              {contentType === 'IMAGE' && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">URL изображения</label>
                  <input
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25"
                    placeholder="https://example.com/image.png"
                  />
                </div>
              )}

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-200">Варианты ответа</label>
                  <span className="text-xs text-slate-400">Ровно 4 варианта</span>
                </div>

                <div className="space-y-3">
                  {options.map((option, index) => (
                    <div key={`option-${index}`} className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-[1fr_auto] md:items-center">
                      <input
                        value={option.text}
                        onChange={(event) => handleOptionTextChange(index, event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25"
                        placeholder={`Вариант ${index + 1}`}
                      />

                      <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={option.isCorrect}
                          onChange={() => handleToggleCorrect(index)}
                          className="h-4 w-4 rounded border-white/20 bg-white/10 text-cyan-400 focus:ring-cyan-400"
                        />
                        Верный
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loadingQuestion}
                className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loadingQuestion ? 'Добавляем...' : 'Добавить вопрос'}
              </button>
            </form>
          </article>

          <aside className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30">
            <h2 className="text-xl font-semibold">Уже добавленные вопросы</h2>
            <div className="mt-5 space-y-3">
              {(quiz?.questions || []).length > 0 ? (
                quiz.questions.map((question, index) => (
                  <div key={question.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Вопрос {index + 1}</p>
                        <p className="mt-1 font-medium text-white">
                          {question.type === 'IMAGE' ? 'Изображение: ' : ''}
                          {question.content}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                        {question.answerType}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/40 p-5 text-sm text-slate-400">
                  Вопросов пока нет. Добавьте первый вопрос через форму слева.
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

export default QuizBuilder
